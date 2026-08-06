import { LOCALES, LOCALE_LABELS, LOCALE_SHORT_LABELS, LOCALE_TAGS } from '@meet/protocol';
import { useLocale, useSetLocale, useT } from '../i18n';
import { GlobeIcon } from './icons';

interface LanguageToggleProps {
  /**
   * Drops the globe and the full language names, leaving just `EN` / `中`.
   * Used where horizontal space is contested — the meeting header, mainly.
   */
  compact?: boolean;
  className?: string;
}

/**
 * The language switcher.
 *
 * A two-option segmented control rather than a dropdown: with only two
 * languages, both options being visible means one tap to switch and no state
 * to discover — which matters most on a phone, where a `<select>` opens a
 * full-screen native picker.
 */
export function LanguageToggle({ compact = false, className }: LanguageToggleProps) {
  const locale = useLocale();
  const setLocale = useSetLocale();
  const t = useT();

  return (
    <div
      className={`lang-toggle${compact ? ' compact' : ''}${className ? ` ${className}` : ''}`}
      role="group"
      aria-label={t('language.label')}
      data-testid="language-toggle"
    >
      {!compact && (
        <span className="lang-icon" aria-hidden>
          <GlobeIcon size={15} />
        </span>
      )}

      {LOCALES.map((code) => (
        <button
          key={code}
          type="button"
          className={`lang-option${code === locale ? ' active' : ''}`}
          onClick={() => setLocale(code)}
          aria-pressed={code === locale}
          aria-label={t('language.switchTo', { language: LOCALE_LABELS[code] })}
          title={t('language.switchTo', { language: LOCALE_LABELS[code] })}
          // The label is written in the language it names, so tag it as such:
          // otherwise a `lang="en"` page hands "中文" to an English voice.
          lang={LOCALE_TAGS[code]}
          data-locale={code}
        >
          <span className="lang-full">{LOCALE_LABELS[code]}</span>
          <span className="lang-short">{LOCALE_SHORT_LABELS[code]}</span>
        </button>
      ))}
    </div>
  );
}
