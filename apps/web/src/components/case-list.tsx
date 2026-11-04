'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { fmtDate, labelFor } from '@/lib/format';
import { fetchCases, type CaseListItem } from '@/lib/staff-api';
import { useLocale } from './locale-provider';

export type CaseView = 'cases' | 'outcomes';

const OUTCOME_STATUSES = ['Attendance pending', 'Outcome pending'];
const priorityTone = (value: string) => (value === 'Critical' ? 'red' : value === 'High' ? 'amb' : 'blu');

export function CaseList({ view }: { view: CaseView }) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [rows, setRows] = useState<CaseListItem[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetchCases()
      .then(setRows)
      .catch((caught: unknown) => {
        if (caught instanceof ApiError && caught.status === 401) router.replace('/sign-in');
        else setError(true);
      });
  }, [router]);

  const shown = (rows ?? []).filter((item) => view === 'cases' || OUTCOME_STATUSES.includes(item.status));

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>{t(view === 'cases' ? 'cases.title' : 'cases.outcomesTitle')}</h1>
          <p>{t(view === 'cases' ? 'cases.intro' : 'cases.outcomesIntro')}</p>
        </div>
      </div>
      {error && <p role="alert" className="alert err">{t('error.loadFailed')}</p>}
      <div className="card">
        {rows === null && !error ? (
          <p role="status">{t('queue.loading')}</p>
        ) : shown.length === 0 ? (
          <p className="empty">{t('cases.empty')}</p>
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
                  <th scope="col">
                    <span className="sr-only">{t('queue.open')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <b>{item.caseNo}</b>
                    </td>
                    <td>{item.requestReference ?? '—'}</td>
                    <td>
                      <span className={`chip ${priorityTone(item.priority)}`}>{labelFor(t, 'value', item.priority)}</span>
                    </td>
                    <td>
                      <span className="chip">{labelFor(t, 'status', item.status)}</span>
                    </td>
                    <td>{fmtDate(item.openedAt, locale, true)}</td>
                    <td>{item.overdue ? <span className="chip red">{t('queue.overdue.yes')}</span> : t('queue.overdue.no')}</td>
                    <td>
                      <Link href={`/cases/${item.id}`} className="btn btn-small">
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
    </section>
  );
}
