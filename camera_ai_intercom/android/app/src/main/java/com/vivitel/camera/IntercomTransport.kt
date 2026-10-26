package com.vivitel.camera

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.time.Instant

class IntercomTransport(
  private val context: Context,
  private val config: AppConfig,
  private val onRuntimeConfigChanged: (() -> Unit)? = null
) {
  private var byteCount: Long = 0
  private var frames: Long = 0
  private var lastHealthAtMs: Long = 0
  private var lastUploadAtMs: Long = 0
  private val settingsSync = DeviceSettingsSync(context)
  private val buffered = ByteArrayOutputStream()
  private val lock = Any()

  fun sendAudio(frame: ByteArray) {
    if (frame.isEmpty()) return

    byteCount += frame.size.toLong()
    frames += 1

    synchronized(lock) {
      buffered.write(frame)
    }

    val now = System.currentTimeMillis()
    val shouldFlush = now - lastUploadAtMs >= config.intercom.uploadIntervalMs || bufferedSize() >= config.intercom.maxBufferedBytes
    if (shouldFlush) {
      flushBufferedAudio(now)
    }

    maybePostHealth(now)
  }

  fun close() {
    flushBufferedAudio(System.currentTimeMillis())
  }

  private fun postCameraHealth(atMs: Long) {
    val endpoint = config.server.buildUrl(config.server.cameraHealthPath)
    if (endpoint.isEmpty()) return

    val payload = JSONObject().apply {
      put("id", config.deviceId.ifBlank { "camera-unknown" })
      put("cameraId", config.deviceId.ifBlank { "camera-unknown" })
      if (config.tenantId.isNotBlank()) put("tenantId", config.tenantId)
      if (config.apn.isNotBlank()) put("apn", config.apn)
      put("transport", "intercom")
      put("bytesSent", byteCount)
      put("framesSent", frames)
      put("network", readNetworkType())
      put("recordedAt", Instant.ofEpochMilli(atMs).toString())
      appendLiveStreamFields(this)
    }

    try {
      val connection = (URL(endpoint).openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"
        connectTimeout = 6_000
        readTimeout = 6_000
        doOutput = true
        setRequestProperty("content-type", "application/json")
        if (config.server.apiKey.isNotBlank()) {
          setRequestProperty("x-api-key", config.server.apiKey)
        }
        if (config.tenantId.isNotBlank()) {
          setRequestProperty("x-tenant-id", config.tenantId)
        }
      }

      connection.outputStream.use { out ->
        out.write(payload.toString().toByteArray(Charsets.UTF_8))
      }
      connection.inputStream.close()
      connection.disconnect()
    } catch (_: Exception) {
      // Keep audio path resilient even when network pushes fail.
    }
  }

  private fun flushBufferedAudio(atMs: Long) {
    val chunk = synchronized(lock) {
      if (buffered.size() == 0) return
      val bytes = buffered.toByteArray()
      buffered.reset()
      bytes
    }

    val endpoint = config.server.buildUrl(config.server.intercomAudioPath)
    if (endpoint.isEmpty()) return

    val payload = JSONObject().apply {
      put("id", config.deviceId.ifBlank { "camera-unknown" })
      put("deviceId", config.deviceId.ifBlank { "camera-unknown" })
      put("cameraId", config.deviceId.ifBlank { "camera-unknown" })
      put("tenantId", config.tenantId)
      put("sampleRate", config.intercom.sampleRate)
      put("channels", config.intercom.channels)
      put("recordedAt", Instant.ofEpochMilli(atMs).toString())
      put("pcm16leBase64", android.util.Base64.encodeToString(chunk, android.util.Base64.NO_WRAP))
    }

    try {
      val connection = (URL(endpoint).openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"
        connectTimeout = 8_000
        readTimeout = 8_000
        doOutput = true
        setRequestProperty("content-type", "application/json")
        if (config.server.apiKey.isNotBlank()) {
          setRequestProperty("x-api-key", config.server.apiKey)
        }
        if (config.tenantId.isNotBlank()) {
          setRequestProperty("x-tenant-id", config.tenantId)
        }
      }

      connection.outputStream.use { out ->
        out.write(payload.toString().toByteArray(Charsets.UTF_8))
      }
      val responseCode = connection.responseCode
      if (responseCode in 200..299) {
        lastUploadAtMs = atMs
      }
      connection.inputStream.close()
      connection.disconnect()
    } catch (_: Exception) {
      // Drop failed chunk to keep live capture non-blocking.
    }
  }

  private fun maybePostHealth(atMs: Long) {
    if (atMs - lastHealthAtMs < 15_000) return
    lastHealthAtMs = atMs
    if (settingsSync.poll(config)) {
      onRuntimeConfigChanged?.invoke()
      return
    }
    postCameraHealth(atMs)
  }

  private fun appendLiveStreamFields(payload: JSONObject) {
    if (!config.liveStream.enabled || !config.liveStream.publishWithHealth) return

    val liveUrls = config.liveStream.channelUrls.filter { it.isNotBlank() }.toMutableList()
    if (liveUrls.isEmpty()) {
      buildDerivedStreamUrl()?.let { liveUrls += it }
    }
    if (liveUrls.isEmpty()) return

    payload.put("streamUrl", config.liveStream.streamUrl.ifBlank { liveUrls.first() })
    payload.put("channelUrls", JSONArray(liveUrls))
    payload.put(
      "channelNames",
      JSONArray(
        config.liveStream.channelNames
          .filter { it.isNotBlank() }
          .ifEmpty { listOf("Main") }
      )
    )
  }

  private fun buildDerivedStreamUrl(): String? {
    val settings = settingsSync.lastAppliedLiveSettings() ?: return config.liveStream.streamUrl.ifBlank { null }
    val host = settings.mediaHost.ifBlank { settings.registerHost }
    val port = settings.mediaPort.takeIf { it > 0 } ?: settings.registerPort.takeIf { it > 0 } ?: return config.liveStream.streamUrl.ifBlank { null }
    if (host.isBlank()) return config.liveStream.streamUrl.ifBlank { null }
    val scheme = when (settings.videoProtocol.lowercase()) {
      "http", "https", "hls" -> "https"
      "rtsps" -> "rtsps"
      else -> "rtsp"
    }
    val cameraKey = URLEncoder.encode(config.deviceId.ifBlank { "camera-unknown" }, Charsets.UTF_8.name())
    return "$scheme://$host:$port/live/$cameraKey"
  }

  private fun bufferedSize(): Int = synchronized(lock) { buffered.size() }

  private fun readNetworkType(): String {
    return try {
      val connectivity = context.getSystemService(ConnectivityManager::class.java) ?: return "unknown"
      val network = connectivity.activeNetwork ?: return "offline"
      val caps = connectivity.getNetworkCapabilities(network) ?: return "offline"
      when {
        caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
        caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"
        caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ethernet"
        else -> "unknown"
      }
    } catch (_: Exception) {
      "unknown"
    }
  }
}

private data class PendingLiveSettings(
  val videoProtocol: String,
  val registerHost: String,
  val registerPort: Int,
  val mediaHost: String,
  val mediaPort: Int
)

private class DeviceSettingsSync(
  private val context: Context
) {
  private var lastPollAtMs: Long = 0
  private var lastLiveSettings: PendingLiveSettings? = null
  private val serverGuard = ServerSwitchGuard(context)

  fun lastAppliedLiveSettings(): PendingLiveSettings? = lastLiveSettings

  fun poll(config: AppConfig): Boolean {
    if (!config.remoteSync.enabled || config.deviceId.isBlank()) return false
    val now = System.currentTimeMillis()
    if (now - lastPollAtMs < config.remoteSync.pollIntervalMs) return false
    lastPollAtMs = now

    val fetch = fetchPending(config, config.server)
    if (fetch.reached) {
      serverGuard.markContact(config.server)
    } else {
      val previous = serverGuard.rollbackTarget(config.server, now, isOnline())
      if (previous != null) {
        serverGuard.clear()
        return AppConfigLoader.saveRuntimeConfig(context, config.copy(server = previous))
      }
    }

    val pending = fetch.envelope ?: return false
    var merged = mergeConfig(config, pending.payload)
    val requestedServer = parseServerChange(config.server, pending.payload)
    // Ack on the current server first: the queue entry lives there.
    val acked = ack(config, pending.id)
    if (!acked) return false
    if (requestedServer != null && probeServer(config, requestedServer)) {
      merged = merged.copy(server = requestedServer)
      serverGuard.beginSwitch(previous = config.server, next = requestedServer, atMs = now)
    }
    if (merged == config) return false
    return AppConfigLoader.saveRuntimeConfig(context, merged)
  }

  /**
   * Server moves are only accepted from the explicit `vivitelServer` block (never from the VT
   * `serverConfigs.Server1` positioning profile) and must pass validation. The API key and paths
   * are kept from the current server.
   */
  private fun parseServerChange(current: ServerConfig, payload: JSONObject): ServerConfig? {
    val block = optObject(payload, "vivitelServer") ?: return null
    val host = block.optString("host", "").trim().lowercase()
    val port = block.optInt("port", 0)
    val protocol = block.optString("protocol", current.protocol).trim().lowercase()
    if (!isValidHost(host) || port !in 1..65535 || protocol !in setOf("http", "https")) return null
    val next = current.copy(protocol = protocol, host = host, port = port)
    return if (next == current) null else next
  }

  private fun isValidHost(host: String): Boolean {
    if (host.isEmpty() || host.length > 253) return false
    val octet = "(25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9])"
    if (Regex("^$octet(\\.$octet){3}$").matches(host)) return true
    val label = Regex("^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$")
    val labels = host.split('.')
    return labels.size >= 2 && labels.all { label.matches(it) } && labels.last().any { it.isLetter() }
  }

  /** The new server must answer the settings endpoint with 2xx using the current key and device ID. */
  private fun probeServer(config: AppConfig, server: ServerConfig): Boolean {
    return fetchPending(config, server, readBody = false).reached
  }

  private fun isOnline(): Boolean {
    return try {
      val connectivity = context.getSystemService(ConnectivityManager::class.java) ?: return false
      val network = connectivity.activeNetwork ?: return false
      connectivity.getNetworkCapabilities(network)?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
    } catch (_: Exception) {
      false
    }
  }

  private fun fetchPending(config: AppConfig, server: ServerConfig, readBody: Boolean = true): PendingFetchResult {
    val endpoint = server.buildUrl(config.remoteSync.pendingSettingsPath)
    if (endpoint.isBlank()) return PendingFetchResult(reached = false, envelope = null)
    return try {
      val url = URL("$endpoint?imei=${URLEncoder.encode(config.deviceId, Charsets.UTF_8.name())}")
      val connection = (url.openConnection() as HttpURLConnection).apply {
        requestMethod = "GET"
        connectTimeout = 6_000
        readTimeout = 6_000
        setRequestProperty("accept", "application/json")
        if (server.apiKey.isNotBlank()) setRequestProperty("x-api-key", server.apiKey)
        if (config.tenantId.isNotBlank()) setRequestProperty("x-tenant-id", config.tenantId)
      }
      val code = connection.responseCode
      if (code !in 200..299) {
        connection.disconnect()
        return PendingFetchResult(reached = false, envelope = null)
      }
      val text = connection.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
      connection.disconnect()
      if (!readBody) return PendingFetchResult(reached = true, envelope = null)
      val root = JSONObject(text)
      val pending = root.optJSONObject("pending") ?: return PendingFetchResult(reached = true, envelope = null)
      val id = pending.optString("id", "").trim()
      val payload = pending.optJSONObject("payload")
      if (id.isBlank() || payload == null) return PendingFetchResult(reached = true, envelope = null)
      PendingFetchResult(reached = true, envelope = PendingSettingsEnvelope(id = id, payload = payload))
    } catch (_: Exception) {
      PendingFetchResult(reached = false, envelope = null)
    }
  }

  private fun ack(config: AppConfig, id: String): Boolean {
    val endpoint = config.server.buildUrl(config.remoteSync.ackSettingsPath)
    if (endpoint.isBlank()) return false
    return try {
      val payload = JSONObject().apply {
        put("id", id)
        put("imei", config.deviceId)
      }
      val connection = (URL(endpoint).openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"
        connectTimeout = 6_000
        readTimeout = 6_000
        doOutput = true
        setRequestProperty("content-type", "application/json")
        if (config.server.apiKey.isNotBlank()) setRequestProperty("x-api-key", config.server.apiKey)
        if (config.tenantId.isNotBlank()) setRequestProperty("x-tenant-id", config.tenantId)
      }
      connection.outputStream.use { out ->
        out.write(payload.toString().toByteArray(Charsets.UTF_8))
      }
      val ok = connection.responseCode in 200..299
      if (ok) {
        connection.inputStream.close()
      }
      connection.disconnect()
      ok
    } catch (_: Exception) {
      false
    }
  }

  private fun mergeConfig(current: AppConfig, payload: JSONObject): AppConfig {
    val apn = firstString(payload, "communicationModuleSettings.apn", "asset.apn").ifBlank { current.apn }
    val tenantId = firstString(payload, "tenantId", "asset.tenantId").ifBlank { current.tenantId }
    val deviceId = firstString(payload, "deviceId", "asset.imei", "asset.id", "asset.cameraId").ifBlank { current.deviceId }

    val nextLive = extractLiveStream(current.liveStream, payload, deviceId)
    return current.copy(
      deviceId = deviceId,
      tenantId = tenantId,
      apn = apn,
      liveStream = nextLive,
      location = extractLocationReport(current.location, payload)
    )
  }

  /**
   * GPS intervals come from the asset's device binding (Send AVL in trip / out of trip) in the
   * settings payload; an explicit `location` block wins when present.
   */
  private fun extractLocationReport(current: LocationReportConfig, payload: JSONObject): LocationReportConfig {
    var next = current
    optObject(payload, "bindings.devices")?.let { binding ->
      if (binding.has("sendAvlsEnabled")) next = next.copy(enabled = binding.optBoolean("sendAvlsEnabled", next.enabled))
      durationSeconds(binding.optJSONObject("sendAvlTripFrequency"))?.let {
        next = next.copy(tripIntervalSec = AppConfigLoader.clampTripInterval(it))
      }
      if (binding.has("sendAvlOutOfTrip")) {
        next = next.copy(outOfTripEnabled = binding.optBoolean("sendAvlOutOfTrip", next.outOfTripEnabled))
      }
      durationSeconds(binding.optJSONObject("sendAvlOutOfTripFrequency"))?.let {
        next = next.copy(outOfTripIntervalSec = AppConfigLoader.clampOutOfTripInterval(it))
      }
    }
    optObject(payload, "location")?.let { block ->
      if (block.has("enabled")) next = next.copy(enabled = block.optBoolean("enabled", next.enabled))
      if (block.has("tripIntervalSec")) {
        next = next.copy(tripIntervalSec = AppConfigLoader.clampTripInterval(block.optInt("tripIntervalSec", next.tripIntervalSec)))
      }
      if (block.has("outOfTripEnabled")) {
        next = next.copy(outOfTripEnabled = block.optBoolean("outOfTripEnabled", next.outOfTripEnabled))
      }
      if (block.has("outOfTripIntervalSec")) {
        next = next.copy(
          outOfTripIntervalSec = AppConfigLoader.clampOutOfTripInterval(block.optInt("outOfTripIntervalSec", next.outOfTripIntervalSec))
        )
      }
    }
    return next
  }

  /** Binding durations are `{ hours, minutes, seconds }`; null when absent or zero. */
  private fun durationSeconds(value: JSONObject?): Int? {
    if (value == null) return null
    val total = value.optInt("hours", 0) * 3_600 + value.optInt("minutes", 0) * 60 + value.optInt("seconds", 0)
    return total.takeIf { it > 0 }
  }

  private fun extractLiveStream(current: LiveStreamConfig, payload: JSONObject, deviceId: String): LiveStreamConfig {
    val explicitStreamUrl = firstString(payload, "liveStream.streamUrl", "streamUrl")
    val explicitChannelUrls = firstArray(payload, "liveStream.channelUrls", "channelUrls")
    val explicitChannelNames = firstArray(payload, "liveStream.channelNames", "channelNames")
    val server1 = optObject(payload, "serverConfigs.Server1")

    val videoProtocol = server1?.optString("videoProtocol", "")?.trim().orEmpty()
    val registerHost = server1?.optString("registerIp", "")?.trim().orEmpty()
    val mediaHost = server1?.optString("mediaIp", "")?.trim().orEmpty()
    val registerPort = parseInt(server1?.optString("registerPort", "") ?: "")
    val mediaPort = parseInt(server1?.optString("mediaPort", "") ?: "")
    var derivedStreamUrl = ""
    if (registerHost.isNotBlank() || mediaHost.isNotBlank()) {
      val settings = PendingLiveSettings(videoProtocol, registerHost, registerPort, mediaHost, mediaPort)
      lastLiveSettings = settings
      derivedStreamUrl = buildStreamUrl(settings, deviceId)
    }

    val nextStreamUrl = explicitStreamUrl.ifBlank { derivedStreamUrl.ifBlank { current.streamUrl } }
    val nextChannelUrls = explicitChannelUrls.ifEmpty {
      if (nextStreamUrl.isNotBlank()) listOf(nextStreamUrl) else current.channelUrls
    }

    return current.copy(
      enabled = current.enabled,
      publishWithHealth = current.publishWithHealth,
      streamUrl = nextStreamUrl,
      channelUrls = nextChannelUrls,
      channelNames = explicitChannelNames.ifEmpty { current.channelNames }
    )
  }

  private fun buildStreamUrl(settings: PendingLiveSettings, deviceId: String): String {
    val host = settings.mediaHost.ifBlank { settings.registerHost }
    val port = settings.mediaPort.takeIf { it > 0 } ?: settings.registerPort.takeIf { it > 0 } ?: 0
    if (host.isBlank() || port <= 0) return ""
    val scheme = when (settings.videoProtocol.lowercase()) {
      "http", "https", "hls" -> "https"
      "rtsps" -> "rtsps"
      else -> "rtsp"
    }
    val cameraKey = URLEncoder.encode(deviceId.ifBlank { "camera-unknown" }, Charsets.UTF_8.name())
    return "$scheme://$host:$port/live/$cameraKey"
  }

  private fun firstString(root: JSONObject, vararg paths: String): String {
    for (path in paths) {
      val value = optAny(root, path)
      if (value is String && value.trim().isNotEmpty()) return value.trim()
    }
    return ""
  }

  private fun firstArray(root: JSONObject, vararg paths: String): List<String> {
    for (path in paths) {
      val value = optAny(root, path)
      if (value is JSONArray) {
        val items = mutableListOf<String>()
        for (index in 0 until value.length()) {
          val item = value.optString(index, "").trim()
          if (item.isNotEmpty()) items += item
        }
        if (items.isNotEmpty()) return items
      }
    }
    return emptyList()
  }

  private fun optObject(root: JSONObject, path: String): JSONObject? {
    return optAny(root, path) as? JSONObject
  }

  private fun optAny(root: JSONObject, path: String): Any? {
    var current: Any = root
    for (segment in path.split('.')) {
      current = when (current) {
        is JSONObject -> current.opt(segment) ?: return null
        else -> return null
      }
    }
    return current
  }

  private fun parseInt(value: String): Int {
    return value.trim().toIntOrNull() ?: 0
  }
}

private data class PendingSettingsEnvelope(
  val id: String,
  val payload: JSONObject
)

private data class PendingFetchResult(
  val reached: Boolean,
  val envelope: PendingSettingsEnvelope?
)

/**
 * Remembers the last working server after a remote move. If the new server is never reached
 * while the unit has internet for ROLLBACK_AFTER_MS, the device moves back so it is not stranded.
 */
private class ServerSwitchGuard(context: Context) {
  private val prefs = context.getSharedPreferences("vivitel_server_switch", Context.MODE_PRIVATE)

  fun beginSwitch(previous: ServerConfig, next: ServerConfig, atMs: Long) {
    prefs.edit()
      .putString(KEY_PREV_PROTOCOL, previous.protocol)
      .putString(KEY_PREV_HOST, previous.host)
      .putInt(KEY_PREV_PORT, previous.port)
      .putString(KEY_NEXT, endpointKey(next))
      .putLong(KEY_SWITCHED_AT, atMs)
      .apply()
  }

  fun markContact(current: ServerConfig) {
    if (prefs.getString(KEY_NEXT, null) == endpointKey(current)) clear()
  }

  fun rollbackTarget(current: ServerConfig, nowMs: Long, online: Boolean): ServerConfig? {
    if (!online) return null
    if (prefs.getString(KEY_NEXT, null) != endpointKey(current)) return null
    val switchedAt = prefs.getLong(KEY_SWITCHED_AT, 0L)
    if (switchedAt <= 0L || nowMs - switchedAt < ROLLBACK_AFTER_MS) return null
    val host = prefs.getString(KEY_PREV_HOST, "").orEmpty()
    val port = prefs.getInt(KEY_PREV_PORT, 0)
    if (host.isBlank() || port <= 0) return null
    return current.copy(protocol = prefs.getString(KEY_PREV_PROTOCOL, current.protocol).orEmpty(), host = host, port = port)
  }

  fun clear() {
    prefs.edit().clear().apply()
  }

  private fun endpointKey(server: ServerConfig): String = "${server.protocol}://${server.host}:${server.port}"

  private companion object {
    const val ROLLBACK_AFTER_MS = 15 * 60_000L
    const val KEY_PREV_PROTOCOL = "prev_protocol"
    const val KEY_PREV_HOST = "prev_host"
    const val KEY_PREV_PORT = "prev_port"
    const val KEY_NEXT = "next_endpoint"
    const val KEY_SWITCHED_AT = "switched_at"
  }
}
