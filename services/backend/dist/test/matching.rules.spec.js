"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const matching_rules_1 = require("../src/modules/matching/matching.rules");
const now = new Date('2026-10-12T06:00:00Z');
const params = (over = {}) => ({
    urgency: 'Urgent', radiusKm: 20, waveSize: 10, requireVerifiedGroup: false, maxInvitesPer24h: 1, maxInvitesPer30d: 4,
    criticalBypassContactHours: true, now, ...over,
});
const donor = (over = {}) => ({
    donorProfileId: 'd1', bloodGroupStatus: 'Self-declared', donorStatus: 'Active', accountStatus: 'Active', nextContactDate: null,
    travelRadiusKm: 10, distanceKm: 4, routineAvailable: true, urgentAvailable: true, pausedUntil: null, contactStart: '08:00',
    contactEnd: '21:00', contactDays: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'], hasUrgentConsent: true, hasRoutineConsent: true,
    hasChannel: true, restricted: false, activeCommitment: false, invites24h: 0, invites30d: 0, invitedForRequest: false,
    isRequester: false, lastAvailableAt: null, ...over,
});
describe('evaluateDonor', () => {
    it('includes an eligible donor', () => {
        expect((0, matching_rules_1.evaluateDonor)(donor(), params())).toEqual({ included: true, reasons: [], deferredUntil: null });
    });
    it.each([
        ['EX_NO_CONSENT', { hasUrgentConsent: false }],
        ['EX_CHANNEL_NOT_PERMITTED', { hasChannel: false }],
        ['EX_INTERVAL_NOT_REACHED', { nextContactDate: '2026-11-01' }],
        ['EX_RESTRICTION_RECORDED', { restricted: true }],
        ['EX_AVAILABILITY_OFF', { urgentAvailable: false }],
        ['EX_AVAILABILITY_OFF', { pausedUntil: new Date('2026-10-20T00:00:00Z') }],
        ['EX_OUTSIDE_TRAVEL_RADIUS', { distanceKm: 12 }],
        ['EX_OUTSIDE_TRAVEL_RADIUS', { distanceKm: null }],
        ['EX_ACTIVE_COMMITMENT', { activeCommitment: true }],
        ['EX_RECENTLY_INVITED', { invites24h: 1 }],
        ['EX_RECENTLY_INVITED', { invitedForRequest: true }],
        ['EX_CONTACT_LIMIT', { invites30d: 4 }],
        ['EX_ACCOUNT_SUSPENDED', { accountStatus: 'Suspended' }],
        ['EX_SAME_PERSON_AS_PATIENT', { isRequester: true }],
    ])('excludes with %s', (code, over) => {
        const result = (0, matching_rules_1.evaluateDonor)(donor(over), params());
        expect(result.included).toBe(false);
        expect(result.reasons).toContain(code);
    });
    it('uses the lesser of the travel radius and the wave radius', () => {
        expect((0, matching_rules_1.evaluateDonor)(donor({ travelRadiusKm: 10, distanceKm: 12 }), params({ radiusKm: 20 })).included).toBe(false);
        expect((0, matching_rules_1.evaluateDonor)(donor({ travelRadiusKm: 50, distanceKm: 12 }), params({ radiusKm: 10 })).included).toBe(false);
    });
    it('needs the consent that matches the urgency', () => {
        const only = donor({ hasUrgentConsent: false, hasRoutineConsent: true });
        expect((0, matching_rules_1.evaluateDonor)(only, params({ urgency: 'Critical' })).reasons).toContain('EX_NO_CONSENT');
        expect((0, matching_rules_1.evaluateDonor)(only, params({ urgency: 'Routine' })).included).toBe(true);
    });
    it('excludes self-declared groups only when the policy asks for it', () => {
        expect((0, matching_rules_1.evaluateDonor)(donor(), params({ requireVerifiedGroup: true })).reasons).toContain('EX_BLOOD_GROUP_UNVERIFIED');
        expect((0, matching_rules_1.evaluateDonor)(donor({ bloodGroupStatus: 'Document-checked' }), params({ requireVerifiedGroup: true })).included).toBe(true);
    });
    it('defers outside contact hours, except for Critical with urgent consent', () => {
        const night = new Date('2026-10-12T17:30:00Z');
        const deferred = (0, matching_rules_1.evaluateDonor)(donor(), params({ now: night }));
        expect(deferred.included).toBe(true);
        expect(deferred.reasons).toEqual(['DF_OUTSIDE_CONTACT_HOURS']);
        expect(deferred.deferredUntil?.toISOString()).toBe('2026-10-13T02:00:00.000Z');
        expect((0, matching_rules_1.evaluateDonor)(donor(), params({ now: night, urgency: 'Critical' })).deferredUntil).toBeNull();
        expect((0, matching_rules_1.evaluateDonor)(donor(), params({ now: night, urgency: 'Critical', criticalBypassContactHours: false })).deferredUntil).not.toBeNull();
    });
});
describe('ordering and helpers', () => {
    it('orders by distance band, then latest Available response, then fewest invitations', () => {
        const list = [
            { facts: donor({ donorProfileId: 'far', distanceKm: 15 }) },
            { facts: donor({ donorProfileId: 'old', distanceKm: 3, lastAvailableAt: new Date('2026-01-01') }) },
            { facts: donor({ donorProfileId: 'new', distanceKm: 4, lastAvailableAt: new Date('2026-06-01') }) },
            { facts: donor({ donorProfileId: 'busy', distanceKm: 4, invites30d: 3 }) },
            { facts: donor({ donorProfileId: 'quiet', distanceKm: 4, invites30d: 0 }) },
        ].sort(matching_rules_1.compareCandidates);
        expect(list.map((c) => c.facts.donorProfileId)).toEqual(['new', 'old', 'quiet', 'busy', 'far']);
    });
    it('maps distance to bands, radius to waves and urgency to windows', () => {
        expect([(0, matching_rules_1.distanceBand)(3), (0, matching_rules_1.distanceBand)(7), (0, matching_rules_1.distanceBand)(15), (0, matching_rules_1.distanceBand)(30), (0, matching_rules_1.distanceBand)(80), (0, matching_rules_1.distanceBand)(null)]).toEqual([0, 1, 2, 3, 4, 4]);
        expect([1, 2, 3, 4, 5, 9].map((n) => (0, matching_rules_1.radiusSteps)([5, 10, 20, 40], n))).toEqual([5, 10, 20, 40, 40, 40]);
        expect([(0, matching_rules_1.responseWindowMinutes)('Critical'), (0, matching_rules_1.responseWindowMinutes)('Urgent'), (0, matching_rules_1.responseWindowMinutes)('Routine')]).toEqual([30, 120, 720]);
    });
    it('finds the next time a contact window opens, skipping excluded days', () => {
        const friNight = new Date('2026-10-16T17:30:00Z');
        const next = (0, matching_rules_1.nextWindowOpen)(friNight, '08:00', '21:00', ['MON', 'TUE']);
        expect(next?.toISOString()).toBe('2026-10-19T02:00:00.000Z');
        expect((0, matching_rules_1.nextWindowOpen)(friNight, '08:00', '21:00', [])).toBeNull();
    });
});
//# sourceMappingURL=matching.rules.spec.js.map