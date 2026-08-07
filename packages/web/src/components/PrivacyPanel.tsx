import { useState } from 'react';
import { useT } from '../i18n';
import { ShieldCheckIcon, CloseIcon, LockIcon } from './icons';

/**
 * The privacy statement shown on the home screen.
 *
 * Every claim here is a property of the running system that can be checked from
 * the source or from the network tab — not a marketing promise. The limitation
 * is given the same visual weight as the guarantees, because a privacy notice
 * that only lists strengths is the kind nobody should believe.
 */
export function PrivacyPanel({ onClose }: { onClose: () => void }) {
  const t = useT();

  const points = [
    ['privacy.noAccounts.title', 'privacy.noAccounts.body'],
    ['privacy.noTracking.title', 'privacy.noTracking.body'],
    ['privacy.nothingStored.title', 'privacy.nothingStored.body'],
    ['privacy.noRecording.title', 'privacy.noRecording.body'],
    ['privacy.encrypted.title', 'privacy.encrypted.body'],
    ['privacy.selfHosted.title', 'privacy.selfHosted.body'],
  ] as const;

  return (
    <div className="privacy-sheet" role="dialog" aria-modal="true">
      <div className="privacy-card">
        <div className="privacy-head">
          <ShieldCheckIcon size={20} />
          <h2>{t('privacy.heading')}</h2>
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose} aria-label={t('common.close')}>
            <CloseIcon />
          </button>
        </div>

        <div className="privacy-body">
          <ul className="privacy-list">
            {points.map(([title, body]) => (
              <li key={title}>
                <span className="privacy-tick" aria-hidden>
                  ✓
                </span>
                <div>
                  <strong>{t(title)}</strong>
                  <p>{t(body)}</p>
                </div>
              </li>
            ))}
          </ul>

          {/* Deliberately not a footnote. */}
          <div className="privacy-limit">
            <div className="privacy-limit-head">
              <LockIcon size={15} />
              <strong>{t('privacy.limit.title')}</strong>
            </div>
            <p>{t('privacy.limit.body')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The link that opens the panel. */
export function PrivacyLink() {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="privacy-link" onClick={() => setOpen(true)}>
        <ShieldCheckIcon size={14} />
        {t('privacy.link')}
      </button>
      {open && <PrivacyPanel onClose={() => setOpen(false)} />}
    </>
  );
}
