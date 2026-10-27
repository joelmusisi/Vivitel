package com.vivitel.camera

import android.content.Context
import android.content.Intent
import android.content.pm.PackageInfo
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import java.io.File

object DeploymentInstaller {
  private const val PREFS_NAME = "deployment_installer"
  private const val PREF_PENDING = "pending_install"
  private const val PREF_APK_PATH = "apk_path"

  private const val STAGED_APK_DIR = "deploy"

  /**
   * True only when the card carries an APK newer than the installed app. Lets the deploy card stay
   * in the camera (or be re-inserted) without re-running the installer on every boot or mount.
   */
  fun hasNewerApk(context: Context, volumeHint: String? = null): Boolean {
    val apkFile = findApk(context, volumeHint) ?: return false
    return try {
      val pm = context.packageManager
      val archive = pm.getPackageArchiveInfo(apkFile.absolutePath, 0) ?: return false
      if (archive.packageName != context.packageName) return false
      val installed = pm.getPackageInfo(context.packageName, 0)
      versionCodeOf(archive) > versionCodeOf(installed)
    } catch (_: Exception) {
      false
    }
  }

  private fun findApk(context: Context, volumeHint: String?): File? {
    val dir = DeployLocation.findDeployDir(context, volumeHint) ?: return null
    return File(dir, DeployLocation.APK_NAME).takeIf { it.isFile }
  }

  @Suppress("DEPRECATION")
  private fun versionCodeOf(info: PackageInfo): Long {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) info.longVersionCode else info.versionCode.toLong()
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

  fun startInstallFlow(context: Context, volumeHint: String? = null): Boolean {
    val sourceApk = findApk(context, volumeHint) ?: return false

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !context.packageManager.canRequestPackageInstalls()) {
      val settingsIntent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES)
        .setData(Uri.parse("package:${context.packageName}"))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(settingsIntent)
      return false
    }

    // Stage the APK in app cache so the installer can read it via FileProvider and the
    // install survives the card being pulled mid-way.
    val apkFile = try {
      val stagedDir = File(context.cacheDir, STAGED_APK_DIR).apply { mkdirs() }
      sourceApk.copyTo(File(stagedDir, DeployLocation.APK_NAME), overwrite = true)
    } catch (_: Exception) {
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