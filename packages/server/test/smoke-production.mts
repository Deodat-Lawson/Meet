/**
 * Production smoke test.
 *
 * Unlike the e2e suite this asserts nothing about internals: a production build
 * deliberately omits the `window.__meet` debug handle, so everything here is
 * observed through the DOM and the server's own metrics endpoint — exactly what
 * a real user and a real monitor can see.
 *
 *   ORIGIN=https://meet-xxxx.japaneast.cloudapp.azure.com \
 *     npx tsx test/smoke-production.mts
 */
import assert from 'node:assert/strict';
import puppeteer, { type Browser, type Page } from 'puppeteer';

const ORIGIN = process.env.ORIGIN;
if (!ORIGIN) {
  console.error('Set ORIGIN to the deployed base URL.');
  process.exit(2);
}

const ARGS = [
  '--use-fake-ui-for-media-stream',
  '--use-fake-device-for-media-stream',
  '--auto-select-desktop-capture-source=Entire screen',
  '--autoplay-policy=no-user-gesture-required',
  '--no-sandbox',
];

const results: Array<{ name: string; ok: boolean; detail?: string }> = [];
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ✓ ${name}`);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    results.push({ name, ok: false, detail });
    console.error(`  ✗ ${name}\n      ${detail}`);
  }
}

async function open(browser: Browser, roomId: string, name: string): Promise<Page> {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem('meet.locale', 'en');
    } catch {
      /* storage may be unavailable */
    }
  });
  await page.setViewport({ width: 1280, height: 800 });
  page.on('pageerror', (e) => console.error(`  [${name}] page error:`, e.message));
  await page.goto(`${ORIGIN}/room/${roomId}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForSelector('#display-name', { timeout: 30_000 });
  await page.click('#display-name');
  await page.evaluate(() => {
    const i = document.querySelector<HTMLInputElement>('#display-name');
    if (i) i.value = '';
  });
  await page.type('#display-name', name);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.trim() === 'Join now');
    b?.click();
  });
  // The control bar only renders once the meeting is actually joined.
  await page.waitForSelector('.controls', { timeout: 45_000 });
  return page;
}

/** Counts tiles that are decoding real frames, straight from the DOM. */
async function liveVideos(page: Page): Promise<Array<{ w: number; h: number }>> {
  return page.evaluate(() =>
    [...document.querySelectorAll('video')]
      .filter((v) => v.videoWidth > 0 && v.videoHeight > 0)
      .map((v) => ({ w: v.videoWidth, h: v.videoHeight })),
  );
}

async function main() {
  console.log(`\nProduction smoke test — ${ORIGIN}\n`);

  await check('health endpoint responds', async () => {
    const r = await fetch(`${ORIGIN}/health`);
    assert.ok(r.ok, `health returned ${r.status}`);
    const body = (await r.json()) as { status: string };
    assert.equal(body.status, 'ok');
  });

  await check('TURN credentials are served to clients', async () => {
    const r = await fetch(`${ORIGIN}/api/config`);
    const body = (await r.json()) as { iceServers: Array<{ urls: string | string[] }> };
    const flat = body.iceServers.flatMap((s) => (Array.isArray(s.urls) ? s.urls : [s.urls]));
    assert.ok(flat.some((u) => u.startsWith('turn:')), `no TURN server offered: ${flat.join(', ')}`);
    assert.ok(flat.some((u) => u.startsWith('stun:')), 'no STUN server offered');
  });

  const created = await fetch(`${ORIGIN}/api/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'production smoke' }),
  });
  assert.ok(created.ok, 'could not create a room');
  const { roomId } = (await created.json()) as { roomId: string };
  console.log(`  room: ${roomId}\n`);

  const browser = await puppeteer.launch({ headless: true, args: ARGS });
  let alice: Page | undefined;
  let bob: Page | undefined;

  try {
    await check('two browsers can join over the public internet', async () => {
      alice = await open(browser, roomId, 'Alice');
      bob = await open(browser, roomId, 'Bob');
    });

    await check('the server reports both peers in the room', async () => {
      const deadline = Date.now() + 30_000;
      let peers = 0;
      while (Date.now() < deadline) {
        const m = (await (await fetch(`${ORIGIN}/api/metrics`)).json()) as {
          detail: Array<{ id: string; peers: number }>;
        };
        peers = m.detail.find((d) => d.id === roomId)?.peers ?? 0;
        if (peers >= 2) return;
        await new Promise((r) => setTimeout(r, 2000));
      }
      throw new Error(`server saw ${peers} peers, expected 2`);
    });

    await check('each peer decodes the other’s video', async () => {
      const deadline = Date.now() + 45_000;
      while (Date.now() < deadline) {
        const a = await liveVideos(alice!);
        const b = await liveVideos(bob!);
        // Two live videos each = own preview plus the remote peer.
        if (a.length >= 2 && b.length >= 2) {
          console.log(`      Alice sees ${a.map((v) => `${v.w}x${v.h}`).join(', ')}`);
          console.log(`      Bob   sees ${b.map((v) => `${v.w}x${v.h}`).join(', ')}`);
          return;
        }
        await new Promise((r) => setTimeout(r, 2500));
      }
      throw new Error('remote video never decoded a frame');
    });

    await check('screen sharing works end to end', async () => {
      await alice!.evaluate(() => {
        const b = [...document.querySelectorAll('button')].find((x) => x.getAttribute('title')?.includes('Share screen'));
        (b as HTMLButtonElement | undefined)?.click();
      });
      // Bob's stage switches to the share layout with its banner.
      await bob!.waitForFunction(() => Boolean(document.querySelector('.share-banner')), { timeout: 45_000 });
      const banner = await bob!.evaluate(() => document.querySelector('.share-banner')?.textContent ?? '');
      assert.ok(banner.length > 0, 'share banner had no text');
      console.log(`      Bob sees: "${banner.trim()}"`);
    });

    await check('no tile is clipped out of the stage', async () => {
      const spill = await bob!.evaluate(() => {
        const stage = document.querySelector('.stage')?.getBoundingClientRect();
        if (!stage) return -1;
        return [...document.querySelectorAll('.tile')]
          .map((t) => t.getBoundingClientRect())
          .filter((r) => r.bottom > stage.bottom + 1 || r.right > stage.right + 1).length;
      });
      assert.equal(spill, 0, `${spill} tiles spill outside the stage`);
    });

    await check('the Chinese translation is served', async () => {
      const page = await browser.newPage();
      await page.evaluateOnNewDocument(() => {
        try {
          localStorage.setItem('meet.locale', 'zh');
        } catch {
          /* ignore */
        }
      });
      await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await page.waitForSelector('.card', { timeout: 20_000 });
      const text = await page.evaluate(() => document.body.innerText);
      assert.ok(/[一-鿿]/.test(text), 'no Chinese characters rendered with locale=zh');
      console.log(`      rendered: ${text.split('\n').filter(Boolean).slice(0, 2).join(' / ')}`);
      await page.close();
    });
  } finally {
    await browser.close().catch(() => undefined);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed\n`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\nSmoke test crashed:', e);
  process.exit(1);
});
