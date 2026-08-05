/**
 * End-to-end meeting test.
 *
 * Drives two real Chrome instances through the real UI against the real SFU and
 * asserts that media actually flows — RTP bytes received, not just signalling
 * state. Fake capture devices give deterministic audio (a 440 Hz tone) and video
 * (a rolling test pattern), so "did we receive frames" is a meaningful question.
 *
 *   npm run test:e2e -w @meet/server
 *
 * Requires the API (:4000) and the web dev server (:5173) to be running.
 */
import assert from 'node:assert/strict';
import puppeteer, { type Browser, type Page } from 'puppeteer';

const WEB_ORIGIN = process.env.E2E_WEB_ORIGIN ?? 'https://localhost:5173';
const API_ORIGIN = process.env.E2E_API_ORIGIN ?? 'http://127.0.0.1:4000';
const HEADLESS = process.env.E2E_HEADFUL !== '1';

const CHROME_ARGS = [
  '--use-fake-ui-for-media-stream',
  '--use-fake-device-for-media-stream',
  // Makes getDisplayMedia resolve without a picker dialog.
  '--auto-select-desktop-capture-source=Entire screen',
  '--autoplay-policy=no-user-gesture-required',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--disable-features=WebRtcHideLocalIpsWithMdns',
];

interface ClientHandle {
  browser: Browser;
  page: Page;
  name: string;
}

const results: Array<{ name: string; ok: boolean; detail?: string }> = [];

function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      results.push({ name, ok: true });
      console.log(`  ✓ ${name}`);
    })
    .catch((error: unknown) => {
      const detail = error instanceof Error ? error.message : String(error);
      results.push({ name, ok: false, detail });
      console.error(`  ✗ ${name}\n      ${detail}`);
    });
}

async function launch(name: string): Promise<ClientHandle> {
  const browser = await puppeteer.launch({
    headless: HEADLESS,
    acceptInsecureCerts: true,
    args: CHROME_ARGS,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on('pageerror', (error) => console.error(`[${name}] page error:`, error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') console.error(`[${name}] console:`, message.text());
  });
  return { browser, page, name };
}

/** Waits until `predicate` evaluated in the page returns true. */
async function waitFor(page: Page, predicate: string, timeoutMs = 20_000, label = 'condition'): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await page.evaluate(`(() => { try { return Boolean(${predicate}); } catch { return false; } })()`);
    if (value) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`timed out after ${timeoutMs}ms waiting for ${label}`);
}

async function joinMeeting(client: ClientHandle, roomId: string, displayName: string): Promise<void> {
  await client.page.goto(`${WEB_ORIGIN}/room/${roomId}`, { waitUntil: 'domcontentloaded' });
  await client.page.waitForSelector('#display-name', { timeout: 15_000 });
  await client.page.click('#display-name');
  await client.page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>('#display-name');
    if (input) input.value = '';
  });
  await client.page.type('#display-name', displayName);

  // "Join now" is the primary button on the pre-join card.
  const joined = await client.page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Join now');
    if (!button) return false;
    button.click();
    return true;
  });
  assert.ok(joined, 'could not find the "Join now" button');

  await waitFor(client.page, 'window.__meet && window.__meet.state.joined', 25_000, `${displayName} to join`);
}

/** Reads inbound RTP byte counts for every consumer, grouped by media source. */
async function inboundBytes(page: Page): Promise<Record<string, number>> {
  return page.evaluate(async () => {
    const client = (window as unknown as { __meet: { state: { consumers: Map<string, unknown> } } }).__meet;
    const totals: Record<string, number> = {};

    for (const entry of client.state.consumers.values()) {
      const typed = entry as { source: string; consumer: { getStats(): Promise<RTCStatsReport> } };
      const stats = await typed.consumer.getStats();
      let bytes = 0;
      stats.forEach((report: { type: string; bytesReceived?: number }) => {
        if (report.type === 'inbound-rtp') bytes += report.bytesReceived ?? 0;
      });
      totals[typed.source] = (totals[typed.source] ?? 0) + bytes;
    }
    return totals;
  });
}

async function main(): Promise<void> {
  console.log('\nMeet end-to-end test\n');

  const created = await fetch(`${API_ORIGIN}/api/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'E2E meeting' }),
  });
  assert.ok(created.ok, 'could not create a room via the API');
  const { roomId } = (await created.json()) as { roomId: string };
  console.log(`Room: ${roomId}\n`);

  const alice = await launch('alice');
  const bob = await launch('bob');

  try {
    console.log('Joining…');
    await joinMeeting(alice, roomId, 'Alice');
    await joinMeeting(bob, roomId, 'Bob');

    await check('both peers complete the join handshake', async () => {
      const aliceJoined = await alice.page.evaluate(() => (window as never as { __meet: { state: { joined: boolean } } }).__meet.state.joined);
      const bobJoined = await bob.page.evaluate(() => (window as never as { __meet: { state: { joined: boolean } } }).__meet.state.joined);
      assert.ok(aliceJoined && bobJoined, 'one of the peers did not report joined');
    });

    await check('each peer sees the other in the participant list', async () => {
      await waitFor(alice.page, 'window.__meet.state.peers.size >= 1', 15_000, 'Alice to see Bob');
      await waitFor(bob.page, 'window.__meet.state.peers.size >= 1', 15_000, 'Bob to see Alice');
    });

    /* ------------------------------------------------------------- audio */

    await check('microphone audio is published and received', async () => {
      await waitFor(
        bob.page,
        "[...window.__meet.state.consumers.values()].some(c => c.source === 'mic')",
        20_000,
        'Bob to receive a mic consumer',
      );
      // Let RTP accumulate before measuring.
      await new Promise((resolve) => setTimeout(resolve, 3500));
      const bytes = await inboundBytes(bob.page);
      assert.ok((bytes.mic ?? 0) > 1000, `expected inbound audio bytes, got ${bytes.mic ?? 0}`);
    });

    /* ------------------------------------------------------------- video */

    await check('camera video is published and received', async () => {
      await alice.page.evaluate(() => (window as never as { __meet: { enableCamera(): Promise<void> } }).__meet.enableCamera());
      await waitFor(
        bob.page,
        "[...window.__meet.state.consumers.values()].some(c => c.source === 'webcam')",
        20_000,
        'Bob to receive a webcam consumer',
      );
      await new Promise((resolve) => setTimeout(resolve, 4000));
      const bytes = await inboundBytes(bob.page);
      assert.ok((bytes.webcam ?? 0) > 5000, `expected inbound video bytes, got ${bytes.webcam ?? 0}`);
    });

    await check('the remote video element renders real frames', async () => {
      const dimensions = await bob.page.evaluate(() => {
        const videos = [...document.querySelectorAll('video')].filter((v) => v.videoWidth > 0);
        return videos.map((v) => ({ w: v.videoWidth, h: v.videoHeight }));
      });
      assert.ok(dimensions.length > 0, 'no video element reported a non-zero resolution');
    });

    /* ------------------------------------------------------- screen share */

    await check('screen share is published and received', async () => {
      await alice.page.evaluate(() =>
        (window as never as { __meet: { startScreenShare(withAudio?: boolean): Promise<void> } }).__meet.startScreenShare(false),
      );
      await waitFor(
        bob.page,
        "[...window.__meet.state.consumers.values()].some(c => c.source === 'screen')",
        25_000,
        'Bob to receive a screen consumer',
      );
      await new Promise((resolve) => setTimeout(resolve, 4000));
      const bytes = await inboundBytes(bob.page);
      assert.ok((bytes.screen ?? 0) > 5000, `expected inbound screen bytes, got ${bytes.screen ?? 0}`);
    });

    await check('the sharing peer is flagged for everyone', async () => {
      await waitFor(
        bob.page,
        '[...window.__meet.state.peers.values()].some(p => p.screenSharing)',
        10_000,
        'Bob to see Alice flagged as sharing',
      );
    });

    await check('only one screen share is allowed at a time', async () => {
      const error = await bob.page.evaluate(async () => {
        try {
          await (window as never as { __meet: { startScreenShare(a?: boolean): Promise<void> } }).__meet.startScreenShare(false);
          return null;
        } catch (err) {
          return (err as Error).message;
        }
      });
      assert.ok(error && /already sharing/i.test(error), `expected a busy error, got: ${error}`);
    });

    await check('stopping the share tears down the remote consumer', async () => {
      await alice.page.evaluate(() => (window as never as { __meet: { stopScreenShare(): Promise<void> } }).__meet.stopScreenShare());
      await waitFor(
        bob.page,
        "![...window.__meet.state.consumers.values()].some(c => c.source === 'screen')",
        15_000,
        'the screen consumer to close',
      );
    });

    /* --------------------------------------------------------- mute/video */

    await check('muting the microphone propagates to other participants', async () => {
      await alice.page.evaluate(() => (window as never as { __meet: { muteMic(): Promise<void> } }).__meet.muteMic());
      await waitFor(
        bob.page,
        '[...window.__meet.state.peers.values()].every(p => !p.audioEnabled)',
        10_000,
        'Bob to see Alice muted',
      );
      await alice.page.evaluate(() => (window as never as { __meet: { unmuteMic(): Promise<void> } }).__meet.unmuteMic());
      await waitFor(
        bob.page,
        '[...window.__meet.state.peers.values()].some(p => p.audioEnabled)',
        10_000,
        'Bob to see Alice unmuted',
      );
    });

    await check('turning the camera off propagates and closes the consumer', async () => {
      await alice.page.evaluate(() => (window as never as { __meet: { disableCamera(): Promise<void> } }).__meet.disableCamera());
      await waitFor(
        bob.page,
        "![...window.__meet.state.consumers.values()].some(c => c.source === 'webcam')",
        12_000,
        'the webcam consumer to close',
      );
    });

    /* --------------------------------------------------------------- chat */

    await check('chat messages are delivered', async () => {
      await alice.page.evaluate(() =>
        (window as never as { __meet: { sendChatMessage(t: string): Promise<void> } }).__meet.sendChatMessage('hello from the e2e suite'),
      );
      await waitFor(
        bob.page,
        "window.__meet.state.chat.some(m => m.text === 'hello from the e2e suite')",
        10_000,
        'Bob to receive the chat message',
      );
    });

    await check('raising a hand propagates', async () => {
      await bob.page.evaluate(() => (window as never as { __meet: { raiseHand(r: boolean): Promise<void> } }).__meet.raiseHand(true));
      await waitFor(
        alice.page,
        '[...window.__meet.state.peers.values()].some(p => p.handRaised)',
        10_000,
        'Alice to see the raised hand',
      );
    });

    /* --------------------------------------------------------- moderation */

    await check('the first participant becomes host and can mute others', async () => {
      const role = await alice.page.evaluate(() => (window as never as { __meet: { state: { self: { role: string } } } }).__meet.state.self.role);
      assert.equal(role, 'host', `expected Alice to be host, got ${role}`);

      const bobId = await bob.page.evaluate(() => (window as never as { __meet: { state: { self: { id: string } } } }).__meet.state.self.id);
      await alice.page.evaluate(
        (id) => (window as never as { __meet: { muteParticipant(p: string): Promise<unknown> } }).__meet.muteParticipant(id),
        bobId,
      );
      await waitFor(bob.page, 'window.__meet.state.local.micMuted === true', 10_000, 'Bob to be muted by the host');
    });

    await check('a non-host cannot perform moderator actions', async () => {
      const aliceId = await alice.page.evaluate(() => (window as never as { __meet: { state: { self: { id: string } } } }).__meet.state.self.id);
      const error = await bob.page.evaluate(async (id) => {
        try {
          await (window as never as { __meet: { removeParticipant(p: string): Promise<unknown> } }).__meet.removeParticipant(id);
          return null;
        } catch (err) {
          return (err as Error).message;
        }
      }, aliceId);
      assert.ok(error && /host privileges/i.test(error), `expected a permission error, got: ${error}`);
    });

    /* ------------------------------------------------------------- leaving */

    await check('leaving removes the peer for everyone else', async () => {
      await bob.page.evaluate(() => (window as never as { __meet: { close(): void } }).__meet.close());
      await waitFor(alice.page, 'window.__meet.state.peers.size === 0', 15_000, 'Alice to see Bob leave');
    });
  } finally {
    await alice.browser.close().catch(() => undefined);
    await bob.browser.close().catch(() => undefined);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed\n`);
  if (failed.length > 0) {
    for (const failure of failed) console.error(`FAILED: ${failure.name}\n  ${failure.detail}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('\nE2E run crashed:', error);
  process.exit(1);
});
