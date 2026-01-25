package com.vivitel.camera

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setContentView(R.layout.activity_main)

    findViewById<android.view.View>(R.id.btnStartIntercom).setOnClickListener {
      startForegroundService(Intent(this, IntercomService::class.java))
    }
    findViewById<android.view.View>(R.id.btnStopIntercom).setOnClickListener {
      stopService(Intent(this, IntercomService::class.java))
    }
    findViewById<android.view.View>(R.id.btnStartTalkback).setOnClickListener {
      startService(Intent(this, TalkbackService::class.java))
    }
    findViewById<android.view.View>(R.id.btnStopTalkback).setOnClickListener {
      stopService(Intent(this, TalkbackService::class.java))
    }
  }
}
