'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { hasMessage, type MessageKey } from '@/lib/messages';
import { fmtDate, labelFor, toneOfStatus } from '@/lib/format';
import { fetchRequest, submitRequest, type RequestView } from '@/lib/public-data';
import { facilityLabel } from '@/lib/request-ui';
import { useLocale } from './locale-provider';
import { RequestProgressPanel } from './request-progress';

export function RequestStatus({ id }: { id: string }) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [request, setRequest] = useState<RequestView | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const fail = useCallback(
    (caught: unknown) => {
      if (caught instanceof ApiError && caught.status === 401) {
        router.replace('/sign-in');
        return;
      }
      const code = caught instanceof ApiError ? caught.code : '';
      const key = `error.${code}`;
      setNotice({ tone: 'err', text: hasMessage(key) ? t(key) : t('error.generic') });
    },
    [router, t],
  );

  const load = useCallback(async () => {
    try {
      setRequest(await fetchRequest(id));
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) router.replace('/sign-in');
      else setError('error.loadFailed');
    }
  }, [id, router]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    setBusy(true);
    setNotice(null);
    try {
      await submitRequest(id);
      setNotice({ tone: 'ok', text: t('requests.submitted') });
      await load();
    } catch (caught) {
      fail(caught);
    } finally {
      setBusy(false);
    }
  };

  if (error) return <p role="alert" className="alert err">{t(error)}</p>;
  if (!request) return <p role="status">{t('queue.loading')}</p>;

  return (
    <section>
      <div className="page-head">
        <div>
          <Link href="/requests" className="muted">
            ← {t('requests.title')}
          </Link>
          <h1 style={{ marginTop: 6 }}>{request.referenceNo ?? t('home.draft')}</h1>
          <p>
            {labelFor(t, 'bloodGroup', request.requestedBloodGroup)} · {labelFor(t, 'comp', request.component)} · {request.quantityUnits}
          </p>
        </div>
        <span className={`chip ${toneOfStatus(request.status)}`}>{labelFor(t, 'status', request.status)}</span>
      </div>

      {notice && <p role={notice.tone === 'err' ? 'alert' : 'status'} className={`alert ${notice.tone === 'err' ? 'err' : 'ok'}`}>{notice.text}</p>}

      <RequestProgressPanel request={request} onChanged={setRequest} />

      <div className="card">
        <h2 style={{ marginBottom: 12 }}>{t('requests.details')}</h2>
        <dl className="facts">
          <dt>{t('form.patientRef')}</dt>
          <dd>{request.patientRef ?? request.patientName}</dd>
          <dt>{t('form.hospital')}</dt>
          <dd>{facilityLabel(request.hospital, locale) ?? '—'}</dd>
          <dt>{t('form.collection')}</dt>
          <dd>{facilityLabel(request.collectionDestination, locale) ?? '—'}</dd>
          <dt>{t('requests.col.urgency')}</dt>
          <dd>{labelFor(t, 'value', request.urgency)}</dd>
          <dt>{t('detail.requiredBy')}</dt>
          <dd>{fmtDate(request.requiredBy, locale, true)}</dd>
          <dt>{t('requests.col.submitted')}</dt>
          <dd>{fmtDate(request.milestones.submittedAt, locale, true)}</dd>
          {request.specialInstructions && (
            <>
              <dt>{t('form.instructions')}</dt>
              <dd>{request.specialInstructions}</dd>
            </>
          )}
          {request.cancelReason && (
            <>
              <dt>{t('requests.cancelReason')}</dt>
              <dd>{labelFor(t, 'cancelReason', request.cancelReason)}</dd>
            </>
          )}
        </dl>
        {request.status === 'Draft' && (
          <div className="row end" style={{ marginTop: 16 }}>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={submit}>
              {busy ? t('action.working') : t('requests.submit')}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
