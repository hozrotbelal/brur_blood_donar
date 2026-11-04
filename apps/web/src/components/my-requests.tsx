'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { labelFor, toneOfStatus } from '@/lib/format';
import { fetchRequests, type RequestView } from '@/lib/public-data';
import { isUnauthenticated, outcomeTone, urgencyTone } from '@/lib/request-ui';
import { useLocale } from './locale-provider';

export function MyRequests() {
  const { t } = useLocale();
  const router = useRouter();
  const [rows, setRows] = useState<RequestView[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetchRequests()
      .then((items) => setRows(items.filter((item) => item.status !== 'Draft')))
      .catch((caught: unknown) => {
        if (isUnauthenticated(caught)) router.replace('/sign-in');
        else setError(true);
      });
  }, [router]);

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>{t('requests.title')}</h1>
          <p>{t('requests.intro')}</p>
        </div>
      </div>

      {error && (
        <p role="alert" className="alert err">
          {t('error.loadFailed')}
        </p>
      )}

      <div className="card flush">
        <div className="card-head">
          <h2>{t('requests.listTitle')}</h2>
          <Link href="/requests/new" className="btn btn-primary">
            {t('nav.pat.myreq.new')}
          </Link>
        </div>
        {rows === null && !error ? (
          <p role="status" className="empty">
            {t('queue.loading')}
          </p>
        ) : rows && rows.length === 0 ? (
          <p className="empty">{t('requests.empty')}</p>
        ) : rows ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">{t('requests.col.request')}</th>
                  <th scope="col">{t('requests.col.patientRef')}</th>
                  <th scope="col">{t('form.bloodGroup')}</th>
                  <th scope="col">{t('requests.col.urgency')}</th>
                  <th scope="col">{t('requests.col.status')}</th>
                  <th scope="col">{t('requests.col.outcome')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item.id} className="clickable" onClick={() => router.push(`/requests/${item.id}`)}>
                    <td>
                      <Link href={`/requests/${item.id}`} className="mono row-link">
                        {item.referenceNo ?? t('home.draft')}
                      </Link>
                    </td>
                    <td>{item.patientRef ?? item.patientName}</td>
                    <td>{item.requestedBloodGroup}</td>
                    <td>
                      <span className={`chip ${urgencyTone(item.urgency)}`}>{labelFor(t, 'value', item.urgency)}</span>
                    </td>
                    <td>
                      <span className={`chip ${toneOfStatus(item.status) || 'gry'}`}>{labelFor(t, 'status', item.status)}</span>
                    </td>
                    <td>
                      {item.outcomeConfidence ? (
                        <span className={`chip ${outcomeTone(item.outcomeConfidence)}`}>{labelFor(t, 'confidence', item.outcomeConfidence)}</span>
                      ) : (
                        <span className="chip gry">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </section>
  );
}
