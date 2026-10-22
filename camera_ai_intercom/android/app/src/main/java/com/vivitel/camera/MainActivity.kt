package com.vivitel.camera

import android.Manifest
import android.content.pm.PackageManager
import android.content.Intent
import android.os.Bundle
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {
  private val configPath = AppConfigLoader.DEFAULT_CONFIG_PATH
  private lateinit var activeConfig: AppConfig

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setContentView(R.layout.activity_main)
    activeConfig = AppConfigLoader.load(this, configPath)
    ensureMicPermission()

    findViewById<android.view.View>(R.id.btnStartIntercom).setOnClickListener {
      startForegroundService(Intent(this, IntercomService::class.java).putExtra(AppConfigLoader.EXTRA_CONFIG_PATH, configPath))
    }
    findViewById<android.view.View>(R.id.btnStopIntercom).setOnClickListener {
      stopService(Intent(this, IntercomService::class.java))
    }
    findViewById<android.view.View>(R.id.btnStartTalkback).setOnClickListener {
      startForegroundService(Intent(this, TalkbackService::class.java).putExtra(AppConfigLoader.EXTRA_CONFIG_PATH, configPath))
    }
    findViewById<android.view.View>(R.id.btnStopTalkback).setOnClickListener {
      stopService(Intent(this, TalkbackService::class.java))
    }
  }

  private fun ensureMicPermission() {
    if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) return
    ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.RECORD_AUDIO), 100)
  }
}
