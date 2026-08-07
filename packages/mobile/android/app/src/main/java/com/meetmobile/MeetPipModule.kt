package com.meetmobile

import android.os.Build
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.meetmobile.specs.NativeMeetPipSpec

/**
 * The JavaScript end of the small window.
 *
 * Deliberately thin: it converts arguments and hands them to
 * [MeetPipController], which is where the state that has to outlive a React
 * render actually lives.
 */
class MeetPipModule(reactContext: ReactApplicationContext) : NativeMeetPipSpec(reactContext) {

  init {
    MeetPipController.attach(reactContext)
  }

  override fun getName(): String = NAME

  override fun isSupported(): Boolean = MeetPipController.isSupported(currentActivity)

  override fun isInPictureInPicture(): Boolean =
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && currentActivity?.isInPictureInPictureMode == true

  override fun setEnabled(enabled: Boolean) {
    val activity = currentActivity
    runOnUi { MeetPipController.setEnabled(activity, enabled) }
  }

  override fun setAspectRatio(width: Double, height: Double) {
    val activity = currentActivity
    runOnUi { MeetPipController.setAspectRatio(activity, width, height) }
  }

  override fun setSourceRect(x: Double, y: Double, width: Double, height: Double) {
    val activity = currentActivity
    runOnUi {
      MeetPipController.setSourceRect(activity, x.toInt(), y.toInt(), width.toInt(), height.toInt())
    }
  }

  override fun setActions(actions: ReadableArray) {
    val specs = mutableListOf<MeetPipController.ActionSpec>()
    for (index in 0 until actions.size()) {
      val entry = actions.getMap(index) ?: continue
      val id = entry.getString("id") ?: continue
      specs.add(
          MeetPipController.ActionSpec(
              id = id,
              title = entry.getString("title").orEmpty(),
              icon = entry.getString("icon").orEmpty()))
    }
    val activity = currentActivity
    runOnUi { MeetPipController.setActions(activity, specs) }
  }

  override fun enter() {
    val activity = currentActivity
    runOnUi { MeetPipController.enter(activity) }
  }

  override fun exitPictureInPicture() {
    val activity = currentActivity ?: return
    runOnUi {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && activity.isInPictureInPictureMode) {
        activity.finish()
      }
    }
  }

  override fun startOngoingCall(labels: ReadableMap) {
    OngoingCallService.start(
        reactApplicationContext,
        title = labels.getString("title").orEmpty(),
        body = labels.getString("body").orEmpty(),
        channelName = labels.getString("channelName").orEmpty(),
        channelDescription = labels.getString("channelDescription").orEmpty(),
        leaveLabel = labels.getString("leave").orEmpty())
  }

  override fun stopOngoingCall() {
    OngoingCallService.stop()
  }

  override fun invalidate() {
    MeetPipController.detach(reactApplicationContext)
    OngoingCallService.stop()
    super.invalidate()
  }

  private fun runOnUi(block: () -> Unit) {
    val activity = currentActivity
    if (activity != null) activity.runOnUiThread(block) else block()
  }

  companion object {
    const val NAME = "MeetPip"
  }
}
