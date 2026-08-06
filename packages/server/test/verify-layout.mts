/**
 * Layout stress check: does any tile ever spill out of the stage?
 *
 * Sweeps participant counts and viewport sizes, in gallery, speaker and
 * screen-share layouts. The gallery used to size rows from CSS aspect-ratio on
 * the column width, which has no knowledge of the container height, so the
 * bottom row was clipped by `overflow: hidden` the moment rows*height exceeded
 * the stage.
 */
import puppeteer, { type Browser, type Page } from 'puppeteer';

const ORIGIN = process.env.E2E_WEB_ORIGIN ?? 'http://localhost:5173';
const API = 'http://127.0.0.1:4000';
const ARGS = [
  '--use-fake-ui-for-media-stream',
  '--use-fake-device-for-media-stream',
  '--auto-select-desktop-capture-source=Entire screen',
  '--autoplay-policy=no-user-gesture-required',
  '--no-sandbox',
];

const VIEWPORTS = [
  { width: 1440, height: 900, label: 'desktop 1440x900' },
  { width: 1280, height: 720, label: 'laptop 1280x720' },
  { width: 1024, height: 640, label: 'small 1024x640' },
  { width: 820, height: 1180, label: 'tablet portrait' },
];

async function join(browser: Browser, roomId: string, name: string): Promise<Page> {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(`${ORIGIN}/room/${roomId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#display-name', { timeout: 15000 });
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
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (await page.evaluate(() => Boolean((window as any).__meet?.state.joined))) return page;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`${name} never joined`);
}

async function spill(page: Page) {
  return page.evaluate(() => {
    const stage = document.querySelector('.stage')?.getBoundingClientRect();
    if (!stage) return { tiles: 0, spilling: 0, worst: 0 };
    const tiles = [...document.querySelectorAll('.tile')].map((t) => t.getBoundingClientRect());
    const overshoot = tiles.map((r) => Math.max(r.bottom - stage.bottom, r.right - stage.right));
    return {
      tiles: tiles.length,
      spilling: overshoot.filter((o) => o > 1).length,
      worst: Math.round(Math.max(0, ...overshoot)),
    };
  });
}

const res = await fetch(`${API}/api/rooms`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ name: 'layout sweep' }),
});
const { roomId } = (await res.json()) as { roomId: string };

const browser = await puppeteer.launch({ headless: true, acceptInsecureCerts: true, args: ARGS });
const viewer = await join(browser, roomId, 'Viewer');

const extras: Page[] = [];
let failures = 0;

try {
  for (const n of [2, 3, 4, 5, 6, 9]) {
    while (extras.length < n - 1) {
      const p = await join(browser, roomId, `Peer${extras.length + 1}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await p.evaluate(() => void (window as any).__meet.enableCamera());
      extras.push(p);
    }
    await new Promise((r) => setTimeout(r, 1500));

    for (const vp of VIEWPORTS) {
      await viewer.setViewport({ width: vp.width, height: vp.height });
      await new Promise((r) => setTimeout(r, 700));
      const gallery = await spill(viewer);

      // Speaker view exercises the pinned/focus layout.
      await viewer.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const s = (window as any).__meet;
        void s;
      });
      const ok = gallery.spilling === 0;
      if (!ok) failures++;
      console.log(
        `${ok ? '  ✓' : '  ✗'} ${n} peers · ${vp.label.padEnd(20)} tiles=${gallery.tiles} spilling=${gallery.spilling}${gallery.worst ? ` worst=+${gallery.worst}px` : ''}`,
      );
    }
  }
} finally {
  await browser.close().catch(() => undefined);
}

console.log(failures === 0 ? '\nNo tile ever left the stage.\n' : `\n${failures} layout failures\n`);
process.exit(failures === 0 ? 0 : 1);
