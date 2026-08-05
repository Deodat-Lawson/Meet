# Meet for Android

React Native client built on `@meet/client-core` — the same meeting engine the web
app runs. Only capture and rendering are platform-specific.

## Layout

```
src/
  adapters/RNMediaAdapter.ts   getUserMedia / getDisplayMedia / permissions
  store/roomStore.ts           zustand store mirroring the engine's state
  screens/                     Home, PreJoin, Meeting
  components/                  VideoTile (RTCView), ControlBar, sheets, icons
  config.ts                    server address (editable at runtime)
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
