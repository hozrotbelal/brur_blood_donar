'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { labelFor, toneOfStatus } from '@/lib/format';
import type { MessageKey } from '@/lib/messages';
import { fetchProgress, fetchTimeline, reportUrgentProblem, type RequestProgress, type RequestView, type TimelineEntry } from '@/lib/public-data';
import { errorKey, facilityLabel, isUnauthenticated } from '@/lib/request-ui';
import { useLocale } from './locale-provider';
import { RequestMilestones } from './request-milestones';
import { StatusTimeline } from './status-timeline';

const URGENT_ALLOWED = ['Submitted', 'Under review', 'Needs information', 'Verified', 'Searching', 'Donor coordination', 'Awaiting outcome'];
const UPDATABLE = ['Draft', 'Submitted', 'Under review', 'Needs information', 'Verified', 'Searching', 'Donor coordination'];

export function requestTitle(request: RequestView, t: (key: MessageKey) => string, locale: 'en' | 'bn'): string {
  const parts = [
    `${request.requestedBloodGroup} ${labelFor(t, 'comp', request.component).toLowerCase()}`,
    t('units.count').replace('{count}', String(request.quantityUnits)),
  ];
  const hospital = facilityLabel(request.hospital, locale);
  if (hospital) parts.push(hospital);
  return parts.join(' · ');
}

/** Progress card plus timeline for one request: four milestones, aggregate search counts only, and the patient's actions. */
export function RequestProgressPanel({ request, onChanged }: { request: RequestView; onChanged: (next: RequestView) => void }) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [progress, setProgress] = useState<RequestProgress | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'err'; key: MessageKey } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    Promise.all([fetchProgress(request.id), fetchTimeline(request.id)])
      .then(([counts, entries]) => {
        setProgress(counts);
        setTimeline(entries);
      })
      .catch((caught: unknown) => {
        if (isUnauthenticated(caught)) router.replace('/sign-in');
      });
  }, [request.id, router]);

  useEffect(() => {
    load();
  }, [load, request.version]);

  const urgent = async () => {
    if (!window.confirm(t('progress.urgentConfirm'))) return;
    setBusy(true);
    setNotice(null);
    try {
      onChanged(await reportUrgentProblem(request.id));
      setNotice({ tone: 'ok', key: 'progress.urgentSent' });
    } catch (caught) {
      if (isUnauthenticated(caught)) router.replace('/sign-in');
      else setNotice({ tone: 'err', key: errorKey(caught) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="split">
      <div className="card">
        <div className="card-title-row">
          <div>
            <span className="mono muted">{request.referenceNo ?? t('home.draft')}</span>
            <h2>{requestTitle(request, t, locale)}</h2>
          </div>
          <span className={`chip ${toneOfStatus(request.status)}`}>{labelFor(t, 'status', request.status)}</span>
        </div>

        <RequestMilestones request={request} />

        {progress && request.status !== 'Draft' && (
          <div className="counts" aria-label={t('progress.countsLabel')}>
            <span>
              {t('progress.contacted')}: <b>{progress.contacted}</b>
            </span>
            <span>
              {t('progress.responded')}: <b>{progress.responded}</b>
            </span>
            <span>
              {t('progress.willing')}: <b>{progress.willing}</b>
            </span>
            <span>
              {t('progress.wave')}: <b>{progress.searchWave}</b>
            </span>
          </div>
        )}

        {notice && (
          <p role={notice.tone === 'err' ? 'alert' : 'status'} className={`alert ${notice.tone}`}>
            {t(notice.key)}
          </p>
        )}

        <div className="row actions">
          {URGENT_ALLOWED.includes(request.status) && (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={urgent}>
              {t('progress.urgent')}
            </button>
          )}
          <Link href="/planned?screen=nav.pat.support.chat" className="btn">
            {t('progress.messageSupport')}
          </Link>
          {UPDATABLE.includes(request.status) && (
            <Link href={`/requests/update?id=${request.id}`} className="btn">
              {t('progress.requestUpdate')}
            </Link>
          )}
          {request.status === 'Draft' && (
            <Link href={`/requests/new?draft=${request.id}`} className="btn">
              {t('drafts.continue')}
            </Link>
          )}
        </div>
      </div>
      <StatusTimeline entries={timeline} />
    </div>
  );
}
