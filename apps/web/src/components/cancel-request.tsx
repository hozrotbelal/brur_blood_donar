'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { labelFor, toneOfStatus } from '@/lib/format';
import type { MessageKey } from '@/lib/messages';
import { cancelRequest, fetchRequests, type CancelRequestBody, type RequestView } from '@/lib/public-data';
import { CANCEL_REASONS, PATIENT_CANCELLABLE, errorKey, isUnauthenticated } from '@/lib/request-ui';
import { useLocale } from './locale-provider';

type Reason = CancelRequestBody['reason'];

export function CancelRequest() {
  const { t } = useLocale();
  const router = useRouter();
  const [rows, setRows] = useState<RequestView[] | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [reasons, setReasons] = useState<Record<string, Reason | ''>>({});
  const [notice, setNotice] = useState<{ tone: 'ok' | 'err'; key: MessageKey } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    fetchRequests()
      .then((items) => {
        const open = items.filter((item) => PATIENT_CANCELLABLE.includes(item.status));
        setRows(open);
        setSelectedId((current) => (open.some((item) => item.id === current) ? current : open[0]?.id ?? ''));
      })
      .catch((caught: unknown) => {
        if (isUnauthenticated(caught)) router.replace('/sign-in');
        else setNotice({ tone: 'err', key: 'error.loadFailed' });
      });

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancel = async () => {
    const reason = reasons[selectedId];
    if (!selectedId) return;
    if (!reason) {
      setNotice({ tone: 'err', key: 'cancel.reasonRequired' });
      return;
    }
    if (!window.confirm(t('cancel.confirm'))) return;
    setBusy(true);
    setNotice(null);
    try {
      await cancelRequest(selectedId, { reason });
      setNotice({ tone: 'ok', key: 'cancel.done' });
      await load();
    } catch (caught) {
      if (isUnauthenticated(caught)) router.replace('/sign-in');
      else setNotice({ tone: 'err', key: errorKey(caught) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>{t('cancel.title')}</h1>
          <p>{t('cancel.intro')}</p>
        </div>
      </div>

      {notice && (
        <p role={notice.tone === 'err' ? 'alert' : 'status'} className={`alert ${notice.tone}`}>
          {t(notice.key)}
        </p>
      )}

      <div className="card flush">
        <div className="card-head">
          <h2>{t('cancel.listTitle')}</h2>
          <button type="button" className="btn btn-primary" disabled={busy || !selectedId} onClick={cancel}>
            {busy ? t('action.working') : t('cancel.action')}
          </button>
        </div>
        {rows === null ? (
          <p role="status" className="empty">
            {t('queue.loading')}
          </p>
        ) : rows.length === 0 ? (
          <p className="empty">{t('cancel.none')}</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">{t('requests.col.request')}</th>
                  <th scope="col">{t('requests.col.status')}</th>
                  <th scope="col">{t('cancel.col.reason')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item.id} className={`clickable${item.id === selectedId ? ' selected' : ''}`} onClick={() => setSelectedId(item.id)}>
                    <td>
                      <label className="radio-cell">
                        <input type="radio" name="cancel-target" checked={item.id === selectedId} onChange={() => setSelectedId(item.id)} />
                        <span className="mono">{item.referenceNo ?? t('home.draft')}</span>
                      </label>
                    </td>
                    <td>
                      <span className={`chip ${toneOfStatus(item.status)}`}>{labelFor(t, 'status', item.status)}</span>
                    </td>
                    <td>
                      <select
                        className="input input-inline"
                        aria-label={t('cancel.col.reason')}
                        value={reasons[item.id] ?? ''}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => {
                          setSelectedId(item.id);
                          setReasons((current) => ({ ...current, [item.id]: event.target.value as Reason }));
                        }}
                      >
                        <option value="">{t('cancel.selectReason')}</option>
                        {CANCEL_REASONS.map((value) => (
                          <option key={value} value={value}>
                            {t(`cancelReason.${value}` as MessageKey)}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="muted small-note">{t('cancel.note')}</p>
    </section>
  );
}
