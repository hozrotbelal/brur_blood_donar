'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { hasMessage, type MessageKey } from '@/lib/messages';
import { fmtDate, labelFor, toneOfStatus } from '@/lib/format';
import { fetchInvitations, respondToInvitation, type InvitationView } from '@/lib/public-data';
import { useLocale } from './locale-provider';

type Answer = 'Available' | 'Later' | 'Unavailable';

export function DonorInvitations() {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [rows, setRows] = useState<InvitationView[] | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [laterFor, setLaterFor] = useState<string | null>(null);
  const [laterAt, setLaterAt] = useState('');

  const load = () =>
    fetchInvitations()
      .then(setRows)
      .catch((caught: unknown) => {
        if (caught instanceof ApiError && caught.status === 401) router.replace('/sign-in');
        else setError('error.loadFailed');
      });

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const answer = async (invitation: InvitationView, value: Answer, later?: string) => {
    setBusy(true);
    setNotice(null);
    try {
      await respondToInvitation(invitation.id, {
        response: value,
        laterAvailableAt: later ? new Date(later).toISOString() : undefined,
        clientMutationId: crypto.randomUUID(),
      });
      setNotice({ tone: 'ok', text: t('invite.answered') });
      setLaterFor(null);
      setLaterAt('');
      await load();
    } catch (caught) {
      const code = caught instanceof ApiError ? caught.code : '';
      const key = `error.${code}`;
      setNotice({ tone: 'err', text: hasMessage(key) ? t(key) : t('error.generic') });
    } finally {
      setBusy(false);
    }
  };

  const chooseLater = (event: FormEvent, invitation: InvitationView) => {
    event.preventDefault();
    if (!laterAt) return;
    answer(invitation, 'Later', laterAt);
  };

  const isOpen = (item: InvitationView) => ['Sent', 'Delivered', 'Viewed'].includes(item.status);

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>{t('invitations.title')}</h1>
          <p>{t('invitations.intro')}</p>
        </div>
      </div>

      {error && <p role="alert" className="alert err">{t(error)}</p>}
      {notice && <p role={notice.tone === 'err' ? 'alert' : 'status'} className={`alert ${notice.tone === 'err' ? 'err' : 'ok'}`}>{notice.text}</p>}

      <div className="card">
        {rows === null && !error ? (
          <p role="status">{t('queue.loading')}</p>
        ) : rows && rows.length === 0 ? (
          <p className="empty">{t('invitations.empty')}</p>
        ) : rows ? (
          <ul className="invite-list">
            {rows.map((item) => (
              <li key={item.id} className="invite-item">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <div>
                    <b style={{ color: 'var(--title)' }}>{item.details ? String(item.details.requestReference ?? t('invitations.request')) : t('invitations.closed')}</b>
                    <div className="muted" style={{ fontSize: 13 }}>
                      {item.details
                        ? `${labelFor(t, 'bloodGroup', String(item.details.bloodGroup ?? ''))} · ${labelFor(t, 'comp', String(item.details.component ?? ''))} · ${labelFor(t, 'value', String(item.details.urgency ?? ''))}`
                        : ''}
                    </div>
                    <div className="muted" style={{ fontSize: 13 }}>
                      {t('invitations.answerBy')}: {fmtDate(item.expiresAt, locale, true)}
                    </div>
                  </div>
                  <div className="row">
                    <span className={`chip ${toneOfStatus(item.status)}`}>{labelFor(t, 'invite.status', item.status)}</span>
                    {item.response && <span className={`chip ${toneOfStatus(item.response)}`}>{labelFor(t, 'resp', item.response)}</span>}
                  </div>
                </div>

                {isOpen(item) && (
                  <div className="row" style={{ marginTop: 12 }}>
                    <button type="button" className="btn btn-primary" disabled={busy} onClick={() => answer(item, 'Available')}>
                      {t('resp.Available')}
                    </button>
                    <button type="button" className="btn" disabled={busy} onClick={() => setLaterFor(laterFor === item.id ? null : item.id)}>
                      {t('resp.Later')}
                    </button>
                    <button type="button" className="btn" disabled={busy} onClick={() => answer(item, 'Unavailable')}>
                      {t('resp.Unavailable')}
                    </button>
                  </div>
                )}

                {laterFor === item.id && (
                  <form className="row" style={{ marginTop: 10 }} onSubmit={(event) => chooseLater(event, item)}>
                    <label htmlFor={`later-${item.id}`} className="muted">
                      {t('invitations.laterWhen')}
                    </label>
                    <input id={`later-${item.id}`} className="input" type="datetime-local" value={laterAt} onChange={(event) => setLaterAt(event.target.value)} required />
                    <button type="submit" className="btn btn-small" disabled={busy || !laterAt}>
                      {t('invitations.laterSave')}
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
