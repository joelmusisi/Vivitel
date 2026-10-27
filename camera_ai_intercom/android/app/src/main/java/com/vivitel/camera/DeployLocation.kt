package com.vivitel.camera

import android.content.Context
import android.os.Environment
import java.io.File

/**
 * Finds the Vivitel deploy folder. On Android 9 `/sdcard` is internal storage, so the
 * removable microSD (mounted at /storage/XXXX-XXXX) is searched first and the legacy
 * internal path is kept as a fallback for units provisioned over ADB.
 */
object DeployLocation {
  const val RELATIVE_DIR = "vivitel/intercom"
  const val LEGACY_DIR = "/sdcard/vivitel/intercom"
  const val CONFIG_NAME = "config.json"
  const val APK_NAME = "app.apk"
  const val INSTALL_SCRIPT_NAME = "install.sh"
  const val API_KEY_NAME = "api-key.txt"

  fun findDeployDir(context: Context? = null, volumeHint: String? = null): File? {
    return candidateDirs(context, volumeHint).firstOrNull { dir ->
      File(dir, CONFIG_NAME).isFile || File(dir, APK_NAME).isFile || File(dir, INSTALL_SCRIPT_NAME).isFile
    }
  }

  fun candidateDirs(context: Context? = null, volumeHint: String? = null): List<File> {
    val removableRoots = linkedSetOf<String>()
    val otherRoots = linkedSetOf<String>()

    volumeHint?.trim()?.takeIf { it.isNotEmpty() }?.let { removableRoots += File(it).absolutePath }

    context?.let { ctx ->
      try {
        ctx.getExternalFilesDirs(null).filterNotNull().forEach { dir ->
          val root = volumeRoot(dir) ?: return@forEach
          val removable = try {
            Environment.isExternalStorageRemovable(dir)
          } catch (_: Exception) {
            false
          }
          if (removable) removableRoots += root else otherRoots += root
        }
      } catch (_: Exception) {
        // Storage service unavailable; fall back to the /storage scan.
      }
    }

    try {
      File("/storage").listFiles()
        ?.filter { it.isDirectory && it.name != "emulated" && it.name != "self" }
        ?.forEach { removableRoots += it.absolutePath }
    } catch (_: Exception) {
      // /storage not listable on this build.
    }

    val dirs = (removableRoots + (otherRoots - removableRoots)).map { File(it, RELATIVE_DIR) }.toMutableList()
    val legacy = File(LEGACY_DIR)
    if (dirs.none { it.absolutePath == legacy.absolutePath }) dirs += legacy
    return dirs
  }

  private fun volumeRoot(appDir: File): String? {
    val path = appDir.absolutePath
    val marker = path.indexOf("/Android/data/")
    return if (marker > 0) path.substring(0, marker) else null
  }
}
