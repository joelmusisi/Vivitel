package com.vivitel.camera

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.speech.tts.TextToSpeech
import java.util.Locale

class DeploymentFeedbackService : Service(), TextToSpeech.OnInitListener {
  private var textToSpeech: TextToSpeech? = null
  private var toneGenerator: ToneGenerator? = null
  private val handler = Handler(Looper.getMainLooper())
  private var pendingMessage: String? = null
  private var repeatMessage: String = DEFAULT_WAIT_MESSAGE
  private var repeatIntervalMs: Long = 60_000L
  private var repeatEnabled = false
  private var ttsReady = false
  private val repeatRunnable = object : Runnable {
    override fun run() {
      if (!repeatEnabled) return
      announce(repeatMessage)
      handler.postDelayed(this, repeatIntervalMs)
    }
  }

  override fun onCreate() {
    super.onCreate()
    startForeground(NOTIFICATION_ID, buildNotification("Deployment feedback active"))
    toneGenerator = ToneGenerator(AudioManager.STREAM_NOTIFICATION, 90)
    textToSpeech = TextToSpeech(applicationContext, this)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.getStringExtra(EXTRA_ACTION)?.trim()?.lowercase()) {
      ACTION_START_REPEAT -> {
        repeatMessage = intent.getStringExtra(EXTRA_MESSAGE)?.trim().orEmpty().ifBlank { DEFAULT_WAIT_MESSAGE }
        repeatIntervalMs = (intent.getIntExtra(EXTRA_INTERVAL_SECONDS, 60).coerceAtLeast(10) * 1000L)
        repeatEnabled = true
        handler.removeCallbacks(repeatRunnable)
        if (ttsReady) {
          announce(repeatMessage)
          handler.postDelayed(repeatRunnable, repeatIntervalMs)
        } else {
          pendingMessage = repeatMessage
        }
      }

      ACTION_COMPLETE -> {
        repeatEnabled = false
        handler.removeCallbacks(repeatRunnable)
        val message = intent.getStringExtra(EXTRA_MESSAGE)?.trim().orEmpty().ifBlank { DEFAULT_SUCCESS_MESSAGE }
        if (ttsReady) {
          announce(message, TextToSpeech.QUEUE_FLUSH)
        } else {
          pendingMessage = message
        }
        handler.postDelayed({ stopSelf() }, COMPLETE_STOP_DELAY_MS)
      }

      ACTION_STOP -> {
        repeatEnabled = false
        handler.removeCallbacks(repeatRunnable)
        stopSelf()
      }
    }
    return START_NOT_STICKY
  }

  override fun onInit(status: Int) {
    if (status == TextToSpeech.SUCCESS) {
      val result = textToSpeech?.setLanguage(Locale.US)
      ttsReady = result != TextToSpeech.LANG_MISSING_DATA && result != TextToSpeech.LANG_NOT_SUPPORTED
    }
    val initialMessage = pendingMessage
    pendingMessage = null
    if (!initialMessage.isNullOrBlank()) {
      announce(initialMessage)
    }
    if (repeatEnabled) {
      handler.removeCallbacks(repeatRunnable)
      handler.postDelayed(repeatRunnable, repeatIntervalMs)
    }
  }

  override fun onDestroy() {
    handler.removeCallbacks(repeatRunnable)
    textToSpeech?.stop()
    textToSpeech?.shutdown()
    textToSpeech = null
    toneGenerator?.release()
    toneGenerator = null
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun speak(message: String, queueMode: Int = TextToSpeech.QUEUE_FLUSH) {
    if (!ttsReady || message.isBlank()) return
    textToSpeech?.speak(message, queueMode, null, "deployment-feedback")
  }

  private fun announce(message: String, queueMode: Int = TextToSpeech.QUEUE_FLUSH) {
    if (ttsReady) {
      speak(message, queueMode)
      return
    }
    playFallbackTone()
  }

  private fun playFallbackTone() {
    try {
      toneGenerator?.startTone(ToneGenerator.TONE_PROP_BEEP2, 250)
      handler.postDelayed({ toneGenerator?.startTone(ToneGenerator.TONE_PROP_BEEP, 250) }, 320L)
    } catch (_: Exception) {
      // Ignore fallback tone failures.
    }
  }

  private fun buildNotification(content: String): Notification {
    val channelId = NOTIFICATION_CHANNEL_ID
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(channelId, "Deployment Feedback", NotificationManager.IMPORTANCE_LOW)
      val manager = getSystemService(NotificationManager::class.java)
      manager.createNotificationChannel(channel)
    }
    return Notification.Builder(this, channelId)
      .setContentTitle("Vivitel Deployment")
      .setContentText(content)
      .setSmallIcon(android.R.drawable.ic_dialog_info)
      .build()
  }

  companion object {
    const val EXTRA_ACTION = "action"
    const val EXTRA_MESSAGE = "message"
    const val EXTRA_INTERVAL_SECONDS = "intervalSeconds"

    const val ACTION_START_REPEAT = "start_repeat"
    const val ACTION_COMPLETE = "complete"
    const val ACTION_STOP = "stop"

    const val DEFAULT_WAIT_MESSAGE = "Please Wait"
    const val DEFAULT_SUCCESS_MESSAGE = "Upload done successfully, please reboot the device"

    private const val NOTIFICATION_ID = 1107
    private const val NOTIFICATION_CHANNEL_ID = "deployment-feedback"
    private const val COMPLETE_STOP_DELAY_MS = 8_000L
  }
}