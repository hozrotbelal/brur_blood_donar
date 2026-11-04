'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/lib/api';
import type { MessageKey } from '@/lib/messages';
import {
  createPatient,
  createRequest,
  fetchFacilities,
  fetchPatients,
  fetchRequest,
  submitRequest,
  updateRequest,
  type CreateRequestBody,
  type Facility,
  type PatientItem,
} from '@/lib/public-data';
import { BLOOD_GROUPS, COMPONENTS, URGENCIES, errorKey, isUnauthenticated, toLocalInput } from '@/lib/request-ui';
import { Icon } from './icons';
import { useLocale } from './locale-provider';

const RELATIONSHIPS = ['SELF', 'PARENT', 'CHILD', 'SPOUSE', 'SIBLING', 'OTHER_RELATIVE', 'FRIEND', 'OTHER'] as const;
const ADD_PATIENT = '__add';
type Group = CreateRequestBody['requestedBloodGroup'];
type Component = CreateRequestBody['component'];
type Urgency = CreateRequestBody['urgency'];

export function NewRequest() {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [patients, setPatients] = useState<PatientItem[] | null>(null);
  const [hospitals, setHospitals] = useState<Facility[]>([]);
  const [collections, setCollections] = useState<Facility[]>([]);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  // One id per form, so a double click or a retry returns the same request instead of a second one.
  const [mutationId] = useState(() => crypto.randomUUID());

  const [patientId, setPatientId] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [hospitalId, setHospitalId] = useState('');
  const [collectionId, setCollectionId] = useState('');
  const [bloodGroup, setBloodGroup] = useState<Group | ''>('');
  const [component, setComponent] = useState<Component | ''>('');
  const [quantity, setQuantity] = useState('1');
  const [requiredBy, setRequiredBy] = useState('');
  const [urgency, setUrgency] = useState<Urgency>('Routine');
  const [instructions, setInstructions] = useState('');
  const [fieldError, setFieldError] = useState<Record<string, MessageKey>>({});

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRef, setNewRef] = useState('');
  const [newRelation, setNewRelation] = useState<(typeof RELATIONSHIPS)[number]>('SELF');

  const fail = (caught: unknown) => {
    if (isUnauthenticated(caught)) router.replace('/sign-in');
    else setError(errorKey(caught));
  };

  const loadPatients = () =>
    fetchPatients()
      .then((items) => {
        setPatients(items);
        setPatientId((current) => current || items[0]?.id || '');
        if (items.length === 0) setAdding(true);
      })
      .catch(fail);

  useEffect(() => {
    loadPatients();
    fetchFacilities('HOSPITAL')
      .then((page) => setHospitals(page.items))
      .catch(() => setHospitals([]));
    fetchFacilities('COLLECTION_SERVICE')
      .then((page) => setCollections(page.items))
      .catch(() => setCollections([]));
    const draft = new URLSearchParams(window.location.search).get('draft');
    if (draft) {
      fetchRequest(draft)
        .then((item) => {
          if (item.status !== 'Draft') {
            router.replace(`/requests/${item.id}`);
            return;
          }
          setDraftId(item.id);
          setPatientId(item.patientId);
          setContactPhone(item.contactPhone ? item.contactPhone.replace(/^\+880/, '0') : '');
          setHospitalId(item.hospitalFacilityId ?? '');
          setCollectionId(item.collectionFacilityId ?? '');
          setBloodGroup(item.requestedBloodGroup as Group);
          setComponent(item.component as Component);
          setQuantity(String(item.quantityUnits));
          setRequiredBy(toLocalInput(item.requiredBy));
          setUrgency(item.urgency as Urgency);
          setInstructions(item.specialInstructions ?? '');
        })
        .catch(fail);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addPatient = async (event: FormEvent) => {
    event.preventDefault();
    if (!newName.trim()) {
      setFieldError({ newName: 'form.required' });
      return;
    }
    setBusy(true);
    try {
      const created = await createPatient({ displayName: newName.trim(), hospitalPatientRef: newRef.trim() || undefined, relationship: newRelation });
      setNewName('');
      setNewRef('');
      setFieldError({});
      setAdding(false);
      setPatientId(created.id);
      await loadPatients();
    } catch (caught) {
      fail(caught);
    } finally {
      setBusy(false);
    }
  };

  const validate = (forSubmit: boolean): boolean => {
    const next: Record<string, MessageKey> = {};
    const qty = Number(quantity);
    if (!patientId) next.patientId = 'form.required';
    if (!contactPhone.trim()) next.contactPhone = 'form.required';
    if (!bloodGroup) next.bloodGroup = 'form.required';
    if (!component) next.component = 'form.required';
    if (!Number.isInteger(qty) || qty < 1 || qty > 10) next.quantity = 'request.quantityRange';
    if (!requiredBy || new Date(requiredBy).getTime() <= Date.now()) next.requiredBy = 'request.requiredByFuture';
    if (forSubmit && !hospitalId) next.hospital = 'form.required';
    setFieldError(next);
    return Object.keys(next).length === 0;
  };

  const save = async (andSubmit: boolean) => {
    if (!validate(andSubmit)) return;
    setBusy(true);
    setError(null);
    const fields = {
      requestedBloodGroup: bloodGroup as Group,
      component: component as Component,
      quantityUnits: Number(quantity),
      requiredBy: new Date(requiredBy).toISOString(),
      urgency,
      contactPhone: contactPhone.trim(),
      hospitalFacilityId: hospitalId || undefined,
      collectionFacilityId: collectionId || undefined,
    };
    try {
      let id = draftId;
      if (id) {
        try {
          await updateRequest(id, { ...fields, specialInstructions: instructions.trim() });
        } catch (caught) {
          if (!(caught instanceof ApiError && caught.code === 'NO_CHANGES')) throw caught;
        }
      } else {
        id = (await createRequest({ ...fields, patientId, specialInstructions: instructions.trim() || undefined, clientMutationId: mutationId })).id;
      }
      if (andSubmit) {
        await submitRequest(id);
        router.replace(`/requests/${id}`);
      } else {
        router.replace('/requests/drafts');
      }
    } catch (caught) {
      fail(caught);
    } finally {
      setBusy(false);
    }
  };

  const facilityName = (item: Facility) => (locale === 'bn' && item.nameBn ? item.nameBn : item.nameEn);

  if (patients === null && !error) return <p role="status">{t('queue.loading')}</p>;

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>{t(draftId ? 'newRequest.editDraft' : 'newRequest.title')}</h1>
          <p>{t('newRequest.intro')}</p>
        </div>
      </div>

      {error && (
        <p role="alert" className="alert err">
          {t(error)}
        </p>
      )}

      {adding && (
        <form className="card stack-form narrow-card" onSubmit={addPatient} noValidate>
          <h2>{t('newRequest.addPatient')}</h2>
          <p className="muted">{t('newRequest.addPatientHint')}</p>
          <div className="form-grid cols-3">
            <Field id="np-name" label={t('newRequest.patientName')} error={fieldError.newName && t(fieldError.newName)}>
              <input id="np-name" className={`input${fieldError.newName ? ' bad' : ''}`} value={newName} onChange={(event) => setNewName(event.target.value)} />
            </Field>
            <Field id="np-ref" label={t('form.patientRef')}>
              <input id="np-ref" className="input" placeholder={t('form.patientRefHint')} value={newRef} onChange={(event) => setNewRef(event.target.value)} />
            </Field>
            <Field id="np-rel" label={t('newRequest.relationship')}>
              <select id="np-rel" className="input" value={newRelation} onChange={(event) => setNewRelation(event.target.value as (typeof RELATIONSHIPS)[number])}>
                {RELATIONSHIPS.map((value) => (
                  <option key={value} value={value}>
                    {t(`relationship.${value}` as MessageKey)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="row end">
            {patients && patients.length > 0 && (
              <button type="button" className="btn" onClick={() => setAdding(false)}>
                {t('action.cancel')}
              </button>
            )}
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {t('newRequest.addPatientSubmit')}
            </button>
          </div>
        </form>
      )}

      {patients && patients.length > 0 && (
        <form className="card stack-form narrow-card" onSubmit={(event) => event.preventDefault()} noValidate>
          <div className="form-grid cols-3">
            <Field id="rq-patient" label={t('form.patientRef')} error={fieldError.patientId && t(fieldError.patientId)}>
              <select
                id="rq-patient"
                className="input"
                value={patientId}
                disabled={!!draftId}
                onChange={(event) => (event.target.value === ADD_PATIENT ? setAdding(true) : setPatientId(event.target.value))}
              >
                {patients.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.hospitalPatientRef ? `${item.hospitalPatientRef} · ${item.displayName}` : item.displayName}
                  </option>
                ))}
                {!draftId && <option value={ADD_PATIENT}>{t('newRequest.addAnother')}</option>}
              </select>
            </Field>
            <Field id="rq-phone" label={t('form.repContact')} error={fieldError.contactPhone && t(fieldError.contactPhone)}>
              <input
                id="rq-phone"
                className={`input${fieldError.contactPhone ? ' bad' : ''}`}
                inputMode="tel"
                placeholder="01XXXXXXXXX"
                value={contactPhone}
                onChange={(event) => setContactPhone(event.target.value)}
              />
            </Field>
            <Field id="rq-hospital" label={t('form.hospital')} error={fieldError.hospital && t(fieldError.hospital)}>
              <select id="rq-hospital" className={`input${fieldError.hospital ? ' bad' : ''}`} value={hospitalId} onChange={(event) => setHospitalId(event.target.value)}>
                <option value="">{t('form.hospitalHint')}</option>
                {hospitals.map((item) => (
                  <option key={item.id} value={item.id}>
                    {facilityName(item)}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="rq-collection" label={t('form.collection')}>
              <select id="rq-collection" className="input" value={collectionId} onChange={(event) => setCollectionId(event.target.value)}>
                <option value="">{t('form.collectionHint')}</option>
                {collections.map((item) => (
                  <option key={item.id} value={item.id}>
                    {facilityName(item)}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="rq-bg" label={t('form.bloodGroup')} error={fieldError.bloodGroup && t(fieldError.bloodGroup)}>
              <select id="rq-bg" className={`input${fieldError.bloodGroup ? ' bad' : ''}`} value={bloodGroup} onChange={(event) => setBloodGroup(event.target.value as Group)}>
                <option value="">{t('form.select')}</option>
                {BLOOD_GROUPS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="rq-comp" label={t('form.component')} error={fieldError.component && t(fieldError.component)}>
              <select id="rq-comp" className={`input${fieldError.component ? ' bad' : ''}`} value={component} onChange={(event) => setComponent(event.target.value as Component)}>
                <option value="">{t('form.select')}</option>
                {COMPONENTS.map((value) => (
                  <option key={value} value={value}>
                    {t(`comp.${value}` as MessageKey)}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="rq-qty" label={t('form.quantity')} error={fieldError.quantity && t(fieldError.quantity)}>
              <input
                id="rq-qty"
                className={`input${fieldError.quantity ? ' bad' : ''}`}
                type="number"
                min={1}
                max={10}
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </Field>
            <Field id="rq-by" label={t('form.requiredBy')} error={fieldError.requiredBy && t(fieldError.requiredBy)}>
              <input
                id="rq-by"
                className={`input${fieldError.requiredBy ? ' bad' : ''}`}
                type="datetime-local"
                value={requiredBy}
                onChange={(event) => setRequiredBy(event.target.value)}
              />
            </Field>
            <Field id="rq-urg" label={t('form.urgency')}>
              <select id="rq-urg" className="input" value={urgency} onChange={(event) => setUrgency(event.target.value as Urgency)}>
                {URGENCIES.map((value) => (
                  <option key={value} value={value}>
                    {t(`value.${value}` as MessageKey)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field id="rq-notes" label={t('form.instructions')}>
            <textarea id="rq-notes" className="input" rows={3} value={instructions} onChange={(event) => setInstructions(event.target.value)} />
          </Field>
          <div className="upload-box" aria-disabled="true">
            <Icon name="upload" size={22} />
            <div>
              <b>{t('form.upload')}</b>
              <small>{t('form.uploadHint')}</small>
            </div>
          </div>
          <div className="row end">
            <Link href={draftId ? '/requests/drafts' : '/requests'} className="btn btn-ghost">
              {t('action.cancel')}
            </Link>
            <button type="button" className="btn" disabled={busy} onClick={() => save(false)}>
              {t('newRequest.saveDraft')}
            </button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => save(true)}>
              {busy ? t('action.working') : t('newRequest.submit')}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string | false; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}
