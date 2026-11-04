'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { hasMessage, type MessageKey } from '@/lib/messages';
import { fmtDate } from '@/lib/format';
import { fetchConsents, saveConsent, type ConsentView } from '@/lib/public-data';
import { useLocale } from './locale-provider';

/** Consent choices a donor or patient can change. Terms and privacy are shown but cannot be withdrawn. */
const CHANGEABLE = [
  'URGENT_INVITATIONS',
  'ROUTINE_INVITATIONS',
  'CHANNEL_CALL',
  'CHANNEL_SMS',
  'CAMPAIGNS',
  'LOCATION_USE',
  'COMMUNITY_VISIBILITY',
] as const;
const LOCKED = ['TERMS', 'PRIVACY'];

export function ConsentScreen() {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [rows, setRows] = useState<ConsentView[] | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () =>
    fetchConsents()
      .then(setRows)
      .catch((caught: unknown) => {
        if (caught instanceof ApiError && caught.status === 401) router.replace('/sign-in');
        else setError('error.loadFailed');
      });

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = async (type: string, current: ConsentView | undefined) => {
    setBusy(type);
    setNotice(null);
    try {
      await saveConsent(type, {
        granted: !(current?.granted ?? false),
        policyVersion: current?.policyVersion ?? 'v1',
        language: locale,
        channel: 'PROFILE_SETTINGS',
      });
      setNotice({ tone: 'ok', text: t('consent.saved') });
      await load();
    } catch (caught) {
      const code = caught instanceof ApiError ? caught.code : '';
      const key = `error.${code}`;
      setNotice({ tone: 'err', text: hasMessage(key) ? t(key) : t('error.generic') });
    } finally {
      setBusy(null);
    }
  };

  const byType = new Map((rows ?? []).map((item) => [item.type, item]));

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>{t('consent.title')}</h1>
          <p>{t('consent.intro')}</p>
        </div>
      </div>

      {error && <p role="alert" className="alert err">{t(error)}</p>}
      {notice && <p role={notice.tone === 'err' ? 'alert' : 'status'} className={`alert ${notice.tone === 'err' ? 'err' : 'ok'}`}>{notice.text}</p>}

      <div className="card">
        {rows === null && !error ? (
          <p role="status">{t('queue.loading')}</p>
        ) : rows ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">{t('consent.col.choice')}</th>
                  <th scope="col">{t('consent.col.status')}</th>
                  <th scope="col">{t('consent.col.updated')}</th>
                  <th scope="col">
                    <span className="sr-only">{t('consent.col.change')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {CHANGEABLE.map((type) => {
                  const current = byType.get(type);
                  return (
                    <tr key={type}>
                      <td>
                        <b>{t(`consent.${type}` as MessageKey)}</b>
                      </td>
                      <td>
                        <span className={`chip ${current?.granted ? 'grn' : ''}`}>{current?.granted ? t('consent.on') : t('consent.off')}</span>
                      </td>
                      <td>{current ? fmtDate(current.capturedAt, locale, true) : '—'}</td>
                      <td>
                        <button type="button" className="btn btn-small" disabled={busy !== null} onClick={() => toggle(type, current)}>
                          {current?.granted ? t('consent.withdraw') : t('consent.give')}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {LOCKED.map((type) => {
                  const current = byType.get(type);
                  return (
                    <tr key={type}>
                      <td>
                        <b>{t(`consent.${type}` as MessageKey)}</b>
                      </td>
                      <td>
                        <span className={`chip ${current?.granted ? 'grn' : ''}`}>{current?.granted ? t('consent.on') : t('consent.off')}</span>
                      </td>
                      <td>{current ? fmtDate(current.capturedAt, locale, true) : '—'}</td>
                      <td className="muted" style={{ fontSize: 13 }}>
                        {t('consent.mandatory')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </section>
  );
}
