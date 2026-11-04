'use client';

import { useState, type FormEvent } from 'react';
import { fmtDate, labelFor } from '@/lib/format';
import { disputeOutcome, recordOutcome, resolveDispute, type CaseDetail, type CaseOutcome, type OutcomeBody } from '@/lib/staff-data';
import type { RunAction } from './case-detail';
import { useLocale } from './locale-provider';

const SOURCES: OutcomeBody['sourceType'][] = ['COLLECTION_SERVICE_CONFIRMATION', 'HOSPITAL_CONFIRMATION', 'SUPPORT_OBSERVATION'];
const TYPES: OutcomeBody['outcomeType'][] = ['DONATION_COMPLETED', 'DONATION_NOT_COMPLETED', 'UNITS_RECEIVED_BY_PATIENT_SERVICE', 'NEED_CHANGED', 'NEED_NO_LONGER_REQUIRED'];
const COUNTED: OutcomeBody['outcomeType'][] = ['DONATION_COMPLETED', 'UNITS_RECEIVED_BY_PATIENT_SERVICE'];
const RECORD_STATUSES = ['Attendance pending', 'Outcome pending'];

interface OutcomeForm {
  sourceType: OutcomeBody['sourceType'];
  outcomeType: OutcomeBody['outcomeType'];
  channel: OutcomeBody['channel'];
  units: string;
  reportedByName: string;
  reportedByRole: string;
  caseDonorId: string;
  reason: string;
}

const blankForm = (): OutcomeForm => ({
  sourceType: 'COLLECTION_SERVICE_CONFIRMATION', outcomeType: 'DONATION_COMPLETED', channel: 'PHONE', units: '1', reportedByName: '', reportedByRole: '', caseDonorId: '', reason: '',
});

const toBody = (form: OutcomeForm): OutcomeBody => ({
  sourceType: form.sourceType,
  outcomeType: form.outcomeType,
  channel: form.channel,
  ...(COUNTED.includes(form.outcomeType) ? { units: Number(form.units) } : {}),
  ...(form.reportedByName.trim() ? { reportedByName: form.reportedByName.trim() } : {}),
  ...(form.reportedByRole.trim() ? { reportedByRole: form.reportedByRole.trim() } : {}),
  ...(form.caseDonorId ? { caseDonorId: form.caseDonorId } : {}),
  ...(form.reason.trim() ? { reason: form.reason.trim() } : {}),
});

const formReady = (form: OutcomeForm) =>
  (!COUNTED.includes(form.outcomeType) || (form.units !== '' && Number(form.units) >= 0)) && (form.channel !== 'PHONE' || form.reportedByName.trim().length > 0);

function OutcomeFields({ form, setForm, donors, prefix }: { form: OutcomeForm; setForm: (f: OutcomeForm) => void; donors: CaseDetail['donors']; prefix: string }) {
  const { t } = useLocale();
  return (
    <div className="form-grid">
      <div className="field">
        <label htmlFor={`${prefix}-type`}>{t('outcome.type')}</label>
        <select id={`${prefix}-type`} className="input" value={form.outcomeType} onChange={(e) => setForm({ ...form, outcomeType: e.target.value as OutcomeBody['outcomeType'] })}>
          {TYPES.map((value) => (
            <option key={value} value={value}>{labelFor(t, 'outcomeType', value)}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${prefix}-source`}>{t('outcome.source')}</label>
        <select id={`${prefix}-source`} className="input" value={form.sourceType} onChange={(e) => setForm({ ...form, sourceType: e.target.value as OutcomeBody['sourceType'] })}>
          {SOURCES.map((value) => (
            <option key={value} value={value}>{labelFor(t, 'outcomeSource', value)}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${prefix}-channel`}>{t('outcome.channel')}</label>
        <select id={`${prefix}-channel`} className="input" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value as OutcomeBody['channel'] })}>
          <option value="PHONE">{t('outcome.channel.PHONE')}</option>
          <option value="IN_APP">{t('outcome.channel.IN_APP')}</option>
        </select>
      </div>
      {COUNTED.includes(form.outcomeType) && (
        <div className="field">
          <label htmlFor={`${prefix}-units`}>{t('outcome.units')}</label>
          <input id={`${prefix}-units`} type="number" min={0} max={20} className="input" value={form.units} onChange={(e) => setForm({ ...form, units: e.target.value })} />
        </div>
      )}
      <div className="field">
        <label htmlFor={`${prefix}-name`}>{t('outcome.reportedBy')}</label>
        <input id={`${prefix}-name`} className="input" maxLength={200} value={form.reportedByName} onChange={(e) => setForm({ ...form, reportedByName: e.target.value })} />
        {form.channel === 'PHONE' && <span className="muted" style={{ fontSize: 12.5 }}>{t('outcome.reportedByHint')}</span>}
      </div>
      <div className="field">
        <label htmlFor={`${prefix}-role`}>{t('outcome.reporterRole')}</label>
        <input id={`${prefix}-role`} className="input" maxLength={100} value={form.reportedByRole} onChange={(e) => setForm({ ...form, reportedByRole: e.target.value })} />
      </div>
      {donors.length > 0 && (
        <div className="field">
          <label htmlFor={`${prefix}-donor`}>{t('case.col.donor')}</label>
          <select id={`${prefix}-donor`} className="input" value={form.caseDonorId} onChange={(e) => setForm({ ...form, caseDonorId: e.target.value })}>
            <option value="">—</option>
            {donors.map((donor) => (
              <option key={donor.id} value={donor.id}>{donor.donorCode ?? donor.id}</option>
            ))}
          </select>
        </div>
      )}
      <div className="field" style={{ gridColumn: '1 / -1' }}>
        <label htmlFor={`${prefix}-reason`}>{t('outcome.reason')}</label>
        <input id={`${prefix}-reason`} className="input" maxLength={500} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        <span className="muted" style={{ fontSize: 12.5 }}>{t('outcome.reasonHint')}</span>
      </div>
    </div>
  );
}

export function CaseOutcomes({ caseId, detail, busy, run }: { caseId: string; detail: CaseDetail; busy: boolean; run: RunAction }) {
  const { t, locale } = useLocale();
  const [form, setForm] = useState<OutcomeForm>(blankForm);
  const [disputing, setDisputing] = useState<{ id: string; reason: string } | null>(null);
  const [resolving, setResolving] = useState<{ id: string; resolution: 'UPHELD' | 'CORRECTED'; note: string; correction: OutcomeForm } | null>(null);
  const superseded = new Set(detail.outcomes.map((o) => o.supersedesId).filter(Boolean));
  const current = (outcome: CaseOutcome) => !superseded.has(outcome.id);
  const canRecord = RECORD_STATUSES.includes(detail.status);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    run(() => recordOutcome(caseId, toBody(form)), t('outcome.saved')).then(() => setForm(blankForm()));
  };

  const submitDispute = (event: FormEvent) => {
    event.preventDefault();
    if (!disputing) return;
    run(() => disputeOutcome(caseId, disputing.id, disputing.reason.trim()), t('outcome.disputeSaved')).then(() => setDisputing(null));
  };

  const submitResolve = (event: FormEvent) => {
    event.preventDefault();
    if (!resolving) return;
    run(
      () =>
        resolveDispute(caseId, resolving.id, {
          resolution: resolving.resolution,
          note: resolving.note.trim(),
          ...(resolving.resolution === 'CORRECTED' ? { correction: toBody(resolving.correction) } : {}),
        }),
      t('outcome.resolved'),
    ).then(() => setResolving(null));
  };

  return (
    <div className="card">
      <h2 style={{ marginBottom: 4 }}>{t('outcome.heading')}</h2>
      <p className="muted" style={{ marginTop: 0 }}>{t('outcome.rule')}</p>
      {detail.outcomes.length === 0 ? (
        <p className="empty">{t('outcome.none')}</p>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th scope="col">{t('case.col.when')}</th>
                <th scope="col">{t('outcome.type')}</th>
                <th scope="col">{t('outcome.confidence')}</th>
                <th scope="col">{t('outcome.units')}</th>
                <th scope="col">
                  <span className="sr-only">{t('appt.col.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {detail.outcomes.map((item) => (
                <tr key={item.id} className={current(item) ? '' : 'muted'}>
                  <td>{fmtDate(item.reportedAt, locale, true)}</td>
                  <td>
                    {labelFor(t, 'outcomeType', item.outcomeType)}
                    {!current(item) && <div style={{ fontSize: 12.5 }}>{t('outcome.superseded')}</div>}
                  </td>
                  <td>
                    <span className={`chip ${item.confidence === 'Service-confirmed' ? 'grn' : 'amb'}`}>{labelFor(t, 'confidence', item.confidence)}</span>
                    {item.disputed && <span className="chip red" style={{ marginLeft: 6 }}>{t('outcome.disputedChip')}</span>}
                  </td>
                  <td>{item.units ?? '—'}</td>
                  <td>
                    {current(item) && !item.disputed && (
                      <button type="button" className="btn btn-small" disabled={busy} onClick={() => setDisputing({ id: item.id, reason: '' })}>
                        {t('outcome.dispute')}
                      </button>
                    )}
                    {current(item) && item.disputed && (
                      <button type="button" className="btn btn-small" disabled={busy} onClick={() => setResolving({ id: item.id, resolution: 'UPHELD', note: '', correction: blankForm() })}>
                        {t('outcome.resolve')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {disputing && (
        <form onSubmit={submitDispute} noValidate className="inset" style={{ marginTop: 12 }}>
          <div className="field">
            <label htmlFor="dispute-reason">{t('outcome.disputeReason')}</label>
            <textarea id="dispute-reason" className="input" rows={2} maxLength={500} value={disputing.reason} onChange={(e) => setDisputing({ ...disputing, reason: e.target.value })} />
          </div>
          <div className="row end" style={{ marginTop: 12 }}>
            <button type="button" className="btn" onClick={() => setDisputing(null)}>{t('action.cancel')}</button>
            <button type="submit" className="btn btn-primary" disabled={busy || disputing.reason.trim().length < 5}>{t('outcome.dispute')}</button>
          </div>
        </form>
      )}

      {resolving && (
        <form onSubmit={submitResolve} noValidate className="inset" style={{ marginTop: 12 }}>
          <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="muted">{t('outcome.resolution')}</legend>
            <div className="row">
              {(['UPHELD', 'CORRECTED'] as const).map((value) => (
                <label key={value} className="row" style={{ gap: 6 }}>
                  <input type="radio" name="resolution" checked={resolving.resolution === value} onChange={() => setResolving({ ...resolving, resolution: value })} />
                  <span>{t(value === 'UPHELD' ? 'outcome.upheld' : 'outcome.corrected')}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {resolving.resolution === 'CORRECTED' && (
            <div style={{ marginTop: 12 }}>
              <OutcomeFields form={resolving.correction} setForm={(correction) => setResolving({ ...resolving, correction })} donors={[]} prefix="fix" />
            </div>
          )}
          <div className="field" style={{ marginTop: 12 }}>
            <label htmlFor="resolve-note">{t('outcome.resolveNote')}</label>
            <textarea id="resolve-note" className="input" rows={2} maxLength={1000} value={resolving.note} onChange={(e) => setResolving({ ...resolving, note: e.target.value })} />
          </div>
          <div className="row end" style={{ marginTop: 12 }}>
            <button type="button" className="btn" onClick={() => setResolving(null)}>{t('action.cancel')}</button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={busy || resolving.note.trim().length < 3 || (resolving.resolution === 'CORRECTED' && !formReady(resolving.correction))}
            >
              {t('outcome.resolve')}
            </button>
          </div>
        </form>
      )}

      {canRecord && (
        <form onSubmit={submit} noValidate style={{ marginTop: 16 }}>
          <h3 style={{ marginBottom: 8 }}>{t('outcome.record')}</h3>
          <OutcomeFields form={form} setForm={setForm} donors={detail.donors} prefix="oc" />
          <div className="row end" style={{ marginTop: 12 }}>
            <button type="submit" className="btn btn-primary" disabled={busy || !formReady(form)}>{t('outcome.save')}</button>
          </div>
        </form>
      )}
    </div>
  );
}
