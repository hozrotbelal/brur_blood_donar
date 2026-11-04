'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { fmtDate, labelFor } from '@/lib/format';
import { hasMessage, type MessageKey } from '@/lib/messages';
import { decideGrant, fetchAccessReview, type AccessReview, type GrantDecision } from '@/lib/staff-data';
import { useLocale } from './locale-provider';
import { useStepUp } from './step-up';

const thisMonth = () => {
  const local = new Date(Date.now() + 6 * 3_600_000);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}`;
};

export function AccessReviewScreen() {
  const { t, locale } = useLocale();
  const router = useRouter();
  const { guard, dialog } = useStepUp();
  const [month, setMonth] = useState(thisMonth);
  const [review, setReview] = useState<AccessReview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [deciding, setDeciding] = useState<{ grantId: string; decision: GrantDecision; reason: string } | null>(null);

  const errorText = useCallback(
    (caught: unknown) => {
      const key = `error.${caught instanceof ApiError ? caught.code : ''}`;
      return hasMessage(key) ? t(key) : t('error.generic');
    },
    [t],
  );

  const load = useCallback(async () => {
    try {
      setReview(await fetchAccessReview(month));
      setLoadError(null);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        router.replace('/sign-in');
        return;
      }
      setLoadError(errorText(caught));
    }
  }, [month, router, errorText]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!deciding) return;
    setBusy(true);
    setNotice(null);
    try {
      await guard(() => decideGrant(deciding.grantId, deciding.decision, deciding.reason.trim()));
      setNotice({ tone: 'ok', text: t(deciding.decision === 'KEEP' ? 'review.kept' : 'review.revoked') });
      setDeciding(null);
      await load();
    } catch (caught) {
      setNotice({ tone: 'err', text: errorText(caught) });
    } finally {
      setBusy(false);
    }
  };

  const pending = review?.members.reduce((n, m) => n + m.grants.filter((g) => !g.decision).length, 0) ?? 0;

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>{t('review.title')}</h1>
          <p>{t('review.intro')}</p>
        </div>
        <div className="field">
          <label htmlFor="review-month">{t('review.month')}</label>
          <input id="review-month" type="month" className="input" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        </div>
      </div>

      {notice && <p role={notice.tone === 'err' ? 'alert' : 'status'} className={`alert ${notice.tone === 'err' ? 'err' : 'ok'}`}>{notice.text}</p>}
      {loadError && <p role="alert" className="alert err">{loadError}</p>}
      {review && <p className="alert info">{t('review.pending', { count: String(pending) })}</p>}

      {deciding && (
        <form className="card" onSubmit={submit} noValidate>
          <h2 style={{ marginBottom: 8 }}>{t(deciding.decision === 'KEEP' ? 'review.keep' : 'review.revoke')}</h2>
          <div className="field">
            <label htmlFor="review-reason">{t('staff.reason')}</label>
            <textarea id="review-reason" className="input" rows={2} maxLength={500} value={deciding.reason} onChange={(e) => setDeciding({ ...deciding, reason: e.target.value })} />
          </div>
          <div className="row end" style={{ marginTop: 12 }}>
            <button type="button" className="btn" onClick={() => setDeciding(null)}>{t('action.cancel')}</button>
            <button type="submit" className={`btn ${deciding.decision === 'REVOKE' ? 'btn-danger' : 'btn-primary'}`} disabled={busy || deciding.reason.trim().length < 5}>
              {t(deciding.decision === 'KEEP' ? 'review.keep' : 'review.revoke')}
            </button>
          </div>
        </form>
      )}

      <div className="card">
        {!review && !loadError ? (
          <p role="status">{t('queue.loading')}</p>
        ) : review && review.members.length === 0 ? (
          <p className="empty">{t('staff.empty')}</p>
        ) : review ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">{t('staff.col.name')}</th>
                  <th scope="col">{t('invite.tier')}</th>
                  <th scope="col">{t('review.col.reveals')}</th>
                  <th scope="col">{t('review.col.searches')}</th>
                  <th scope="col">{t('review.col.grants')}</th>
                </tr>
              </thead>
              <tbody>
                {review.members.map((member) => (
                  <tr key={member.userId}>
                    <td>
                      <b>{member.displayName ?? '—'}</b>
                      <div className="muted" style={{ fontSize: 12.5 }}>{member.roleCode ? t(`role.${member.roleCode}` as MessageKey) : '—'}</div>
                    </td>
                    <td>{labelFor(t, 'tier', member.tierCode)}</td>
                    <td>{member.reveals}</td>
                    <td>{member.searches}</td>
                    <td>
                      {member.grants.length === 0 ? (
                        <span className="muted">{t('review.noGrants')}</span>
                      ) : (
                        <ul className="task-list">
                          {member.grants.map((grant) => (
                            <li key={grant.grantId}>
                              <b style={{ color: 'var(--title)' }}>{locale === 'bn' ? grant.setNameBn : grant.setNameEn}</b>
                              <div className="muted" style={{ fontSize: 12.5 }}>
                                {grant.expiresAt ? t('review.expires', { date: fmtDate(grant.expiresAt, locale) }) : t('review.noExpiry')}
                                {grant.sensitiveKeys.length > 0 && ` · ${t('review.sensitiveCount', { count: String(grant.sensitiveKeys.length) })}`}
                              </div>
                              {grant.decision ? (
                                <span className="chip grn">{t('review.keptOn', { date: fmtDate(grant.decidedAt, locale) })}</span>
                              ) : (
                                <div className="row" style={{ marginTop: 6 }}>
                                  <button type="button" className="btn btn-small" disabled={busy} onClick={() => setDeciding({ grantId: grant.grantId, decision: 'KEEP', reason: '' })}>
                                    {t('review.keep')}
                                  </button>
                                  <button type="button" className="btn btn-small" disabled={busy} onClick={() => setDeciding({ grantId: grant.grantId, decision: 'REVOKE', reason: '' })}>
                                    {t('review.revoke')}
                                  </button>
                                </div>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
      {dialog}
    </section>
  );
}
