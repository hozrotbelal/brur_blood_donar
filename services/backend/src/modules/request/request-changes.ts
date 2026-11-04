import { RequestStatus } from './request-status';

export type ChangeType = 'QUANTITY' | 'REQUIRED_BY' | 'URGENCY' | 'HOSPITAL_DESTINATION' | 'BLOOD_GROUP_OR_COMPONENT' | 'CONTACT' | 'SPECIAL_INSTRUCTIONS';

export interface ChangeableFields {
  contactPhone: string | null;
  altContactPhone: string | null;
  specialInstructions: string | null;
  quantityUnits: number;
  requiredBy: Date;
  urgency: string;
  hospitalFacilityId: string | null;
  collectionFacilityId: string | null;
  requestedBloodGroup: string;
  component: string;
}

export type ProposedFields = Partial<ChangeableFields>;

export interface PlannedChange {
  type: ChangeType;
  material: boolean;
  previous: Partial<ChangeableFields>;
  proposed: Partial<ChangeableFields>;
}

export const UPDATABLE_STATUSES: readonly RequestStatus[] = [
  'Draft', 'Submitted', 'Under review', 'Needs information', 'Verified', 'Searching', 'Donor coordination',
];

const GROUPS: { type: ChangeType; fields: (keyof ChangeableFields)[] }[] = [
  { type: 'CONTACT', fields: ['contactPhone', 'altContactPhone'] },
  { type: 'SPECIAL_INSTRUCTIONS', fields: ['specialInstructions'] },
  { type: 'QUANTITY', fields: ['quantityUnits'] },
  { type: 'REQUIRED_BY', fields: ['requiredBy'] },
  { type: 'URGENCY', fields: ['urgency'] },
  { type: 'HOSPITAL_DESTINATION', fields: ['hospitalFacilityId', 'collectionFacilityId'] },
  { type: 'BLOOD_GROUP_OR_COMPONENT', fields: ['requestedBloodGroup', 'component'] },
];

const same = (a: unknown, b: unknown) => (a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : (a ?? null) === (b ?? null));

function isMaterial(type: ChangeType, previous: Partial<ChangeableFields>, proposed: Partial<ChangeableFields>): boolean {
  if (type === 'CONTACT' || type === 'SPECIAL_INSTRUCTIONS') return false;
  if (type === 'QUANTITY') return (proposed.quantityUnits ?? 0) > (previous.quantityUnits ?? 0);
  return true;
}

export function planRequestChanges(status: RequestStatus, current: ChangeableFields, proposed: ProposedFields): PlannedChange[] {
  const plan: PlannedChange[] = [];
  for (const group of GROUPS) {
    const changed = group.fields.filter((field) => field in proposed && proposed[field] !== undefined && !same(proposed[field], current[field]));
    if (changed.length === 0) continue;
    const previous: Partial<ChangeableFields> = {};
    const next: Partial<ChangeableFields> = {};
    for (const field of changed) {
      Object.assign(previous, { [field]: current[field] });
      Object.assign(next, { [field]: proposed[field] });
    }
    plan.push({ type: group.type, material: status !== 'Draft' && isMaterial(group.type, previous, next), previous, proposed: next });
  }
  return plan;
}
