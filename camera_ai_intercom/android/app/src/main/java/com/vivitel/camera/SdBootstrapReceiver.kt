package com.vivitel.camera

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class SdBootstrapReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    // Placeholder: read /sdcard/vivitel/intercom/config.json and start services.
    context.startForegroundService(Intent(context, IntercomService::class.java))
    context.startService(Intent(context, TalkbackService::class.java))
  }
}
