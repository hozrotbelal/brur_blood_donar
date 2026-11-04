'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { fmtDate, labelFor } from '@/lib/format';
import { hasMessage, type MessageKey } from '@/lib/messages';
import {
  changeStaffAssignment,
  deactivateStaff,
  fetchAreas,
  fetchStaff,
  resetStaffDevice,
  type AreaPage,
  type StaffDeactivated,
  type StaffMember,
} from '@/lib/staff-data';
import { useLocale } from './locale-provider';
import { useStepUp } from './step-up';

type Action = 'assign' | 'reset' | 'deactivate';
type StaffRole = 'SUP' | 'MOD' | 'ADM';

const TIERS: Record<StaffRole, string[]> = {
  SUP: ['TIER_SUPPORT_AGENT', 'TIER_SUPPORT_LEAD'],
  MOD: ['TIER_MODERATOR', 'TIER_MODERATION_LEAD'],
  ADM: ['TIER_ADMINISTRATOR', 'TIER_PRIMARY_ADMINISTRATOR'],
};
const statusTone = (status: string) => (status === 'Active' ? 'grn' : status === 'Deactivated' ? '' : 'red');

export function StaffScreen() {
  const { t, locale } = useLocale();
  const router = useRouter();
  const { guard, dialog } = useStepUp();
  const [rows, setRows] = useState<StaffMember[] | null>(null);
  const [areas, setAreas] = useState<AreaPage['items']>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<{ member: StaffMember; action: Action } | null>(null);
  const [tier, setTier] = useState('');
  const [areaIds, setAreaIds] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [leftCases, setLeftCases] = useState<StaffDeactivated['openCases'] | null>(null);

  const errorText = useCallback(
    (caught: unknown) => {
      const key = `error.${caught instanceof ApiError ? caught.code : ''}`;
      return hasMessage(key) ? t(key) : t('error.generic');
    },
    [t],
  );

  const load = useCallback(async () => {
    try {
      setRows(await fetchStaff());
      setLoadError(null);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        router.replace('/sign-in');
        return;
      }
      setLoadError(errorText(caught));
    }
  }, [router, errorText]);

  useEffect(() => {
    load();
    fetchAreas()
      .then((page) => setAreas(page.items))
      .catch(() => setAreas([]));
  }, [load]);

  const areaName = (id: string) => {
    const area = areas.find((a) => a.id === id);
    return area ? (locale === 'bn' ? area.nameBn : area.nameEn) : '—';
  };

  const start = (member: StaffMember, action: Action) => {
    setOpen({ member, action });
    setTier(member.tierCode ?? TIERS[(member.roleCode ?? 'SUP') as StaffRole][0]);
    setAreaIds(member.areaIds);
    setReason('');
    setNotice(null);
    setLeftCases(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!open) return;
    const { member, action } = open;
    setBusy(true);
    setNotice(null);
    try {
      if (action === 'assign') {
        await guard(() => changeStaffAssignment(member.userId, { tierCode: tier, areaIds: member.roleCode === 'SUP' ? areaIds : [], reason: reason.trim() }));
        setNotice({ tone: 'ok', text: t('staff.assigned') });
      } else if (action === 'reset') {
        await guard(() => resetStaffDevice(member.userId, reason.trim()));
        setNotice({ tone: 'ok', text: t('staff.resetDone') });
      } else {
        const result = await guard(() => deactivateStaff(member.userId, reason.trim()));
        setLeftCases(result.openCases);
        setNotice({ tone: 'ok', text: t('staff.deactivated') });
      }
      setOpen(null);
      await load();
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        router.replace('/sign-in');
        return;
      }
      setNotice({ tone: 'err', text: errorText(caught) });
    } finally {
      setBusy(false);
    }
  };

  if (loadError) return <p role="alert" className="alert err">{loadError}</p>;

  const role = (open?.member.roleCode ?? 'SUP') as StaffRole;
  const formReady = reason.trim().length >= 5 && (open?.action !== 'assign' || role !== 'SUP' || areaIds.length > 0);

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>{t('staff.title')}</h1>
          <p>{t('staff.intro')}</p>
        </div>
        <Link href="/team/invitations" className="btn btn-primary">{t('staff.invite')}</Link>
      </div>

      {notice && <p role={notice.tone === 'err' ? 'alert' : 'status'} className={`alert ${notice.tone === 'err' ? 'err' : 'ok'}`}>{notice.text}</p>}
      {leftCases && leftCases.length > 0 && (
        <div className="alert warn">
          <b>{t('staff.reassign')}</b>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {leftCases.map((c) => (
              <li key={c.id} className="mono">{c.caseNo}</li>
            ))}
          </ul>
        </div>
      )}

      {open && (
        <form className="card" onSubmit={submit} noValidate>
          <h2 style={{ marginBottom: 4 }}>{t(`staff.action.${open.action}` as MessageKey)} · {open.member.displayName ?? `…${open.member.phoneLast4}`}</h2>
          <p className="muted" style={{ marginTop: 0 }}>{t(`staff.hint.${open.action}` as MessageKey)}</p>
          {open.action === 'assign' && (
            <div className="form-grid">
              <div className="field">
                <label htmlFor="st-tier">{t('invite.tier')}</label>
                <select id="st-tier" className="input" value={tier} onChange={(e) => setTier(e.target.value)}>
                  {TIERS[role].map((code) => (
                    <option key={code} value={code}>{labelFor(t, 'tier', code)}</option>
                  ))}
                </select>
              </div>
              {role === 'SUP' && (
                <div className="field">
                  <label htmlFor="st-areas">{t('invite.areas')}</label>
                  <select id="st-areas" className="input" multiple size={5} value={areaIds} onChange={(e) => setAreaIds(Array.from(e.target.selectedOptions, (o) => o.value))}>
                    {areas.map((area) => (
                      <option key={area.id} value={area.id}>{locale === 'bn' ? area.nameBn : area.nameEn}</option>
                    ))}
                  </select>
                  <span className="muted" style={{ fontSize: 12.5 }}>{t('invite.areasHint')}</span>
                </div>
              )}
            </div>
          )}
          <div className="field" style={{ marginTop: 12 }}>
            <label htmlFor="st-reason">{t('staff.reason')}</label>
            <textarea id="st-reason" className="input" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
            <span className="muted" style={{ fontSize: 12.5 }}>{t('staff.reasonHint')}</span>
          </div>
          <div className="row end" style={{ marginTop: 12 }}>
            <button type="button" className="btn" onClick={() => setOpen(null)}>{t('action.cancel')}</button>
            <button type="submit" className={`btn ${open.action === 'deactivate' ? 'btn-danger' : 'btn-primary'}`} disabled={busy || !formReady}>
              {busy ? t('action.working') : t(`staff.action.${open.action}` as MessageKey)}
            </button>
          </div>
        </form>
      )}

      <div className="card">
        {rows === null ? (
          <p role="status">{t('queue.loading')}</p>
        ) : rows.length === 0 ? (
          <p className="empty">{t('staff.empty')}</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">{t('staff.col.name')}</th>
                  <th scope="col">{t('invite.role')}</th>
                  <th scope="col">{t('invite.tier')}</th>
                  <th scope="col">{t('invite.col.areas')}</th>
                  <th scope="col">{t('staff.col.lastSignIn')}</th>
                  <th scope="col">{t('queue.col.status')}</th>
                  <th scope="col">
                    <span className="sr-only">{t('appt.col.actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((member) => (
                  <tr key={member.userId} className={member.status === 'Deactivated' ? 'muted' : ''}>
                    <td>
                      <b>{member.displayName ?? '—'}</b>
                      <div className="muted mono" style={{ fontSize: 12.5 }}>…{member.phoneLast4}</div>
                    </td>
                    <td>{member.roleCode ? t(`role.${member.roleCode}` as MessageKey) : '—'}</td>
                    <td>{labelFor(t, 'tier', member.tierCode)}</td>
                    <td>{member.areaIds.length ? member.areaIds.map(areaName).join(', ') : '—'}</td>
                    <td>{fmtDate(member.lastLoginAt, locale, true)}</td>
                    <td>
                      <span className={`chip ${statusTone(member.status)}`}>{labelFor(t, 'staffStatus', member.status)}</span>
                    </td>
                    <td>
                      {member.status !== 'Deactivated' && (
                        <div className="row">
                          <button type="button" className="btn btn-small" disabled={busy} onClick={() => start(member, 'assign')}>{t('staff.action.assign')}</button>
                          <button type="button" className="btn btn-small" disabled={busy} onClick={() => start(member, 'reset')}>{t('staff.action.reset')}</button>
                          <button type="button" className="btn btn-small" disabled={busy} onClick={() => start(member, 'deactivate')}>{t('staff.action.deactivate')}</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {dialog}
    </section>
  );
}
