"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UPDATABLE_STATUSES = void 0;
exports.planRequestChanges = planRequestChanges;
exports.UPDATABLE_STATUSES = [
    'Draft', 'Submitted', 'Under review', 'Needs information', 'Verified', 'Searching', 'Donor coordination',
];
const GROUPS = [
    { type: 'CONTACT', fields: ['contactPhone', 'altContactPhone'] },
    { type: 'SPECIAL_INSTRUCTIONS', fields: ['specialInstructions'] },
    { type: 'QUANTITY', fields: ['quantityUnits'] },
    { type: 'REQUIRED_BY', fields: ['requiredBy'] },
    { type: 'URGENCY', fields: ['urgency'] },
    { type: 'HOSPITAL_DESTINATION', fields: ['hospitalFacilityId', 'collectionFacilityId'] },
    { type: 'BLOOD_GROUP_OR_COMPONENT', fields: ['requestedBloodGroup', 'component'] },
];
const same = (a, b) => (a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : (a ?? null) === (b ?? null));
function isMaterial(type, previous, proposed) {
    if (type === 'CONTACT' || type === 'SPECIAL_INSTRUCTIONS')
        return false;
    if (type === 'QUANTITY')
        return (proposed.quantityUnits ?? 0) > (previous.quantityUnits ?? 0);
    return true;
}
function planRequestChanges(status, current, proposed) {
    const plan = [];
    for (const group of GROUPS) {
        const changed = group.fields.filter((field) => field in proposed && proposed[field] !== undefined && !same(proposed[field], current[field]));
        if (changed.length === 0)
            continue;
        const previous = {};
        const next = {};
        for (const field of changed) {
            Object.assign(previous, { [field]: current[field] });
            Object.assign(next, { [field]: proposed[field] });
        }
        plan.push({ type: group.type, material: status !== 'Draft' && isMaterial(group.type, previous, next), previous, proposed: next });
    }
    return plan;
}
//# sourceMappingURL=request-changes.js.map