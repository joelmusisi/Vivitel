package com.vivitel.camera

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URLEncoder
import java.net.URL

data class TalkbackPacket(
  val id: String,
  val audio: ByteArray
)

class TalkbackTransport(private val config: AppConfig) {
  fun receiveAudio(): TalkbackPacket? {
    val endpoint = config.server.buildUrl(config.server.talkbackNextPath)
    if (endpoint.isEmpty()) return null

    val deviceId = config.deviceId.ifBlank { "camera-unknown" }
    val encodedDeviceId = URLEncoder.encode(deviceId, "UTF-8")
    val url = "$endpoint?cameraId=$encodedDeviceId"

    return try {
      val connection = (URL(url).openConnection() as HttpURLConnection).apply {
        requestMethod = "GET"
        connectTimeout = 6_000
        readTimeout = 6_000
        if (config.server.apiKey.isNotBlank()) {
          setRequestProperty("x-api-key", config.server.apiKey)
        }
        if (config.tenantId.isNotBlank()) {
          setRequestProperty("x-tenant-id", config.tenantId)
        }
      }

      val status = connection.responseCode
      if (status == 204) {
        connection.disconnect()
        return null
      }
      if (status !in 200..299) {
        connection.disconnect()
        return null
      }

      val response = connection.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
      connection.disconnect()
      if (response.isBlank()) return null
      val json = JSONObject(response)
      val id = json.optString("id", "").trim()
      val base64 = json.optString("pcm16leBase64", "").trim()
      if (id.isBlank() || base64.isBlank()) return null
      val audio = android.util.Base64.decode(base64, android.util.Base64.DEFAULT)
      if (audio.isEmpty()) return null
      TalkbackPacket(id = id, audio = audio)
    } catch (_: Exception) {
      null
    }
  }

  fun ackPacket(packetId: String): Boolean {
    if (packetId.isBlank()) return false
    val endpoint = config.server.buildUrl(config.server.talkbackAckBasePath)
    if (endpoint.isEmpty()) return false
    val url = "$endpoint/$packetId/ack"
    return try {
      val connection = (URL(url).openConnection() as HttpURLConnection).apply {
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
        out.write("{}".toByteArray(Charsets.UTF_8))
      }
      val ok = connection.responseCode in 200..299
      connection.inputStream.close()
      connection.disconnect()
      ok
    } catch (_: Exception) {
      false
    }
  }

  fun pollIntervalMs(): Long = config.talkback.pollIntervalMs.toLong()
}
