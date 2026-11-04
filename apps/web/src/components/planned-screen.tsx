'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { currentRole, homeFor } from '@/lib/api';
import { hasMessage } from '@/lib/messages';
import { useLocale } from './locale-provider';

export function PlannedScreen({ screenKey }: { screenKey: string }) {
  const { t } = useLocale();
  const title = hasMessage(screenKey) ? t(screenKey) : t('planned.title');
  const [home, setHome] = useState('/queue');
  useEffect(() => {
    const role = currentRole();
    if (role) setHome(homeFor(role));
  }, []);
  return (
    <section>
      <div className="page-head">
        <div>
          <h1>{title}</h1>
          <p>{t('planned.body')}</p>
        </div>
      </div>
      <Link href={home} className="btn">
        {t('planned.back')}
      </Link>
    </section>
  );
}
