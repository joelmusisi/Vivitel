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
import android.os.IBinder

class IntercomService : Service() {
  private var recorder: AudioRecord? = null
  private var captureThread: Thread? = null
  private val transport = IntercomTransport()

  override fun onCreate() {
    super.onCreate()
    startForeground(1001, buildNotification())
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
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
    val sampleRate = 16000
    val bufferSize = AudioRecord.getMinBufferSize(sampleRate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
    recorder = AudioRecord(
      MediaRecorder.AudioSource.MIC,
      sampleRate,
      AudioFormat.CHANNEL_IN_MONO,
      AudioFormat.ENCODING_PCM_16BIT,
      bufferSize
    )
    recorder?.startRecording()
    captureThread = Thread {
      val buffer = ByteArray(bufferSize)
      while (!Thread.currentThread().isInterrupted) {
        val read = recorder?.read(buffer, 0, buffer.size) ?: 0
        if (read > 0) {
          transport.sendAudio(buffer.copyOf(read))
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
