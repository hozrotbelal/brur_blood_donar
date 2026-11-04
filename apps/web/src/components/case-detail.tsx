'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { fmtDate, labelFor } from '@/lib/format';
import { hasMessage } from '@/lib/messages';
import {
  addCaseNote,
  answerMoreDonors,
  closeCase,
  declareUnable,
  fetchCaseDetail,
  logContact,
  setFulfilment,
  startScheduling,
  type CaseDetail as CaseDetailData,
  type ContactBody,
} from '@/lib/staff-data';
import { CaseAppointments } from './case-appointments';
import { CaseOutcomes } from './case-outcomes';
import { useLocale } from './locale-provider';

const FLOW = ['Open', 'Scheduling', 'Scheduled', 'Attendance pending', 'Outcome pending', 'Resolved', 'Closed'];
const PARTIES: ContactBody['party'][] = ['DONOR', 'REPRESENTATIVE', 'HOSPITAL', 'COLLECTION_SERVICE', 'OTHER_EXTERNAL'];
const CHANNELS: ContactBody['channel'][] = ['PHONE_CALL', 'SMS', 'IN_APP_MESSAGE'];
const RESULTS: ContactBody['result'][] = ['REACHED', 'NO_ANSWER', 'BUSY', 'WRONG_NUMBER', 'CALLBACK_REQUESTED', 'LEFT_MESSAGE'];
const OPEN_TASK = ['Open', 'In progress'];

export type RunAction = (action: () => Promise<unknown>, success: string) => Promise<void>;

export function CaseDetail({ id }: { id: string }) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [detail, setDetail] = useState<CaseDetailData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [contact, setContact] = useState<{ party: ContactBody['party']; channel: ContactBody['channel']; result: ContactBody['result']; caseDonorId: string; externalPerson: string }>({
    party: 'DONOR', channel: 'PHONE_CALL', result: 'REACHED', caseDonorId: '', externalPerson: '',
  });
  const [note, setNote] = useState('');
  const [closeNote, setCloseNote] = useState('');
  const [unableReason, setUnableReason] = useState('');

  const errorText = useCallback(
    (caught: unknown) => {
      const key = `error.${caught instanceof ApiError ? caught.code : ''}`;
      return hasMessage(key) ? t(key) : t('error.generic');
    },
    [t],
  );

  const load = useCallback(async () => {
    try {
      setDetail(await fetchCaseDetail(id));
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

  const run: RunAction = async (action, success) => {
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

  const step = FLOW.indexOf(detail.status);
  const openTasks = detail.tasks.filter((task) => OPEN_TASK.includes(task.status));
  const askMoreDonors = openTasks.some((task) => task.taskType === 'TK_CONFIRM_MORE_DONORS_NEEDED');
  const ended = detail.status === 'Resolved' || detail.status === 'Closed';

  const submitContact = (event: FormEvent) => {
    event.preventDefault();
    run(
      () =>
        logContact(id, {
          party: contact.party, channel: contact.channel, result: contact.result,
          ...(contact.caseDonorId ? { caseDonorId: contact.caseDonorId } : {}),
          ...(contact.externalPerson.trim() ? { externalPerson: contact.externalPerson.trim() } : {}),
        }),
      t('case.contactSaved'),
    ).then(() => setContact((c) => ({ ...c, externalPerson: '' })));
  };

  const submitNote = (event: FormEvent) => {
    event.preventDefault();
    run(() => addCaseNote(id, note.trim()), t('case.noteSaved')).then(() => setNote(''));
  };

  return (
    <section>
      <div className="page-head">
        <div>
          <Link href="/cases" className="muted">
            ← {t('case.back')}
          </Link>
          <h1 style={{ marginTop: 6 }}>
            {detail.caseNo} · {detail.requestReference ?? '—'}
          </h1>
          <p>{t('case.intro')}</p>
        </div>
        <div className="row">
          <span className="chip">{labelFor(t, 'value', detail.priority)}</span>
          <span className="chip">{labelFor(t, 'status', detail.status)}</span>
        </div>
      </div>

      <ol className="pill-steps" aria-label={t('case.progress')}>
        {FLOW.map((status, index) => (
          <li key={status} className={index < step ? 'done' : index === step ? 'now' : ''} aria-current={index === step ? 'step' : undefined}>
            {labelFor(t, 'status', status)}
          </li>
        ))}
      </ol>

      {notice && <p role={notice.tone === 'err' ? 'alert' : 'status'} className={`alert ${notice.tone === 'err' ? 'err' : 'ok'}`}>{notice.text}</p>}
      {detail.status === 'Needs replacement' && <p className="alert info">{t('case.needsReplacement')}</p>}
      {detail.disputed && <p className="alert warn">{t('case.disputed')}</p>}

      <div className="grid-main">
        <div>
          <div className="card">
            <h2 style={{ marginBottom: 12 }}>{t('case.donors')}</h2>
            {detail.donors.length === 0 ? (
              <p className="empty">{t('case.noDonors')}</p>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th scope="col">{t('case.col.donor')}</th>
                      <th scope="col">{t('queue.col.status')}</th>
                      <th scope="col">{t('case.col.joined')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.donors.map((donor) => (
                      <tr key={donor.id}>
                        <td>
                          <b className="mono">{donor.donorCode ?? '—'}</b>
                        </td>
                        <td>
                          <span className="chip">{labelFor(t, 'caseDonor', donor.status)}</span>
                        </td>
                        <td>{fmtDate(donor.joinedAt, locale, true)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>{t('case.donorPrivacy')}</p>
          </div>

          <CaseAppointments caseId={id} detail={detail} busy={busy} run={run} />
          <CaseOutcomes caseId={id} detail={detail} busy={busy} run={run} />

          <div className="card">
            <h2 style={{ marginBottom: 12 }}>{t('case.contacts')}</h2>
            {detail.contacts.length > 0 && (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th scope="col">{t('case.col.when')}</th>
                      <th scope="col">{t('case.col.who')}</th>
                      <th scope="col">{t('case.col.channel')}</th>
                      <th scope="col">{t('case.col.result')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.contacts.map((item) => (
                      <tr key={item.id}>
                        <td>{fmtDate(item.attemptedAt, locale, true)}</td>
                        <td>{labelFor(t, 'party', item.targetParty)}</td>
                        <td>{labelFor(t, 'channel', item.channel)}</td>
                        <td>{labelFor(t, 'contactResult', item.result)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!ended && (
              <form onSubmit={submitContact} noValidate style={{ marginTop: 12 }}>
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="ct-party">{t('case.col.who')}</label>
                    <select id="ct-party" className="input" value={contact.party} onChange={(e) => setContact({ ...contact, party: e.target.value as ContactBody['party'] })}>
                      {PARTIES.map((value) => (
                        <option key={value} value={value}>{labelFor(t, 'party', value)}</option>
                      ))}
                    </select>
                  </div>
                  {contact.party === 'DONOR' && (
                    <div className="field">
                      <label htmlFor="ct-donor">{t('case.col.donor')}</label>
                      <select id="ct-donor" className="input" value={contact.caseDonorId} onChange={(e) => setContact({ ...contact, caseDonorId: e.target.value })}>
                        <option value="">—</option>
                        {detail.donors.map((donor) => (
                          <option key={donor.id} value={donor.id}>{donor.donorCode ?? donor.id}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="field">
                    <label htmlFor="ct-channel">{t('case.col.channel')}</label>
                    <select id="ct-channel" className="input" value={contact.channel} onChange={(e) => setContact({ ...contact, channel: e.target.value as ContactBody['channel'] })}>
                      {CHANNELS.map((value) => (
                        <option key={value} value={value}>{labelFor(t, 'channel', value)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="ct-result">{t('case.col.result')}</label>
                    <select id="ct-result" className="input" value={contact.result} onChange={(e) => setContact({ ...contact, result: e.target.value as ContactBody['result'] })}>
                      {RESULTS.map((value) => (
                        <option key={value} value={value}>{labelFor(t, 'contactResult', value)}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {contact.party !== 'DONOR' && contact.party !== 'REPRESENTATIVE' && (
                  <div className="field" style={{ marginTop: 12 }}>
                    <label htmlFor="ct-person">{t('case.externalPerson')}</label>
                    <input id="ct-person" className="input" maxLength={200} value={contact.externalPerson} onChange={(e) => setContact({ ...contact, externalPerson: e.target.value })} />
                  </div>
                )}
                <div className="row end" style={{ marginTop: 12 }}>
                  <button type="submit" className="btn" disabled={busy}>{t('case.logContact')}</button>
                </div>
              </form>
            )}
          </div>

          <div className="card">
            <h2 style={{ marginBottom: 12 }}>{t('case.notes')}</h2>
            {detail.notes.length === 0 ? (
              <p className="empty">{t('case.noNotes')}</p>
            ) : (
              <ul className="note-list">
                {detail.notes.map((item) => (
                  <li key={item.id}>
                    <div className="muted" style={{ fontSize: 12.5 }}>
                      {fmtDate(item.createdAt, locale, true)} · {labelFor(t, 'noteType', item.noteType)}
                    </div>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{item.body}</div>
                  </li>
                ))}
              </ul>
            )}
            <form onSubmit={submitNote} noValidate style={{ marginTop: 12 }}>
              <div className="field">
                <label htmlFor="case-note">{t('case.addNote')}</label>
                <textarea id="case-note" className="input" rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
                <span className="muted" style={{ fontSize: 12.5 }}>{t('case.noteHint')}</span>
              </div>
              <div className="row end" style={{ marginTop: 12 }}>
                <button type="submit" className="btn" disabled={busy || note.trim().length === 0}>{t('case.saveNote')}</button>
              </div>
            </form>
          </div>
        </div>

        <div>
          <div className="card">
            <h2 style={{ marginBottom: 12 }}>{t('case.tasks')}</h2>
            {openTasks.length === 0 ? (
              <p className="empty">{t('case.noTasks')}</p>
            ) : (
              <ul className="task-list">
                {openTasks.map((task) => (
                  <li key={task.id}>
                    <b style={{ color: 'var(--title)' }}>{labelFor(t, 'task', task.taskType)}</b>
                    <div className="muted" style={{ fontSize: 12.5 }}>
                      {t('case.due')} {fmtDate(task.dueAt, locale, true)}
                      {task.dueAt && new Date(task.dueAt).getTime() < Date.now() && <span className="chip red" style={{ marginLeft: 8 }}>{t('queue.overdue.yes')}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {detail.status === 'Open' && (
            <div className="card">
              <p style={{ marginTop: 0 }}>{t('case.startHint')}</p>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => run(() => startScheduling(id), t('case.startDone'))}>
                {t('case.start')}
              </button>
            </div>
          )}

          {detail.status === 'Outcome pending' && !askMoreDonors && (
            <div className="card">
              <h2 style={{ marginBottom: 8 }}>{t('case.fulfilment')}</h2>
              <p className="muted" style={{ marginTop: 0 }}>{t('case.fulfilmentHint')}</p>
              <button type="button" className="btn btn-primary" disabled={busy || detail.disputed} onClick={() => run(() => setFulfilment(id), t('case.fulfilmentDone'))}>
                {t('case.setFulfilment')}
              </button>
            </div>
          )}

          {askMoreDonors && (
            <div className="card">
              <h2 style={{ marginBottom: 8 }}>{t('case.moreDonors')}</h2>
              <p className="muted" style={{ marginTop: 0 }}>{t('case.moreDonorsHint')}</p>
              <div className="row">
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => run(() => answerMoreDonors(id, true), t('case.moreDonorsYes'))}>
                  {t('case.moreDonorsNeeded')}
                </button>
                <button type="button" className="btn" disabled={busy} onClick={() => run(() => answerMoreDonors(id, false), t('case.moreDonorsNo'))}>
                  {t('case.moreDonorsNotNeeded')}
                </button>
              </div>
            </div>
          )}

          {detail.status === 'Resolved' && (
            <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); run(() => closeCase(id, closeNote.trim()), t('case.closed')); }}>
              <h2 style={{ marginBottom: 8 }}>{t('case.close')}</h2>
              <div className="field">
                <label htmlFor="close-note">{t('case.closeNote')}</label>
                <textarea id="close-note" className="input" rows={3} maxLength={1000} value={closeNote} onChange={(e) => setCloseNote(e.target.value)} />
              </div>
              <div className="row end" style={{ marginTop: 12 }}>
                <button type="submit" className="btn btn-primary" disabled={busy || detail.disputed || closeNote.trim().length < 3}>{t('case.closeAction')}</button>
              </div>
            </form>
          )}

          {!ended && (
            <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); run(() => declareUnable(detail.requestId, unableReason.trim()), t('case.unableDone')); }}>
              <h2 style={{ marginBottom: 8 }}>{t('case.unable')}</h2>
              <p className="muted" style={{ marginTop: 0 }}>{t('case.unableHint')}</p>
              <div className="field">
                <label htmlFor="unable-reason">{t('case.unableReason')}</label>
                <textarea id="unable-reason" className="input" rows={3} maxLength={500} value={unableReason} onChange={(e) => setUnableReason(e.target.value)} />
              </div>
              <div className="row end" style={{ marginTop: 12 }}>
                <button type="submit" className="btn" disabled={busy || unableReason.trim().length < 5}>{t('case.unableAction')}</button>
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
