package com.vivitel.camera

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class SdBootstrapReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val action = intent.action ?: return
    if (action != Intent.ACTION_BOOT_COMPLETED && action != Intent.ACTION_MEDIA_MOUNTED && action != Intent.ACTION_MY_PACKAGE_REPLACED) return

    val configPath = AppConfigLoader.DEFAULT_CONFIG_PATH
    val config = AppConfigLoader.load(context, configPath)

    if (action == Intent.ACTION_MY_PACKAGE_REPLACED && DeploymentInstaller.isPending(context)) {
      context.startActivity(
        Intent(context, DeploymentFeedbackActivity::class.java)
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
          .putExtra(DeploymentFeedbackActivity.EXTRA_ACTION, DeploymentFeedbackActivity.ACTION_SHOW_COMPLETE)
          .putExtra(DeploymentFeedbackActivity.EXTRA_MESSAGE, DeploymentFeedbackActivity.DEFAULT_SUCCESS_MESSAGE)
      )

      context.startForegroundService(
        Intent(context, DeploymentFeedbackService::class.java)
          .putExtra(DeploymentFeedbackService.EXTRA_ACTION, DeploymentFeedbackService.ACTION_COMPLETE)
          .putExtra(DeploymentFeedbackService.EXTRA_MESSAGE, DeploymentFeedbackService.DEFAULT_SUCCESS_MESSAGE)
      )

      context.startActivity(
        Intent(context, MainActivity::class.java)
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      )

      DeploymentInstaller.clearPending(context)
      startConfiguredServices(context, configPath, config)
      return
    }

    // MEDIA_MOUNTED carries the card's mount point (file:///storage/XXXX-XXXX); check it first.
    val volumeHint = if (action == Intent.ACTION_MEDIA_MOUNTED) intent.data?.path else null
    if (action == Intent.ACTION_MEDIA_MOUNTED && DeploymentInstaller.hasNewerApk(context, volumeHint)) {
      context.startActivity(
        Intent(context, DeploymentFeedbackActivity::class.java)
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
          .putExtra(DeploymentFeedbackActivity.EXTRA_ACTION, DeploymentFeedbackActivity.ACTION_SHOW_PROGRESS)
          .putExtra(DeploymentFeedbackActivity.EXTRA_MESSAGE, DeploymentFeedbackActivity.DEFAULT_WAIT_MESSAGE)
      )

      context.startForegroundService(
        Intent(context, DeploymentFeedbackService::class.java)
          .putExtra(DeploymentFeedbackService.EXTRA_ACTION, DeploymentFeedbackService.ACTION_START_REPEAT)
          .putExtra(DeploymentFeedbackService.EXTRA_MESSAGE, DeploymentFeedbackService.DEFAULT_WAIT_MESSAGE)
          .putExtra(DeploymentFeedbackService.EXTRA_INTERVAL_SECONDS, 60)
      )

      DeploymentInstaller.startInstallFlow(context, volumeHint)
    }

    startConfiguredServices(context, configPath, config)
  }

  private fun startConfiguredServices(context: Context, configPath: String, config: AppConfig) {
    LocationReportService.sync(context, configPath, config)
    if (config.camera.autoStartNetworkStatus) {
      context.startForegroundService(
        Intent(context, NetworkStatusService::class.java)
          .putExtra(AppConfigLoader.EXTRA_CONFIG_PATH, configPath)
      )
    } else {
      context.stopService(Intent(context, NetworkStatusService::class.java))
    }

    if (config.camera.autoStartIntercom) {
      context.startForegroundService(
        Intent(context, IntercomService::class.java)
          .putExtra(AppConfigLoader.EXTRA_CONFIG_PATH, configPath)
      )
    }

    if (config.camera.autoStartTalkback) {
      context.startForegroundService(
        Intent(context, TalkbackService::class.java)
          .putExtra(AppConfigLoader.EXTRA_CONFIG_PATH, configPath)
      )
    } else {
      context.stopService(Intent(context, TalkbackService::class.java))
    }
  }
}
