package com.meetmobile

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.drawable.Icon
import android.os.Build
import android.os.IBinder
import android.util.Log

/**
 * Holds the process in the foreground for as long as a meeting is running.
 *
 * Without this, "minimised" would be a promise Android does not keep. An app in
 * the background has no claim on the microphone, and the system is free to stop
 * capture — or the process — while the user reads something else. A foreground
 * service is the only way to say *this is a call, not a task*, and Android
 * charges an ongoing notification for it.
 *
 * That notification is the third face of the same idea as the floating window
 * and the Picture-in-Picture window, and it is the one that survives having no
 * screen at all: tap it to come back, or leave from it without coming back.
 *
 * It says only that a meeting is running. Not who is in it, not what it is
 * called — a notification is the one part of a meeting that outlives the screen
 * it was drawn on, and this app does not keep records of meetings anywhere else
 * either.
 */
class OngoingCallService : Service() {

  /** The wording from the last start, reused if a stop arrives on its own. */
  private var lastLabels = Labels.fallback

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    running = this
  }

  override fun onDestroy() {
    if (running === this) running = null
    super.onDestroy()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    /*
     * Going foreground is unconditional, and it comes first.
     *
     * Android's rule is absolute: a service reached through
     * `startForegroundService` must call `startForeground` within a few seconds
     * or the *app* is killed — not the service, the app. That applies even when
     * the command that arrived is one that ends the service, and even when the
     * command that ends it overtakes the one that started it, which is exactly
     * what a call that is joined and left in the same breath will do.
     *
     * So every path posts the notification, and only then decides whether to
     * keep it. A notification that exists for a few milliseconds is invisible;
     * a missed deadline is a crash.
     */
    if (intent?.action != null) lastLabels = Labels.from(intent).orElse(lastLabels)
    val labels = lastLabels
    createChannel(labels)

    val held =
        try {
          val notification = buildNotification(labels)
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
          } else {
            startForeground(NOTIFICATION_ID, notification)
          }
          true
        } catch (error: Exception) {
          // Android 14 refuses a microphone service when the permission was
          // never granted or the app had already gone to the background. Losing
          // the service costs audio in the background, not the meeting itself,
          // so the call carries on without it rather than taking the app down.
          Log.w(TAG, "could not hold the call in the foreground", error)
          false
        }

    when {
      !held -> stopSelfSafely()
      intent?.action == ACTION_LEAVE -> {
        // The meeting is torn down by the JavaScript that owns the connection;
        // this only forwards the tap and gets out of the way.
        MeetPipController.emitAction("leave")
        stopSelfSafely()
      }
      // A meeting that ended before this service finished starting. The request
      // could not be honoured then — there was nothing to stop yet — so it was
      // left here to be honoured now.
      stopRequested -> stopSelfSafely()
    }

    // Restarting this service without the meeting it belonged to would leave a
    // notification pointing at nothing.
    return START_NOT_STICKY
  }

  private fun buildNotification(labels: Labels): Notification {
    val contentIntent =
        PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java).apply {
              flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

    val leaveIntent =
        PendingIntent.getService(
            this,
            1,
            Intent(this, OngoingCallService::class.java).setAction(ACTION_LEAVE),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

    val builder =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(this, CHANNEL_ID)
        else @Suppress("DEPRECATION") Notification.Builder(this)

    return builder
        .setContentTitle(labels.title)
        .setContentText(labels.body)
        .setSmallIcon(R.drawable.ic_notification)
        .setContentIntent(contentIntent)
        .setOngoing(true)
        .setCategory(Notification.CATEGORY_CALL)
        .setVisibility(Notification.VISIBILITY_PUBLIC)
        .addAction(
            Notification.Action.Builder(
                    Icon.createWithResource(this, R.drawable.ic_pip_leave), labels.leave, leaveIntent)
                .build())
        .build()
  }

  private fun createChannel(labels: Labels) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(NotificationManager::class.java) ?: return
    val channel =
        NotificationChannel(CHANNEL_ID, labels.channelName, NotificationManager.IMPORTANCE_LOW).apply {
          description = labels.channelDescription
          setShowBadge(false)
          enableVibration(false)
          setSound(null, null)
        }
    manager.createNotificationChannel(channel)
  }

  private fun stopSelfSafely() {
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  private data class Labels(
      val title: String,
      val body: String,
      val channelName: String,
      val channelDescription: String,
      val leave: String,
  ) {
    /** A stop request carries no wording; keep whatever the start supplied. */
    fun orElse(previous: Labels): Labels = if (title.isEmpty()) previous else this

    companion object {
      /** English only, and only ever seen if a stop arrives before a start. */
      val fallback = Labels("Meeting in progress", "", "Ongoing meeting", "", "Leave")

      fun from(intent: Intent?): Labels =
          Labels(
              title = intent?.getStringExtra(EXTRA_TITLE).orEmpty(),
              body = intent?.getStringExtra(EXTRA_BODY).orEmpty(),
              channelName = intent?.getStringExtra(EXTRA_CHANNEL_NAME).orEmpty(),
              channelDescription = intent?.getStringExtra(EXTRA_CHANNEL_DESCRIPTION).orEmpty(),
              leave = intent?.getStringExtra(EXTRA_LEAVE).orEmpty())
    }
  }

  companion object {
    /**
     * The live instance, so stopping does not have to go through `startService`
     * — which Android forbids from the background, exactly where a call is
     * most likely to end.
     */
    @Volatile private var running: OngoingCallService? = null

    /** A stop that arrived while the service was still on its way up. */
    @Volatile private var stopRequested = false

    private const val TAG = "OngoingCallService"
    private const val CHANNEL_ID = "ongoing_meeting"
    private const val NOTIFICATION_ID = 4711

    private const val ACTION_START = "com.meetmobile.CALL_START"
    const val ACTION_LEAVE = "com.meetmobile.CALL_LEAVE"

    private const val EXTRA_TITLE = "title"
    private const val EXTRA_BODY = "body"
    private const val EXTRA_CHANNEL_NAME = "channelName"
    private const val EXTRA_CHANNEL_DESCRIPTION = "channelDescription"
    private const val EXTRA_LEAVE = "leave"

    fun start(
        context: Context,
        title: String,
        body: String,
        channelName: String,
        channelDescription: String,
        leaveLabel: String,
    ) {
      val intent =
          Intent(context, OngoingCallService::class.java).apply {
            action = ACTION_START
            putExtra(EXTRA_TITLE, title)
            putExtra(EXTRA_BODY, body)
            putExtra(EXTRA_CHANNEL_NAME, channelName)
            putExtra(EXTRA_CHANNEL_DESCRIPTION, channelDescription)
            putExtra(EXTRA_LEAVE, leaveLabel)
          }
      stopRequested = false
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent)
        else context.startService(intent)
      } catch (error: Exception) {
        Log.w(TAG, "could not start the ongoing-call service", error)
      }
    }

    /**
     * Stops the service if it is running, and leaves word if it is not yet.
     *
     * Sending a stop *command* to a service that does not exist would create
     * one — which, for a service started the foreground way, is how a meeting
     * that ends the instant it begins used to take the whole app down.
     */
    fun stop() {
      stopRequested = true
      running?.stopSelfSafely()
    }
  }
}
