package com.vivitel.camera

import android.app.Service
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.os.IBinder

class TalkbackService : Service() {
  private var player: AudioTrack? = null
  private var playThread: Thread? = null
  private val transport = TalkbackTransport()

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    startPlayback()
    return START_STICKY
  }

  override fun onDestroy() {
    stopPlayback()
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun startPlayback() {
    if (playThread != null) return
    val sampleRate = 16000
    val bufferSize = AudioTrack.getMinBufferSize(sampleRate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT)
    player = AudioTrack.Builder()
      .setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
          .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
          .build()
      )
      .setAudioFormat(
        AudioFormat.Builder()
          .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
          .setSampleRate(sampleRate)
          .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
          .build()
      )
      .setBufferSizeInBytes(bufferSize)
      .build()
    player?.play()

    playThread = Thread {
      while (!Thread.currentThread().isInterrupted) {
        val frame = transport.receiveAudio()
        if (frame != null && frame.isNotEmpty()) {
          player?.write(frame, 0, frame.size)
        }
      }
    }.apply { start() }
  }

  private fun stopPlayback() {
    playThread?.interrupt()
    playThread = null
    player?.stop()
    player?.release()
    player = null
  }
}
