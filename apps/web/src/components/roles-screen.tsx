'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { labelFor } from '@/lib/format';
import type { MessageKey } from '@/lib/messages';
import { fetchPermissionSets, type PermissionSetView } from '@/lib/staff-data';
import { useLocale } from './locale-provider';

const ROLE_ORDER = ['SUP', 'MOD', 'ADM', 'DON', 'PAT'];

export function RolesScreen() {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [sets, setSets] = useState<PermissionSetView[] | null>(null);
  const [error, setError] = useState(false);
  const [openCode, setOpenCode] = useState<string | null>(null);

  useEffect(() => {
    fetchPermissionSets()
      .then(setSets)
      .catch((caught: unknown) => {
        if (caught instanceof ApiError && caught.status === 401) router.replace('/sign-in');
        else setError(true);
      });
  }, [router]);

  const name = (set: PermissionSetView) => (locale === 'bn' ? set.nameBn : set.nameEn);

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>{t('roles.title')}</h1>
          <p>{t('roles.intro')}</p>
        </div>
      </div>
      {error && <p role="alert" className="alert err">{t('error.loadFailed')}</p>}
      {sets === null && !error && <p role="status">{t('queue.loading')}</p>}
      {sets &&
        ROLE_ORDER.filter((role) => sets.some((s) => s.roleCode === role)).map((role) => (
          <div key={role} className="card">
            <h2 style={{ marginBottom: 12 }}>{t(`role.${role}` as MessageKey)}</h2>
            <ul className="task-list">
              {sets
                .filter((s) => s.roleCode === role)
                .map((set) => (
                  <li key={set.code}>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <div>
                        <b style={{ color: 'var(--title)' }}>{name(set)}</b>
                        <span className="chip" style={{ marginLeft: 8 }}>{labelFor(t, 'setKind', set.kind)}</span>
                        <div className="muted" style={{ fontSize: 12.5 }}>{t('roles.keyCount', { count: String(set.items.length) })}</div>
                      </div>
                      <button type="button" className="btn btn-small" aria-expanded={openCode === set.code} onClick={() => setOpenCode(openCode === set.code ? null : set.code)}>
                        {t(openCode === set.code ? 'roles.hide' : 'roles.show')}
                      </button>
                    </div>
                    {openCode === set.code && (
                      <div className="table-wrap" style={{ marginTop: 12 }}>
                        <table className="data">
                          <thead>
                            <tr>
                              <th scope="col">{t('roles.col.permission')}</th>
                              <th scope="col">{t('roles.col.scope')}</th>
                              <th scope="col">{t('roles.col.controls')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {set.items.map((item) => (
                              <tr key={item.key}>
                                <td>
                                  {locale === 'bn' ? item.descriptionBn : item.descriptionEn}
                                  <div className="muted mono" style={{ fontSize: 12 }}>{item.key}</div>
                                </td>
                                <td>{labelFor(t, 'scope', item.scope)}</td>
                                <td>
                                  <div className="row" style={{ gap: 6 }}>
                                    {item.sensitive && <span className="chip amb">{t('roles.sensitive')}</span>}
                                    {item.requiresStepUp && <span className="chip blu">{t('roles.stepUp')}</span>}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </li>
                ))}
            </ul>
          </div>
        ))}
      <p className="muted" style={{ fontSize: 12.5 }}>{t('roles.note')}</p>
    </section>
  );
}
