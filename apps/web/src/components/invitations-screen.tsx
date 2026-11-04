'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { hasMessage, type MessageKey } from '@/lib/messages';
import { createInvitation, fetchAreas, fetchInvitations, revokeInvitation, type AreaPage, type InvitationRow, type InviteBody } from '@/lib/staff-data';
import { useLocale } from './locale-provider';

type InviteRole = InviteBody['roleCode'];

const TIERS: Record<InviteRole, string[]> = {
  SUP: ['TIER_SUPPORT_AGENT', 'TIER_SUPPORT_LEAD'],
  MOD: ['TIER_MODERATOR', 'TIER_MODERATION_LEAD'],
  ADM: ['TIER_ADMINISTRATOR', 'TIER_PRIMARY_ADMINISTRATOR'],
};
const ROLE_LABEL: Record<InviteRole, MessageKey> = { SUP: 'role.SUP', MOD: 'role.MOD', ADM: 'role.ADM' };
const INVITE_DAYS = 7;

export function InvitationsScreen() {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [rows, setRows] = useState<InvitationRow[] | null>(null);
  const [areas, setAreas] = useState<AreaPage['items']>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<InviteRole>('SUP');
  const [tier, setTier] = useState(TIERS.SUP[0]);
  const [areaIds, setAreaIds] = useState<string[]>([]);

  const errorText = useCallback(
    (caught: unknown) => {
      const code = caught instanceof ApiError ? caught.code : '';
      const key = `error.${code}`;
      return hasMessage(key) ? t(key) : t('error.generic');
    },
    [t],
  );

  const load = useCallback(async () => {
    try {
      setRows(await fetchInvitations());
      setLoadError(null);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        router.replace('/sign-in');
        return;
      }
      setLoadError(errorText(caught));
    }
  }, [router, errorText]);

  useEffect(() => {
    load();
    fetchAreas()
      .then((page) => setAreas(page.items))
      .catch(() => setAreas([]));
  }, [load]);

  const chooseRole = (next: InviteRole) => {
    setRole(next);
    setTier(TIERS[next][0]);
    if (next !== 'SUP') setAreaIds([]);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      await createInvitation({ phone, roleCode: role, tierCode: tier, areaIds });
      setNotice({ tone: 'ok', text: t('invite.sent', { days: String(INVITE_DAYS) }) });
      setPhone('');
      await load();
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        router.replace('/sign-in');
        return;
      }
      setNotice({ tone: 'err', text: errorText(caught) });
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    setBusy(true);
    setNotice(null);
    try {
      await revokeInvitation(id);
      setNotice({ tone: 'ok', text: t('invite.revoked') });
      await load();
    } catch (caught) {
      setNotice({ tone: 'err', text: errorText(caught) });
    } finally {
      setBusy(false);
    }
  };

  const date = (value: string) =>
    new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

  if (loadError) return <p role="alert" className="alert err">{loadError}</p>;

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>{t('invite.title')}</h1>
          <p>{t('invite.intro')}</p>
        </div>
      </div>

      {notice && <p role={notice.tone === 'err' ? 'alert' : 'status'} className={`alert ${notice.tone === 'err' ? 'err' : 'ok'}`}>{notice.text}</p>}

      <form className="card" onSubmit={submit} noValidate>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="inv-phone">{t('invite.phone')}</label>
            <input id="inv-phone" className="input" inputMode="tel" autoComplete="off" placeholder="01712345678" value={phone} onChange={(event) => setPhone(event.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="inv-role">{t('invite.role')}</label>
            <select id="inv-role" className="input" value={role} onChange={(event) => chooseRole(event.target.value as InviteRole)}>
              {(Object.keys(TIERS) as InviteRole[]).map((item) => (
                <option key={item} value={item}>
                  {t(ROLE_LABEL[item])}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="inv-tier">{t('invite.tier')}</label>
            <select id="inv-tier" className="input" value={tier} onChange={(event) => setTier(event.target.value)}>
              {TIERS[role].map((code) => (
                <option key={code} value={code}>
                  {t(`tier.${code}` as MessageKey)}
                </option>
              ))}
            </select>
          </div>
          {role === 'SUP' && (
            <div className="field">
              <label htmlFor="inv-areas">{t('invite.areas')}</label>
              <select
                id="inv-areas"
                className="input"
                multiple
                size={5}
                value={areaIds}
                onChange={(event) => setAreaIds(Array.from(event.target.selectedOptions, (option) => option.value))}
              >
                {areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {locale === 'bn' ? area.nameBn : area.nameEn}
                  </option>
                ))}
              </select>
              <span className="muted" style={{ fontSize: 12.5 }}>{t('invite.areasHint')}</span>
            </div>
          )}
        </div>
        <div className="row end" style={{ marginTop: 16 }}>
          <button type="submit" className="btn btn-primary" disabled={busy || phone.trim().length === 0}>
            {t('invite.submit')}
          </button>
        </div>
      </form>

      <div className="card">
        <h2 style={{ marginBottom: 12 }}>{t('nav.adm.team.invitations')}</h2>
        {rows === null ? (
          <p role="status">{t('queue.loading')}</p>
        ) : rows.length === 0 ? (
          <p className="empty">{t('invite.empty')}</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">{t('invite.col.phone')}</th>
                  <th scope="col">{t('invite.col.role')}</th>
                  <th scope="col">{t('invite.col.tier')}</th>
                  <th scope="col">{t('invite.col.areas')}</th>
                  <th scope="col">{t('invite.col.expires')}</th>
                  <th scope="col">{t('invite.col.status')}</th>
                  <th scope="col">{t('invite.col.action')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>•••• {row.phoneLast4}</td>
                    <td>{hasMessage(`role.${row.roleCode}`) ? t(`role.${row.roleCode}` as MessageKey) : row.roleCode}</td>
                    <td>{row.tierCode && hasMessage(`tier.${row.tierCode}`) ? t(`tier.${row.tierCode}` as MessageKey) : row.tierCode ?? '—'}</td>
                    <td>{row.areaIds.length}</td>
                    <td>{date(row.expiresAt)}</td>
                    <td>
                      <span className="chip">{hasMessage(`invite.status.${row.status}`) ? t(`invite.status.${row.status}` as MessageKey) : row.status}</span>
                    </td>
                    <td>
                      {row.status === 'Pending' && (
                        <button type="button" className="btn btn-small" disabled={busy} onClick={() => revoke(row.id)}>
                          {t('invite.revoke')}
                        </button>
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
