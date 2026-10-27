package com.vivitel.camera

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import java.net.HttpURLConnection
import java.net.URL

class NetworkStatusService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private var activeConfig = AppConfig()
  private var lastOnline: Boolean? = null
  private val monitorRunnable = object : Runnable {
    override fun run() {
      updateStatus()
      handler.postDelayed(this, STATUS_POLL_INTERVAL_MS)
    }
  }

  override fun onCreate() {
    super.onCreate()
    startForeground(NOTIFICATION_ID, buildNotification("Monitoring network status"))
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val configPath = intent?.getStringExtra(AppConfigLoader.EXTRA_CONFIG_PATH) ?: AppConfigLoader.DEFAULT_CONFIG_PATH
    activeConfig = AppConfigLoader.load(this, configPath)
    handler.removeCallbacks(monitorRunnable)
    updateStatus()
    handler.postDelayed(monitorRunnable, STATUS_POLL_INTERVAL_MS)
    return START_STICKY
  }

  override fun onDestroy() {
    handler.removeCallbacks(monitorRunnable)
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun updateStatus() {
    val online = isNetworkAndServerAvailable()
    if (lastOnline == online) return
    lastOnline = online

    val action = if (online) {
      DeploymentFeedbackActivity.ACTION_SHOW_NETWORK_ONLINE
    } else {
      DeploymentFeedbackActivity.ACTION_SHOW_NETWORK_OFFLINE
    }
    val message = if (online) {
      DeploymentFeedbackActivity.DEFAULT_NETWORK_ONLINE_MESSAGE
    } else {
      DeploymentFeedbackActivity.DEFAULT_NETWORK_OFFLINE_MESSAGE
    }

    startActivity(
      Intent(this, DeploymentFeedbackActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        .putExtra(DeploymentFeedbackActivity.EXTRA_ACTION, action)
        .putExtra(DeploymentFeedbackActivity.EXTRA_MESSAGE, message)
    )
  }

  private fun isNetworkAndServerAvailable(): Boolean {
    val connectivity = getSystemService(ConnectivityManager::class.java) ?: return false
    val network = connectivity.activeNetwork ?: return false
    val caps = connectivity.getNetworkCapabilities(network) ?: return false
    if (!caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) return false
    if (
      !caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) &&
      !caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) &&
      !caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)
    ) {
      return false
    }
    return probeServer()
  }

  private fun probeServer(): Boolean {
    val endpoint = activeConfig.server.buildUrl("/")
    if (endpoint.isBlank()) return false
    return try {
      val connection = (URL(endpoint).openConnection() as HttpURLConnection).apply {
        requestMethod = "GET"
        connectTimeout = 4_000
        readTimeout = 4_000
        if (activeConfig.server.apiKey.isNotBlank()) {
          setRequestProperty("x-api-key", activeConfig.server.apiKey)
        }
        if (activeConfig.tenantId.isNotBlank()) {
          setRequestProperty("x-tenant-id", activeConfig.tenantId)
        }
      }
      val code = connection.responseCode
      connection.inputStream?.close()
      connection.errorStream?.close()
      connection.disconnect()
      code in 200..499
    } catch (_: Exception) {
      false
    }
  }

  private fun buildNotification(content: String): Notification {
    val channelId = NOTIFICATION_CHANNEL_ID
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(channelId, "Network Status", NotificationManager.IMPORTANCE_LOW)
      val manager = getSystemService(NotificationManager::class.java)
      manager.createNotificationChannel(channel)
    }
    return Notification.Builder(this, channelId)
      .setContentTitle("Vivitel Network Status")
      .setContentText(content)
      .setSmallIcon(android.R.drawable.presence_online)
      .build()
  }

  companion object {
    private const val NOTIFICATION_ID = 1108
    private const val NOTIFICATION_CHANNEL_ID = "network-status"
    private const val STATUS_POLL_INTERVAL_MS = 5_000L
  }
}