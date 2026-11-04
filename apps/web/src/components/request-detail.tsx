'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { hasMessage, type MessageKey } from '@/lib/messages';
import {
  fetchRequestDetail,
  pickUpRequest,
  rejectRequest,
  requestMoreInformation,
  resolveFlag,
  verifyRequest,
  type InformationBody,
  type RejectBody,
  type ReviewDetail,
  type ReviewFlag,
  type VerifyBody,
} from '@/lib/staff-data';
import { useLocale } from './locale-provider';
import { StaffChangeRequests } from './staff-change-requests';

type CheckKey = keyof VerifyBody;
type MissingItem = InformationBody['items'][number];
type RejectCode = RejectBody['reasonCode'];

const CHECKS: CheckKey[] = [
  'documentLegible',
  'bloodGroupAndComponentMatch',
  'facilityExists',
  'representativeReachable',
  'noDuplicate',
  'urgencyConsistent',
];
const MISSING: MissingItem[] = [
  'DOCUMENT_MISSING',
  'DOCUMENT_ILLEGIBLE',
  'BLOOD_GROUP_MISMATCH',
  'COMPONENT_MISMATCH',
  'FACILITY_UNCLEAR',
  'CONTACT_UNREACHABLE',
  'OTHER',
];
const REJECTS: RejectCode[] = ['DUPLICATE', 'SUSPECTED_MISUSE', 'NO_GENUINE_NEED', 'DOCUMENT_INVALID', 'UNREACHABLE', 'OTHER'];

const emptyChecks = () => Object.fromEntries(CHECKS.map((key) => [key, false])) as Record<CheckKey, boolean>;
const urgencyTone = (value: string) => (value === 'Critical' ? 'red' : value === 'Urgent' ? 'amb' : 'blu');

export function RequestDetail({ id }: { id: string }) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [detail, setDetail] = useState<ReviewDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [checks, setChecks] = useState<Record<CheckKey, boolean>>(emptyChecks);
  const [missing, setMissing] = useState<MissingItem[]>([]);
  const [infoMessage, setInfoMessage] = useState('');
  const [rejectCode, setRejectCode] = useState<RejectCode | ''>('');
  const [explanation, setExplanation] = useState('');

  const errorText = useCallback(
    (caught: unknown) => {
      const code = caught instanceof ApiError ? caught.code : '';
      const key = `error.${code}`;
      return hasMessage(key) ? t(key) : t('error.generic');
    },
    [t],
  );

  const load = useCallback(async () => {
    try {
      setDetail(await fetchRequestDetail(id));
      setLoadError(null);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        router.replace('/sign-in');
        return;
      }
      setLoadError(errorText(caught));
    }
  }, [id, router, errorText]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setNotice(null);
    try {
      await action();
      setNotice({ tone: 'ok', text: success });
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
  if (!detail) return <p role="status">{t('detail.loading')}</p>;

  const date = (value: string | null, withTime = false) => {
    if (!value) return '—';
    const parsed = new Date(withTime ? value : `${value}T00:00:00`);
    return new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-GB', {
      dateStyle: 'medium',
      timeStyle: withTime ? 'short' : undefined,
    }).format(parsed);
  };

  const allChecked = CHECKS.every((key) => checks[key]);
  const canPickUp = detail.status === 'Submitted';
  const canDecide = detail.status === 'Under review' && !detail.hasModerationHold;
  const openFlags = detail.flags.filter((flag) => flag.status === 'Open');

  const verify = (event: FormEvent) => {
    event.preventDefault();
    run(() => verifyRequest(id, { ...checks }), t('action.done'));
  };

  const askForInformation = (event: FormEvent) => {
    event.preventDefault();
    run(() => requestMoreInformation(id, { items: missing, message: infoMessage }), t('action.done'));
  };

  const reject = (event: FormEvent) => {
    event.preventDefault();
    if (!rejectCode) return;
    run(() => rejectRequest(id, { reasonCode: rejectCode, explanation }), t('action.done'));
  };

  const decideFlag = (flag: ReviewFlag, resolution: 'Dismissed' | 'Confirmed') =>
    run(() => resolveFlag(id, flag.id, { resolution, note: '' }), t('action.done'));

  const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((value) => value !== item) : [...list, item]);

  return (
    <section>
      <div className="page-head">
        <div>
          <Link href="/queue" className="muted">
            ← {t('detail.back')}
          </Link>
          <h1 style={{ marginTop: 6 }}>
            {t('detail.heading')} · {detail.referenceNo ?? '—'}
          </h1>
          <p>
            {detail.patientName} · {detail.requestedBloodGroup} {detail.component} · {detail.quantityUnits}
          </p>
        </div>
        <span className="chip">{hasMessage(`status.${detail.status}`) ? t(`status.${detail.status}` as MessageKey) : detail.status}</span>
      </div>

      {notice && <p role={notice.tone === 'err' ? 'alert' : 'status'} className={`alert ${notice.tone === 'err' ? 'err' : 'ok'}`}>{notice.text}</p>}
      {detail.hasModerationHold && <p className="alert info">{t('detail.hold')}</p>}
      {detail.status === 'Under review' && detail.firstActionAt && <p className="alert info">{t('detail.pickedUp')}</p>}

      <div className="grid-main">
        <div>
          <div className="card">
            <h2 style={{ marginBottom: 12 }}>{t('detail.heading')}</h2>
            <dl className="facts">
              <dt>{t('detail.patient')}</dt>
              <dd>{detail.patientName}</dd>
              <dt>{t('detail.group')}</dt>
              <dd>{detail.requestedBloodGroup}</dd>
              <dt>{t('detail.component')}</dt>
              <dd>{detail.component}</dd>
              <dt>{t('detail.units')}</dt>
              <dd>{detail.quantityUnits}</dd>
              <dt>{t('detail.requiredBy')}</dt>
              <dd>{date(detail.requiredBy)}</dd>
              <dt>{t('detail.urgency')}</dt>
              <dd>
                <span className={`chip ${urgencyTone(detail.urgency)}`}>
                  {hasMessage(`value.${detail.urgency}`) ? t(`value.${detail.urgency}` as MessageKey) : detail.urgency}
                </span>
              </dd>
              <dt>{t('detail.contact')}</dt>
              <dd>{detail.contactPhone ?? '—'}</dd>
              <dt>{t('detail.submitted')}</dt>
              <dd>{date(detail.submittedAt, true)}</dd>
            </dl>
          </div>

          <div className="card">
            <h2 style={{ marginBottom: 12 }}>{t('detail.flags')}</h2>
            {openFlags.length === 0 && detail.flags.length === 0 && <p className="empty">{t('detail.noFlags')}</p>}
            <div className="stack-flags" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {detail.flags.map((flag) => (
                <div key={flag.id} className="row" style={{ justifyContent: 'space-between' }}>
                  <div>
                    <b style={{ color: 'var(--title)' }}>
                      {hasMessage(`flag.${flag.flagType}`) ? t(`flag.${flag.flagType}` as MessageKey) : flag.flagType}
                    </b>
                    {flag.matchedReferenceNo && <div className="muted">{flag.matchedReferenceNo}</div>}
                  </div>
                  {flag.status === 'Open' ? (
                    <div className="row">
                      <button type="button" className="btn btn-small" disabled={busy} onClick={() => decideFlag(flag, 'Dismissed')}>
                        {t('detail.flagDismiss')}
                      </button>
                      <button type="button" className="btn btn-small btn-primary" disabled={busy} onClick={() => decideFlag(flag, 'Confirmed')}>
                        {t('detail.flagConfirm')}
                      </button>
                    </div>
                  ) : (
                    <span className="chip">{flag.status}</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <StaffChangeRequests requestId={id} changes={detail.changes} busy={busy} run={run} />
        </div>

        <div>
          {canPickUp && (
            <div className="card">
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => run(() => pickUpRequest(id), t('action.done'))}>
                {busy ? t('action.working') : t('detail.pickUp')}
              </button>
            </div>
          )}

          {canDecide && (
            <form className="card" onSubmit={verify} noValidate>
              <h2 style={{ marginBottom: 4 }}>{t('detail.checklist')}</h2>
              <p className="muted" style={{ marginTop: 0 }}>{t('detail.checklistHint')}</p>
              <ul className="checklist">
                {CHECKS.map((key) => (
                  <li key={key}>
                    <label>
                      <input type="checkbox" checked={checks[key]} onChange={(event) => setChecks({ ...checks, [key]: event.target.checked })} />
                      <span>{t(`checklist.${key}` as MessageKey)}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="row end" style={{ marginTop: 16 }}>
                <button type="submit" className="btn btn-primary" disabled={busy || !allChecked}>
                  {t('action.verify')}
                </button>
              </div>
            </form>
          )}

          {canDecide && (
            <form className="card" onSubmit={askForInformation} noValidate>
              <h2 style={{ marginBottom: 12 }}>{t('detail.requestInfo')}</h2>
              <div className="field">
                <span className="muted">{t('detail.missingItems')}</span>
                <ul className="checklist">
                  {MISSING.map((item) => (
                    <li key={item}>
                      <label>
                        <input type="checkbox" checked={missing.includes(item)} onChange={() => setMissing(toggle(missing, item))} />
                        <span>{t(`missing.${item}` as MessageKey)}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="field" style={{ marginTop: 12 }}>
                <label htmlFor="info-message">{t('detail.message')}</label>
                <textarea id="info-message" className="input" rows={3} value={infoMessage} onChange={(event) => setInfoMessage(event.target.value)} />
              </div>
              <div className="row end" style={{ marginTop: 12 }}>
                <button type="submit" className="btn" disabled={busy || missing.length === 0}>
                  {t('action.requestInfo')}
                </button>
              </div>
            </form>
          )}

          {canDecide && (
            <form className="card" onSubmit={reject} noValidate>
              <h2 style={{ marginBottom: 12 }}>{t('detail.reject')}</h2>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="reject-code">{t('detail.reasonCode')}</label>
                  <select id="reject-code" className="input" value={rejectCode} onChange={(event) => setRejectCode(event.target.value as RejectCode | '')}>
                    <option value="">—</option>
                    {REJECTS.map((code) => (
                      <option key={code} value={code}>
                        {t(`reject.${code}` as MessageKey)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="field" style={{ marginTop: 12 }}>
                <label htmlFor="reject-explanation">{t('detail.explanation')}</label>
                <textarea id="reject-explanation" className="input" rows={3} value={explanation} onChange={(event) => setExplanation(event.target.value)} />
                <span className="muted" style={{ fontSize: 12.5 }}>{t('detail.explanationHint')}</span>
              </div>
              <div className="row end" style={{ marginTop: 12 }}>
                <button type="submit" className="btn" disabled={busy || !rejectCode || explanation.trim().length === 0}>
                  {t('action.reject')}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
