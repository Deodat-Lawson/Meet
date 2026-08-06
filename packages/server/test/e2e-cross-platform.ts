/**
 * Cross-platform verification: a browser peer joining a meeting that an Android
 * peer is already in.
 *
 * Unlike `e2e.ts`, this one needs a human-driven (or scripted) Android client
 * already sitting in the room — the app running on an emulator or device. Run it
 * with the room code shown in the app:
 *
 *   E2E_ROOM=abc-defg-hij npm run test:e2e:cross -w @meet/server
 *
 * It asserts that the browser negotiates with the Android peer's producers and
 * actually receives their RTP, which is the part that codec or handler
 * mismatches between mediasoup-client's browser and ReactNative handlers break.
 */
import assert from 'node:assert/strict';
import puppeteer, { type Page } from 'puppeteer';

const WEB_ORIGIN = process.env.E2E_WEB_ORIGIN ?? 'https://localhost:5173';
const ROOM = process.env.E2E_ROOM;

if (!ROOM) {
  console.error('Set E2E_ROOM to the meeting code the Android client is in.');
  process.exit(2);
}

async function waitFor(page: Page, predicate: string, timeoutMs: number, label: string): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await page.evaluate(`(() => { try { return Boolean(${predicate}); } catch { return false; } })()`);
    if (value) return;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`timed out after ${timeoutMs}ms waiting for ${label}`);
}

async function main(): Promise<void> {
  console.log(`\nCross-platform test against room ${ROOM}\n`);

  const browser = await puppeteer.launch({
    headless: true,
    acceptInsecureCerts: true,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--auto-select-desktop-capture-source=Entire screen',
      '--autoplay-policy=no-user-gesture-required',
      '--no-sandbox',
    ],
  });

  const page = await browser.newPage();
  // These assertions match on English button text; pin the language so the
  // suite does not depend on the locale of whatever machine it runs on.
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem('meet.locale', 'en');
    } catch {
      /* storage may be unavailable */
    }
  });
  page.on('pageerror', (error) => console.error('[web] page error:', error.message));

  try {
    await page.goto(`${WEB_ORIGIN}/room/${ROOM}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#display-name', { timeout: 15_000 });
    await page.type('#display-name', 'WebUser');
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Join now');
      button?.click();
    });

    await waitFor(page, 'window.__meet && window.__meet.state.joined', 30_000, 'the web peer to join');
    console.log('  ✓ browser joined the meeting');

    await waitFor(page, 'window.__meet.state.peers.size >= 1', 15_000, 'the Android peer to appear');
    const androidPeer = await page.evaluate(() => {
      const peers = [...(window as never as { __meet: { state: { peers: Map<string, unknown> } } }).__meet.state.peers.values()];
      return peers[0] as { displayName: string; device: { platform: string; name: string } };
    });
    console.log(`  ✓ sees Android peer "${androidPeer.displayName}" (${androidPeer.device.name}/${androidPeer.device.platform})`);
    assert.equal(androidPeer.device.platform, 'android', 'the other peer should identify as Android');

    await waitFor(
      page,
      "[...window.__meet.state.consumers.values()].some(c => c.source === 'mic')",
      25_000,
      'a mic consumer from Android',
    );
    await waitFor(
      page,
      "[...window.__meet.state.consumers.values()].some(c => c.source === 'webcam')",
      25_000,
      'a webcam consumer from Android',
    );
    console.log('  ✓ negotiated audio and video consumers from the Android peer');

    // Let RTP accumulate before measuring.
    await new Promise((resolve) => setTimeout(resolve, 6000));

    const totals = await page.evaluate(async () => {
      const client = (window as never as { __meet: { state: { consumers: Map<string, unknown> } } }).__meet;
      const result: Record<string, { bytes: number; packets: number; codec: string }> = {};
      for (const entry of client.state.consumers.values()) {
        const typed = entry as { source: string; consumer: { getStats(): Promise<RTCStatsReport> } };
        const stats = await typed.consumer.getStats();
        let bytes = 0;
        let packets = 0;
        let codec = '';
        stats.forEach((report: { type: string; bytesReceived?: number; packetsReceived?: number; mimeType?: string }) => {
          if (report.type === 'inbound-rtp') {
            bytes += report.bytesReceived ?? 0;
            packets += report.packetsReceived ?? 0;
          }
          if (report.type === 'codec' && report.mimeType) codec = report.mimeType;
        });
        result[typed.source] = { bytes, packets, codec };
      }
      return result;
    });

    console.log('  Inbound from Android:', JSON.stringify(totals));

    // Audio is asserted on packet count, not byte volume. Opus DTX is enabled on
    // the router, so a silent microphone (an emulator, or anyone in a quiet room)
    // legitimately sends only sparse comfort-noise packets. Packets arriving at
    // all is what proves the audio path is negotiated and forwarding.
    assert.equal(totals.mic?.codec, 'audio/opus', `expected Opus audio, got ${totals.mic?.codec}`);
    assert.ok((totals.mic?.packets ?? 0) > 0, 'expected audio RTP packets from Android, got none');
    assert.ok((totals.webcam?.bytes ?? 0) > 5000, `expected video RTP from Android, got ${totals.webcam?.bytes ?? 0} bytes`);
    console.log('  ✓ receiving real audio and video RTP from the Android device');

    // Optional: the Android client is sharing its screen (set E2E_EXPECT_SCREEN=1).
    // This is the MediaProjection path, which is the piece most likely to be
    // silently broken by Android's foreground-service rules.
    if (process.env.E2E_EXPECT_SCREEN === '1') {
      await waitFor(
        page,
        "[...window.__meet.state.consumers.values()].some(c => c.source === 'screen')",
        25_000,
        'a screen-share consumer from Android',
      );
      await new Promise((resolve) => setTimeout(resolve, 5000));

      const screenBytes = await page.evaluate(async () => {
        const client = (window as never as { __meet: { state: { consumers: Map<string, unknown> } } }).__meet;
        for (const entry of client.state.consumers.values()) {
          const typed = entry as { source: string; consumer: { getStats(): Promise<RTCStatsReport> } };
          if (typed.source !== 'screen') continue;
          const stats = await typed.consumer.getStats();
          let bytes = 0;
          stats.forEach((report: { type: string; bytesReceived?: number }) => {
            if (report.type === 'inbound-rtp') bytes += report.bytesReceived ?? 0;
          });
          return bytes;
        }
        return 0;
      });

      console.log(`  Screen-share inbound: ${screenBytes} bytes`);
      assert.ok(screenBytes > 5000, `expected screen-share RTP from Android, got ${screenBytes} bytes`);
      console.log('  ✓ receiving the Android device screen share');
    }

    const rendered = await page.evaluate(() =>
      [...document.querySelectorAll('video')].filter((v) => v.videoWidth > 0).map((v) => `${v.videoWidth}x${v.videoHeight}`),
    );
    console.log(`  ✓ rendered video resolutions: ${rendered.join(', ') || 'none'}`);
    assert.ok(rendered.length > 0, 'no video element decoded a frame');

    console.log('\nCross-platform checks passed.\n');
    // Stay joined briefly so the Android side can be screenshotted receiving us.
    await new Promise((resolve) => setTimeout(resolve, 20_000));
  } finally {
    await browser.close().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error('\nCross-platform test failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
