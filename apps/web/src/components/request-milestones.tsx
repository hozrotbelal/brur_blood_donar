'use client';

import type { MessageKey } from '@/lib/messages';
import type { RequestView } from '@/lib/public-data';
import { fmtDate } from '@/lib/format';
import { useLocale } from './locale-provider';

const STEPS: { key: MessageKey; next: MessageKey; field: keyof RequestView['milestones'] }[] = [
  { key: 'milestone.willing', next: 'milestone.next.willing', field: 'donorWillingAt' },
  { key: 'milestone.reported', next: 'milestone.next.reported', field: 'donationReportedAt' },
  { key: 'milestone.outcome', next: 'milestone.next.outcome', field: 'outcomeConfirmedAt' },
  { key: 'milestone.fulfilled', next: 'milestone.next.fulfilled', field: 'fulfilledAt' },
];

const SEARCHING = ['Searching', 'Donor coordination', 'Awaiting outcome', 'Partially fulfilled'];

/** The four patient milestones stay separate; each is marked only when the server has recorded it. */
export function RequestMilestones({ request }: { request: RequestView }) {
  const { t, locale } = useLocale();
  const firstOpen = STEPS.findIndex((step) => !request.milestones[step.field]);
  const active = SEARCHING.includes(request.status);
  return (
    <ol className="milestones" aria-label={t('milestone.heading')}>
      {STEPS.map((step, index) => {
        const at = request.milestones[step.field];
        const current = !at && active && index === firstOpen;
        return (
          <li key={step.key} className={at ? 'reached' : current ? 'current' : ''} aria-current={current ? 'step' : undefined}>
            <span className="milestone-n">{index + 1}</span>
            <b>{t(step.key)}</b>
            <small>{at ? `${t('milestone.reached')} · ${fmtDate(at, locale, true)}` : current ? t(step.next) : t('milestone.notYet')}</small>
          </li>
        );
      })}
    </ol>
  );
}
