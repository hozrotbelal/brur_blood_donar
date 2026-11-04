'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fmtDate, fmtDayMonth } from '@/lib/format';
import { fetchRequests, type RequestView } from '@/lib/public-data';
import { facilityLabel, isUnauthenticated } from '@/lib/request-ui';
import { useLocale } from './locale-provider';

export function RequestDrafts() {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [rows, setRows] = useState<RequestView[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetchRequests()
      .then((items) => setRows(items.filter((item) => item.status === 'Draft')))
      .catch((caught: unknown) => {
        if (isUnauthenticated(caught)) router.replace('/sign-in');
        else setError(true);
      });
  }, [router]);

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>{t('drafts.title')}</h1>
          <p>{t('drafts.intro')}</p>
        </div>
      </div>

      {error && (
        <p role="alert" className="alert err">
          {t('error.loadFailed')}
        </p>
      )}

      <div className="card flush">
        <div className="card-head">
          <h2>{t('drafts.title')}</h2>
          <Link href="/requests/new" className="btn btn-primary">
            {t('nav.pat.myreq.new')}
          </Link>
        </div>
        {rows === null && !error ? (
          <p role="status" className="empty">
            {t('queue.loading')}
          </p>
        ) : rows && rows.length === 0 ? (
          <p className="empty">{t('drafts.empty')}</p>
        ) : rows ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">{t('drafts.col.draft')}</th>
                  <th scope="col">{t('form.bloodGroup')}</th>
                  <th scope="col">{t('form.hospital')}</th>
                  <th scope="col">{t('drafts.col.saved')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item.id} className="clickable" onClick={() => router.push(`/requests/new?draft=${item.id}`)}>
                    <td>
                      <Link href={`/requests/new?draft=${item.id}`} className="row-link">
                        {t('home.draft')} · {fmtDayMonth(item.createdAt, locale)}
                      </Link>
                    </td>
                    <td>{item.requestedBloodGroup}</td>
                    <td>{facilityLabel(item.hospital, locale) ?? '—'}</td>
                    <td>{fmtDate(item.updatedAt, locale)}</td>
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
