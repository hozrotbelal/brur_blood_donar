'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { hasMessage, type MessageKey } from '@/lib/messages';
import { fetchCases, fetchRequestQueue, type CaseListItem, type ReviewQueueItem } from '@/lib/staff-api';
import { useLocale } from './locale-provider';

interface QueueData {
  requests: ReviewQueueItem[];
  cases: CaseListItem[];
}

const urgencyTone = (value: string) => (value === 'Critical' ? 'red' : value === 'Urgent' ? 'amb' : 'blu');

export function WorkQueue() {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [data, setData] = useState<QueueData | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);

  useEffect(() => {
    Promise.all([fetchRequestQueue(), fetchCases()])
      .then(([requests, cases]) => setData({ requests, cases }))
      .catch((caught: unknown) => {
        if (caught instanceof ApiError && caught.status === 401) {
          router.replace('/sign-in');
          return;
        }
        setError('queue.error');
      });
  }, [router]);

  const label = (prefix: string, value: string) => {
    const key = `${prefix}.${value}`;
    return hasMessage(key) ? t(key) : value;
  };

  const date = (value: string | null, withTime = false) => {
    if (!value) return '—';
    const parsed = new Date(withTime ? value : `${value}T00:00:00`);
    return new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-GB', {
      dateStyle: 'medium',
      timeStyle: withTime ? 'short' : undefined,
    }).format(parsed);
  };

  if (error) return <p role="alert" className="alert err">{t(error)}</p>;
  if (!data) return <p role="status">{t('queue.loading')}</p>;

  const overdue = data.cases.filter((item) => item.overdue).length;

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>{t('queue.title')}</h1>
          <p>{t('queue.intro')}</p>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi on">
          <span>{t('queue.tile.requests')}</span>
          <b>{data.requests.length}</b>
        </div>
        <div className="kpi">
          <span>{t('queue.tile.cases')}</span>
          <b>{data.cases.length}</b>
        </div>
        <div className="kpi">
          <span>{t('queue.tile.overdue')}</span>
          <b style={overdue ? { color: 'var(--red-fg)' } : undefined}>{overdue}</b>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 12 }}>{t('queue.requests.heading')}</h2>
        {data.requests.length === 0 ? (
          <p className="empty">{t('queue.empty')}</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">{t('queue.col.reference')}</th>
                  <th scope="col">{t('queue.col.bloodGroup')}</th>
                  <th scope="col">{t('queue.col.units')}</th>
                  <th scope="col">{t('queue.col.requiredBy')}</th>
                  <th scope="col">{t('queue.col.urgency')}</th>
                  <th scope="col">{t('queue.col.status')}</th>
                  <th scope="col">
                    <span className="sr-only">{t('queue.open')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.requests.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <b>{item.referenceNo}</b>
                    </td>
                    <td>{item.requestedBloodGroup}</td>
                    <td>{item.quantityUnits}</td>
                    <td>{date(item.requiredBy)}</td>
                    <td>
                      <span className={`chip ${urgencyTone(item.urgency)}`}>{label('value', item.urgency)}</span>
                    </td>
                    <td>
                      <span className="chip">{label('status', item.status)}</span>
                    </td>
                    <td>
                      <Link href={`/review/${item.id}`} className="btn btn-small">
                        {t('queue.open')}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 12 }}>{t('queue.cases.heading')}</h2>
        {data.cases.length === 0 ? (
          <p className="empty">{t('queue.empty')}</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">{t('queue.col.case')}</th>
                  <th scope="col">{t('queue.col.reference')}</th>
                  <th scope="col">{t('queue.col.priority')}</th>
                  <th scope="col">{t('queue.col.status')}</th>
                  <th scope="col">{t('queue.col.openedAt')}</th>
                  <th scope="col">{t('queue.col.overdue')}</th>
                </tr>
              </thead>
              <tbody>
                {data.cases.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <b>{item.caseNo}</b>
                    </td>
                    <td>{item.requestReference ?? '—'}</td>
                    <td>{label('value', item.priority)}</td>
                    <td>
                      <span className="chip">{label('status', item.status)}</span>
                    </td>
                    <td>{date(item.openedAt, true)}</td>
                    <td>
                      {item.overdue ? (
                        <span className="chip red">{t('queue.overdue.yes')}</span>
                      ) : (
                        t('queue.overdue.no')
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
