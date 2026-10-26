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
    LocationReportService.sync(this, configPath, activeConfig)

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
    // READ_EXTERNAL_STORAGE lets the app read config.json / app.apk from the removable SD card.
    val missing = arrayOf(
      Manifest.permission.RECORD_AUDIO,
      Manifest.permission.READ_EXTERNAL_STORAGE,
      Manifest.permission.ACCESS_FINE_LOCATION
    )
      .filter { ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED }
    if (missing.isEmpty()) return
    ActivityCompat.requestPermissions(this, missing.toTypedArray(), 100)
  }
}
