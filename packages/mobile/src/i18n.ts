import { NativeModules, Platform } from 'react-native';
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

/**
 * Reads the phone's language.
 *
 * There is no cross-platform API for this in bare React Native, so each
 * platform's native settings are read directly, with `Intl` as the fallback for
 * anything that reports neither.
 */
function deviceLocale(): Locale {
  try {
    if (Platform.OS === 'ios') {
      const settings = NativeModules.SettingsManager?.settings;
      const tag: string | undefined = settings?.AppleLocale ?? settings?.AppleLanguages?.[0];
      if (tag) return resolveLocale(tag);
    } else if (Platform.OS === 'android') {
      const tag: string | undefined = NativeModules.I18nManager?.localeIdentifier;
      if (tag) return resolveLocale(tag.replace(/_/g, '-'));
    }
    return resolveLocale(Intl.DateTimeFormat().resolvedOptions().locale, DEFAULT_LOCALE);
  } catch {
    return DEFAULT_LOCALE;
  }
}

/**
 * The chosen language, in a store rather than a context so the room store can
 * translate its toasts without being handed a hook.
 *
 * Like the server address in `config.ts`, the choice lives for the life of the
 * process — the app ships no persistent storage dependency.
 */
interface I18nStore {
  locale: Locale;
  setLocale(locale: Locale): void;
}

export const useI18nStore = create<I18nStore>((set, get) => ({
  locale: deviceLocale(),
  setLocale(locale) {
    if (get().locale !== locale) set({ locale });
  },
}));

export function useLocale(): Locale {
  return useI18nStore((state) => state.locale);
}

export function useSetLocale(): (locale: Locale) => void {
  return useI18nStore((state) => state.setLocale);
}

export function useT(): Translator {
  const locale = useI18nStore((state) => state.locale);
  return createTranslator(locale);
}

/** Translation outside React — for stores, event handlers and callbacks. */
export function t(key: MessageKey, params?: MessageParams): string {
  return translate(useI18nStore.getState().locale, key, params);
}

export function useLocaleTag(): string {
  return LOCALE_TAGS[useI18nStore((state) => state.locale)];
}

/**
 * Text held in state and rendered later: one of our own messages, or a string
 * that arrived from the server. Translating at render time is what lets a toast
 * already on screen follow a language switch.
 */
export type TranslatableText = { key: MessageKey; params?: MessageParams } | { text: string };

export function useTranslatable(): (value: TranslatableText) => string {
  const locale = useI18nStore((state) => state.locale);
  return (value) =>
    'key' in value ? translate(locale, value.key, value.params) : translateServerText(locale, value.text);
}

/** An error is shown verbatim when it carries a message, else `fallback`. */
export function fromError(error: unknown, fallback: MessageKey): TranslatableText {
  const message = error instanceof Error ? error.message.trim() : '';
  return message ? { text: message } : { key: fallback };
}
