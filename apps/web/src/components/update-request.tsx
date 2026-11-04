'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { fmtDate, labelFor } from '@/lib/format';
import type { MessageKey } from '@/lib/messages';
import {
  fetchChanges,
  fetchFacilities,
  fetchRequests,
  updateRequest,
  type Facility,
  type RequestChange,
  type RequestView,
  type UpdateRequestBody,
} from '@/lib/public-data';
import { BLOOD_GROUPS, COMPONENTS, UPDATABLE, URGENCIES, errorKey, isUnauthenticated, toLocalInput } from '@/lib/request-ui';
import { Icon } from './icons';
import { useLocale } from './locale-provider';

type Kind = 'minor' | 'material';

export function UpdateRequest() {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [requests, setRequests] = useState<RequestView[] | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [kind, setKind] = useState<Kind | null>(null);
  const [changes, setChanges] = useState<RequestChange[]>([]);
  const [hospitals, setHospitals] = useState<Facility[]>([]);
  const [collections, setCollections] = useState<Facility[]>([]);
  const [form, setForm] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ tone: 'ok' | 'err' | 'info'; key: MessageKey } | null>(null);
  const [busy, setBusy] = useState(false);

  const fail = (caught: unknown) => {
    if (isUnauthenticated(caught)) router.replace('/sign-in');
    else setNotice({ tone: 'err', key: errorKey(caught) });
  };

  const load = () =>
    fetchRequests()
      .then((items) => {
        const open = items.filter((item) => UPDATABLE.includes(item.status) && item.status !== 'Draft');
        setRequests(open);
        const wanted = new URLSearchParams(window.location.search).get('id');
        setSelectedId((current) => current || (open.some((item) => item.id === wanted) ? wanted! : open[0]?.id) || '');
      })
      .catch(fail);

  useEffect(() => {
    load();
    fetchFacilities('HOSPITAL')
      .then((page) => setHospitals(page.items))
      .catch(() => setHospitals([]));
    fetchFacilities('COLLECTION_SERVICE')
      .then((page) => setCollections(page.items))
      .catch(() => setCollections([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = useMemo(() => requests?.find((item) => item.id === selectedId) ?? null, [requests, selectedId]);

  useEffect(() => {
    if (!selected) return;
    setForm({
      contactPhone: selected.contactPhone ? selected.contactPhone.replace(/^\+880/, '0') : '',
      specialInstructions: selected.specialInstructions ?? '',
      requestedBloodGroup: selected.requestedBloodGroup,
      component: selected.component,
      quantityUnits: String(selected.quantityUnits),
      requiredBy: toLocalInput(selected.requiredBy),
      urgency: selected.urgency,
      hospitalFacilityId: selected.hospitalFacilityId ?? '',
      collectionFacilityId: selected.collectionFacilityId ?? '',
    });
    fetchChanges(selected.id)
      .then(setChanges)
      .catch(() => setChanges([]));
  }, [selected]);

  const set = (field: string) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [field]: event.target.value }));

  const send = async () => {
    if (!selected || !kind) return;
    const body: UpdateRequestBody =
      kind === 'minor'
        ? { contactPhone: form.contactPhone.trim(), specialInstructions: form.specialInstructions }
        : {
            requestedBloodGroup: form.requestedBloodGroup as UpdateRequestBody['requestedBloodGroup'],
            component: form.component as UpdateRequestBody['component'],
            quantityUnits: Number(form.quantityUnits),
            requiredBy: form.requiredBy ? new Date(form.requiredBy).toISOString() : undefined,
            urgency: form.urgency as UpdateRequestBody['urgency'],
            hospitalFacilityId: form.hospitalFacilityId || undefined,
            collectionFacilityId: form.collectionFacilityId || undefined,
          };
    setBusy(true);
    setNotice(null);
    try {
      const result = await updateRequest(selected.id, body);
      const pending = result.changes.some((change) => change.status === 'Pending');
      const applied = result.changes.some((change) => change.status === 'Auto-applied');
      setNotice({ tone: pending ? 'info' : 'ok', key: pending && applied ? 'update.mixed' : pending ? 'update.pending' : 'update.applied' });
      setRequests((items) => (items ?? []).map((item) => (item.id === result.request.id ? result.request : item)));
      setChanges(await fetchChanges(selected.id));
    } catch (caught) {
      fail(caught);
    } finally {
      setBusy(false);
    }
  };

  const facilityName = (item: Facility) => (locale === 'bn' && item.nameBn ? item.nameBn : item.nameEn);

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>{t('update.title')}</h1>
          <p>{t('update.intro')}</p>
        </div>
      </div>

      <div className="choice-grid">
        <button type="button" className={`card choice-card${kind === 'minor' ? ' on' : ''}`} aria-pressed={kind === 'minor'} onClick={() => setKind('minor')}>
          <span className="choice-icon">
            <Icon name="list" size={18} />
          </span>
          <b>{t('update.minor.title')}</b>
          <span>{t('update.minor.body')}</span>
        </button>
        <button type="button" className={`card choice-card${kind === 'material' ? ' on' : ''}`} aria-pressed={kind === 'material'} onClick={() => setKind('material')}>
          <span className="choice-icon">
            <Icon name="shield" size={18} />
          </span>
          <b>{t('update.material.title')}</b>
          <span>{t('update.material.body')}</span>
        </button>
      </div>

      {notice && (
        <p role={notice.tone === 'err' ? 'alert' : 'status'} className={`alert ${notice.tone}`}>
          {t(notice.key)}
        </p>
      )}

      {requests !== null && requests.length === 0 && <p className="card empty">{t('update.none')}</p>}

      {kind && selected && (
        <form className="card stack-form" onSubmit={(event) => event.preventDefault()} noValidate>
          <div className="form-grid cols-3">
            <Field id="up-request" label={t('update.which')}>
              <select id="up-request" className="input" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
                {(requests ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.referenceNo} · {labelFor(t, 'status', item.status)}
                  </option>
                ))}
              </select>
            </Field>
            {kind === 'minor' ? (
              <Field id="up-phone" label={t('form.repContact')}>
                <input id="up-phone" className="input" inputMode="tel" value={form.contactPhone ?? ''} onChange={set('contactPhone')} />
              </Field>
            ) : (
              <>
                <Field id="up-bg" label={t('form.bloodGroup')}>
                  <select id="up-bg" className="input" value={form.requestedBloodGroup ?? ''} onChange={set('requestedBloodGroup')}>
                    {BLOOD_GROUPS.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field id="up-comp" label={t('form.component')}>
                  <select id="up-comp" className="input" value={form.component ?? ''} onChange={set('component')}>
                    {COMPONENTS.map((value) => (
                      <option key={value} value={value}>
                        {t(`comp.${value}` as MessageKey)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field id="up-qty" label={t('form.quantity')}>
                  <input id="up-qty" className="input" type="number" min={1} max={10} value={form.quantityUnits ?? ''} onChange={set('quantityUnits')} />
                </Field>
                <Field id="up-by" label={t('form.requiredBy')}>
                  <input id="up-by" className="input" type="datetime-local" value={form.requiredBy ?? ''} onChange={set('requiredBy')} />
                </Field>
                <Field id="up-urg" label={t('form.urgency')}>
                  <select id="up-urg" className="input" value={form.urgency ?? ''} onChange={set('urgency')}>
                    {URGENCIES.map((value) => (
                      <option key={value} value={value}>
                        {t(`value.${value}` as MessageKey)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field id="up-hospital" label={t('form.hospital')}>
                  <select id="up-hospital" className="input" value={form.hospitalFacilityId ?? ''} onChange={set('hospitalFacilityId')}>
                    <option value="">{t('form.hospitalHint')}</option>
                    {hospitals.map((item) => (
                      <option key={item.id} value={item.id}>
                        {facilityName(item)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field id="up-collection" label={t('form.collection')}>
                  <select id="up-collection" className="input" value={form.collectionFacilityId ?? ''} onChange={set('collectionFacilityId')}>
                    <option value="">{t('form.collectionHint')}</option>
                    {collections.map((item) => (
                      <option key={item.id} value={item.id}>
                        {facilityName(item)}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            )}
          </div>
          {kind === 'minor' && (
            <Field id="up-notes" label={t('form.instructions')}>
              <textarea id="up-notes" className="input" rows={3} value={form.specialInstructions ?? ''} onChange={set('specialInstructions')} />
            </Field>
          )}
          <p className="muted small-note">{t(kind === 'minor' ? 'update.minor.note' : 'update.material.note')}</p>
          <div className="row end">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={send}>
              {busy ? t('action.working') : t(kind === 'minor' ? 'update.minor.send' : 'update.material.send')}
            </button>
          </div>
        </form>
      )}

      {selected && changes.length > 0 && (
        <div className="card flush">
          <div className="card-head">
            <h2>{t('update.history')}</h2>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">{t('update.col.change')}</th>
                  <th scope="col">{t('update.col.kind')}</th>
                  <th scope="col">{t('requests.col.status')}</th>
                  <th scope="col">{t('update.col.at')}</th>
                </tr>
              </thead>
              <tbody>
                {changes.map((change) => (
                  <tr key={change.id}>
                    <td>{labelFor(t, 'changeType', change.changeType)}</td>
                    <td>{t(change.isMaterial ? 'update.kind.material' : 'update.kind.minor')}</td>
                    <td>
                      <span className={`chip ${change.status === 'Pending' ? 'amb' : change.status === 'Rejected' ? 'red' : 'grn'}`}>
                        {labelFor(t, 'changeStatus', change.status)}
                      </span>
                    </td>
                    <td>{fmtDate(change.createdAt, locale, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}
