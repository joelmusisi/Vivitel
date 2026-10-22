package com.vivitel.camera

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.URI

data class ServerConfig(
  val protocol: String = "https",
  val host: String = "",
  val port: Int = 0,
  val apiBasePath: String = "/",
  val apiKey: String = "",
  val cameraHealthPath: String = "/ingest/camera-health",
  val intercomAudioPath: String = "/ingest/intercom-audio",
  val talkbackNextPath: String = "/intercom/talkback/next",
  val talkbackAckBasePath: String = "/intercom/talkback"
) {
  fun isConfigured(): Boolean = host.isNotBlank() && port > 0

  fun buildUrl(path: String): String {
    if (!isConfigured()) return ""
    val basePath = normalizePath(apiBasePath)
    val relPath = normalizePath(path)
    return "$protocol://$host:$port$basePath$relPath"
  }

  private fun normalizePath(value: String): String {
    val trimmed = value.trim()
    if (trimmed.isEmpty() || trimmed == "/") return ""
    return if (trimmed.startsWith("/")) trimmed else "/$trimmed"
  }
}

data class IntercomConfig(
  val sampleRate: Int = 16_000,
  val channels: Int = 1,
  val frameMs: Int = 20,
  val uploadIntervalMs: Int = 1_000,
  val maxBufferedBytes: Int = 32_000
)

data class TalkbackConfig(
  val sampleRate: Int = 16_000,
  val channels: Int = 1,
  val pollIntervalMs: Int = 300
)

data class CameraBehaviorConfig(
  val autoStartIntercom: Boolean = true,
  val autoStartTalkback: Boolean = true,
  val autoStartNetworkStatus: Boolean = true
)

data class RemoteSyncConfig(
  val enabled: Boolean = true,
  val pollIntervalMs: Int = 30_000,
  val pendingSettingsPath: String = "/device/pending-settings",
  val ackSettingsPath: String = "/device/ack-settings"
)

data class LiveStreamConfig(
  val enabled: Boolean = true,
  val publishWithHealth: Boolean = true,
  val streamUrl: String = "",
  val channelUrls: List<String> = emptyList(),
  val channelNames: List<String> = listOf("Main")
)

data class AppConfig(
  val deviceId: String = "",
  val tenantId: String = "",
  val apn: String = "",
  val server: ServerConfig = ServerConfig(),
  val intercom: IntercomConfig = IntercomConfig(),
  val talkback: TalkbackConfig = TalkbackConfig(),
  val camera: CameraBehaviorConfig = CameraBehaviorConfig(),
  val remoteSync: RemoteSyncConfig = RemoteSyncConfig(),
  val liveStream: LiveStreamConfig = LiveStreamConfig()
)

object AppConfigLoader {
  const val EXTRA_CONFIG_PATH = "config_path"
  const val DEFAULT_CONFIG_PATH = "/sdcard/vivitel/intercom/config.json"
  private const val PREFS_NAME = "vivitel_camera_runtime"
  private const val PREF_RUNTIME_CONFIG = "runtime_config"

  fun load(context: Context? = null, configPath: String = DEFAULT_CONFIG_PATH): AppConfig {
    val file = File(configPath)
    val base = if (!file.exists()) {
      AppConfig()
    } else {
      try {
        val json = JSONObject(file.readText(Charsets.UTF_8))
        parse(json)
      } catch (_: Exception) {
        AppConfig()
      }
    }

    if (context == null) return base
    val raw = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getString(PREF_RUNTIME_CONFIG, "")?.trim().orEmpty()
    if (raw.isEmpty()) return base
    return try {
      mergeConfigs(base, parse(JSONObject(raw)))
    } catch (_: Exception) {
      base
    }
  }

  /** Keeps user/runtime settings when a fresh SD-card config.json is uploaded with the app. */
  private fun mergeConfigs(base: AppConfig, runtime: AppConfig): AppConfig {
    val server = mergeServer(base.server, runtime.server)
    return AppConfig(
      deviceId = runtime.deviceId.ifBlank { base.deviceId },
      tenantId = runtime.tenantId.ifBlank { base.tenantId },
      apn = runtime.apn.ifBlank { base.apn },
      server = server,
      intercom = mergeIntercom(base.intercom, runtime.intercom),
      talkback = mergeTalkback(base.talkback, runtime.talkback),
      camera = mergeCamera(base.camera, runtime.camera),
      remoteSync = mergeRemoteSync(base.remoteSync, runtime.remoteSync),
      liveStream = mergeLiveStream(base.liveStream, runtime.liveStream)
    )
  }

  private fun mergeServer(base: ServerConfig, runtime: ServerConfig): ServerConfig {
    return ServerConfig(
      protocol = runtime.protocol.ifBlank { base.protocol },
      host = runtime.host.ifBlank { base.host },
      port = if (runtime.port > 0) runtime.port else base.port,
      apiBasePath = runtime.apiBasePath.ifBlank { base.apiBasePath },
      apiKey = runtime.apiKey.ifBlank { base.apiKey },
      cameraHealthPath = runtime.cameraHealthPath.ifBlank { base.cameraHealthPath },
      intercomAudioPath = runtime.intercomAudioPath.ifBlank { base.intercomAudioPath },
      talkbackNextPath = runtime.talkbackNextPath.ifBlank { base.talkbackNextPath },
      talkbackAckBasePath = runtime.talkbackAckBasePath.ifBlank { base.talkbackAckBasePath }
    )
  }

  private fun mergeIntercom(base: IntercomConfig, runtime: IntercomConfig): IntercomConfig {
    return IntercomConfig(
      sampleRate = if (runtime.sampleRate != 16_000) runtime.sampleRate else base.sampleRate,
      channels = if (runtime.channels != 1) runtime.channels else base.channels,
      frameMs = if (runtime.frameMs != 20) runtime.frameMs else base.frameMs,
      uploadIntervalMs = if (runtime.uploadIntervalMs != 1_000) runtime.uploadIntervalMs else base.uploadIntervalMs,
      maxBufferedBytes = if (runtime.maxBufferedBytes != 32_000) runtime.maxBufferedBytes else base.maxBufferedBytes
    )
  }

  private fun mergeTalkback(base: TalkbackConfig, runtime: TalkbackConfig): TalkbackConfig {
    return TalkbackConfig(
      sampleRate = if (runtime.sampleRate != 16_000) runtime.sampleRate else base.sampleRate,
      channels = if (runtime.channels != 1) runtime.channels else base.channels,
      pollIntervalMs = if (runtime.pollIntervalMs != 300) runtime.pollIntervalMs else base.pollIntervalMs
    )
  }

  private fun mergeCamera(base: CameraBehaviorConfig, runtime: CameraBehaviorConfig): CameraBehaviorConfig {
    return CameraBehaviorConfig(
      autoStartIntercom = runtime.autoStartIntercom,
      autoStartTalkback = runtime.autoStartTalkback,
      autoStartNetworkStatus = runtime.autoStartNetworkStatus
    )
  }

  private fun mergeRemoteSync(base: RemoteSyncConfig, runtime: RemoteSyncConfig): RemoteSyncConfig {
    return RemoteSyncConfig(
      enabled = runtime.enabled,
      pollIntervalMs = if (runtime.pollIntervalMs != 30_000) runtime.pollIntervalMs else base.pollIntervalMs,
      pendingSettingsPath = runtime.pendingSettingsPath.ifBlank { base.pendingSettingsPath },
      ackSettingsPath = runtime.ackSettingsPath.ifBlank { base.ackSettingsPath }
    )
  }

  private fun mergeLiveStream(base: LiveStreamConfig, runtime: LiveStreamConfig): LiveStreamConfig {
    return LiveStreamConfig(
      enabled = runtime.enabled,
      publishWithHealth = runtime.publishWithHealth,
      streamUrl = runtime.streamUrl.ifBlank { base.streamUrl },
      channelUrls = if (runtime.channelUrls.isNotEmpty()) runtime.channelUrls else base.channelUrls,
      channelNames = if (runtime.channelNames != listOf("Main")) runtime.channelNames else base.channelNames
    )
  }

  fun saveRuntimeConfig(context: Context, config: AppConfig): Boolean {
    return try {
      context
        .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .edit()
        .putString(PREF_RUNTIME_CONFIG, toJson(config).toString())
        .apply()
      true
    } catch (_: Exception) {
      false
    }
  }

  private fun parse(json: JSONObject): AppConfig {
    val server = parseServer(json)

    val intercomJson = json.optJSONObject("intercom") ?: JSONObject()
    val talkbackJson = json.optJSONObject("talkback") ?: JSONObject()
    val cameraJson = json.optJSONObject("camera") ?: JSONObject()
    val remoteSyncJson = json.optJSONObject("remoteSync") ?: JSONObject()
    val liveStreamJson = json.optJSONObject("liveStream") ?: JSONObject()

    return AppConfig(
      deviceId = json.optString("deviceId", "").trim(),
      tenantId = json.optString("tenantId", "").trim(),
      apn = json.optString("apn", "").trim(),
      server = server,
      intercom = IntercomConfig(
        sampleRate = intercomJson.optInt("sampleRate", 16_000).coerceAtLeast(8_000),
        channels = intercomJson.optInt("channels", 1).coerceIn(1, 2),
        frameMs = intercomJson.optInt("frameMs", 20).coerceIn(10, 200),
        uploadIntervalMs = intercomJson.optInt("uploadIntervalMs", 1_000).coerceIn(200, 5_000),
        maxBufferedBytes = intercomJson.optInt("maxBufferedBytes", 32_000).coerceIn(8_000, 262_144)
      ),
      talkback = TalkbackConfig(
        sampleRate = talkbackJson.optInt("sampleRate", 16_000).coerceAtLeast(8_000),
        channels = talkbackJson.optInt("channels", 1).coerceIn(1, 2),
        pollIntervalMs = talkbackJson.optInt("pollIntervalMs", 300).coerceIn(100, 5_000)
      ),
      camera = CameraBehaviorConfig(
        autoStartIntercom = cameraJson.optBoolean("autoStartIntercom", true),
        autoStartTalkback = cameraJson.optBoolean("autoStartTalkback", true),
        autoStartNetworkStatus = cameraJson.optBoolean("autoStartNetworkStatus", true)
      ),
      remoteSync = RemoteSyncConfig(
        enabled = remoteSyncJson.optBoolean("enabled", true),
        pollIntervalMs = remoteSyncJson.optInt("pollIntervalMs", 30_000).coerceIn(5_000, 300_000),
        pendingSettingsPath = remoteSyncJson.optString("pendingSettingsPath", "/device/pending-settings").trim().ifBlank {
          "/device/pending-settings"
        },
        ackSettingsPath = remoteSyncJson.optString("ackSettingsPath", "/device/ack-settings").trim().ifBlank {
          "/device/ack-settings"
        }
      ),
      liveStream = LiveStreamConfig(
        enabled = liveStreamJson.optBoolean("enabled", true),
        publishWithHealth = liveStreamJson.optBoolean("publishWithHealth", true),
        streamUrl = liveStreamJson.optString("streamUrl", "").trim(),
        channelUrls = parseStringArray(liveStreamJson.optJSONArray("channelUrls")),
        channelNames = parseStringArray(liveStreamJson.optJSONArray("channelNames")).ifEmpty { listOf("Main") }
      )
    )
  }

  private fun parseStringArray(array: JSONArray?): List<String> {
    if (array == null) return emptyList()
    val values = mutableListOf<String>()
    for (index in 0 until array.length()) {
      val value = array.optString(index, "").trim()
      if (value.isNotEmpty()) values += value
    }
    return values
  }

  private fun toJson(config: AppConfig): JSONObject {
    return JSONObject().apply {
      put("deviceId", config.deviceId)
      put("tenantId", config.tenantId)
      put("apn", config.apn)
      put("server", JSONObject().apply {
        put("protocol", config.server.protocol)
        put("host", config.server.host)
        put("port", config.server.port)
        put("apiBasePath", config.server.apiBasePath)
        put("apiKey", config.server.apiKey)
        put("cameraHealthPath", config.server.cameraHealthPath)
        put("intercomAudioPath", config.server.intercomAudioPath)
        put("talkbackNextPath", config.server.talkbackNextPath)
        put("talkbackAckBasePath", config.server.talkbackAckBasePath)
      })
      put("intercom", JSONObject().apply {
        put("sampleRate", config.intercom.sampleRate)
        put("channels", config.intercom.channels)
        put("frameMs", config.intercom.frameMs)
        put("uploadIntervalMs", config.intercom.uploadIntervalMs)
        put("maxBufferedBytes", config.intercom.maxBufferedBytes)
      })
      put("talkback", JSONObject().apply {
        put("sampleRate", config.talkback.sampleRate)
        put("channels", config.talkback.channels)
        put("pollIntervalMs", config.talkback.pollIntervalMs)
      })
      put("camera", JSONObject().apply {
        put("autoStartIntercom", config.camera.autoStartIntercom)
        put("autoStartTalkback", config.camera.autoStartTalkback)
        put("autoStartNetworkStatus", config.camera.autoStartNetworkStatus)
      })
      put("remoteSync", JSONObject().apply {
        put("enabled", config.remoteSync.enabled)
        put("pollIntervalMs", config.remoteSync.pollIntervalMs)
        put("pendingSettingsPath", config.remoteSync.pendingSettingsPath)
        put("ackSettingsPath", config.remoteSync.ackSettingsPath)
      })
      put("liveStream", JSONObject().apply {
        put("enabled", config.liveStream.enabled)
        put("publishWithHealth", config.liveStream.publishWithHealth)
        put("streamUrl", config.liveStream.streamUrl)
        put("channelUrls", JSONArray(config.liveStream.channelUrls))
        put("channelNames", JSONArray(config.liveStream.channelNames))
      })
    }
  }

  private fun parseServer(root: JSONObject): ServerConfig {
    val serverJson = root.optJSONObject("server") ?: JSONObject()
    var protocol = serverJson.optString("protocol", "https").trim().ifBlank { "https" }
    var host = serverJson.optString("host", "").trim()
    var port = serverJson.optInt("port", 0)

    val legacyUrl = root.optString("serverUrl", "").trim()
    if (legacyUrl.isNotEmpty() && (host.isEmpty() || port <= 0)) {
      try {
        val uri = URI(legacyUrl)
        if (!uri.scheme.isNullOrBlank()) protocol = uri.scheme.trim()
        if (!uri.host.isNullOrBlank()) host = uri.host.trim()
        if (uri.port > 0) port = uri.port
      } catch (_: Exception) {
        // Ignore parse errors and use explicit server settings.
      }
    }

    val normalizedProtocol = when (protocol.lowercase()) {
      "http", "https" -> protocol.lowercase()
      "ws" -> "http"
      "wss" -> "https"
      else -> "https"
    }

    return ServerConfig(
      protocol = normalizedProtocol,
      host = host,
      port = port,
      apiBasePath = serverJson.optString("apiBasePath", "/").trim().ifBlank { "/" },
      apiKey = serverJson.optString("apiKey", "").trim(),
      cameraHealthPath = serverJson.optString("cameraHealthPath", "/ingest/camera-health").trim().ifBlank {
        "/ingest/camera-health"
      },
      intercomAudioPath = serverJson.optString("intercomAudioPath", "/ingest/intercom-audio").trim().ifBlank {
        "/ingest/intercom-audio"
      },
      talkbackNextPath = serverJson.optString("talkbackNextPath", "/intercom/talkback/next").trim().ifBlank {
        "/intercom/talkback/next"
      },
      talkbackAckBasePath = serverJson.optString("talkbackAckBasePath", "/intercom/talkback").trim().ifBlank {
        "/intercom/talkback"
      }
    )
  }
}