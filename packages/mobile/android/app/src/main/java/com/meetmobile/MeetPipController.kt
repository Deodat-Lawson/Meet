package com.meetmobile

import android.app.Activity
import android.app.PendingIntent
import android.app.PictureInPictureParams
import android.app.RemoteAction
import android.content.Intent
import android.graphics.Rect
import android.graphics.drawable.Icon
import android.os.Build
import android.util.Rational
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext

/**
 * What the meeting should look like when the system shrinks it into a window,
 * and the plumbing that puts it there.
 *
 * The state lives here rather than in the native module because the two halves
 * that need it are on different clocks: JavaScript sets the shape and the
 * buttons whenever the meeting changes, while Android asks for them at the
 * moment the user swipes the app away, which can be any time at all — including
 * after React has been told to pause. Keeping the last-known description in one
 * place means the window is always built from something current.
 *
 * Nothing here is written to disk. The description is rebuilt from the live
 * meeting every time and dies with the process.
 */
object MeetPipController {

  const val ACTION_CONTROL = "com.meetmobile.PIP_CONTROL"
  const val EXTRA_CONTROL_ID = "controlId"

  private const val MIN_ASPECT = 0.4185f
  private const val MAX_ASPECT = 2.39f

  data class ActionSpec(val id: String, val title: String, val icon: String)

  private var reactContext: ReactApplicationContext? = null

  /** Set from JavaScript while a meeting is on screen. */
  @Volatile var enabled: Boolean = false
    private set

  private var aspect: Rational = Rational(16, 9)
  private var sourceRect: Rect? = null
  private var actions: List<ActionSpec> = emptyList()

  fun attach(context: ReactApplicationContext) {
    reactContext = context
  }

  fun detach(context: ReactApplicationContext) {
    if (reactContext === context) reactContext = null
  }

  /** Picture-in-Picture is an 8.0 feature, and a device may still opt out. */
  fun isSupported(activity: Activity?): Boolean =
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
          activity?.packageManager?.hasSystemFeature(
              android.content.pm.PackageManager.FEATURE_PICTURE_IN_PICTURE) == true

  fun setEnabled(activity: Activity?, value: Boolean) {
    enabled = value
    if (!value) sourceRect = null
    apply(activity)
  }

  fun setAspectRatio(activity: Activity?, width: Double, height: Double) {
    if (width <= 0 || height <= 0) return
    // Android rejects params outside this range outright, taking the buttons and
    // the source rectangle down with them, so the shape is clamped instead.
    val ratio = (width / height).toFloat().coerceIn(MIN_ASPECT, MAX_ASPECT)
    val next = Rational((ratio * 1000).toInt(), 1000)
    if (next == aspect) return
    aspect = next
    apply(activity)
  }

  fun setSourceRect(activity: Activity?, x: Int, y: Int, width: Int, height: Int) {
    if (width <= 0 || height <= 0) return
    val next = Rect(x, y, x + width, y + height)
    if (next == sourceRect) return
    sourceRect = next
    apply(activity)
  }

  fun setActions(activity: Activity?, next: List<ActionSpec>) {
    if (next == actions) return
    actions = next
    apply(activity)
  }

  /**
   * Pushes the current description at the activity.
   *
   * On Android 12 and up this is also what arms the seamless swipe: the system
   * animates the meeting down into the window itself, with no callback of ours
   * on the path, which is why that version needs nothing in `onUserLeaveHint`.
   */
  fun apply(activity: Activity?) {
    if (activity == null || !isSupported(activity)) return
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    try {
      activity.setPictureInPictureParams(buildParams(activity))
    } catch (error: IllegalStateException) {
      // The activity was finishing, or is in a state that cannot hold params.
    } catch (error: IllegalArgumentException) {
      // A shape the device refused; the meeting is unaffected either way.
    }
  }

  fun enter(activity: Activity?): Boolean {
    if (activity == null || !isSupported(activity)) return false
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false
    if (activity.isInPictureInPictureMode) return true
    return try {
      activity.enterPictureInPictureMode(buildParams(activity))
    } catch (error: IllegalStateException) {
      false
    } catch (error: IllegalArgumentException) {
      false
    }
  }

  /** The pre-Android-12 path: shrink as the user leaves, if they left by hand. */
  fun enterOnUserLeaving(activity: Activity?) {
    if (!enabled) return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) return
    enter(activity)
  }

  fun emitModeChanged(active: Boolean) {
    val payload = Arguments.createMap().apply { putBoolean("active", active) }
    reactContext?.emitDeviceEvent("MeetPip:modeChanged", payload)
  }

  fun emitAction(id: String) {
    val payload = Arguments.createMap().apply { putString("id", id) }
    reactContext?.emitDeviceEvent("MeetPip:action", payload)
  }

  private fun buildParams(activity: Activity): PictureInPictureParams {
    val builder = PictureInPictureParams.Builder().setAspectRatio(aspect).setActions(remoteActions(activity))
    sourceRect?.let { builder.setSourceRectHint(it) }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) builder.setAutoEnterEnabled(enabled)
    return builder.build()
  }

  private fun remoteActions(activity: Activity): List<RemoteAction> {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return emptyList()
    // More buttons than the window has room for are dropped by the system with
    // no warning; asking how many fit keeps the important ones visible.
    val room = activity.maxNumPictureInPictureActions
    return actions.take(room).mapIndexed { index, action ->
      val intent =
          Intent(ACTION_CONTROL).apply {
            setPackage(activity.packageName)
            putExtra(EXTRA_CONTROL_ID, action.id)
          }
      val pending =
          PendingIntent.getBroadcast(
              activity,
              index,
              intent,
              PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
      RemoteAction(Icon.createWithResource(activity, iconFor(action.icon)), action.title, action.title, pending)
    }
  }

  private fun iconFor(name: String): Int =
      when (name) {
        "mic" -> R.drawable.ic_pip_mic
        "mic-off" -> R.drawable.ic_pip_mic_off
        "camera" -> R.drawable.ic_pip_camera
        "camera-off" -> R.drawable.ic_pip_camera_off
        else -> R.drawable.ic_pip_leave
      }
}
