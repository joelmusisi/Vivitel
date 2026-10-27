package com.vivitel.camera

import android.app.Activity
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.WindowManager
import android.widget.TextView

class DeploymentFeedbackActivity : Activity() {
  private val handler = Handler(Looper.getMainLooper())
  private var blinking = false
  private var blinkOn = false
  private var blinkVariant = BLINK_VARIANT_PROGRESS
  private lateinit var rootView: View
  private lateinit var messageView: TextView
  private val blinkRunnable = object : Runnable {
    override fun run() {
      if (!blinking) return
      blinkOn = !blinkOn
      applyBlinkState(blinkOn)
      handler.postDelayed(this, BLINK_INTERVAL_MS)
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    window.addFlags(
      WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
        WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
    )
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    }
    setContentView(R.layout.activity_deployment_feedback)
    rootView = findViewById(R.id.deploymentFeedbackRoot)
    messageView = findViewById(R.id.deploymentFeedbackMessage)
    handleIntent()
  }

  override fun onNewIntent(intent: android.content.Intent?) {
    super.onNewIntent(intent)
    setIntent(intent)
    handleIntent()
  }

  override fun onDestroy() {
    handler.removeCallbacks(blinkRunnable)
    super.onDestroy()
  }

  private fun handleIntent() {
    val currentIntent = intent ?: return
    val action = currentIntent.getStringExtra(EXTRA_ACTION)?.trim()?.lowercase().orEmpty()
    val message = currentIntent.getStringExtra(EXTRA_MESSAGE)?.trim().orEmpty()

    when (action) {
      ACTION_SHOW_PROGRESS -> {
        messageView.text = if (message.isBlank()) DEFAULT_WAIT_MESSAGE else message
        blinking = true
        blinkVariant = BLINK_VARIANT_PROGRESS
        handler.removeCallbacks(blinkRunnable)
        blinkOn = false
        applyBlinkState(false)
        handler.post(blinkRunnable)
      }

      ACTION_SHOW_NETWORK_OFFLINE -> {
        messageView.text = if (message.isBlank()) DEFAULT_NETWORK_OFFLINE_MESSAGE else message
        blinking = true
        blinkVariant = BLINK_VARIANT_NETWORK_OFFLINE
        handler.removeCallbacks(blinkRunnable)
        blinkOn = false
        applyBlinkState(false)
        handler.post(blinkRunnable)
      }

      ACTION_SHOW_NETWORK_ONLINE -> {
        blinking = false
        handler.removeCallbacks(blinkRunnable)
        applyNetworkOnlineState()
        messageView.text = if (message.isBlank()) DEFAULT_NETWORK_ONLINE_MESSAGE else message
      }

      ACTION_SHOW_COMPLETE -> {
        blinking = false
        handler.removeCallbacks(blinkRunnable)
        applyCompleteState()
        messageView.text = if (message.isBlank()) DEFAULT_SUCCESS_MESSAGE else message
        handler.postDelayed({ finish() }, COMPLETE_CLOSE_DELAY_MS)
      }

      ACTION_CLOSE -> {
        blinking = false
        handler.removeCallbacks(blinkRunnable)
        finish()
      }
    }
  }

  private fun applyBlinkState(on: Boolean) {
    when (blinkVariant) {
      BLINK_VARIANT_NETWORK_OFFLINE -> {
        if (on) {
          rootView.setBackgroundColor(Color.parseColor("#1565C0"))
          messageView.setTextColor(Color.WHITE)
        } else {
          rootView.setBackgroundColor(Color.BLACK)
          messageView.setTextColor(Color.WHITE)
        }
      }

      else -> {
        if (on) {
          rootView.setBackgroundColor(Color.parseColor("#FFD54F"))
          messageView.setTextColor(Color.BLACK)
        } else {
          rootView.setBackgroundColor(Color.BLACK)
          messageView.setTextColor(Color.WHITE)
        }
      }
    }
  }

  private fun applyNetworkOnlineState() {
    rootView.setBackgroundColor(Color.parseColor("#1B5E20"))
    messageView.setTextColor(Color.WHITE)
  }

  private fun applyCompleteState() {
    rootView.setBackgroundColor(Color.parseColor("#1B5E20"))
    messageView.setTextColor(Color.WHITE)
  }

  companion object {
    const val EXTRA_ACTION = "action"
    const val EXTRA_MESSAGE = "message"

    const val ACTION_SHOW_PROGRESS = "show_progress"
    const val ACTION_SHOW_NETWORK_OFFLINE = "show_network_offline"
    const val ACTION_SHOW_NETWORK_ONLINE = "show_network_online"
    const val ACTION_SHOW_COMPLETE = "show_complete"
    const val ACTION_CLOSE = "close"

    const val DEFAULT_WAIT_MESSAGE = "Please Wait"
    const val DEFAULT_NETWORK_OFFLINE_MESSAGE = "Network offline"
    const val DEFAULT_NETWORK_ONLINE_MESSAGE = "Network online"
    const val DEFAULT_SUCCESS_MESSAGE = "Upload done successfully, please reboot the device"

    private const val BLINK_VARIANT_PROGRESS = "progress"
    private const val BLINK_VARIANT_NETWORK_OFFLINE = "network_offline"
    private const val BLINK_INTERVAL_MS = 700L
    private const val COMPLETE_CLOSE_DELAY_MS = 8_000L
  }
}