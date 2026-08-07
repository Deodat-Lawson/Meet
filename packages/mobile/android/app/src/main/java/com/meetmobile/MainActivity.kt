package com.meetmobile

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.res.Configuration
import android.os.Build
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "MeetMobile"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  /* --------------------------------------------------------------------- */
  /*  Picture-in-Picture                                                    */
  /* --------------------------------------------------------------------- */

  /**
   * Buttons inside the Picture-in-Picture window talk back through a broadcast,
   * because that is the only channel a `PendingIntent` can use to reach an app
   * that the system may have moved out of the way.
   */
  private val controlReceiver =
      object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
          val id = intent?.getStringExtra(MeetPipController.EXTRA_CONTROL_ID) ?: return
          MeetPipController.emitAction(id)
        }
      }

  override fun onStart() {
    super.onStart()
    val filter = IntentFilter(MeetPipController.ACTION_CONTROL)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      registerReceiver(controlReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      @Suppress("UnspecifiedRegisterReceiverFlag") registerReceiver(controlReceiver, filter)
    }
  }

  override fun onStop() {
    try {
      unregisterReceiver(controlReceiver)
    } catch (error: IllegalArgumentException) {
      // Already gone; nothing to undo.
    }
    super.onStop()
  }

  /**
   * The user pressed home or swiped up.
   *
   * Android 12 and later shrink the meeting into the window themselves, from the
   * parameters the controller keeps up to date, which is what makes that
   * transition a single continuous animation rather than a disappear followed by
   * an appear. Older versions have to be asked, here, at the last moment before
   * the activity goes away.
   */
  override fun onUserLeaveHint() {
    super.onUserLeaveHint()
    MeetPipController.enterOnUserLeaving(this)
  }

  override fun onPictureInPictureModeChanged(
      isInPictureInPictureMode: Boolean,
      newConfig: Configuration,
  ) {
    super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
    MeetPipController.emitModeChanged(isInPictureInPictureMode)
  }
}
