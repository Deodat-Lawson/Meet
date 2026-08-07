package com.meetmobile

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.oney.WebRTCModule.WebRTCModuleOptions

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Autolinking only covers dependencies; this one is part of the app.
          add(MeetPipPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()

    // Screen sharing does not start without this.
    //
    // Since Android 14, MediaProjection.start() throws SecurityException unless a
    // foreground service of type mediaProjection is *already* running. react-native-webrtc
    // ships that service and launches it around getDisplayMedia(), but only when this
    // opt-in flag is set — it defaults to false so apps that never share a screen are
    // not forced to declare the foreground-service permissions.
    WebRTCModuleOptions.getInstance().enableMediaProjectionService = true

    loadReactNative(this)
  }
}
