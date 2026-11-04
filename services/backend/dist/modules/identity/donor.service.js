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
const drizzle_orm_1 = require("drizzle-orm");
const node_crypto_1 = require("node:crypto");
const database_service_1 = require("../../platform/db/database.service");
const outbox_service_1 = require("../../platform/outbox/outbox.service");
const status_history_service_1 = require("../../platform/status/status-history.service");
const donor_dto_1 = require("./donor.dto");
const schema_1 = require("./schema");
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
const consentView = (r) => ({
    id: r.id, type: r.consentType, granted: r.granted, policyVersion: r.policyVersion, capturedAt: r.capturedAt,
    channel: r.captureChannel, language: r.language,
});
const prefView = (r) => ({
    category: r.category, pushEnabled: r.pushEnabled, smsEnabled: r.smsEnabled, inappEnabled: r.inappEnabled,
    quietStart: r.quietStart?.slice(0, 5) ?? null, quietEnd: r.quietEnd?.slice(0, 5) ?? null,
});
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
            const [row] = await tx.orm
                .select({ id: schema_1.donorProfile.id, bloodGroup: schema_1.donorProfile.bloodGroup, bloodGroupStatus: schema_1.donorProfile.bloodGroupStatus })
                .from(schema_1.donorProfile)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.donorProfile.userId, principal.userId), (0, drizzle_orm_1.isNull)(schema_1.donorProfile.deletedAt)))
                .for('update');
            const next = dto.lastDonationDate ? nextContactDate(dto.lastDonationDate) : null;
            if (row) {
                if (row.bloodGroupStatus !== 'Self-declared' && row.bloodGroup !== dto.bloodGroup)
                    throw fail('BLOOD_GROUP_LOCKED');
                await tx.orm
                    .update(schema_1.donorProfile)
                    .set({
                    bloodGroup: dto.bloodGroup,
                    ...(dto.areaId ? { areaId: dto.areaId } : {}),
                    ...(dto.travelRadiusKm != null ? { travelRadiusKm: dto.travelRadiusKm } : {}),
                    ...(dto.lastDonationDate ? { lastDonationDate: dto.lastDonationDate, provisionalNextContactDate: next, nextContactBasis: 'SELF_REPORTED' } : {}),
                    version: (0, drizzle_orm_1.sql) `${schema_1.donorProfile.version} + 1`, updatedAt: new Date(),
                })
                    .where((0, drizzle_orm_1.eq)(schema_1.donorProfile.id, row.id));
            }
            else {
                const id = await this.insertProfile(tx, principal.userId, dto, next);
                await tx.orm.insert(schema_1.donorAvailability).values({ donorProfileId: id, contactStart: '08:00', contactEnd: '21:00', contactDays: donor_dto_1.DAYS.join(',') });
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
            await tx.orm
                .update(schema_1.donorAvailability)
                .set({
                routineAvailable: dto.routineAvailable, urgentAvailable: dto.urgentAvailable, pausedUntil, contactStart: dto.contactStart, contactEnd: dto.contactEnd,
                contactDays: donor_dto_1.DAYS.filter((d) => dto.contactDays.includes(d)).join(','), version: (0, drizzle_orm_1.sql) `${schema_1.donorAvailability.version} + 1`, updatedAt: new Date(),
            })
                .where((0, drizzle_orm_1.eq)(schema_1.donorAvailability.donorProfileId, id));
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
            const old = await tx.orm
                .update(schema_1.donorLocation)
                .set({ status: 'Superseded', supersededAt: new Date(), version: (0, drizzle_orm_1.sql) `${schema_1.donorLocation.version} + 1`, updatedAt: new Date() })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.donorLocation.donorProfileId, profileId), (0, drizzle_orm_1.eq)(schema_1.donorLocation.status, 'Pending')))
                .returning({ id: schema_1.donorLocation.id });
            for (const r of old)
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
            const [pending] = await tx.orm
                .select({ id: schema_1.donorLocation.id })
                .from(schema_1.donorLocation)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.donorLocation.id, locationId), (0, drizzle_orm_1.eq)(schema_1.donorLocation.donorProfileId, profileId), (0, drizzle_orm_1.eq)(schema_1.donorLocation.status, 'Pending')))
                .for('update');
            if (!pending)
                throw new common_1.NotFoundException({ code: 'LOCATION_NOT_FOUND' });
            const correlationId = (0, node_crypto_1.randomUUID)();
            const [previous] = await tx.orm
                .update(schema_1.donorLocation)
                .set({ status: 'Superseded', supersededAt: new Date(), version: (0, drizzle_orm_1.sql) `${schema_1.donorLocation.version} + 1`, updatedAt: new Date() })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.donorLocation.donorProfileId, profileId), (0, drizzle_orm_1.eq)(schema_1.donorLocation.status, 'Approved')))
                .returning({ id: schema_1.donorLocation.id });
            const prevId = previous?.id ?? null;
            if (prevId)
                await this.recordLocation(tx, principal, prevId, 'Approved', 'Superseded', correlationId);
            const now = new Date();
            await tx.orm
                .update(schema_1.donorLocation)
                .set({ status: 'Approved', validatedAt: now, approvedAt: now, confirmedByDonorAt: now, supersedesId: prevId, version: (0, drizzle_orm_1.sql) `${schema_1.donorLocation.version} + 1`, updatedAt: now })
                .where((0, drizzle_orm_1.eq)(schema_1.donorLocation.id, locationId));
            await tx.orm
                .update(schema_1.donorProfile)
                .set({
                approxLocation: (0, drizzle_orm_1.sql) `(select l.approx_point from idn.donor_location l where l.id = ${locationId})`, locationSource: 'APPROVED_LOCATION',
                version: (0, drizzle_orm_1.sql) `${schema_1.donorProfile.version} + 1`, updatedAt: now,
            })
                .where((0, drizzle_orm_1.eq)(schema_1.donorProfile.id, profileId));
            await this.recordLocation(tx, principal, locationId, 'Pending', 'Approved', correlationId);
            await this.outbox.append(tx, {
                aggregateType: 'DONOR_LOCATION', aggregateId: locationId, eventType: 'DonorLocationApproved', payload: { donorProfileId: profileId },
            });
            return this.locationView(tx, profileId, locationId);
        });
    }
    async listLocations(principal) {
        const profileId = await this.profileId(this.db, principal.userId);
        const rows = await this.db.orm
            .select({ id: schema_1.donorLocation.id })
            .from(schema_1.donorLocation)
            .where((0, drizzle_orm_1.eq)(schema_1.donorLocation.donorProfileId, profileId))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.donorLocation.createdAt))
            .limit(50);
        return Promise.all(rows.map((r) => this.locationView(this.db, profileId, r.id)));
    }
    async listConsents(principal) {
        const rows = await this.db.orm
            .select(this.consentColumns())
            .from(schema_1.consentRecord)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.consentRecord.userId, principal.userId), (0, drizzle_orm_1.isNull)(schema_1.consentRecord.withdrawnAt)))
            .orderBy(schema_1.consentRecord.consentType);
        return rows.map(consentView);
    }
    async saveConsent(principal, type, dto) {
        if (!dto.granted && LOCKED_CONSENTS.includes(type))
            throw fail('CONSENT_CANNOT_BE_WITHDRAWN');
        const consentType = type;
        return this.db.transaction(async (tx) => {
            const [prev] = await tx.orm
                .select(this.consentColumns())
                .from(schema_1.consentRecord)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.consentRecord.userId, principal.userId), (0, drizzle_orm_1.eq)(schema_1.consentRecord.consentType, consentType), (0, drizzle_orm_1.isNull)(schema_1.consentRecord.withdrawnAt)))
                .for('update');
            if (prev && prev.granted === dto.granted && prev.policyVersion === dto.policyVersion)
                return consentView(prev);
            if (prev)
                await tx.orm.update(schema_1.consentRecord).set({ withdrawnAt: new Date() }).where((0, drizzle_orm_1.eq)(schema_1.consentRecord.id, prev.id));
            const [row] = await tx.orm
                .insert(schema_1.consentRecord)
                .values({
                userId: principal.userId, consentType, granted: dto.granted, policyVersion: dto.policyVersion, capturedAt: new Date(),
                captureChannel: (dto.channel ?? 'PROFILE_SETTINGS'), language: dto.language,
            })
                .returning(this.consentColumns());
            const withdrew = !dto.granted && prev?.granted === true;
            await this.outbox.append(tx, {
                aggregateType: 'CONSENT', aggregateId: row.id, eventType: withdrew ? 'ConsentWithdrawn' : 'ConsentChanged',
                payload: { userId: principal.userId, consentType: type, granted: dto.granted },
            });
            if (withdrew && type === 'LOCATION_USE') {
                await tx.orm
                    .update(schema_1.donorProfile)
                    .set({
                    approxLocation: (0, drizzle_orm_1.sql) `(select a.centroid from cfg.area a where a.id = ${schema_1.donorProfile.areaId})`, locationSource: 'AREA_CENTROID',
                    version: (0, drizzle_orm_1.sql) `${schema_1.donorProfile.version} + 1`, updatedAt: new Date(),
                })
                    .where((0, drizzle_orm_1.eq)(schema_1.donorProfile.userId, principal.userId));
            }
            return consentView(row);
        });
    }
    async listNotificationPreferences(principal) {
        const rows = await this.db.orm.select(this.prefColumns()).from(schema_1.notificationPreference).where((0, drizzle_orm_1.eq)(schema_1.notificationPreference.userId, principal.userId));
        const byCategory = new Map(rows.map((r) => [r.category, r]));
        return donor_dto_1.NOTIFICATION_CATEGORIES.map((c) => prefView(byCategory.get(c) ?? { category: c, pushEnabled: false, smsEnabled: false, inappEnabled: false, quietStart: null, quietEnd: null }));
    }
    async savePreference(principal, category, dto) {
        if ((dto.quietStart == null) !== (dto.quietEnd == null))
            throw fail('QUIET_HOURS_INCOMPLETE');
        const values = { pushEnabled: dto.pushEnabled, smsEnabled: dto.smsEnabled, inappEnabled: dto.inappEnabled, quietStart: dto.quietStart ?? null, quietEnd: dto.quietEnd ?? null };
        const [row] = await this.db.orm
            .insert(schema_1.notificationPreference)
            .values({ userId: principal.userId, category: category, ...values })
            .onConflictDoUpdate({
            target: [schema_1.notificationPreference.userId, schema_1.notificationPreference.category],
            set: { ...values, version: (0, drizzle_orm_1.sql) `${schema_1.notificationPreference.version} + 1`, updatedAt: new Date() },
        })
            .returning(this.prefColumns());
        return prefView(row);
    }
    consentColumns() {
        return {
            id: schema_1.consentRecord.id, consentType: schema_1.consentRecord.consentType, granted: schema_1.consentRecord.granted, policyVersion: schema_1.consentRecord.policyVersion,
            capturedAt: schema_1.consentRecord.capturedAt, captureChannel: schema_1.consentRecord.captureChannel, language: schema_1.consentRecord.language,
        };
    }
    prefColumns() {
        return {
            category: schema_1.notificationPreference.category, pushEnabled: schema_1.notificationPreference.pushEnabled, smsEnabled: schema_1.notificationPreference.smsEnabled,
            inappEnabled: schema_1.notificationPreference.inappEnabled, quietStart: schema_1.notificationPreference.quietStart, quietEnd: schema_1.notificationPreference.quietEnd,
        };
    }
    async insertProfile(tx, userId, dto, next) {
        for (let attempt = 0; attempt < 5; attempt++) {
            const rows = await tx.orm
                .insert(schema_1.donorProfile)
                .values({
                userId, donorCode: newDonorCode(), bloodGroup: dto.bloodGroup, areaId: dto.areaId ?? null,
                approxLocation: dto.areaId ? (0, drizzle_orm_1.sql) `(select centroid from cfg.area where id = ${dto.areaId})` : null, locationSource: 'AREA_CENTROID',
                travelRadiusKm: dto.travelRadiusKm ?? 10, lastDonationDate: dto.lastDonationDate ?? null, provisionalNextContactDate: next,
                nextContactBasis: dto.lastDonationDate ? 'SELF_REPORTED' : 'NONE',
            })
                .onConflictDoNothing({ target: schema_1.donorProfile.donorCode })
                .returning({ id: schema_1.donorProfile.id });
            if (rows[0])
                return rows[0].id;
        }
        throw fail('DONOR_CODE_UNAVAILABLE', common_1.HttpStatus.SERVICE_UNAVAILABLE);
    }
    async profileId(db, userId) {
        const [row] = await db.orm.select({ id: schema_1.donorProfile.id }).from(schema_1.donorProfile).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.donorProfile.userId, userId), (0, drizzle_orm_1.isNull)(schema_1.donorProfile.deletedAt)));
        if (!row)
            throw new common_1.NotFoundException({ code: 'DONOR_PROFILE_NOT_FOUND' });
        return row.id;
    }
    async requireConsent(db, userId, type) {
        const [row] = await db.orm
            .select({ id: schema_1.consentRecord.id })
            .from(schema_1.consentRecord)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.consentRecord.userId, userId), (0, drizzle_orm_1.eq)(schema_1.consentRecord.consentType, type), (0, drizzle_orm_1.eq)(schema_1.consentRecord.granted, true), (0, drizzle_orm_1.isNull)(schema_1.consentRecord.withdrawnAt)));
        if (!row)
            throw fail('CONSENT_REQUIRED');
    }
    recordLocation(tx, principal, id, from, to, correlationId) {
        return this.history.record(tx, {
            entityType: 'DONOR_LOCATION', entityId: id, from, to, actorUserId: principal.userId, actorRole: 'DON', source: 'USER', correlationId,
        });
    }
    async loadProfile(db, userId) {
        const [r] = await db.orm
            .select({
            donorCode: schema_1.donorProfile.donorCode, bloodGroup: schema_1.donorProfile.bloodGroup, bloodGroupStatus: schema_1.donorProfile.bloodGroupStatus, areaId: schema_1.donorProfile.areaId,
            travelRadiusKm: schema_1.donorProfile.travelRadiusKm, lastDonationDate: schema_1.donorProfile.lastDonationDate, provisionalNextContactDate: schema_1.donorProfile.provisionalNextContactDate,
            nextContactBasis: schema_1.donorProfile.nextContactBasis, donorStatus: schema_1.donorProfile.donorStatus, locationSource: schema_1.donorProfile.locationSource,
            approxLat: (0, drizzle_orm_1.sql) `ST_Y(${schema_1.donorProfile.approxLocation}::geometry)`.mapWith(Number), approxLon: (0, drizzle_orm_1.sql) `ST_X(${schema_1.donorProfile.approxLocation}::geometry)`.mapWith(Number),
            hasLocation: (0, drizzle_orm_1.sql) `${schema_1.donorProfile.approxLocation} is not null`, version: schema_1.donorProfile.version,
        })
            .from(schema_1.donorProfile)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.donorProfile.userId, userId), (0, drizzle_orm_1.isNull)(schema_1.donorProfile.deletedAt)));
        if (!r)
            return null;
        const { approxLat, approxLon, hasLocation, ...rest } = r;
        return { ...rest, approximateLocation: hasLocation ? { latitude: approxLat, longitude: approxLon } : null };
    }
    async loadAvailability(db, profileId) {
        const [r] = await db.orm
            .select({
            routineAvailable: schema_1.donorAvailability.routineAvailable, urgentAvailable: schema_1.donorAvailability.urgentAvailable, pausedUntil: schema_1.donorAvailability.pausedUntil,
            contactStart: schema_1.donorAvailability.contactStart, contactEnd: schema_1.donorAvailability.contactEnd, contactDays: schema_1.donorAvailability.contactDays, version: schema_1.donorAvailability.version,
        })
            .from(schema_1.donorAvailability)
            .where((0, drizzle_orm_1.eq)(schema_1.donorAvailability.donorProfileId, profileId));
        return { ...r, contactStart: r.contactStart.slice(0, 5), contactEnd: r.contactEnd.slice(0, 5), contactDays: r.contactDays.split(',') };
    }
    async locationView(db, profileId, id) {
        const [r] = await db.orm
            .select({
            id: schema_1.donorLocation.id, source: schema_1.donorLocation.source, status: schema_1.donorLocation.status, gridSizeM: schema_1.donorLocation.gridSizeM, accuracyM: schema_1.donorLocation.accuracyM,
            lat: (0, drizzle_orm_1.sql) `ST_Y(${schema_1.donorLocation.approxPoint}::geometry)`.mapWith(Number), lon: (0, drizzle_orm_1.sql) `ST_X(${schema_1.donorLocation.approxPoint}::geometry)`.mapWith(Number),
            confirmedAt: schema_1.donorLocation.confirmedByDonorAt, approvedAt: schema_1.donorLocation.approvedAt, supersededAt: schema_1.donorLocation.supersededAt,
            rejectionReason: schema_1.donorLocation.rejectionReason, createdAt: schema_1.donorLocation.createdAt,
        })
            .from(schema_1.donorLocation)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.donorLocation.id, id), (0, drizzle_orm_1.eq)(schema_1.donorLocation.donorProfileId, profileId)));
        const { lat, lon, ...rest } = r;
        return { ...rest, approximateLocation: { latitude: lat, longitude: lon } };
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
//# sourceMappingURL=donor.service.js.map