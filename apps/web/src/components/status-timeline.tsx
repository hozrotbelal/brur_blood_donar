'use client';

import { fmtDate, labelFor } from '@/lib/format';
import { hasMessage, type MessageKey } from '@/lib/messages';
import type { TimelineEntry } from '@/lib/public-data';
import { useLocale } from './locale-provider';

/** Newest first. Staff appear by role only, never by name. */
export function StatusTimeline({ entries }: { entries: TimelineEntry[] }) {
  const { t, locale } = useLocale();
  const ordered = [...entries].reverse();
  return (
    <div className="card status-timeline">
      <h2>{t('requests.timeline')}</h2>
      {ordered.length === 0 ? (
        <p className="empty">{t('requests.timelineEmpty')}</p>
      ) : (
        <ol className="timeline">
          {ordered.map((entry, index) => (
            <li key={`${entry.at}-${index}`} className={index === 0 ? 'latest' : ''}>
              <b>{labelFor(t, 'status', entry.to)}</b>
              <small>
                {fmtDate(entry.at, locale, true)} · {labelFor(t, 'actor', entry.actorRole)}
              </small>
              {entry.missingItems && entry.missingItems.length > 0 && (
                <small>{entry.missingItems.map((item) => (hasMessage(`missing.${item}`) ? t(`missing.${item}` as MessageKey) : item)).join(', ')}</small>
              )}
            </li>
          ))}
        </ol>
      )}
      <p className="muted small-note">{t('timeline.staffByRole')}</p>
    </div>
  );
}
