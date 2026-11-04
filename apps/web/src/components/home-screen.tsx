'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, currentRole, type AppRole } from '@/lib/api';
import type { MessageKey } from '@/lib/messages';
import { fetchAppointments, fetchInvitations, fetchNotifications, fetchRequests, type DonorAppointment, type InvitationView, type RequestView } from '@/lib/public-data';
import { fmtDate } from '@/lib/format';
import { useLocale } from './locale-provider';
import { RequestProgressPanel } from './request-progress';

const CLOSED = ['Cancelled', 'Rejected', 'Closed', 'Fulfilled', 'Unable to fulfil'];

export function HomeScreen() {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [role, setRole] = useState<AppRole | null>(null);
  const [requests, setRequests] = useState<RequestView[] | null>(null);
  const [invitations, setInvitations] = useState<InvitationView[] | null>(null);
  const [appointments, setAppointments] = useState<DonorAppointment[] | null>(null);
  const [unread, setUnread] = useState<number | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);

  useEffect(() => {
    const current = currentRole();
    setRole(current);
    const onError = (caught: unknown) => {
      if (caught instanceof ApiError && caught.status === 401) router.replace('/sign-in');
      else setError('error.loadFailed');
    };
    if (current === 'PAT') {
      fetchRequests().then(setRequests).catch(onError);
    } else {
      fetchInvitations().then(setInvitations).catch(onError);
      fetchAppointments().then(setAppointments).catch(onError);
    }
    fetchNotifications()
      .then((items) => setUnread(items.filter((item) => !item.read).length))
      .catch(() => setUnread(null));
  }, [router]);

  if (error) return <p role="alert" className="alert err">{t(error)}</p>;
  if (!role) return <p role="status">{t('queue.loading')}</p>;

  const activeRequest =
    requests?.find((item) => !CLOSED.includes(item.status) && item.status !== 'Draft') ??
    requests?.find((item) => !CLOSED.includes(item.status)) ??
    requests?.[0];

  if (role === 'PAT') {
    return (
      <section>
        <div className="page-head">
          <div>
            <h1>{t('home.patient.title')}</h1>
            <p>{t('home.patient.intro')}</p>
          </div>
        </div>
        {requests === null ? (
          <p role="status">{t('queue.loading')}</p>
        ) : activeRequest ? (
          <RequestProgressPanel
            request={activeRequest}
            onChanged={(next) => setRequests((items) => (items ?? []).map((item) => (item.id === next.id ? next : item)))}
          />
        ) : (
          <div className="card empty">
            <p>{t('home.patient.none')}</p>
            <Link href="/requests/new" className="btn btn-primary">
              {t('nav.pat.myreq.new')}
            </Link>
          </div>
        )}
      </section>
    );
  }
  const pendingInvitations = (invitations ?? []).filter((item) => ['Sent', 'Delivered', 'Viewed'].includes(item.status));
  const now = Date.now();
  const nextAppointment = (appointments ?? [])
    .filter((item) => new Date(item.scheduledStart).getTime() > now && item.status !== 'Cancelled')
    .sort((a, b) => new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime())[0];

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>{t('home.donor.title')}</h1>
          <p>{t('home.donor.intro')}</p>
        </div>
      </div>

      <div className="kpis">
        <Link href="/notifications" className="kpi">
          <span>{t('home.unread')}</span>
          <b>{unread ?? '—'}</b>
        </Link>
        <Link href="/invitations" className="kpi">
          <span>{t('home.donor.pending')}</span>
          <b>{invitations ? pendingInvitations.length : '—'}</b>
        </Link>
        <Link href="/appointments" className="kpi">
          <span>{t('home.donor.nextAppointment')}</span>
          <b style={{ fontSize: 16 }}>{nextAppointment ? fmtDate(nextAppointment.scheduledStart, locale, true) : t('home.none')}</b>
        </Link>
      </div>

      {role === 'DON' && (
        <div className="card">
          <h2 style={{ marginBottom: 10 }}>{t('home.donor.latest')}</h2>
          {invitations === null ? (
            <p role="status">{t('queue.loading')}</p>
          ) : invitations.length === 0 ? (
            <p className="empty">{t('home.donor.noInvitations')}</p>
          ) : (
            <p>
              {t('home.donor.latestHint')} <Link href="/invitations">{t('nav.don.requests.invitations')}</Link>
            </p>
          )}
        </div>
      )}
    </section>
  );
}
