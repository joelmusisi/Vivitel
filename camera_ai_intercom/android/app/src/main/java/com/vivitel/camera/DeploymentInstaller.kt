package com.vivitel.camera

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import java.io.File

object DeploymentInstaller {
  private const val PREFS_NAME = "deployment_installer"
  private const val PREF_PENDING = "pending_install"
  private const val PREF_APK_PATH = "apk_path"

  private const val BASE_DIR_PATH = "/sdcard/vivitel/intercom"
  private const val APK_NAME = "app.apk"

  fun hasDeploymentBundle(): Boolean {
    val baseDir = File(BASE_DIR_PATH)
    return File(baseDir, "install.sh").exists() || File(baseDir, APK_NAME).exists()
  }

  fun markPending(context: Context, apkPath: String) {
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .edit()
      .putBoolean(PREF_PENDING, true)
      .putString(PREF_APK_PATH, apkPath)
      .apply()
  }

  fun isPending(context: Context): Boolean {
    return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .getBoolean(PREF_PENDING, false)
  }

  fun clearPending(context: Context) {
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .edit()
      .remove(PREF_PENDING)
      .remove(PREF_APK_PATH)
      .apply()
  }

  fun startInstallFlow(context: Context): Boolean {
    val apkFile = File(BASE_DIR_PATH, APK_NAME)
    if (!apkFile.exists()) return false

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !context.packageManager.canRequestPackageInstalls()) {
      val settingsIntent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES)
        .setData(Uri.parse("package:${context.packageName}"))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(settingsIntent)
      return false
    }

    val uri = FileProvider.getUriForFile(
      context,
      "${context.packageName}.fileprovider",
      apkFile
    )

    markPending(context, apkFile.absolutePath)

    val installIntent = Intent(Intent.ACTION_VIEW)
      .setDataAndType(uri, "application/vnd.android.package-archive")
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)

    context.startActivity(installIntent)
    return true
  }
}