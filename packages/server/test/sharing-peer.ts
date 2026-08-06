/**
 * Helper: joins a meeting from a browser, starts a screen share and holds it.
 *
 * Used to verify the receiving side of a screen share on another platform (the
 * Android app), which cannot be asserted from inside the browser.
 *
 *   E2E_ROOM=abc-defg-hij E2E_HOLD_MS=45000 tsx test/sharing-peer.ts
 */
import puppeteer from 'puppeteer';

const WEB_ORIGIN = process.env.E2E_WEB_ORIGIN ?? 'https://localhost:5173';
const ROOM = process.env.E2E_ROOM;
const HOLD_MS = Number(process.env.E2E_HOLD_MS ?? 45_000);

if (!ROOM) {
  console.error('Set E2E_ROOM to the meeting code to join.');
  process.exit(2);
}

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
// This script clicks a button by its English label; pin the language so it does
// not depend on the locale of whatever machine it runs on.
await page.evaluateOnNewDocument(() => {
  try {
    localStorage.setItem('meet.locale', 'en');
  } catch {
    /* storage may be unavailable */
  }
});
await page.goto(`${WEB_ORIGIN}/room/${ROOM}`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#display-name', { timeout: 15_000 });
await page.type('#display-name', 'WebPresenter');
await page.evaluate(() => {
  const button = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Join now');
  button?.click();
});

const deadline = Date.now() + 30_000;
while (Date.now() < deadline) {
  const joined = await page.evaluate(() => Boolean((window as never as { __meet?: { state: { joined: boolean } } }).__meet?.state.joined));
  if (joined) break;
  await new Promise((resolve) => setTimeout(resolve, 300));
}
console.log('joined');

await page.evaluate(() =>
  (window as never as { __meet: { startScreenShare(a?: boolean): Promise<void> } }).__meet.startScreenShare(false),
);
console.log('sharing screen; holding…');

await new Promise((resolve) => setTimeout(resolve, HOLD_MS));
await browser.close();
console.log('done');
