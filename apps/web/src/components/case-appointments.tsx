'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { fmtDate, labelFor } from '@/lib/format';
import {
  fetchAppointmentFacilities,
  markNoShow,
  proposeAppointment,
  rescheduleAppointment,
  type CaseDetail,
  type FacilityPage,
} from '@/lib/staff-data';
import type { RunAction } from './case-detail';
import { useLocale } from './locale-provider';

type Facility = FacilityPage['items'][number];

const PROPOSE_STATUSES = ['Open', 'Scheduling', 'Scheduled'];
const LIVE = ['Proposed', 'Confirmed'];
const toIso = (local: string) => new Date(local).toISOString();

export function CaseAppointments({ caseId, detail, busy, run }: { caseId: string; detail: CaseDetail; busy: boolean; run: RunAction }) {
  const { t, locale } = useLocale();
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [form, setForm] = useState({ caseDonorId: '', facilityId: '', when: '' });
  const [moving, setMoving] = useState<{ id: string; when: string } | null>(null);
  const canPropose = PROPOSE_STATUSES.includes(detail.status);
  const activeDonors = detail.donors.filter((donor) => donor.status === 'Active');

  useEffect(() => {
    if (!canPropose) return;
    fetchAppointmentFacilities()
      .then(setFacilities)
      .catch(() => setFacilities([]));
  }, [canPropose]);

  const donorCode = (caseDonorId: string) => detail.donors.find((donor) => donor.id === caseDonorId)?.donorCode ?? '—';
  const facilityName = (facility: Facility) => (locale === 'bn' && facility.nameBn ? facility.nameBn : facility.nameEn);

  const propose = (event: FormEvent) => {
    event.preventDefault();
    run(() => proposeAppointment(caseId, { caseDonorId: form.caseDonorId, facilityId: form.facilityId, scheduledStart: toIso(form.when) }), t('appt.proposed')).then(() =>
      setForm({ caseDonorId: '', facilityId: '', when: '' }),
    );
  };

  const reschedule = (event: FormEvent) => {
    event.preventDefault();
    if (!moving) return;
    run(() => rescheduleAppointment(moving.id, toIso(moving.when)), t('appt.rescheduled')).then(() => setMoving(null));
  };

  return (
    <div className="card">
      <h2 style={{ marginBottom: 12 }}>{t('appt.heading')}</h2>
      {detail.appointments.length === 0 ? (
        <p className="empty">{t('appt.none')}</p>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th scope="col">{t('case.col.donor')}</th>
                <th scope="col">{t('appt.col.facility')}</th>
                <th scope="col">{t('appt.col.time')}</th>
                <th scope="col">{t('queue.col.status')}</th>
                <th scope="col">
                  <span className="sr-only">{t('appt.col.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {detail.appointments.map((item) => (
                <tr key={item.id}>
                  <td className="mono">{donorCode(item.caseDonorId)}</td>
                  <td>{item.facility ?? '—'}</td>
                  <td>{fmtDate(item.scheduledStart, locale, true)}</td>
                  <td>
                    <span className="chip">{labelFor(t, 'appt', item.status)}</span>
                  </td>
                  <td>
                    <div className="row">
                      {LIVE.includes(item.status) && (
                        <button type="button" className="btn btn-small" disabled={busy} onClick={() => setMoving({ id: item.id, when: '' })}>
                          {t('appt.reschedule')}
                        </button>
                      )}
                      {item.status === 'Confirmed' && (
                        <button type="button" className="btn btn-small" disabled={busy} onClick={() => run(() => markNoShow(item.id), t('appt.noShowDone'))}>
                          {t('appt.noShow')}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {moving && (
        <form onSubmit={reschedule} noValidate className="inset" style={{ marginTop: 12 }}>
          <div className="field">
            <label htmlFor="appt-move">{t('appt.newTime')}</label>
            <input id="appt-move" type="datetime-local" className="input" value={moving.when} onChange={(e) => setMoving({ ...moving, when: e.target.value })} />
          </div>
          <div className="row end" style={{ marginTop: 12 }}>
            <button type="button" className="btn" onClick={() => setMoving(null)}>{t('action.cancel')}</button>
            <button type="submit" className="btn btn-primary" disabled={busy || !moving.when}>{t('appt.reschedule')}</button>
          </div>
        </form>
      )}

      {canPropose && activeDonors.length > 0 && (
        <form onSubmit={propose} noValidate style={{ marginTop: 16 }}>
          <h3 style={{ marginBottom: 8 }}>{t('appt.propose')}</h3>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="appt-donor">{t('case.col.donor')}</label>
              <select id="appt-donor" className="input" value={form.caseDonorId} onChange={(e) => setForm({ ...form, caseDonorId: e.target.value })}>
                <option value="">—</option>
                {activeDonors.map((donor) => (
                  <option key={donor.id} value={donor.id}>{donor.donorCode ?? donor.id}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="appt-facility">{t('appt.col.facility')}</label>
              <select id="appt-facility" className="input" value={form.facilityId} onChange={(e) => setForm({ ...form, facilityId: e.target.value })}>
                <option value="">—</option>
                {facilities.map((facility) => (
                  <option key={facility.id} value={facility.id}>{facilityName(facility)}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="appt-when">{t('appt.col.time')}</label>
              <input id="appt-when" type="datetime-local" className="input" value={form.when} onChange={(e) => setForm({ ...form, when: e.target.value })} />
            </div>
          </div>
          <p className="muted" style={{ fontSize: 12.5 }}>{t('appt.proposeHint')}</p>
          <div className="row end">
            <button type="submit" className="btn btn-primary" disabled={busy || !form.caseDonorId || !form.facilityId || !form.when}>
              {t('appt.proposeAction')}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
