package com.vivitel.camera

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper

class IntercomService : Service() {
  private var recorder: AudioRecord? = null
  private var captureThread: Thread? = null
  private var activeConfig: AppConfig = AppConfig()
  private var transport: IntercomTransport? = null
  private var activeConfigPath: String = AppConfigLoader.DEFAULT_CONFIG_PATH
  private val mainHandler = Handler(Looper.getMainLooper())
  @Volatile private var reloadQueued = false

  override fun onCreate() {
    super.onCreate()
    startForeground(1001, buildNotification())
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    activeConfigPath = intent?.getStringExtra(AppConfigLoader.EXTRA_CONFIG_PATH) ?: AppConfigLoader.DEFAULT_CONFIG_PATH
    activeConfig = AppConfigLoader.load(this, activeConfigPath)
    transport = IntercomTransport(this, activeConfig, ::scheduleConfigReload)
    startCapture()
    return START_STICKY
  }

  override fun onDestroy() {
    stopCapture()
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun startCapture() {
    if (captureThread != null) return
    val sampleRate = activeConfig.intercom.sampleRate
    val channels = if (activeConfig.intercom.channels > 1) AudioFormat.CHANNEL_IN_STEREO else AudioFormat.CHANNEL_IN_MONO
    val frameBytes = (sampleRate * 2 * activeConfig.intercom.frameMs / 1000).coerceAtLeast(320)
    val minBuffer = AudioRecord.getMinBufferSize(sampleRate, channels, AudioFormat.ENCODING_PCM_16BIT)
    val bufferSize = maxOf(minBuffer, frameBytes)

    recorder = AudioRecord(
      MediaRecorder.AudioSource.MIC,
      sampleRate,
      channels,
      AudioFormat.ENCODING_PCM_16BIT,
      bufferSize
    )
    recorder?.startRecording()
    captureThread = Thread {
      val buffer = ByteArray(bufferSize)
      while (!Thread.currentThread().isInterrupted) {
        val read = recorder?.read(buffer, 0, buffer.size) ?: 0
        if (read > 0) {
          transport?.sendAudio(buffer.copyOf(read))
        }
      }
    }.apply { start() }
  }

  private fun stopCapture() {
    captureThread?.interrupt()
    captureThread = null
    recorder?.stop()
    recorder?.release()
    recorder = null
    transport?.close()
    transport = null
  }

  private fun scheduleConfigReload() {
    if (reloadQueued) return
    reloadQueued = true
    mainHandler.post {
      reloadQueued = false
      stopCapture()
      activeConfig = AppConfigLoader.load(this, activeConfigPath)
      transport = IntercomTransport(this, activeConfig, ::scheduleConfigReload)
      LocationReportService.sync(this, activeConfigPath, activeConfig)
      if (activeConfig.camera.autoStartNetworkStatus) {
        startForegroundService(
          Intent(this, NetworkStatusService::class.java)
            .putExtra(AppConfigLoader.EXTRA_CONFIG_PATH, activeConfigPath)
        )
      } else {
        stopService(Intent(this, NetworkStatusService::class.java))
      }
      if (activeConfig.camera.autoStartTalkback) {
        startForegroundService(
          Intent(this, TalkbackService::class.java)
            .putExtra(AppConfigLoader.EXTRA_CONFIG_PATH, activeConfigPath)
        )
      } else {
        stopService(Intent(this, TalkbackService::class.java))
      }
      startCapture()
    }
  }

  private fun buildNotification(): Notification {
    val channelId = "intercom"
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(channelId, "Intercom", NotificationManager.IMPORTANCE_LOW)
      val manager = getSystemService(NotificationManager::class.java)
      manager.createNotificationChannel(channel)
    }
    return Notification.Builder(this, channelId)
      .setContentTitle("Intercom Active")
      .setSmallIcon(android.R.drawable.ic_btn_speak_now)
      .build()
  }
}
