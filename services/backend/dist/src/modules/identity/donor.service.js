"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DonorService = exports.NEXT_CONTACT_INTERVAL_DAYS = void 0;
exports.newDonorCode = newDonorCode;
exports.insideBangladesh = insideBangladesh;
exports.nextContactDate = nextContactDate;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const database_service_1 = require("../../platform/db/database.service");
const outbox_service_1 = require("../../platform/outbox/outbox.service");
const status_history_service_1 = require("../../platform/status/status-history.service");
const donor_dto_1 = require("./donor.dto");
exports.NEXT_CONTACT_INTERVAL_DAYS = 120;
const BANGLADESH = { minLat: 20.5, maxLat: 26.7, minLon: 88.0, maxLon: 92.7 };
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LOCKED_CONSENTS = ['TERMS', 'PRIVACY'];
const fail = (code, status = common_1.HttpStatus.UNPROCESSABLE_ENTITY) => new common_1.HttpException({ code }, status);
function newDonorCode() {
    const bytes = (0, node_crypto_1.randomBytes)(7);
    return 'D' + Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}
function insideBangladesh(lat, lon) {
    return lat >= BANGLADESH.minLat && lat <= BANGLADESH.maxLat && lon >= BANGLADESH.minLon && lon <= BANGLADESH.maxLon;
}
function nextContactDate(lastDonation) {
    const d = new Date(`${lastDonation}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + exports.NEXT_CONTACT_INTERVAL_DAYS);
    return d.toISOString().slice(0, 10);
}
let DonorService = class DonorService {
    db;
    history;
    outbox;
    constructor(db, history, outbox) {
        this.db = db;
        this.history = history;
        this.outbox = outbox;
    }
    async getProfile(principal) {
        const profile = await this.loadProfile(this.db, principal.userId);
        if (!profile)
            throw new common_1.NotFoundException({ code: 'DONOR_PROFILE_NOT_FOUND' });
        return profile;
    }
    async saveProfile(principal, dto) {
        if (dto.lastDonationDate && dto.lastDonationDate > new Date().toISOString().slice(0, 10))
            throw fail('DATE_IN_FUTURE');
        return this.db.transaction(async (tx) => {
            if (dto.areaId) {
                const area = await tx.query('SELECT 1 FROM cfg.area WHERE id = $1 AND is_active', [dto.areaId]);
                if (!area.rows[0])
                    throw fail('AREA_NOT_FOUND', common_1.HttpStatus.NOT_FOUND);
            }
            const existing = await tx.query('SELECT id, blood_group, blood_group_status FROM idn.donor_profile WHERE user_id = $1 AND deleted_at IS NULL FOR UPDATE', [principal.userId]);
            const next = dto.lastDonationDate ? nextContactDate(dto.lastDonationDate) : null;
            const basis = dto.lastDonationDate ? 'SELF_REPORTED' : 'NONE';
            const row = existing.rows[0];
            if (row) {
                if (row.blood_group_status !== 'Self-declared' && row.blood_group !== dto.bloodGroup)
                    throw fail('BLOOD_GROUP_LOCKED');
                await tx.query(`UPDATE idn.donor_profile
              SET blood_group = $2, area_id = COALESCE($3, area_id), travel_radius_km = COALESCE($4, travel_radius_km),
                  last_donation_date = COALESCE($5::date, last_donation_date),
                  provisional_next_contact_date = COALESCE($6::date, provisional_next_contact_date),
                  next_contact_basis = CASE WHEN $5::date IS NULL THEN next_contact_basis ELSE $7::next_contact_basis END,
                  version = version + 1, updated_at = now()
            WHERE id = $1`, [row.id, dto.bloodGroup, dto.areaId ?? null, dto.travelRadiusKm ?? null, dto.lastDonationDate ?? null, next, basis]);
            }
            else {
                const id = await this.insertProfile(tx, principal.userId, dto, next, basis);
                await tx.query(`INSERT INTO idn.donor_availability (donor_profile_id, contact_start, contact_end, contact_days)
           VALUES ($1, '08:00', '21:00', $2)`, [id, donor_dto_1.DAYS.join(',')]);
                await this.outbox.append(tx, { aggregateType: 'DONOR_PROFILE', aggregateId: id, eventType: 'DonorProfileCreated', payload: {} });
            }
            return this.loadProfile(tx, principal.userId);
        });
    }
    async getAvailability(principal) {
        const id = await this.profileId(this.db, principal.userId);
        return this.loadAvailability(this.db, id);
    }
    async saveAvailability(principal, dto) {
        if (dto.contactStart >= dto.contactEnd)
            throw fail('INVALID_CONTACT_WINDOW');
        if (dto.contactDays.length === 0)
            throw fail('NO_CONTACT_DAYS');
        const pausedUntil = dto.pausedUntil ? new Date(dto.pausedUntil) : null;
        if (pausedUntil && pausedUntil.getTime() <= Date.now())
            throw fail('PAUSE_IN_PAST');
        return this.db.transaction(async (tx) => {
            const id = await this.profileId(tx, principal.userId);
            await tx.query(`UPDATE idn.donor_availability
            SET routine_available = $2, urgent_available = $3, paused_until = $4, contact_start = $5, contact_end = $6,
                contact_days = $7, version = version + 1, updated_at = now()
          WHERE donor_profile_id = $1`, [id, dto.routineAvailable, dto.urgentAvailable, pausedUntil, dto.contactStart, dto.contactEnd, donor_dto_1.DAYS.filter((d) => dto.contactDays.includes(d)).join(',')]);
            await this.outbox.append(tx, {
                aggregateType: 'DONOR_PROFILE', aggregateId: id, eventType: 'DonorAvailabilityChanged', payload: {}, version: Date.now(),
            });
            return this.loadAvailability(tx, id);
        });
    }
    async proposeLocation(principal, dto) {
        if (!insideBangladesh(dto.latitude, dto.longitude))
            throw fail('LOCATION_OUTSIDE_SERVICE_AREA');
        const size = dto.gridSizeM ?? 1000;
        return this.db.transaction(async (tx) => {
            const profileId = await this.profileId(tx, principal.userId);
            await this.requireConsent(tx, principal.userId, 'LOCATION_USE');
            const correlationId = (0, node_crypto_1.randomUUID)();
            const old = await tx.query(`UPDATE idn.donor_location SET status = 'Superseded', superseded_at = now(), version = version + 1, updated_at = now()
          WHERE donor_profile_id = $1 AND status = 'Pending' RETURNING id`, [profileId]);
            for (const r of old.rows)
                await this.recordLocation(tx, principal, r.id, 'Pending', 'Superseded', correlationId);
            const inserted = await tx.query(`WITH p AS (SELECT ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography AS g),
              t AS (SELECT ST_Transform(g::geometry, 32646) AS m FROM p)
         INSERT INTO idn.donor_location (donor_profile_id, source, status, exact_point, approx_point, grid_cell, grid_size_m, accuracy_m)
         SELECT $1, $4::donor_location_source, 'Pending', p.g, public.snap_to_grid(p.g, $5),
                $5 || ':' || floor(ST_X(t.m) / $5)::bigint || ':' || floor(ST_Y(t.m) / $5)::bigint, $5, $6
           FROM p, t RETURNING id`, [profileId, dto.longitude, dto.latitude, dto.source, size, dto.accuracyM ?? null]);
            const id = inserted.rows[0].id;
            await this.recordLocation(tx, principal, id, null, 'Pending', correlationId);
            return this.locationView(tx, profileId, id);
        });
    }
    async confirmLocation(principal, locationId) {
        return this.db.transaction(async (tx) => {
            const profileId = await this.profileId(tx, principal.userId);
            await this.requireConsent(tx, principal.userId, 'LOCATION_USE');
            const pending = await tx.query(`SELECT id FROM idn.donor_location WHERE id = $1 AND donor_profile_id = $2 AND status = 'Pending' FOR UPDATE`, [locationId, profileId]);
            if (!pending.rows[0])
                throw new common_1.NotFoundException({ code: 'LOCATION_NOT_FOUND' });
            const correlationId = (0, node_crypto_1.randomUUID)();
            const previous = await tx.query(`UPDATE idn.donor_location SET status = 'Superseded', superseded_at = now(), version = version + 1, updated_at = now()
          WHERE donor_profile_id = $1 AND status = 'Approved' RETURNING id`, [profileId]);
            const prevId = previous.rows[0]?.id ?? null;
            if (prevId)
                await this.recordLocation(tx, principal, prevId, 'Approved', 'Superseded', correlationId);
            await tx.query(`UPDATE idn.donor_location
            SET status = 'Approved', validated_at = now(), approved_at = now(), confirmed_by_donor_at = now(),
                supersedes_id = $2, version = version + 1, updated_at = now()
          WHERE id = $1`, [locationId, prevId]);
            await tx.query(`UPDATE idn.donor_profile p
            SET approx_location = l.approx_point, location_source = 'APPROVED_LOCATION', version = p.version + 1, updated_at = now()
           FROM idn.donor_location l WHERE l.id = $1 AND p.id = $2`, [locationId, profileId]);
            await this.recordLocation(tx, principal, locationId, 'Pending', 'Approved', correlationId);
            await this.outbox.append(tx, {
                aggregateType: 'DONOR_LOCATION', aggregateId: locationId, eventType: 'DonorLocationApproved', payload: { donorProfileId: profileId },
            });
            return this.locationView(tx, profileId, locationId);
        });
    }
    async listLocations(principal) {
        const profileId = await this.profileId(this.db, principal.userId);
        const { rows } = await this.db.query('SELECT id FROM idn.donor_location WHERE donor_profile_id = $1 ORDER BY created_at DESC LIMIT 50', [profileId]);
        return Promise.all(rows.map((r) => this.locationView(this.db, profileId, r.id)));
    }
    async listConsents(principal) {
        const { rows } = await this.db.query(`SELECT id, consent_type, granted, policy_version, captured_at, capture_channel, language
         FROM idn.consent_record WHERE user_id = $1 AND withdrawn_at IS NULL ORDER BY consent_type`, [principal.userId]);
        return rows.map(consentView);
    }
    async saveConsent(principal, type, dto) {
        if (!dto.granted && LOCKED_CONSENTS.includes(type))
            throw fail('CONSENT_CANNOT_BE_WITHDRAWN');
        return this.db.transaction(async (tx) => {
            const current = await tx.query(`SELECT id, consent_type, granted, policy_version, captured_at, capture_channel, language
           FROM idn.consent_record WHERE user_id = $1 AND consent_type = $2 AND withdrawn_at IS NULL FOR UPDATE`, [principal.userId, type]);
            const prev = current.rows[0];
            if (prev && prev.granted === dto.granted && prev.policy_version === dto.policyVersion)
                return consentView(prev);
            if (prev)
                await tx.query('UPDATE idn.consent_record SET withdrawn_at = now() WHERE id = $1', [prev.id]);
            const inserted = await tx.query(`INSERT INTO idn.consent_record (user_id, consent_type, granted, policy_version, captured_at, capture_channel, language)
         VALUES ($1, $2::consent_type, $3, $4, now(), $5::consent_capture_channel, $6::ui_language)
         RETURNING id, consent_type, granted, policy_version, captured_at, capture_channel, language`, [principal.userId, type, dto.granted, dto.policyVersion, dto.channel ?? 'PROFILE_SETTINGS', dto.language]);
            const row = inserted.rows[0];
            const withdrew = !dto.granted && prev?.granted === true;
            await this.outbox.append(tx, {
                aggregateType: 'CONSENT', aggregateId: row.id, eventType: withdrew ? 'ConsentWithdrawn' : 'ConsentChanged',
                payload: { userId: principal.userId, consentType: type, granted: dto.granted },
            });
            if (withdrew && type === 'LOCATION_USE') {
                await tx.query(`UPDATE idn.donor_profile p
              SET approx_location = (SELECT a.centroid FROM cfg.area a WHERE a.id = p.area_id), location_source = 'AREA_CENTROID',
                  version = p.version + 1, updated_at = now()
            WHERE p.user_id = $1`, [principal.userId]);
            }
            return consentView(row);
        });
    }
    async listNotificationPreferences(principal) {
        const { rows } = await this.db.query(`SELECT category, push_enabled, sms_enabled, inapp_enabled, quiet_start::text, quiet_end::text
         FROM idn.notification_preference WHERE user_id = $1`, [principal.userId]);
        const byCategory = new Map(rows.map((r) => [r.category, r]));
        return donor_dto_1.NOTIFICATION_CATEGORIES.map((c) => prefView(byCategory.get(c) ?? { category: c, push_enabled: false, sms_enabled: false, inapp_enabled: false, quiet_start: null, quiet_end: null }));
    }
    async savePreference(principal, category, dto) {
        if ((dto.quietStart == null) !== (dto.quietEnd == null))
            throw fail('QUIET_HOURS_INCOMPLETE');
        const { rows } = await this.db.query(`INSERT INTO idn.notification_preference (user_id, category, push_enabled, sms_enabled, inapp_enabled, quiet_start, quiet_end)
       VALUES ($1, $2::notification_category, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, category) DO UPDATE
         SET push_enabled = $3, sms_enabled = $4, inapp_enabled = $5, quiet_start = $6, quiet_end = $7,
             version = idn.notification_preference.version + 1, updated_at = now()
       RETURNING category, push_enabled, sms_enabled, inapp_enabled, quiet_start::text, quiet_end::text`, [principal.userId, category, dto.pushEnabled, dto.smsEnabled, dto.inappEnabled, dto.quietStart ?? null, dto.quietEnd ?? null]);
        return prefView(rows[0]);
    }
    async insertProfile(tx, userId, dto, next, basis) {
        for (let attempt = 0; attempt < 5; attempt++) {
            const res = await tx.query(`INSERT INTO idn.donor_profile
           (user_id, donor_code, blood_group, area_id, approx_location, location_source, travel_radius_km,
            last_donation_date, provisional_next_contact_date, next_contact_basis)
         VALUES ($1, $2, $3, $4, (SELECT centroid FROM cfg.area WHERE id = $4), 'AREA_CENTROID', COALESCE($5, 10), $6::date, $7::date, $8::next_contact_basis)
         ON CONFLICT (donor_code) DO NOTHING RETURNING id`, [userId, newDonorCode(), dto.bloodGroup, dto.areaId ?? null, dto.travelRadiusKm ?? null, dto.lastDonationDate ?? null, next, basis]);
            if (res.rows[0])
                return res.rows[0].id;
        }
        throw fail('DONOR_CODE_UNAVAILABLE', common_1.HttpStatus.SERVICE_UNAVAILABLE);
    }
    async profileId(db, userId) {
        const { rows } = await db.query('SELECT id FROM idn.donor_profile WHERE user_id = $1 AND deleted_at IS NULL', [userId]);
        if (!rows[0])
            throw new common_1.NotFoundException({ code: 'DONOR_PROFILE_NOT_FOUND' });
        return rows[0].id;
    }
    async requireConsent(db, userId, type) {
        const { rows } = await db.query('SELECT 1 FROM idn.consent_record WHERE user_id = $1 AND consent_type = $2::consent_type AND granted AND withdrawn_at IS NULL', [userId, type]);
        if (!rows[0])
            throw fail('CONSENT_REQUIRED');
    }
    recordLocation(tx, principal, id, from, to, correlationId) {
        return this.history.record(tx, {
            entityType: 'DONOR_LOCATION', entityId: id, from, to, actorUserId: principal.userId, actorRole: 'DON', source: 'USER', correlationId,
        });
    }
    async loadProfile(db, userId) {
        const { rows } = await db.query(`SELECT p.donor_code, p.blood_group, p.blood_group_status, p.area_id, p.travel_radius_km, p.last_donation_date::text,
              p.provisional_next_contact_date::text, p.next_contact_basis, p.donor_status, p.location_source,
              ST_Y(p.approx_location::geometry) AS approx_lat, ST_X(p.approx_location::geometry) AS approx_lon, p.version
         FROM idn.donor_profile p WHERE p.user_id = $1 AND p.deleted_at IS NULL`, [userId]);
        const r = rows[0];
        if (!r)
            return null;
        return {
            donorCode: r.donor_code,
            bloodGroup: r.blood_group,
            bloodGroupStatus: r.blood_group_status,
            areaId: r.area_id,
            travelRadiusKm: r.travel_radius_km,
            lastDonationDate: r.last_donation_date,
            provisionalNextContactDate: r.provisional_next_contact_date,
            nextContactBasis: r.next_contact_basis,
            donorStatus: r.donor_status,
            locationSource: r.location_source,
            approximateLocation: r.approx_lat == null ? null : { latitude: r.approx_lat, longitude: r.approx_lon },
            version: r.version,
        };
    }
    async loadAvailability(db, profileId) {
        const { rows } = await db.query(`SELECT routine_available, urgent_available, paused_until, contact_start::text, contact_end::text, contact_days, version
         FROM idn.donor_availability WHERE donor_profile_id = $1`, [profileId]);
        const r = rows[0];
        return {
            routineAvailable: r.routine_available,
            urgentAvailable: r.urgent_available,
            pausedUntil: r.paused_until,
            contactStart: r.contact_start.slice(0, 5),
            contactEnd: r.contact_end.slice(0, 5),
            contactDays: r.contact_days.split(','),
            version: r.version,
        };
    }
    async locationView(db, profileId, id) {
        const { rows } = await db.query(`SELECT id, source, status, grid_size_m, accuracy_m, ST_Y(approx_point::geometry) AS lat, ST_X(approx_point::geometry) AS lon,
              confirmed_by_donor_at, approved_at, superseded_at, rejection_reason, created_at
         FROM idn.donor_location WHERE id = $1 AND donor_profile_id = $2`, [id, profileId]);
        const r = rows[0];
        return {
            id: r.id, source: r.source, status: r.status, gridSizeM: r.grid_size_m, accuracyM: r.accuracy_m,
            approximateLocation: { latitude: r.lat, longitude: r.lon },
            confirmedAt: r.confirmed_by_donor_at, approvedAt: r.approved_at, supersededAt: r.superseded_at,
            rejectionReason: r.rejection_reason, createdAt: r.created_at,
        };
    }
};
exports.DonorService = DonorService;
exports.DonorService = DonorService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_service_1.DatabaseService)),
    __metadata("design:paramtypes", [database_service_1.DatabaseService,
        status_history_service_1.StatusHistoryService,
        outbox_service_1.OutboxService])
], DonorService);
const consentView = (r) => ({
    id: r.id, type: r.consent_type, granted: r.granted, policyVersion: r.policy_version, capturedAt: r.captured_at,
    channel: r.capture_channel, language: r.language,
});
const prefView = (r) => ({
    category: r.category, pushEnabled: r.push_enabled, smsEnabled: r.sms_enabled, inappEnabled: r.inapp_enabled,
    quietStart: r.quiet_start?.slice(0, 5) ?? null, quietEnd: r.quiet_end?.slice(0, 5) ?? null,
});
//# sourceMappingURL=donor.service.js.map