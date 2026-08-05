/**
 * End-to-end test for the waiting room.
 *
 * The admission path is easy to get subtly wrong: the client re-runs the join
 * handshake after being let in, so a naive lobby check bounces an admitted guest
 * straight back into the queue. This drives the real flow — host waits, guest
 * queues, host admits, guest lands in the meeting with media flowing — and then
 * checks that a denied guest is actually turned away.
 *
 *   npm run test:e2e:lobby -w @meet/server
 */
import assert from 'node:assert/strict';
import puppeteer, { type Browser, type Page } from 'puppeteer';

const WEB_ORIGIN = process.env.E2E_WEB_ORIGIN ?? 'https://localhost:5173';
const API_ORIGIN = process.env.E2E_API_ORIGIN ?? 'http://127.0.0.1:4000';

const CHROME_ARGS = [
  '--use-fake-ui-for-media-stream',
  '--use-fake-device-for-media-stream',
  '--autoplay-policy=no-user-gesture-required',
  '--no-sandbox',
];

const results: Array<{ name: string; ok: boolean; detail?: string }> = [];

async function check(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ✓ ${name}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ name, ok: false, detail });
    console.error(`  ✗ ${name}\n      ${detail}`);
  }
}

async function waitFor(page: Page, predicate: string, timeoutMs: number, label: string): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await page.evaluate(`(() => { try { return Boolean(${predicate}); } catch { return false; } })()`);
    if (value) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`timed out after ${timeoutMs}ms waiting for ${label}`);
}

async function launch(): Promise<{ browser: Browser; page: Page }> {
  const browser = await puppeteer.launch({ headless: true, acceptInsecureCerts: true, args: CHROME_ARGS });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on('pageerror', (error) => console.error('[page]', error.message));
  return { browser, page };
}

async function startJoin(page: Page, roomId: string, displayName: string): Promise<void> {
  await page.goto(`${WEB_ORIGIN}/room/${roomId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#display-name', { timeout: 15_000 });
  await page.click('#display-name');
  await page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>('#display-name');
    if (input) input.value = '';
  });
  await page.type('#display-name', displayName);
  await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Join now');
    button?.click();
  });
}

async function main(): Promise<void> {
  console.log('\nMeet waiting-room test\n');

  const created = await fetch(`${API_ORIGIN}/api/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Lobby meeting', lobbyEnabled: true }),
  });
  assert.ok(created.ok, 'could not create the room');
  const { roomId } = (await created.json()) as { roomId: string };
  console.log(`Room: ${roomId} (waiting room enabled)\n`);

  const host = await launch();
  const guest = await launch();
  const denied = await launch();

  try {
    await check('the first participant bypasses the waiting room and becomes host', async () => {
      await startJoin(host.page, roomId, 'Host');
      await waitFor(host.page, 'window.__meet && window.__meet.state.joined', 25_000, 'the host to join');
      const role = await host.page.evaluate(() => (window as never as { __meet: { state: { self: { role: string } } } }).__meet.state.self.role);
      assert.equal(role, 'host', `expected host, got ${role}`);
    });

    await check('a later participant is held in the waiting room', async () => {
      await startJoin(guest.page, roomId, 'Guest');
      await waitFor(guest.page, 'window.__meet && window.__meet.state.inLobby', 25_000, 'the guest to enter the lobby');
      const joined = await guest.page.evaluate(() => (window as never as { __meet: { state: { joined: boolean } } }).__meet.state.joined);
      assert.equal(joined, false, 'the guest should not be in the meeting yet');
    });

    await check('the host is notified of the waiting participant', async () => {
      await waitFor(host.page, 'window.__meet.state.lobbyPeers.length >= 1', 15_000, 'the host to see the lobby queue');
      const name = await host.page.evaluate(
        () => (window as never as { __meet: { state: { lobbyPeers: Array<{ displayName: string }> } } }).__meet.state.lobbyPeers[0].displayName,
      );
      assert.equal(name, 'Guest');
    });

    await check('admitting the guest puts them in the meeting, not back in the queue', async () => {
      const guestId = await host.page.evaluate(
        () => (window as never as { __meet: { state: { lobbyPeers: Array<{ id: string }> } } }).__meet.state.lobbyPeers[0].id,
      );
      await host.page.evaluate((id) => {
        void (window as never as { __meet: { admitLobbyPeer(p: string, a: boolean): Promise<unknown> } }).__meet.admitLobbyPeer(id, true);
      }, guestId);

      await waitFor(guest.page, 'window.__meet.state.joined === true', 25_000, 'the guest to be admitted');

      // Give a buggy server the chance to bounce them back before asserting.
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const state = await guest.page.evaluate(() => {
        const s = (window as never as { __meet: { state: { joined: boolean; inLobby: boolean } } }).__meet.state;
        return { joined: s.joined, inLobby: s.inLobby };
      });
      assert.equal(state.joined, true, 'the guest should be in the meeting');
      assert.equal(state.inLobby, false, 'the guest should not have been returned to the lobby');
    });

    await check('media flows to the admitted guest', async () => {
      await waitFor(
        guest.page,
        "[...window.__meet.state.consumers.values()].some(c => c.source === 'mic')",
        20_000,
        'the guest to receive the host audio',
      );
      await waitFor(host.page, 'window.__meet.state.peers.size >= 1', 15_000, 'the host to see the guest');
    });

    await check('a denied participant is turned away', async () => {
      await startJoin(denied.page, roomId, 'Uninvited');
      await waitFor(denied.page, 'window.__meet && window.__meet.state.inLobby', 25_000, 'the third peer to queue');
      await waitFor(host.page, 'window.__meet.state.lobbyPeers.length >= 1', 15_000, 'the host to see them queued');

      const id = await host.page.evaluate(
        () => (window as never as { __meet: { state: { lobbyPeers: Array<{ id: string }> } } }).__meet.state.lobbyPeers[0].id,
      );
      await host.page.evaluate((peerId) => {
        void (window as never as { __meet: { admitLobbyPeer(p: string, a: boolean): Promise<unknown> } }).__meet.admitLobbyPeer(peerId, false);
      }, id);

      // The UI moves to the "you've left" screen carrying the denial reason.
      await denied.page.waitForFunction(
        () => document.body.innerText.includes('did not admit you'),
        { timeout: 20_000 },
      );
      const stillIn = await host.page.evaluate(
        () => (window as never as { __meet: { state: { peers: Map<string, unknown> } } }).__meet.state.peers.size,
      );
      assert.equal(stillIn, 1, 'only the admitted guest should be in the meeting');
    });
  } finally {
    for (const client of [host, guest, denied]) await client.browser.close().catch(() => undefined);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed\n`);
  if (failed.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error('\nLobby test crashed:', error);
  process.exit(1);
});
