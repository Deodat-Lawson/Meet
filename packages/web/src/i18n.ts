import { create } from 'zustand';
import {
  DEFAULT_LOCALE,
  LOCALE_TAGS,
  createTranslator,
  resolveLocale,
  translate,
  translateServerText,
  type Locale,
  type MessageKey,
  type MessageParams,
  type Translator,
} from '@meet/protocol';

const STORAGE_KEY = 'meet.locale';

/**
 * The chosen language lives in a store rather than a React context so that
 * non-component code — the room store's toast handlers, most importantly — can
 * translate without being handed a hook.
 */
interface I18nStore {
  locale: Locale;
  setLocale(locale: Locale): void;
}

function storedLocale(): Locale | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? resolveLocale(stored) : null;
  } catch {
    /* private browsing can throw on access */
    return null;
  }
}

function initialLocale(): Locale {
  return storedLocale() ?? resolveLocale(navigator.language, DEFAULT_LOCALE);
}

/**
 * Keeps the parts of the page React does not own in step with the language:
 * the `lang` attribute (which drives font selection and screen-reader voice),
 * the tab title and the meta description.
 */
function applyDocumentLocale(locale: Locale): Locale {
  const root = document.documentElement;
  root.lang = LOCALE_TAGS[locale];
  document.title = translate(locale, 'app.name');
  document.querySelector('meta[name="description"]')?.setAttribute('content', translate(locale, 'app.description'));
  return locale;
}

export const useI18nStore = create<I18nStore>((set, get) => ({
  locale: applyDocumentLocale(initialLocale()),

  setLocale(locale) {
    if (get().locale === locale) return;
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      /* the preference simply will not survive a reload */
    }
    applyDocumentLocale(locale);
    set({ locale });
  },
}));

export function useLocale(): Locale {
  return useI18nStore((state) => state.locale);
}

export function useSetLocale(): (locale: Locale) => void {
  return useI18nStore((state) => state.setLocale);
}

/**
 * Subscribing to the locale (rather than memoising a translator) is what makes
 * every caller re-render on a language switch.
 */
export function useT(): Translator {
  const locale = useI18nStore((state) => state.locale);
  return createTranslator(locale);
}

/** Translation outside React — for stores, event handlers and callbacks. */
export function t(key: MessageKey, params?: MessageParams): string {
  return translate(useI18nStore.getState().locale, key, params);
}

/** Maps an English message produced by the server into the current language. */
export function useServerText(): (text: string) => string {
  const locale = useI18nStore((state) => state.locale);
  return (text: string) => translateServerText(locale, text);
}

/**
 * A piece of text held in state and rendered later: either one of our own
 * messages, or a string that arrived from the server. Storing it in this shape
 * defers the translation to render time, so text already on screen — a toast, a
 * "meeting ended" reason — follows a language switch instead of freezing in
 * whichever language it was created in.
 */
export type TranslatableText = { key: MessageKey; params?: MessageParams } | { text: string };

export function useTranslatable(): (value: TranslatableText) => string {
  const locale = useI18nStore((state) => state.locale);
  return (value) =>
    'key' in value ? translate(locale, value.key, value.params) : translateServerText(locale, value.text);
}

/** The BCP 47 tag to hand to `Intl` / `toLocaleTimeString`. */
export function useLocaleTag(): string {
  return LOCALE_TAGS[useI18nStore((state) => state.locale)];
}
