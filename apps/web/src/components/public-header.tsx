'use client';

import { useLocale } from './locale-provider';

export function PublicHeader() {
  const { t, toggleLocale } = useLocale();
  return (
    <header className="topbar">
      <strong>{t('app.name')}</strong>
      <span className="muted">· {t('app.staffPortal')}</span>
      <div className="topbar-end">
        <button type="button" className="btn btn-small" onClick={toggleLocale}>
          {t('language.switch')}
        </button>
      </div>
    </header>
  );
}
