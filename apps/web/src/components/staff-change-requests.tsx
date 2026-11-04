'use client';

import { useEffect, useState } from 'react';
import { fmtDate, labelFor } from '@/lib/format';
import { fetchFacilities, type Facility } from '@/lib/public-data';
import { approveChange, rejectChange, type ReviewChange } from '@/lib/staff-data';
import { useLocale } from './locale-provider';

interface Props {
  requestId: string;
  changes: ReviewChange[];
  busy: boolean;
  run: (action: () => Promise<unknown>, success: string) => Promise<void>;
}

/** Support decides each pending material change; the old values stay on the request until approval. */
export function StaffChangeRequests({ requestId, changes, busy, run }: Props) {
  const { t, locale } = useLocale();
  const [facilities, setFacilities] = useState<Map<string, Facility>>(new Map());
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const needsFacilities = changes.some((change) => change.changeType === 'HOSPITAL_DESTINATION');
  useEffect(() => {
    if (!needsFacilities) return;
    Promise.all([fetchFacilities('HOSPITAL'), fetchFacilities('COLLECTION_SERVICE')])
      .then(([a, b]) => setFacilities(new Map([...a.items, ...b.items].map((item) => [item.id, item]))))
      .catch(() => setFacilities(new Map()));
  }, [needsFacilities]);

  const show = (field: string, value: unknown): string => {
    if (value === null || value === undefined || value === '') return '—';
    if (field === 'requiredBy') return fmtDate(String(value), locale, true);
    if (field === 'urgency') return labelFor(t, 'value', String(value));
    if (field === 'component') return labelFor(t, 'comp', String(value));
    if (field === 'hospitalFacilityId' || field === 'collectionFacilityId') {
      const item = facilities.get(String(value));
      return item ? (locale === 'bn' && item.nameBn ? item.nameBn : item.nameEn) : '…';
    }
    return String(value);
  };

  const pending = changes.filter((change) => change.status === 'Pending');
  const decided = changes.filter((change) => change.isMaterial && change.status !== 'Pending').slice(0, 5);
  if (pending.length === 0 && decided.length === 0) return null;

  return (
    <div className="card">
      <h2 style={{ marginBottom: 4 }}>{t('staffChange.title')}</h2>
      <p className="muted small-note" style={{ marginTop: 0, marginBottom: 12 }}>
        {t('staffChange.hint')}
      </p>
      <div className="change-list">
        {pending.map((change) => (
          <div key={change.id} className="change-item">
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <b>{labelFor(t, 'changeType', change.changeType)}</b>
                <div className="muted small-note" style={{ marginTop: 2 }}>
                  {fmtDate(change.createdAt, locale, true)}
                </div>
              </div>
              <span className="chip amb">{t('staffChange.pending')}</span>
            </div>
            <dl className="facts change-values">
              {Object.keys(change.proposedValues).map((field) => (
                <div key={field} className="change-row">
                  <dt>{labelFor(t, 'changeField', field)}</dt>
                  <dd>
                    <s className="muted">{show(field, change.previousValues[field])}</s> → <b>{show(field, change.proposedValues[field])}</b>
                  </dd>
                </div>
              ))}
            </dl>
            {rejecting === change.id ? (
              <div className="stack-form" style={{ marginTop: 10 }}>
                <div className="field">
                  <label htmlFor={`reject-${change.id}`}>{t('staffChange.reason')}</label>
                  <input id={`reject-${change.id}`} className="input" value={reason} onChange={(event) => setReason(event.target.value)} />
                </div>
                <div className="row end">
                  <button type="button" className="btn btn-small" onClick={() => setRejecting(null)}>
                    {t('action.cancel')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-small btn-primary"
                    disabled={busy || reason.trim().length < 5}
                    onClick={() =>
                      run(() => rejectChange(requestId, change.id, { reason: reason.trim() }), t('staffChange.rejected')).then(() => {
                        setRejecting(null);
                        setReason('');
                      })
                    }
                  >
                    {t('staffChange.confirmReject')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="row end" style={{ marginTop: 10 }}>
                <button type="button" className="btn btn-small" disabled={busy} onClick={() => setRejecting(change.id)}>
                  {t('staffChange.reject')}
                </button>
                <button
                  type="button"
                  className="btn btn-small btn-primary"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(t('staffChange.approveConfirm'))) run(() => approveChange(requestId, change.id), t('staffChange.approved'));
                  }}
                >
                  {t('staffChange.approve')}
                </button>
              </div>
            )}
          </div>
        ))}
        {decided.map((change) => (
          <div key={change.id} className="row change-item decided" style={{ justifyContent: 'space-between' }}>
            <span>{labelFor(t, 'changeType', change.changeType)}</span>
            <span className={`chip ${change.status === 'Approved' ? 'grn' : change.status === 'Rejected' ? 'red' : 'gry'}`}>
              {labelFor(t, 'changeStatus', change.status)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
