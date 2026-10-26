package com.vivitel.camera

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant
import java.util.concurrent.Executors

/**
 * Sends GPS positions to /ingest/camera-health while the camera is awake (ACC on and during the
 * firmware's ACC-off delay). In trip it reports every `tripIntervalSec`, parked every
 * `outOfTripIntervalSec`. When the MiTAC firmware puts the unit to sleep this app is not running,
 * so sleep-mode reporting stays a firmware feature.
 */
class LocationReportService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private val sender = Executors.newSingleThreadExecutor()
  private var activeConfig = AppConfig()
  private var locationManager: LocationManager? = null
  private var listening = false

  @Volatile private var lastFix: Location? = null
  private var lastMovingAtMs = 0L
  private var lastReportAtMs = 0L
  private var wasInTrip = false

  private val listener = object : LocationListener {
    override fun onLocationChanged(location: Location) {
      lastFix = location
      if (location.hasSpeed() && location.speed >= MOVING_SPEED_MPS) lastMovingAtMs = System.currentTimeMillis()
    }

    @Deprecated("Required on API < 29")
    override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit
    override fun onProviderEnabled(provider: String) = Unit
    override fun onProviderDisabled(provider: String) = Unit
  }

  private val tick = object : Runnable {
    override fun run() {
      maybeReport()
      handler.postDelayed(this, TICK_MS)
    }
  }

  override fun onCreate() {
    super.onCreate()
    startForeground(NOTIFICATION_ID, buildNotification())
    locationManager = getSystemService(LocationManager::class.java)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val configPath = intent?.getStringExtra(AppConfigLoader.EXTRA_CONFIG_PATH) ?: AppConfigLoader.DEFAULT_CONFIG_PATH
    activeConfig = AppConfigLoader.load(this, configPath)
    if (!activeConfig.location.enabled) {
      stopSelf()
      return START_NOT_STICKY
    }
    startListening()
    handler.removeCallbacks(tick)
    handler.post(tick)
    return START_STICKY
  }

  override fun onDestroy() {
    handler.removeCallbacks(tick)
    stopListening()
    sender.shutdown()
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  @SuppressLint("MissingPermission")
  private fun startListening() {
    if (listening) return
    if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) return
    val manager = locationManager ?: return
    try {
      if (manager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
        manager.requestLocationUpdates(LocationManager.GPS_PROVIDER, GPS_UPDATE_MS, 0f, listener, Looper.getMainLooper())
      }
      if (manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
        manager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, GPS_UPDATE_MS * 6, 0f, listener, Looper.getMainLooper())
      }
      lastFix = manager.getLastKnownLocation(LocationManager.GPS_PROVIDER) ?: lastFix
      listening = true
    } catch (_: Exception) {
      listening = false
    }
  }

  private fun stopListening() {
    try {
      locationManager?.removeUpdates(listener)
    } catch (_: Exception) {
      // Ignore; the service is going away.
    }
    listening = false
  }

  private fun maybeReport() {
    if (!listening) startListening()
    val fix = lastFix ?: return
    val now = System.currentTimeMillis()
    val inTrip = now - lastMovingAtMs < TRIP_HOLD_MS
    val intervalMs = when {
      inTrip -> activeConfig.location.tripIntervalSec * 1_000L
      activeConfig.location.outOfTripEnabled -> activeConfig.location.outOfTripIntervalSec * 1_000L
      else -> return
    }
    // Report straight away when a trip starts or ends, then on the interval.
    val tripChanged = inTrip != wasInTrip
    wasInTrip = inTrip
    if (!tripChanged && now - lastReportAtMs < intervalMs) return
    // Skip stale fixes (e.g. no sky view); a fresh one arrives within seconds once GPS recovers.
    if (now - fix.time > STALE_FIX_MS) return
    lastReportAtMs = now
    val config = activeConfig
    sender.execute { postPosition(config, fix, inTrip) }
  }

  private fun postPosition(config: AppConfig, fix: Location, inTrip: Boolean) {
    val endpoint = config.server.buildUrl(config.server.cameraHealthPath)
    if (endpoint.isEmpty() || config.deviceId.isBlank()) return
    val payload = JSONObject().apply {
      put("cameraId", config.deviceId)
      put("deviceId", config.deviceId)
      if (config.tenantId.isNotBlank()) put("tenantId", config.tenantId)
      put("transport", "gps")
      put("lat", fix.latitude)
      put("lon", fix.longitude)
      // Speed in knots, matching Traccar positions elsewhere in the platform.
      if (fix.hasSpeed()) put("speed", fix.speed * KNOTS_PER_MPS)
      if (fix.hasBearing()) put("heading", fix.bearing.toDouble())
      if (fix.hasAltitude()) put("altitude", fix.altitude)
      if (fix.hasAccuracy()) put("accuracy", fix.accuracy.toDouble())
      fix.extras?.getInt("satellites", -1)?.takeIf { it >= 0 }?.let { put("satellites", it) }
      put("motion", inTrip)
      put("provider", fix.provider ?: "gps")
      put("recordedAt", Instant.ofEpochMilli(fix.time).toString())
    }
    try {
      val connection = (URL(endpoint).openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"
        connectTimeout = 8_000
        readTimeout = 8_000
        doOutput = true
        setRequestProperty("content-type", "application/json")
        if (config.server.apiKey.isNotBlank()) setRequestProperty("x-api-key", config.server.apiKey)
        if (config.tenantId.isNotBlank()) setRequestProperty("x-tenant-id", config.tenantId)
      }
      connection.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }
      connection.responseCode
      connection.inputStream?.close()
      connection.disconnect()
    } catch (_: Exception) {
      // Next interval retries with a fresh fix.
    }
  }

  private fun buildNotification(): Notification {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(NOTIFICATION_CHANNEL_ID, "Location Reporting", NotificationManager.IMPORTANCE_LOW)
      getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
    return Notification.Builder(this, NOTIFICATION_CHANNEL_ID)
      .setContentTitle("Vivitel Location")
      .setContentText("Reporting vehicle position")
      .setSmallIcon(android.R.drawable.ic_menu_mylocation)
      .build()
  }

  companion object {
    /** Starts or stops the service to match the location settings in [config]. */
    fun sync(context: android.content.Context, configPath: String, config: AppConfig) {
      val intent = Intent(context, LocationReportService::class.java)
        .putExtra(AppConfigLoader.EXTRA_CONFIG_PATH, configPath)
      try {
        if (config.location.enabled) context.startForegroundService(intent) else context.stopService(intent)
      } catch (_: Exception) {
        // Background start can be refused; the next boot or config reload retries.
      }
    }

    private const val NOTIFICATION_ID = 1109
    private const val NOTIFICATION_CHANNEL_ID = "location-report"
    private const val TICK_MS = 5_000L
    private const val GPS_UPDATE_MS = 5_000L
    private const val MOVING_SPEED_MPS = 2.0f // ~7 km/h
    private const val TRIP_HOLD_MS = 180_000L // still "in trip" for 3 min after last movement
    private const val STALE_FIX_MS = 120_000L
    private const val KNOTS_PER_MPS = 1.943844
  }
}
