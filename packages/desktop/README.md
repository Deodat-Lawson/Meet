# Meet for macOS

A native macOS app for Meet. It wraps the same web client the browser runs, and
exists for the things a browser tab cannot do well: a proper Dock presence, a
real app menu, remembered window position, and a screen-share picker that lists
your individual windows rather than deferring to the browser's own chooser.

## Installing

Download the disk image that matches your Mac:

| Your Mac | File |
| --- | --- |
| Apple Silicon (M1 / M2 / M3 / M4) | `Meet-1.0.0-arm64.dmg` |
| Intel | `Meet-1.0.0.dmg` |

Not sure which you have:  ▸ About This Mac. "Chip" means Apple Silicon,
"Processor" means Intel.

1. Open the `.dmg`.
2. Drag **Meet** onto the **Applications** shortcut.
3. Eject the disk image.

### First launch — this bit matters

The app is **not signed with an Apple Developer ID**, so Gatekeeper will refuse
it on the first double-click with *"Meet is damaged and can't be opened"* or
*"cannot be opened because the developer cannot be verified"*. Neither message is
literally true — macOS says that about any app it has not seen notarised.

**Right-click (or Control-click) Meet in Applications ▸ Open ▸ Open.** You only
do this once; afterwards it launches normally.

If macOS still refuses, clear the quarantine flag it attached at download:

```bash
xattr -dr com.apple.quarantine /Applications/Meet.app
```

To remove the warning entirely you need a paid Apple Developer account
($99/year) and a notarised build — see *Signing* below.

## Permissions

macOS asks for each capability the first time it is used, rather than up front:

| Permission | Asked when | If you decline |
| --- | --- | --- |
| **Camera** | You open the pre-join screen | Join with video off; enable later in System Settings ▸ Privacy & Security ▸ Camera |
| **Microphone** | You open the pre-join screen | Others cannot hear you |
| **Screen Recording** | You first click **Share** | Screen sharing produces a black frame |

**Screen Recording cannot be granted from inside the app.** macOS requires you to
enable it in **System Settings ▸ Privacy & Security ▸ Screen & System Audio
Recording**, and then **quit and reopen Meet** — the permission is only read at
launch. The app detects this and offers to open the right settings pane:
**Help ▸ Check Screen Recording Permission**.

## Using it

The app points at `https://meet.team-studio.space` by default. To change it — for a local dev
stack, or your own deployment — use **Meet ▸ Server Address…** (`⌘,`). The choice
persists across launches.

| Shortcut | Action |
| --- | --- |
| `⌘,` | Server address |
| `⌘R` | Reload |
| `⌘⇧A` | Mute / unmute |
| `⌘⇧V` | Start / stop video |
| `⌘⇧S` | Share screen |
| `Space` (held) | Push to talk while muted |

## Building from source

```bash
cd packages/desktop
npm install
npm run dist          # both architectures → release/
```

Other targets:

```bash
npm start             # run from source without packaging
npm run icon          # re-render build/icon.icns from build/icon.html
npm run dist:universal   # one universal binary instead of two DMGs
```

The icon is generated, not hand-drawn: `build/icon.html` is the source artwork,
rendered headlessly to a 1024px PNG and then through `sips`/`iconutil` into the
full `.icns` set. Edit the HTML and re-run `npm run icon`.

### Signing and notarising

Unsigned builds work fine but carry the Gatekeeper prompt above. With an Apple
Developer ID:

```bash
export CSC_LINK=/path/to/DeveloperID.p12
export CSC_KEY_PASSWORD=…
export APPLE_ID=…                 # for notarisation
export APPLE_APP_SPECIFIC_PASSWORD=…
export APPLE_TEAM_ID=…
# remove `identity: null` from electron-builder.yml, then:
npm run dist
```

The hardened runtime entitlements in `build/entitlements.mac.plist` are already
correct for capture and for Electron's JIT.

## How screen sharing works here

In a browser, `getDisplayMedia` is serviced by the browser's own picker. Electron
hands that responsibility to the app, so `src/main.ts` implements it:

- On **macOS 15+** it defers to the system ScreenCaptureKit picker, which is what
  users expect and which handles the permission flow itself.
- On **older macOS** there is no system picker, so the app enumerates sources
  with `desktopCapturer` and shows its own chooser (`static/picker.html`) with
  live thumbnails for screens and windows.

Everything else — the meeting itself, simulcast, the SFU connection — is the
unmodified web client.
