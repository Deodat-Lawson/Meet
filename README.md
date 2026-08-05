# Meet

Video meetings with screen sharing, for the browser and for Android.

Two clients — a React web app and a React Native Android app — share one meeting
engine and talk to a [mediasoup](https://mediasoup.org) SFU. Participants can
talk and listen, turn video on and off, mute and unmute, and share a screen that
everyone else sees, including sharing a phone's screen from the Android app.

```
                         ┌──────────────────┐
  Browser  ──── WSS ────►│                  │
  (React)  ◄─── SRTP ───►│   @meet/server   │   mediasoup workers
                         │   Fastify + ws   │   1 router per room
  Android  ──── WSS ────►│                  │   simulcast / SVC
  (RN)     ◄─── SRTP ───►└──────────────────┘
```

## Why an SFU

A mesh (everyone connects to everyone) collapses past three or four people: each
participant uploads their video N−1 times. An MCU (server-side compositing) burns
a CPU core per room and adds a transcode delay.

An SFU takes one upload per participant and forwards it, so a participant's uplink
cost is constant regardless of meeting size. Combined with simulcast — each camera
is encoded at three resolutions at once — the server can hand every viewer the
layer that matches how large they are actually rendering that tile.

## Repository layout

| Package | What it is |
| --- | --- |
| `packages/protocol` | The wire contract. Typed request/response/notification frames, codec and simulcast configuration, shared domain types. No dependencies, so both a Node server and Hermes can load it. |
| `packages/client-core` | The meeting engine: signaling with reconnection, transports, publish/subscribe, simulcast layer selection, screen-share lifecycle. Platform-agnostic — it reaches the OS only through a `MediaAdapter`. |
| `packages/server` | mediasoup SFU, signaling, REST API, moderation, lobby, chat, recording. |
| `packages/web` | React client. |
| `packages/mobile` | React Native Android client. Consumes `client-core` unchanged. |
| `infra` | Docker Compose, TURN, and the reverse proxy that terminates TLS. |

The engine is genuinely shared: the Android app supplies a `MediaAdapter` backed by
`react-native-webrtc` and renders the same state the web app does. Bug fixes to
reconnection or layer selection land in both apps at once.

## Features

**Media**
- Microphone and camera with mute/unmute and start/stop video
- Screen sharing from a desktop browser or from an Android device, with tab/system
  audio on the web
- Three-layer simulcast for camera, two for screen share, VP9/AV1-style SVC when
  the client negotiates VP9
- Automatic layer selection driven by the rendered tile size, and consumers paused
  while their tile is off-screen
- Device switching mid-call, speaker selection on the web, front/back camera on mobile
- Opus DTX, FEC and in-band comfort noise, so silent participants cost ~nothing

**Meeting**
- Gallery, speaker, pinned and screen-share layouts; the grid reflows to maximise
  tile area
- Dominant-speaker detection and per-tile audio level rings
- Chat, including private messages; reactions; raise hand
- Pre-join device check that resolves permissions before you are on camera
- Waiting room, meeting passcodes, meeting lock
- Host and co-host controls: mute one/all, stop video, stop a share, remove, promote,
  end for everyone; host automatically reassigned if the host leaves
- Server-side recording (one WebM per participant plus a generated `compose.sh`)
- Network quality indicators and automatic ICE restart on a network change

**Operational**
- One mediasoup worker per core, rooms assigned to the least loaded worker
- One UDP+TCP port per worker via `WebRtcServer` — trivial firewall rules
- JWT join tokens, per-connection rate limiting, payload validation on every request
- Graceful shutdown, health check, metrics endpoint, structured logs

## Running locally

Requires Node 20+. `ffmpeg` is needed only for recording.

```bash
npm install
npm run dev          # SFU on :4000, web client on :5173
```

Open `https://localhost:5173`, click **New meeting**, and share the link.

The dev web server runs over TLS because `getUserMedia` and `getDisplayMedia`
require a secure context anywhere except `localhost` — that is what lets a phone
on the same Wi-Fi join. Generate the certificate once:

```bash
mkdir -p infra/certs && cd infra/certs
openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
  -keyout dev-key.pem -out dev-cert.pem \
  -subj "/CN=meet.local" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:<your-LAN-IP>"
```

Browsers will warn about the self-signed certificate; accept it once per device.

### Environment

Everything is configured by environment variable; see `.env.example`. The two that
matter most:

- `MEDIASOUP_ANNOUNCED_IP` — the address clients send RTP to. Auto-detected as the
  primary LAN address in development; **must** be set explicitly behind NAT or in
  a container.
- `JWT_SECRET` — signs join tokens. The server refuses to start in production with
  the development default.

## The Android app

```bash
cd packages/mobile
npm install
npm run android      # debug build onto a connected device or emulator
```

The app defaults to `http://10.0.2.2:4000` (the emulator's route to the host).
On a physical device, tap **Server settings** on the home screen and enter your
machine's LAN address.

Screen sharing needs one piece of native setup that is easy to miss. Since Android
14, `MediaProjection.start()` throws `SecurityException` unless a foreground
service of type `mediaProjection` is *already running*. `react-native-webrtc`
ships that service but only starts it when the app opts in, which
`MainApplication.kt` does:

```kotlin
WebRTCModuleOptions.getInstance().enableMediaProjectionService = true
```

The manifest correspondingly declares `FOREGROUND_SERVICE_MEDIA_PROJECTION` and
`POST_NOTIFICATIONS`.

### Release builds

```bash
./gradlew assembleRelease \
  -PMEET_RELEASE_STORE_FILE=/path/to/meet.keystore \
  -PMEET_RELEASE_STORE_PASSWORD=… \
  -PMEET_RELEASE_KEY_ALIAS=meet \
  -PMEET_RELEASE_KEY_PASSWORD=…
```

Release builds are minified and, per Android's defaults, **reject cleartext HTTP**.
Point them at an `https://` deployment; a plain-HTTP dev server will fail to
connect by design. `proguard-rules.pro` keeps `org.webrtc.**`, which libwebrtc
calls reflectively from native code — without those rules a minified build fails
only once a call actually starts.

## Deploying

```bash
cp .env.example .env    # fill in PUBLIC_IP, DOMAIN, JWT_SECRET, TURN_PASSWORD
cd infra && docker compose up -d
```

That brings up the SFU, a coturn TURN relay, and Caddy terminating TLS with an
automatic certificate.

A TURN relay is not optional in practice. Symmetric NATs and restrictive corporate
firewalls block direct UDP outright, and those users simply never connect without
a relay to fall back to.

Scaling past one host means running several SFU instances and routing a whole room
to one of them — a room's router lives on a single worker on a single machine.
Route by room id at the load balancer, or add mediasoup `PipeTransport`s between
instances.

## Tests

```bash
npm run test -w @meet/server            # unit tests
npm run test:e2e -w @meet/server        # full meeting flow, needs the dev servers running
npm run test:e2e:lobby -w @meet/server  # waiting room: queue, admit, deny
```

The end-to-end suite drives two real Chrome instances through the real UI against
the real SFU and asserts inbound RTP byte counts for microphone, camera and screen
share — not just signaling state. It also covers moderation permissions, the
one-share-at-a-time rule, mute propagation, chat and leaving.

The lobby suite covers a path that is easy to get subtly wrong: the client re-runs
the join handshake after being admitted, so a naive lobby check bounces the guest
straight back into the queue. Reverting that guard turns the suite red (3/6), which
is the point of having it.

`test:e2e:cross` verifies a browser against a live Android client (start the app,
join a meeting, then pass its code as `E2E_ROOM`), which is what catches codec or
handler mismatches between mediasoup-client's browser and React Native handlers.

Audio assertions there check packet count rather than byte volume: Opus DTX is
enabled, so a silent microphone legitimately sends only sparse comfort-noise
packets, and a byte threshold would fail on a quiet room.

## Known limitations

- Screen-share audio is web-only. Android's `MediaProjection` audio capture is not
  exposed by `react-native-webrtc`, so an Android share sends video only.
- Recording produces one file per participant plus an ffmpeg script to grid them
  offline. Live compositing would cost roughly a core per room.
- There is no persistence: rooms live in memory and are reaped shortly after the
  last participant leaves. Meeting history would need a datastore.
- The iOS project builds but is unverified; only Android was developed and tested.
