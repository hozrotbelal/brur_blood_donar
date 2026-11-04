import { ChangeableFields, planRequestChanges } from './request-changes';

const base: ChangeableFields = {
  contactPhone: '+8801700000005', altContactPhone: null, specialInstructions: null, quantityUnits: 2,
  requiredBy: new Date('2026-10-20T10:00:00Z'), urgency: 'Urgent', hospitalFacilityId: 'h1', collectionFacilityId: null,
  requestedBloodGroup: 'B+', component: 'WHOLE_BLOOD',
};

describe('planRequestChanges', () => {
  it('applies contact and instruction changes immediately', () => {
    const plan = planRequestChanges('Searching', base, { contactPhone: '+8801700000009', specialInstructions: 'Call after 5 pm' });
    expect(plan.map((c) => [c.type, c.material])).toEqual([['CONTACT', false], ['SPECIAL_INSTRUCTIONS', false]]);
  });

  it('sends blood group, facility, date, urgency and quantity increase to Support', () => {
    const plan = planRequestChanges('Searching', base, {
      requestedBloodGroup: 'O-', hospitalFacilityId: 'h2', requiredBy: new Date('2026-10-21T10:00:00Z'), urgency: 'Critical', quantityUnits: 3,
    });
    expect(plan.every((c) => c.material)).toBe(true);
    expect(plan.map((c) => c.type).sort()).toEqual(['BLOOD_GROUP_OR_COMPONENT', 'HOSPITAL_DESTINATION', 'QUANTITY', 'REQUIRED_BY', 'URGENCY']);
  });

  it('treats a quantity decrease as non-material', () => {
    expect(planRequestChanges('Searching', base, { quantityUnits: 1 })).toEqual([
      { type: 'QUANTITY', material: false, previous: { quantityUnits: 2 }, proposed: { quantityUnits: 1 } },
    ]);
  });

  it('treats every change to a draft as non-material', () => {
    expect(planRequestChanges('Draft', base, { requestedBloodGroup: 'A+', urgency: 'Routine' }).some((c) => c.material)).toBe(false);
  });

  it('ignores values that did not change', () => {
    expect(planRequestChanges('Searching', base, { urgency: 'Urgent', requiredBy: new Date(base.requiredBy), quantityUnits: 2 })).toEqual([]);
  });
});
