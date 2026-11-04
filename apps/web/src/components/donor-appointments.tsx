'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { fmtDate, labelFor, toneOfStatus } from '@/lib/format';
import { fetchAppointments, type DonorAppointment } from '@/lib/public-data';
import { useLocale } from './locale-provider';

export function DonorAppointments() {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [rows, setRows] = useState<DonorAppointment[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetchAppointments()
      .then(setRows)
      .catch((caught: unknown) => {
        if (caught instanceof ApiError && caught.status === 401) router.replace('/sign-in');
        else setError(true);
      });
  }, [router]);

  const now = Date.now();
  const upcoming = (rows ?? []).filter((item) => new Date(item.scheduledStart).getTime() >= now);
  const past = (rows ?? []).filter((item) => new Date(item.scheduledStart).getTime() < now);

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>{t('appointments.title')}</h1>
          <p>{t('appointments.intro')}</p>
        </div>
      </div>

      {error && <p role="alert" className="alert err">{t('error.loadFailed')}</p>}
      {rows === null && !error ? <p role="status">{t('queue.loading')}</p> : null}

      {rows && (
        <>
          <AppointmentList title={t('appointments.upcoming')} items={upcoming} locale={locale} t={t} empty={t('appointments.noUpcoming')} />
          <AppointmentList title={t('appointments.past')} items={past} locale={locale} t={t} empty={t('appointments.noPast')} />
        </>
      )}
    </section>
  );
}

function AppointmentList({
  title,
  items,
  locale,
  t,
  empty,
}: {
  title: string;
  items: DonorAppointment[];
  locale: 'en' | 'bn';
  t: Parameters<typeof labelFor>[0];
  empty: string;
}) {
  return (
    <div className="card">
      <h2 style={{ marginBottom: 12 }}>{title}</h2>
      {items.length === 0 ? (
        <p className="empty">{empty}</p>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th scope="col">{t('appointments.col.when')}</th>
                <th scope="col">{t('appointments.col.facility')}</th>
                <th scope="col">{t('appointments.col.status')}</th>
                <th scope="col">
                  <span className="sr-only">{t('appointments.col.directions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <b>{fmtDate(item.scheduledStart, locale, true)}</b>
                  </td>
                  <td>
                    {item.facility.name}
                    {item.facility.phone && <div className="muted" style={{ fontSize: 13 }}>{item.facility.phone}</div>}
                  </td>
                  <td>
                    <span className={`chip ${toneOfStatus(item.status)}`}>{labelFor(t, 'appt', item.status)}</span>
                  </td>
                  <td>
                    {item.facility.directionsUrl && (
                      <a href={item.facility.directionsUrl} target="_blank" rel="noreferrer" className="btn btn-small">
                        {t('appointments.directions')}
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
