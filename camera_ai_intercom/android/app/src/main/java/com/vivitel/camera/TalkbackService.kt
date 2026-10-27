package com.vivitel.camera

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.os.Build
import android.os.IBinder

class TalkbackService : Service() {
  private var player: AudioTrack? = null
  private var playThread: Thread? = null
  private var activeConfig: AppConfig = AppConfig()
  private var transport: TalkbackTransport = TalkbackTransport(activeConfig)

  override fun onCreate() {
    super.onCreate()
    startForeground(1002, buildNotification())
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val configPath = intent?.getStringExtra(AppConfigLoader.EXTRA_CONFIG_PATH) ?: AppConfigLoader.DEFAULT_CONFIG_PATH
    activeConfig = AppConfigLoader.load(this, configPath)
    transport = TalkbackTransport(activeConfig)
    startPlayback()
    return START_STICKY
  }

  override fun onDestroy() {
    stopPlayback()
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun startPlayback() {
    if (playThread != null) return
    val sampleRate = activeConfig.talkback.sampleRate
    val channelMask = if (activeConfig.talkback.channels > 1) AudioFormat.CHANNEL_OUT_STEREO else AudioFormat.CHANNEL_OUT_MONO
    val bufferSize = AudioTrack.getMinBufferSize(sampleRate, channelMask, AudioFormat.ENCODING_PCM_16BIT)

    player = AudioTrack.Builder()
      .setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
          .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
          .build()
      )
      .setAudioFormat(
        AudioFormat.Builder()
          .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
          .setSampleRate(sampleRate)
          .setChannelMask(channelMask)
          .build()
      )
      .setBufferSizeInBytes(bufferSize)
      .build()
    player?.play()

    playThread = Thread {
      while (!Thread.currentThread().isInterrupted) {
        val packet = transport.receiveAudio()
        if (packet != null && packet.audio.isNotEmpty()) {
          val written = player?.write(packet.audio, 0, packet.audio.size) ?: 0
          if (written > 0) {
            transport.ackPacket(packet.id)
          }
        } else {
          Thread.sleep(transport.pollIntervalMs())
        }
      }
    }.apply { start() }
  }

  private fun stopPlayback() {
    playThread?.interrupt()
    playThread = null
    player?.stop()
    player?.release()
    player = null
  }

  private fun buildNotification(): Notification {
    val channelId = "talkback"
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(channelId, "Talkback", NotificationManager.IMPORTANCE_LOW)
      val manager = getSystemService(NotificationManager::class.java)
      manager.createNotificationChannel(channel)
    }
    return Notification.Builder(this, channelId)
      .setContentTitle("Talkback Active")
      .setSmallIcon(android.R.drawable.ic_btn_speak_now)
      .build()
  }
}
