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

  fun lastAppliedLiveSettings(): PendingLiveSettings? = lastLiveSettings

  fun poll(config: AppConfig): Boolean {
    if (!config.remoteSync.enabled || config.deviceId.isBlank()) return false
    val now = System.currentTimeMillis()
    if (now - lastPollAtMs < config.remoteSync.pollIntervalMs) return false
    lastPollAtMs = now

    val pending = fetchPending(config) ?: return false
    val merged = mergeConfig(config, pending.payload)
    val acked = ack(config, pending.id)
    if (!acked) return false
    if (merged == config) return false
    return AppConfigLoader.saveRuntimeConfig(context, merged)
  }

  private fun fetchPending(config: AppConfig): PendingSettingsEnvelope? {
    val endpoint = config.server.buildUrl(config.remoteSync.pendingSettingsPath)
    if (endpoint.isBlank()) return null
    return try {
      val url = URL("$endpoint?imei=${URLEncoder.encode(config.deviceId, Charsets.UTF_8.name())}")
      val connection = (url.openConnection() as HttpURLConnection).apply {
        requestMethod = "GET"
        connectTimeout = 6_000
        readTimeout = 6_000
        setRequestProperty("accept", "application/json")
        if (config.server.apiKey.isNotBlank()) setRequestProperty("x-api-key", config.server.apiKey)
        if (config.tenantId.isNotBlank()) setRequestProperty("x-tenant-id", config.tenantId)
      }
      val code = connection.responseCode
      if (code !in 200..299) {
        connection.disconnect()
        return null
      }
      val text = connection.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
      connection.disconnect()
      val root = JSONObject(text)
      val pending = root.optJSONObject("pending") ?: return null
      val id = pending.optString("id", "").trim()
      val payload = pending.optJSONObject("payload") ?: return null
      if (id.isBlank()) return null
      PendingSettingsEnvelope(id = id, payload = payload)
    } catch (_: Exception) {
      null
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
      liveStream = nextLive
    )
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
