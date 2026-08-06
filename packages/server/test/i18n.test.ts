import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_LABELS,
  LOCALE_SHORT_LABELS,
  LOCALE_TAGS,
  createTranslator,
  interpolate,
  isLocale,
  messages,
  resolveLocale,
  translate,
  translateServerText,
  type Locale,
  type MessageKey,
} from '@meet/protocol';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');

const en = messages.en;
const zh = messages.zh;
const keys = Object.keys(en) as MessageKey[];

/** Anything with a CJK ideograph, kana or full-width punctuation counts. */
const CJK = /[　-〿㐀-䶿一-鿿＀-￯]/;

/**
 * Entries whose Chinese form is legitimately identical to the English one, or
 * carries no Chinese characters at all. Each needs a reason: this list is the
 * only escape hatch from "everything is translated".
 */
const UNTRANSLATED_BY_DESIGN: Partial<Record<MessageKey, string>> = {
  'home.joinCodePlaceholder': 'a meeting code format, not prose',
};

function placeholders(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
}

/* --------------------------------------------------------------- dictionary */

describe('translation dictionary', () => {
  it('ships the same keys in every locale', () => {
    for (const locale of LOCALES) {
      const table = messages[locale];
      assert.ok(table, `locale ${locale} has no message table`);
      assert.deepEqual(
        Object.keys(table).sort(),
        keys.slice().sort(),
        `locale ${locale} does not have exactly the English key set`,
      );
    }
  });

  it('has no empty or placeholder-only translations', () => {
    for (const locale of LOCALES) {
      for (const key of keys) {
        const value = messages[locale][key];
        assert.ok(value.trim().length > 0, `${locale}/${key} is empty`);
        assert.notEqual(value, key, `${locale}/${key} still renders its own key`);
      }
    }
  });

  it('actually translates every string into Chinese', () => {
    const missing: string[] = [];
    for (const key of keys) {
      if (key in UNTRANSLATED_BY_DESIGN) continue;
      if (!CJK.test(zh[key])) missing.push(`${key}: ${JSON.stringify(zh[key])}`);
    }
    assert.deepEqual(missing, [], `these Chinese entries contain no Chinese:\n${missing.join('\n')}`);
  });

  it('does not leave any Chinese entry byte-identical to its English source', () => {
    const untouched = keys.filter((key) => !(key in UNTRANSLATED_BY_DESIGN) && zh[key] === en[key]);
    assert.deepEqual(untouched, [], 'these entries were never translated');
  });

  it('keeps the same placeholders in every locale', () => {
    for (const key of keys) {
      const expected = placeholders(en[key]);
      for (const locale of LOCALES) {
        assert.deepEqual(
          placeholders(messages[locale][key]),
          expected,
          `${locale}/${key} has different placeholders from English`,
        );
      }
    }
  });

  it('names each language in that language', () => {
    assert.equal(LOCALE_LABELS.en, 'English');
    assert.ok(CJK.test(LOCALE_LABELS.zh), 'the Chinese option must be labelled in Chinese');
    for (const locale of LOCALES) {
      assert.ok(LOCALE_SHORT_LABELS[locale].length <= 2, 'the compact label must fit a narrow control');
      assert.ok(LOCALE_TAGS[locale], `locale ${locale} has no BCP 47 tag`);
    }
  });
});

/* ------------------------------------------------------------- translate() */

describe('translate', () => {
  it('fills placeholders', () => {
    assert.equal(translate('en', 'room.rejoin', { id: 'abc-defg-hij' }), 'Rejoin abc-defg-hij');
    assert.ok(translate('zh', 'room.rejoin', { id: 'abc-defg-hij' }).includes('abc-defg-hij'));
  });

  it('leaves an unknown placeholder alone rather than printing "undefined"', () => {
    assert.equal(interpolate('Hello {who} from {where}', { who: 'Ada' }), 'Hello Ada from {where}');
  });

  it('accepts numbers as well as strings', () => {
    assert.equal(translate('en', 'participants.title', { count: 3 }), 'Participants (3)');
    assert.equal(translate('zh', 'participants.title', { count: 3 }), '参会者（3）');
  });

  it('falls back to English for a locale that is missing an entry', () => {
    const broken = { ...messages.zh } as Record<MessageKey, string>;
    // Simulated by deleting through a copy: the real tables are complete, and
    // the parity test above is what keeps them that way.
    delete (broken as Partial<Record<MessageKey, string>>)['chat.title'];
    const original = messages.zh;
    (messages as Record<Locale, Record<MessageKey, string>>).zh = broken;
    try {
      assert.equal(translate('zh', 'chat.title'), en['chat.title']);
    } finally {
      (messages as Record<Locale, Record<MessageKey, string>>).zh = original;
    }
  });

  it('binds a locale with createTranslator', () => {
    const t = createTranslator('zh');
    assert.equal(t('chat.title'), zh['chat.title']);
  });
});

/* ---------------------------------------------------------- locale parsing */

describe('resolveLocale', () => {
  it('matches exact tags', () => {
    assert.equal(resolveLocale('zh'), 'zh');
    assert.equal(resolveLocale('en'), 'en');
  });

  it('matches regional and script variants', () => {
    for (const tag of ['zh-CN', 'zh-Hans', 'zh-Hant-TW', 'ZH_HK', 'zh-SG']) {
      assert.equal(resolveLocale(tag), 'zh', `${tag} should resolve to Chinese`);
    }
    for (const tag of ['en-US', 'en-GB', 'EN_AU']) {
      assert.equal(resolveLocale(tag), 'en', `${tag} should resolve to English`);
    }
  });

  it('falls back for unknown, empty or missing input', () => {
    assert.equal(resolveLocale('fr-FR'), DEFAULT_LOCALE);
    assert.equal(resolveLocale(''), DEFAULT_LOCALE);
    assert.equal(resolveLocale(null), DEFAULT_LOCALE);
    assert.equal(resolveLocale(undefined), DEFAULT_LOCALE);
    assert.equal(resolveLocale('nonsense', 'zh'), 'zh');
  });

  it('recognises the locales it ships and nothing else', () => {
    assert.ok(isLocale('en'));
    assert.ok(isLocale('zh'));
    assert.ok(!isLocale('de'));
    assert.ok(!isLocale(42));
  });
});

/* ---------------------------------------------------- server-produced text */

describe('translateServerText', () => {
  it('translates a fixed server message', () => {
    assert.equal(translateServerText('zh', 'This meeting is full.'), '本次会议人数已满。');
    assert.equal(translateServerText('zh', 'the host has disabled chat'), '主持人已禁用聊天。');
  });

  it('tidies up the lower-case internal wording even in English', () => {
    assert.equal(translateServerText('en', 'the host has disabled chat'), 'The host has disabled chat.');
  });

  it('translates messages that interpolate a name', () => {
    assert.equal(translateServerText('zh', 'Dana removed you from the meeting.'), 'Dana 已将你移出会议。');
    assert.equal(translateServerText('zh', 'Dana Wu is already sharing their screen'), 'Dana Wu 已在共享屏幕。');
  });

  it('passes unknown text through untouched', () => {
    const odd = 'Some brand-new failure nobody has mapped yet';
    assert.equal(translateServerText('zh', odd), odd);
    assert.equal(translateServerText('en', odd), odd);
  });

  it('tolerates surrounding whitespace and empty input', () => {
    assert.equal(translateServerText('zh', '  this meeting is locked  '), '本次会议已锁定。');
    assert.equal(translateServerText('zh', ''), '');
  });
});

/* -------------------------------------------------- coverage of the sources */

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function walk(dir: string, extensions: string[]): string[] {
  const absolute = path.join(repoRoot, dir);
  if (!fs.existsSync(absolute)) return [];
  return fs
    .readdirSync(absolute, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && extensions.some((extension) => entry.name.endsWith(extension)))
    .map((entry) => path.relative(repoRoot, path.join(entry.parentPath ?? absolute, entry.name)));
}

/**
 * Where a message the user can actually read is minted in English.
 *
 * The server has no idea who is reading, so it answers in English and the
 * clients map it back on the way to the screen. That only holds while every
 * such string has a mapping — which is what this test enforces.
 */
const SERVER_MESSAGE_SOURCES = [
  'packages/server/src/room/Room.ts',
  'packages/server/src/room/RoomManager.ts',
  'packages/server/src/signaling/Connection.ts',
  'packages/server/src/signaling/SignalingServer.ts',
  'packages/server/src/http/routes.ts',
  'packages/client-core/src/RoomClient.ts',
  'packages/client-core/src/SignalingClient.ts',
];

/**
 * Messages that are deliberately not translated: they are protocol-level
 * plumbing that reaches a log or a socket close frame, never a rendered string.
 */
const NOT_USER_FACING = new Set([
  'room error',
  'room full',
  'duplicate peer',
  'join timeout',
  'roomId is required',
  'invalid or missing token',
]);

/** Turns `` `${peer.name} left` `` into a probe string a pattern can match. */
function probeFor(literal: string): string {
  return literal.replace(/\$\{[^}]*\}/g, 'Sample Name');
}

function extractServerMessages(source: string): string[] {
  const found = new Set<string>();

  const add = (raw: string | undefined) => {
    if (!raw) return;
    const value = raw.trim();
    if (value && !NOT_USER_FACING.has(value)) found.add(value);
  };

  // new ProtocolError(ErrorCodes.X, 'message' | `message`)
  for (const match of source.matchAll(/new ProtocolError\(\s*[^,]+,\s*(['`])((?:[^\\]|\\.)*?)\1/g)) add(match[2]);
  // new Error('message' | `message`) — the shared engine's own failures
  for (const match of source.matchAll(/new Error\(\s*(['`])((?:[^\\]|\\.)*?)\1\s*\)/g)) add(match[2]);
  // { code, message: 'text' } on a notify/respond frame, and { reason: 'text' }
  for (const match of source.matchAll(/\b(?:message|reason):\s*(['`])((?:[^\\]|\\.)*?)\1/g)) add(match[2]);

  return [...found];
}

describe('server messages reach the user in their language', () => {
  it('has a Chinese mapping for every English message a client can display', () => {
    const uncovered: string[] = [];

    for (const file of SERVER_MESSAGE_SOURCES) {
      for (const literal of extractServerMessages(read(file))) {
        const probe = probeFor(literal);
        if (translateServerText('zh', probe) === probe) uncovered.push(`${file}: ${JSON.stringify(literal)}`);
      }
    }

    assert.deepEqual(
      uncovered,
      [],
      `these server messages would be shown to a Chinese reader in English:\n${uncovered.join('\n')}`,
    );
  });

  it('finds messages at all — a broken extractor must not pass silently', () => {
    const extracted = extractServerMessages(read('packages/server/src/room/Room.ts'));
    assert.ok(extracted.length > 15, `expected many messages in Room.ts, found ${extracted.length}`);
    assert.ok(extracted.includes('the host has disabled chat'));
  });
});

/* ------------------------------------------------- coverage of the UI files */

const UI_SOURCES = [
  ...walk('packages/web/src', ['.tsx']),
  ...walk('packages/mobile/src', ['.tsx']),
  'packages/mobile/App.tsx',
];

/**
 * Literals that are legitimately not prose: URLs, code formats, separators and
 * emoji. Anything else caught by the scan below is an untranslated string.
 */
const ALLOWED_UI_LITERALS = new Set(['http://192.168.1.10:4000', 'abc-defg-hij', '9+', '·']);

const TRANSLATABLE_ATTRIBUTES = ['title', 'placeholder', 'aria-label', 'accessibilityLabel', 'label'];

describe('no untranslated strings are left in the UI', () => {
  it('has no hard-coded text in a user-visible attribute', () => {
    const offenders: string[] = [];
    const attribute = new RegExp(`\\b(${TRANSLATABLE_ATTRIBUTES.join('|')})=(["'])([^"']*[A-Za-z]{2,}[^"']*)\\2`, 'g');

    for (const file of UI_SOURCES) {
      const source = read(file);
      for (const match of source.matchAll(attribute)) {
        if (!ALLOWED_UI_LITERALS.has(match[3])) offenders.push(`${file}: ${match[1]}="${match[3]}"`);
      }
    }

    assert.deepEqual(offenders, [], `untranslated attributes:\n${offenders.join('\n')}`);
  });

  it('has no hard-coded sentence rendered as JSX text', () => {
    const offenders: string[] = [];
    // Text between tags: `>Some words<`. The trailing group captures what
    // follows the `<` so a generic type argument can be told apart from a real
    // element boundary — `Promise<unknown>` reads exactly like JSX text to a
    // regex, and every file here is full of them.
    const jsxText = />\s*([A-Za-z][A-Za-z'’,.!?&\-—: ]*)\s*<(.?)/g;

    for (const file of UI_SOURCES) {
      for (const match of read(file).matchAll(jsxText)) {
        const value = match[1].trim();
        const isClosingTag = match[2] === '/';
        // A single word not followed by `</` is a type parameter, not prose:
        // real one-word JSX text always closes its own element.
        if (!isClosingTag && !/\s/.test(value)) continue;
        if (value.length > 2 && !ALLOWED_UI_LITERALS.has(value)) offenders.push(`${file}: ${JSON.stringify(value)}`);
      }
    }

    assert.deepEqual(offenders, [], `untranslated JSX text:\n${offenders.join('\n')}`);
  });

  it('would catch a leak that the generic-type exemption must not hide', () => {
    // Guards the heuristic above: these are the shapes a real untranslated
    // string takes, and all three must still be reported.
    const jsxText = />\s*([A-Za-z][A-Za-z'’,.!?&\-—: ]*)\s*<(.?)/g;
    const samples = [
      '<button>Join</button>',
      '<div><Icon /> No messages yet. <span>x</span></div>',
      '<Text style={s}>Ready to join</Text>',
    ];
    for (const sample of samples) {
      const hits = [...sample.matchAll(jsxText)].filter(
        (match) => match[2] === '/' || /\s/.test(match[1].trim()),
      );
      assert.ok(hits.length > 0, `the scanner would miss: ${sample}`);
    }
    // ...while a generic type parameter stays exempt.
    const generic = 'action: (key: string) => Promise<unknown>';
    const genericHits = [...generic.matchAll(jsxText)].filter(
      (match) => match[2] === '/' || /\s/.test(match[1].trim()),
    );
    assert.deepEqual(genericHits, [], 'a generic type argument must not be reported as prose');
  });

  it('scans a non-trivial number of files — an empty file list must not pass', () => {
    assert.ok(UI_SOURCES.length >= 15, `expected the whole UI, found ${UI_SOURCES.length} files`);
    assert.ok(UI_SOURCES.some((file) => file.includes('web/src/pages/Home.tsx')));
    assert.ok(UI_SOURCES.some((file) => file.includes('mobile/src/screens/HomeScreen.tsx')));
  });
});
