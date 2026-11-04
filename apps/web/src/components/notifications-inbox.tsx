'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import { fetchNotifications, markAllNotificationsRead, markNotificationRead, type NotificationItem } from '@/lib/public-data';
import { useLocale } from './locale-provider';

type Category = NotificationItem['category'];
type View = 'date' | 'type';

const CATEGORY_ORDER: Category[] = ['INVITATIONS', 'REQUEST_UPDATES', 'REMINDERS', 'SUPPORT', 'COMMUNITY', 'CAMPAIGNS', 'SYSTEM'];

export function NotificationsInbox() {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [rows, setRows] = useState<NotificationItem[] | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<View>('type');

  const load = () =>
    fetchNotifications()
      .then(setRows)
      .catch((caught: unknown) => {
        if (caught instanceof ApiError && caught.status === 401) router.replace('/sign-in');
        else setError(true);
      });

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markOne = async (id: string) => {
    setBusy(true);
    try {
      await markNotificationRead(id);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const markAll = async () => {
    setBusy(true);
    try {
      await markAllNotificationsRead();
      await load();
    } finally {
      setBusy(false);
    }
  };

  const unread = (rows ?? []).filter((item) => !item.read).length;
  const groups = CATEGORY_ORDER.map((category) => ({ category, items: (rows ?? []).filter((item) => item.category === category) })).filter((group) => group.items.length > 0);

  const list = (items: NotificationItem[]) => (
    <ul className="invite-list">
      {items.map((item) => (
        <li key={item.id} className={`invite-item${item.read ? '' : ' unread'}`}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <b style={{ color: 'var(--title)' }}>
                {!item.read && <span className="dot" aria-hidden="true" />}
                {!item.read && <span className="sr-only">{t('notifications.unreadPrefix')} </span>}
                {item.title ?? t('notifications.untitled')}
              </b>
              {item.critical && <span className="chip red" style={{ marginLeft: 8 }}>{t('notifications.urgent')}</span>}
              <div className="muted" style={{ fontSize: 14, marginTop: 4 }}>
                {item.body}
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                {fmtDate(item.createdAt, locale, true)}
                {view === 'date' && ` · ${t(`notifications.category.${item.category}`)}`}
              </div>
            </div>
            <div className="row">
              {item.requestId && (
                <Link href={`/requests/${item.requestId}`} className="btn btn-small">
                  {t('notifications.open')}
                </Link>
              )}
              {!item.read && (
                <button type="button" className="btn btn-small" disabled={busy} onClick={() => markOne(item.id)}>
                  {t('notifications.markRead')}
                </button>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>{t('notifications.title')}</h1>
          <p>{t('notifications.intro')}</p>
        </div>
      </div>

      {error && <p role="alert" className="alert err">{t('error.loadFailed')}</p>}
      {rows && rows.length > 0 && (
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div className="row" style={{ alignItems: 'center', gap: 12 }}>
            <b role="status">{t('notifications.unreadCount', { count: String(unread) })}</b>
            {unread > 0 && (
              <button type="button" className="btn btn-small" disabled={busy} onClick={markAll}>
                {t('notifications.markAll')}
              </button>
            )}
          </div>
          <div className="row" role="group" aria-label={t('notifications.viewBy')} style={{ gap: 8 }}>
            {(['date', 'type'] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={`btn btn-small${view === option ? ' btn-primary' : ''}`}
                aria-pressed={view === option}
                onClick={() => setView(option)}
              >
                {t(option === 'date' ? 'notifications.viewDate' : 'notifications.viewType')}
              </button>
            ))}
          </div>
        </div>
      )}
      {rows === null && !error ? (
        <div className="card">
          <p role="status">{t('queue.loading')}</p>
        </div>
      ) : rows && rows.length === 0 ? (
        <div className="card">
          <p className="empty">{t('notifications.empty')}</p>
        </div>
      ) : rows && view === 'date' ? (
        <div className="card">{list(rows)}</div>
      ) : rows ? (
        groups.map((group) => (
          <section key={group.category} className="card" style={{ marginBottom: 16 }} aria-labelledby={`ntf-${group.category}`}>
            <h2 id={`ntf-${group.category}`} style={{ marginTop: 0 }}>
              {t(`notifications.category.${group.category}`)} ({group.items.length})
            </h2>
            {list(group.items)}
          </section>
        ))
      ) : null}
    </section>
  );
}
