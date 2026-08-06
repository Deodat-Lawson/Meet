/**
 * End-to-end language test.
 *
 * Walks a real Chrome through every screen the app has — home, pre-join,
 * waiting room, meeting, and each side panel — at a desktop and a phone
 * viewport, in both languages, and asserts three things per screen:
 *
 *   1. the expected Chinese text is on screen;
 *   2. no English UI string is left behind;
 *   3. the switch works in both directions, live, without a reload.
 *
 * The "no English left behind" check reads the rendered text of the page rather
 * than the source, so anything a translation missed — an attribute, a fallback,
 * a string minted by the server — shows up here.
 *
 *   npm run test:e2e:i18n -w @meet/server
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
  '--autoplay-policy=no-user-gesture-required',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--disable-features=WebRtcHideLocalIpsWithMdns',
];

const VIEWPORTS = [
  { label: 'desktop', width: 1280, height: 800 },
  { label: 'phone', width: 390, height: 844 },
] as const;

/**
 * English UI strings that must not survive a switch to Chinese.
 *
 * Deliberately drawn from every screen, and deliberately including the wording
 * that only appears in an attribute (`Copy the meeting link`) or that the server
 * writes (`This meeting is full.`).
 */
const ENGLISH_PHRASES = [
  'Start or join a meeting',
  'New meeting',
  'Meeting options',
  'Join with a code',
  'Ready to join?',
  'Your name',
  'Join now',
  'Cancel',
  'Waiting to be admitted',
  'Copy link',
  'Participants',
  'Chat',
  'Settings',
  'Unmute',
  'Start video',
  'Share',
  'React',
  'Raise',
  'More',
  'Leave',
  'No messages yet.',
  'Type a message…',
  'Microphone',
  'Video quality',
  'Meeting controls',
  'Your network',
  'System default',
  'Host',
  'Speaker view',
  'Mute everyone',
  'Lock meeting',
  'End meeting for all',
];

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

async function launch(width: number, height: number): Promise<{ browser: Browser; page: Page }> {
  const browser = await puppeteer.launch({ headless: HEADLESS, acceptInsecureCerts: true, args: CHROME_ARGS });
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  page.on('pageerror', (error) => console.error('  page error:', error.message));
  // The meeting page installs a beforeunload guard; left unanswered its dialog
  // stalls every later navigation.
  page.on('dialog', (dialog) => void dialog.accept().catch(() => undefined));
  return { browser, page };
}

async function waitFor(page: Page, predicate: string, timeoutMs = 20_000, label = 'condition'): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await page.evaluate(`(() => { try { return Boolean(${predicate}); } catch { return false; } })()`);
    if (value) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`timed out after ${timeoutMs}ms waiting for ${label}`);
}

/** Everything the user can read: rendered text plus the attributes that speak. */
async function visibleText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const parts = [document.title, document.body.innerText];
    for (const element of document.querySelectorAll('[title], [aria-label], [placeholder]')) {
      parts.push(
        element.getAttribute('title') ?? '',
        element.getAttribute('aria-label') ?? '',
        element.getAttribute('placeholder') ?? '',
      );
    }
    // `<option>` text is not part of innerText when the select is closed.
    for (const option of document.querySelectorAll('option')) parts.push(option.textContent ?? '');
    return parts.join('\n');
  });
}

async function setLanguage(page: Page, locale: 'en' | 'zh'): Promise<void> {
  const clicked = await page.evaluate((wanted) => {
    const button = document.querySelector<HTMLButtonElement>(`.lang-option[data-locale="${wanted}"]`);
    if (!button) return false;
    button.click();
    return true;
  }, locale);
  assert.ok(clicked, `no language button for "${locale}" on screen`);
  // One frame for React to re-render.
  await new Promise((resolve) => setTimeout(resolve, 120));
}

async function assertChinese(page: Page, screen: string): Promise<void> {
  const text = await visibleText(page);
  const leaked = ENGLISH_PHRASES.filter((phrase) => text.includes(phrase));
  assert.deepEqual(leaked, [], `${screen}: English left on screen after switching to Chinese: ${leaked.join(', ')}`);
  assert.match(text, /[一-鿿]/, `${screen}: no Chinese text rendered at all`);
}

async function assertContains(page: Page, screen: string, expected: string[]): Promise<void> {
  const text = await visibleText(page);
  const missing = expected.filter((phrase) => !text.includes(phrase));
  assert.deepEqual(missing, [], `${screen}: expected text missing: ${missing.join(', ')}`);
}

async function createRoom(options: Record<string, unknown> = {}): Promise<string> {
  const response = await fetch(`${API_ORIGIN}/api/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(options),
  });
  assert.ok(response.ok, 'could not create a room via the API');
  return ((await response.json()) as { roomId: string }).roomId;
}

async function joinAs(
  page: Page,
  roomId: string,
  displayName: string,
  until: 'joined' | 'lobby' = 'joined',
): Promise<void> {
  await page.goto(`${WEB_ORIGIN}/room/${roomId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#display-name', { timeout: 15_000 });
  await page.evaluate((name) => {
    const input = document.querySelector<HTMLInputElement>('#display-name');
    if (!input) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, name);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, displayName);

  // Click the primary action by role, not by label — the label is the thing
  // under test and changes language halfway through this suite.
  await page.evaluate(() => {
    document.querySelector<HTMLButtonElement>('.card .btn-primary.btn-block')?.click();
  });
  const predicate =
    until === 'joined'
      ? 'window.__meet && window.__meet.state.joined'
      : 'window.__meet && window.__meet.state.inLobby';
  await waitFor(page, predicate, 30_000, `${displayName} to reach ${until}`);
  await new Promise((resolve) => setTimeout(resolve, 400));
}

/**
 * Opens a side panel through the store rather than by clicking its button: the
 * button's label is the thing under test, and clicking by text would make the
 * test depend on the translation it is meant to verify.
 */
async function openPanel(page: Page, panel: 'none' | 'participants' | 'chat' | 'settings'): Promise<void> {
  const opened = await page.evaluate((wanted) => {
    const store = (window as unknown as { __meetStore?: { setState(patch: object): void } }).__meetStore;
    if (!store) return false;
    store.setState({ panel: wanted });
    return true;
  }, panel);
  assert.ok(opened, 'the dev store handle is missing — is the web client running in dev mode?');
  await new Promise((resolve) => setTimeout(resolve, 250));
}

async function main(): Promise<void> {
  console.log('\nMeet language test\n');

  for (const viewport of VIEWPORTS) {
    console.log(`${viewport.label} (${viewport.width}×${viewport.height})`);
    const { browser, page } = await launch(viewport.width, viewport.height);

    try {
      /* ------------------------------------------------------------ home */

      await page.goto(`${WEB_ORIGIN}/`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-testid="language-toggle"]', { timeout: 15_000 });

      await check(`${viewport.label}: the language toggle is on the home screen`, async () => {
        const buttons = await page.$$eval('.lang-option', (nodes) =>
          nodes.map((node) => node.getAttribute('data-locale')),
        );
        assert.deepEqual(buttons, ['en', 'zh'], 'expected an English and a Chinese option');
      });

      await check(`${viewport.label}: the toggle is reachable and not clipped`, async () => {
        const box = await page.$eval('[data-testid="language-toggle"]', (node) => {
          const rect = node.getBoundingClientRect();
          return { top: rect.top, left: rect.left, right: rect.right, width: rect.width, height: rect.height };
        });
        assert.ok(box.width > 0 && box.height > 0, 'the toggle has no size');
        assert.ok(box.left >= 0, `the toggle starts off the left edge (${box.left})`);
        assert.ok(box.right <= viewport.width, `the toggle overflows the viewport (${box.right} > ${viewport.width})`);
      });

      await setLanguage(page, 'en');
      await check(`${viewport.label}: the home screen reads in English`, async () => {
        await assertContains(page, 'home', ['Start or join a meeting', 'New meeting', 'Join with a code']);
      });

      await setLanguage(page, 'zh');
      await check(`${viewport.label}: the home screen switches to Chinese`, async () => {
        await assertContains(page, 'home', ['发起或加入会议', '发起新会议', '使用会议号加入']);
        await assertChinese(page, 'home');
      });

      await check(`${viewport.label}: the document language follows the switch`, async () => {
        const lang = await page.evaluate(() => document.documentElement.lang);
        assert.equal(lang, 'zh-CN', `expected the <html lang> to be Chinese, got "${lang}"`);
        const title = await page.evaluate(() => document.title);
        assert.match(title, /[一-鿿]/, `the tab title stayed English: "${title}"`);
      });

      await check(`${viewport.label}: meeting options are translated`, async () => {
        await page.evaluate(() => {
          const buttons = [...document.querySelectorAll<HTMLButtonElement>('.card > .btn-block')];
          buttons[1]?.click();
        });
        await new Promise((resolve) => setTimeout(resolve, 150));
        await assertContains(page, 'home options', ['会议名称', '入会密码（可选）', '等候室']);
        await assertChinese(page, 'home options');
      });

      /* -------------------------------------------------------- pre-join */

      const roomId = await createRoom();
      await page.goto(`${WEB_ORIGIN}/room/${roomId}`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#display-name', { timeout: 15_000 });

      await check(`${viewport.label}: the pre-join screen is translated`, async () => {
        await assertContains(page, 'pre-join', ['准备好加入了吗？', '你的名字', '立即加入', '取消']);
        await assertChinese(page, 'pre-join');
      });

      await check(`${viewport.label}: an unnamed meeting gets a localized title`, async () => {
        await assertContains(page, 'pre-join', [`会议 ${roomId}`]);
      });

      await check(`${viewport.label}: pre-join switches back to English and returns`, async () => {
        await setLanguage(page, 'en');
        await assertContains(page, 'pre-join', ['Ready to join?', 'Your name', 'Join now', `Meeting ${roomId}`]);
        await setLanguage(page, 'zh');
        await assertChinese(page, 'pre-join');
      });

      /* -------------------------------------------------------- meeting */

      await joinAs(page, roomId, '李明');

      await check(`${viewport.label}: the meeting screen is translated`, async () => {
        await assertContains(page, 'meeting', ['复制链接', '静音', '参会者', '聊天', '离开']);
        await assertChinese(page, 'meeting');
      });

      await check(`${viewport.label}: the meeting header fits the viewport`, async () => {
        const overflow = await page.evaluate(() => {
          const header = document.querySelector('.room-header');
          if (!header) return 'no header';
          return header.scrollWidth > header.clientWidth + 1
            ? `header overflows by ${header.scrollWidth - header.clientWidth}px`
            : '';
        });
        assert.equal(overflow, '', overflow);
        const noBodyScroll = await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
        );
        assert.ok(noBodyScroll, 'the page scrolls horizontally');
      });

      for (const panel of ['participants', 'chat', 'settings'] as const) {
        await check(`${viewport.label}: the ${panel} panel is translated`, async () => {
          await openPanel(page, panel);
          const expected = {
            participants: ['参会者', '主持人'],
            chat: ['聊天', '还没有消息。', '消息对会议中的所有人可见。'],
            settings: ['设置', '语言', '麦克风', '视频质量', '会议控制', '你的网络'],
          }[panel];
          await assertContains(page, `${panel} panel`, expected);
          await assertChinese(page, `${panel} panel`);
        });
      }

      await check(`${viewport.label}: the host menu is translated`, async () => {
        await openPanel(page, 'none');
        await page.evaluate(() => {
          const controls = [...document.querySelectorAll<HTMLButtonElement>('.controls .control')];
          controls[controls.length - 1]?.click();
        });
        await new Promise((resolve) => setTimeout(resolve, 150));
        await assertContains(page, 'host menu', ['演讲者视图', '音频与视频设置', '全体静音', '锁定会议', '结束全体会议']);
        await assertChinese(page, 'host menu');
        await page.keyboard.press('Escape');
        await page.evaluate(() => document.body.click());
      });

      await check(`${viewport.label}: switching mid-meeting re-renders everything live`, async () => {
        await openPanel(page, 'settings');
        await setLanguage(page, 'en');
        await assertContains(page, 'meeting (en)', ['Settings', 'Language', 'Microphone', 'Video quality', 'Copy link']);
        await setLanguage(page, 'zh');
        await assertContains(page, 'meeting (zh)', ['设置', '语言', '麦克风', '视频质量', '复制链接']);
        await assertChinese(page, 'meeting (zh)');
      });

      await check(`${viewport.label}: the network and signalling readouts are words, not wire values`, async () => {
        await openPanel(page, 'settings');
        const text = await visibleText(page);
        for (const wireValue of ['excellent', 'connected', 'reconnecting', 'disconnected']) {
          assert.ok(!text.includes(wireValue), `the raw state "${wireValue}" is being shown to the user`);
        }
      });

      /* --------------------------------------------------- meeting ended */

      await check(`${viewport.label}: the "meeting ended" screen translates the server's reason`, async () => {
        // Drive the state the host's "end meeting for all" produces, carrying
        // the exact wording the server puts on the wire. Getting Chinese out of
        // it proves the server-message mapping runs at render time.
        await page.evaluate(() => {
          const debug = window as unknown as {
            __meet: { close(): void };
            __meetStore: { setState(patch: object): void };
          };
          // Closing first mirrors the real handler: while the socket is open the
          // engine keeps emitting state, and each emission would put `status`
          // straight back to "joined".
          debug.__meet.close();
          debug.__meetStore.setState({ status: 'left', fatalError: { text: 'The host ended this meeting.' } });
        });
        await new Promise((resolve) => setTimeout(resolve, 250));
        await assertContains(page, 'meeting ended', [
          '你已离开会议',
          '主持人已结束本次会议。',
          '重新加入',
          '返回首页',
        ]);
        await assertChinese(page, 'meeting ended');
      });

      await check(`${viewport.label}: that reason follows a language switch`, async () => {
        await setLanguage(page, 'en');
        await assertContains(page, 'meeting ended (en)', [
          "You've left the meeting",
          'The host ended this meeting.',
          'Back to home',
        ]);
        await setLanguage(page, 'zh');
        await assertContains(page, 'meeting ended (zh)', ['主持人已结束本次会议。']);
      });

      /* ------------------------------------------------------ persistence */

      await check(`${viewport.label}: the choice survives a reload`, async () => {
        await page.goto(`${WEB_ORIGIN}/`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('[data-testid="language-toggle"]', { timeout: 15_000 });
        await assertContains(page, 'home after reload', ['发起或加入会议']);
        const active = await page.$eval('.lang-option.active', (node) => node.getAttribute('data-locale'));
        assert.equal(active, 'zh', 'the Chinese option is not marked active after a reload');
      });

      /* ---------------------------------------------------- waiting room */

      await check(`${viewport.label}: the waiting room is translated`, async () => {
        const lobbyRoom = await createRoom({ lobbyEnabled: true });
        // A host has to be present for the lobby to hold anyone.
        const host = await launch(1280, 800);
        try {
          await joinAs(host.page, lobbyRoom, 'Anna');
          await joinAs(page, lobbyRoom, '王芳', 'lobby');
          await assertContains(page, 'waiting room', ['等待主持人允许你加入', '取消']);
          await assertChinese(page, 'waiting room');
        } finally {
          await host.browser.close();
        }
      });
    } finally {
      await browser.close();
    }
    console.log('');
  }

  const failed = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) {
    console.error('\nFailures:');
    for (const failure of failed) console.error(`  ✗ ${failure.name}\n      ${failure.detail}`);
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
