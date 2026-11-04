'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, currentRole, type AppRole } from '@/lib/api';
import { hasMessage, type MessageKey } from '@/lib/messages';
import { fmtDate, labelFor } from '@/lib/format';
import {
  fetchAreas,
  fetchDonorProfile,
  fetchPatients,
  saveDonorProfile,
  type AreaPage,
  type DonorProfile,
  type PatientItem,
  type SaveDonorProfileBody,
} from '@/lib/public-data';
import { useLocale } from './locale-provider';

const BLOOD_GROUPS: SaveDonorProfileBody['bloodGroup'][] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export function ProfileScreen() {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [role, setRole] = useState<AppRole | null>(null);

  useEffect(() => {
    setRole(currentRole());
  }, []);

  if (!role) return <p role="status">{t('queue.loading')}</p>;
  return role === 'DON' ? <DonorProfileForm /> : <PatientProfile onAuthError={() => router.replace('/sign-in')} />;
}

function DonorProfileForm() {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [profile, setProfile] = useState<DonorProfile | null>(null);
  const [areas, setAreas] = useState<AreaPage['items']>([]);
  const [error, setError] = useState<MessageKey | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [bloodGroup, setBloodGroup] = useState<SaveDonorProfileBody['bloodGroup']>('B+');
  const [areaId, setAreaId] = useState('');
  const [radius, setRadius] = useState('10');
  const [lastDonation, setLastDonation] = useState('');

  useEffect(() => {
    fetchDonorProfile()
      .then((item) => {
        setProfile(item);
        if (item.bloodGroup) setBloodGroup(item.bloodGroup as SaveDonorProfileBody['bloodGroup']);
        setAreaId(item.areaId ?? '');
        setRadius(String(item.travelRadiusKm));
        setLastDonation(item.lastDonationDate ?? '');
      })
      .catch((caught: unknown) => {
        if (caught instanceof ApiError && caught.status === 401) router.replace('/sign-in');
        else if (caught instanceof ApiError && caught.status === 404) setError(null);
        else setError('error.loadFailed');
      });
    fetchAreas()
      .then((page) => setAreas(page.items))
      .catch(() => setAreas([]));
  }, [router]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const saved = await saveDonorProfile({
        bloodGroup,
        areaId: areaId || undefined,
        travelRadiusKm: Number(radius) || undefined,
        lastDonationDate: lastDonation || undefined,
      });
      setProfile(saved);
      setNotice({ tone: 'ok', text: t('profile.saved') });
    } catch (caught) {
      const code = caught instanceof ApiError ? caught.code : '';
      const key = `error.${code}`;
      setNotice({ tone: 'err', text: hasMessage(key) ? t(key) : t('error.generic') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>{t('profile.title')}</h1>
          <p>{t('profile.donorIntro')}</p>
        </div>
      </div>

      {error && <p role="alert" className="alert err">{t(error)}</p>}
      {notice && <p role={notice.tone === 'err' ? 'alert' : 'status'} className={`alert ${notice.tone === 'err' ? 'err' : 'ok'}`}>{notice.text}</p>}

      {(
        <div className="grid-main">
          <form className="card stack-form" onSubmit={save} noValidate>
            <h2>{t('profile.donorDetails')}</h2>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="pf-bg">{t('detail.group')}</label>
                <select id="pf-bg" className="input" value={bloodGroup} onChange={(event) => setBloodGroup(event.target.value as SaveDonorProfileBody['bloodGroup'])}>
                  {BLOOD_GROUPS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="pf-area">{t('detail.area')}</label>
                <select id="pf-area" className="input" value={areaId} onChange={(event) => setAreaId(event.target.value)}>
                  <option value="">—</option>
                  {areas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {locale === 'bn' ? area.nameBn : area.nameEn}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="pf-radius">{t('profile.travelRadius')}</label>
                <input id="pf-radius" className="input" type="number" min={1} max={100} value={radius} onChange={(event) => setRadius(event.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="pf-last">{t('profile.lastDonation')}</label>
                <input id="pf-last" className="input" type="date" value={lastDonation} onChange={(event) => setLastDonation(event.target.value)} />
              </div>
            </div>
            <div className="row end">
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? t('action.working') : t('profile.save')}
              </button>
            </div>
          </form>

          {profile && (
          <div className="card">
            <h2 style={{ marginBottom: 12 }}>{t('profile.donorSummary')}</h2>
            <dl className="facts">
              <dt>{t('profile.donorCode')}</dt>
              <dd>{profile.donorCode}</dd>
              <dt>{t('profile.bloodGroupStatus')}</dt>
              <dd>{labelFor(t, 'verify', profile.bloodGroupStatus)}</dd>
              <dt>{t('profile.nextContact')}</dt>
              <dd>{fmtDate(profile.provisionalNextContactDate, locale)}</dd>
            </dl>
            <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>{t('profile.nextContactNote')}</p>
          </div>
          )}
        </div>
      )}
    </section>
  );
}

function PatientProfile({ onAuthError }: { onAuthError: () => void }) {
  const { t } = useLocale();
  const [patients, setPatients] = useState<PatientItem[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetchPatients()
      .then(setPatients)
      .catch((caught: unknown) => {
        if (caught instanceof ApiError && caught.status === 401) onAuthError();
        else setError(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>{t('profile.title')}</h1>
          <p>{t('profile.patientIntro')}</p>
        </div>
      </div>
      {error && <p role="alert" className="alert err">{t('error.loadFailed')}</p>}
      <div className="card">
        <h2 style={{ marginBottom: 12 }}>{t('profile.patients')}</h2>
        {patients === null && !error ? (
          <p role="status">{t('queue.loading')}</p>
        ) : patients && patients.length === 0 ? (
          <p className="empty">{t('profile.noPatients')}</p>
        ) : patients ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">{t('profile.col.name')}</th>
                  <th scope="col">{t('profile.col.relationship')}</th>
                </tr>
              </thead>
              <tbody>
                {patients.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <b>{item.displayName}</b>
                    </td>
                    <td>{labelFor(t, 'relationship', item.relationship)}</td>
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
