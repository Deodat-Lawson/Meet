# Meet for Android

React Native client built on `@meet/client-core` — the same meeting engine the web
app runs. Only capture and rendering are platform-specific.

## Layout

```
src/
  adapters/RNMediaAdapter.ts   getUserMedia / getDisplayMedia / permissions
  store/roomStore.ts           zustand store mirroring the engine's state
  screens/                     Home, PreJoin, Meeting, Pip
  components/                  VideoTile (RTCView), ControlBar, sheets, icons
  native/pictureInPicture.ts   the system window, from JavaScript
  usePictureInPicture.ts       wires the meeting to that window
  spotlight.ts                 what a small window should show
  videoVisibility.ts           ref-counted consumer pause/resume
  config.ts                    server address (editable at runtime)
specs/NativeMeetPip.ts         TurboModule spec (codegen input)
```

`index.js` calls `registerGlobals()` from `react-native-webrtc` before anything
else. That installs `RTCPeerConnection`, `MediaStream` and `navigator.mediaDevices`
globally, which is what lets the shared engine — written against the standard Web
APIs — run unmodified.

`metro.config.js` watches the sibling packages and maps the shared package's
standards-compliant ESM specifiers (`./emitter.js` pointing at `emitter.ts`) onto
their TypeScript sources, which Metro does not do on its own.

## Running

```bash
npm install
npm start            # Metro
npm run android      # build + install
```

Point the app at your server with **Server settings** on the home screen.
`10.0.2.2` is the emulator's route to the host machine; a physical device needs
your machine's LAN address.

## Leaving the meeting on screen when you leave the meeting

A call you cannot walk away from is a call you have to hang up. The meeting
follows you out of its own screen in three forms, all views of the same live
connection — no rejoin, no reconnect, nothing written down:

| Where you went | What you get |
|---|---|
| Elsewhere in the app (Minimise, or Back) | A draggable floating window |
| Out of the app (Home, recents, or Back again) | The system's Picture-in-Picture window |
| Screen off, or the window dismissed | An ongoing notification, audio still running |

**`presentation` in the room store** — `full`, `mini` or `pip` — is the whole
model. It never touches the `RoomClient`, which is why coming back is instant.

**The floating window** (`FloatingMeeting.tsx`) owns its gesture outright rather
than nesting a pressable: a tap is a drag that never moved, which is the only
way a flick of the thumb cannot also count as a tap. Let go and it settles
against the nearer edge.

**Picture-in-Picture** is a real Android window, not a drawn imitation:

1. `MeetPipController` keeps the window's description — shape, buttons, the
   rectangle it should shrink out of — up to date while the meeting runs, so
   Android can build the window at the moment of a swipe, when there is no time
   to ask JavaScript anything. On Android 12+ `setAutoEnterEnabled` makes that
   swipe one continuous animation; older versions enter from `onUserLeaveHint`.
2. The shape comes from the video's real proportions, reported from the meeting
   screen as well as from the window, so the window opens at the right shape
   instead of correcting itself a moment later.
3. The buttons are `RemoteAction`s carrying already-translated titles, and they
   answer through a broadcast — the only channel a `PendingIntent` has to an app
   the system has moved out of the way.
4. `PipScreen` renders inside it: one video, one name, nothing else.

**Which mode we are in** is driven by `onPictureInPictureModeChanged`, *and*
re-read from the platform on every `AppState` change. The callback crosses over
at the one moment the system is busy moving the app, and a missed one leaves the
full interface — header, control bar, language toggle — rendering into a window
a few centimetres across.

**`OngoingCallService`** holds the process in the foreground for the length of a
call. It always calls `startForeground` before doing anything else, including
when the command that arrived is one that stops it: Android kills the *app*, not
the service, if a `startForegroundService` promise goes unfulfilled for a few
seconds — which is exactly what a meeting joined and left in the same breath
does. The notification says only that a meeting is running.

**iOS** shrinks a video *view*, not a screen, so there is no `PipScreen` there:
`iosPipOptions` hands the spotlight tile to `AVPictureInPicture` via
`react-native-webrtc`, and `UIBackgroundModes: audio` in `Info.plist` is what
allows it. Never a local view — the camera stops in the background, so a
self-view would freeze exactly when the window became useful.

**`videoVisibility.ts`** defers a consumer's pause by a moment. Collapsing the
meeting swaps a grid of tiles for a single one; without the delay the person
still on screen would be paused and resumed across that swap — two signalling
round trips and a black frame in the window the user is looking at.

## Screen sharing

Android 14 rejects `MediaProjection.start()` unless a `mediaProjection` foreground
service is already running. Three things must line up, and all three are in place:

1. `MainApplication.kt` sets `WebRTCModuleOptions.enableMediaProjectionService = true`
   so `react-native-webrtc` starts its bundled service around `getDisplayMedia()`.
2. `AndroidManifest.xml` declares `FOREGROUND_SERVICE`,
   `FOREGROUND_SERVICE_MEDIA_PROJECTION` and `POST_NOTIFICATIONS`.
3. `RNMediaAdapter` requests `POST_NOTIFICATIONS` at runtime on API 33+, because
   the service cannot post its mandatory ongoing notification without it.

Symptom when any of these is missing:
`SecurityException: Media projections require a foreground service of type
ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION`.

Android shares video only — `MediaProjection` audio capture is not exposed by the
library.

## Release

See the root README. Note that release builds reject cleartext HTTP, so they need
an `https://` server.
