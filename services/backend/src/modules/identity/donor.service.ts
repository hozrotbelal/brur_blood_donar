import { HttpException, HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { randomBytes, randomUUID } from 'node:crypto';
import { DatabaseService, Db } from '../../platform/db/database.service';
import { OutboxService } from '../../platform/outbox/outbox.service';
import { Principal } from '../../platform/policy/policy.types';
import { StatusHistoryService } from '../../platform/status/status-history.service';
import {
  DAYS, NOTIFICATION_CATEGORIES, ProposeLocationDto, SaveAvailabilityDto, SaveConsentDto, SaveDonorProfileDto,
  SaveNotificationPreferenceDto,
} from './donor.dto';
import { consentRecord, donorAvailability, donorLocation, donorProfile, notificationPreference } from './schema';

export const NEXT_CONTACT_INTERVAL_DAYS = 120;
const BANGLADESH = { minLat: 20.5, maxLat: 26.7, minLon: 88.0, maxLon: 92.7 };
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LOCKED_CONSENTS = ['TERMS', 'PRIVACY'];

type ConsentType = (typeof consentRecord.$inferSelect)['consentType'];
type CaptureChannel = (typeof consentRecord.$inferSelect)['captureChannel'];
type Category = (typeof notificationPreference.$inferSelect)['category'];
type ConsentRow = Pick<typeof consentRecord.$inferSelect, 'id' | 'consentType' | 'granted' | 'policyVersion' | 'capturedAt' | 'captureChannel' | 'language'>;
type PrefRow = Pick<typeof notificationPreference.$inferSelect, 'category' | 'pushEnabled' | 'smsEnabled' | 'inappEnabled' | 'quietStart' | 'quietEnd'>;

const fail = (code: string, status = HttpStatus.UNPROCESSABLE_ENTITY) => new HttpException({ code }, status);

export function newDonorCode(): string {
  const bytes = randomBytes(7);
  return 'D' + Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

export function insideBangladesh(lat: number, lon: number): boolean {
  return lat >= BANGLADESH.minLat && lat <= BANGLADESH.maxLat && lon >= BANGLADESH.minLon && lon <= BANGLADESH.maxLon;
}

export function nextContactDate(lastDonation: string): string {
  const d = new Date(`${lastDonation}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + NEXT_CONTACT_INTERVAL_DAYS);
  return d.toISOString().slice(0, 10);
}

const consentView = (r: ConsentRow) => ({
  id: r.id, type: r.consentType, granted: r.granted, policyVersion: r.policyVersion, capturedAt: r.capturedAt,
  channel: r.captureChannel, language: r.language,
});
const prefView = (r: PrefRow) => ({
  category: r.category, pushEnabled: r.pushEnabled, smsEnabled: r.smsEnabled, inappEnabled: r.inappEnabled,
  quietStart: r.quietStart?.slice(0, 5) ?? null, quietEnd: r.quietEnd?.slice(0, 5) ?? null,
});

@Injectable()
export class DonorService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    private readonly history: StatusHistoryService,
    private readonly outbox: OutboxService,
  ) {}

  async getProfile(principal: Principal) {
    const profile = await this.loadProfile(this.db, principal.userId);
    if (!profile) throw new NotFoundException({ code: 'DONOR_PROFILE_NOT_FOUND' });
    return profile;
  }

  async saveProfile(principal: Principal, dto: SaveDonorProfileDto) {
    if (dto.lastDonationDate && dto.lastDonationDate > new Date().toISOString().slice(0, 10)) throw fail('DATE_IN_FUTURE');
    return this.db.transaction(async (tx) => {
      if (dto.areaId) {
        const area = await tx.query('SELECT 1 FROM cfg.area WHERE id = $1 AND is_active', [dto.areaId]);
        if (!area.rows[0]) throw fail('AREA_NOT_FOUND', HttpStatus.NOT_FOUND);
      }
      const [row] = await tx.orm
        .select({ id: donorProfile.id, bloodGroup: donorProfile.bloodGroup, bloodGroupStatus: donorProfile.bloodGroupStatus })
        .from(donorProfile)
        .where(and(eq(donorProfile.userId, principal.userId), isNull(donorProfile.deletedAt)))
        .for('update');
      const next = dto.lastDonationDate ? nextContactDate(dto.lastDonationDate) : null;
      if (row) {
        if (row.bloodGroupStatus !== 'Self-declared' && row.bloodGroup !== dto.bloodGroup) throw fail('BLOOD_GROUP_LOCKED');
        await tx.orm
          .update(donorProfile)
          .set({
            bloodGroup: dto.bloodGroup,
            ...(dto.areaId ? { areaId: dto.areaId } : {}),
            ...(dto.travelRadiusKm != null ? { travelRadiusKm: dto.travelRadiusKm } : {}),
            ...(dto.lastDonationDate ? { lastDonationDate: dto.lastDonationDate, provisionalNextContactDate: next, nextContactBasis: 'SELF_REPORTED' as const } : {}),
            version: sql`${donorProfile.version} + 1`, updatedAt: new Date(),
          })
          .where(eq(donorProfile.id, row.id));
      } else {
        const id = await this.insertProfile(tx, principal.userId, dto, next);
        await tx.orm.insert(donorAvailability).values({ donorProfileId: id, contactStart: '08:00', contactEnd: '21:00', contactDays: DAYS.join(',') });
        await this.outbox.append(tx, { aggregateType: 'DONOR_PROFILE', aggregateId: id, eventType: 'DonorProfileCreated', payload: {} });
      }
      return this.loadProfile(tx, principal.userId);
    });
  }

  async getAvailability(principal: Principal) {
    const id = await this.profileId(this.db, principal.userId);
    return this.loadAvailability(this.db, id);
  }

  async saveAvailability(principal: Principal, dto: SaveAvailabilityDto) {
    if (dto.contactStart >= dto.contactEnd) throw fail('INVALID_CONTACT_WINDOW');
    if (dto.contactDays.length === 0) throw fail('NO_CONTACT_DAYS');
    const pausedUntil = dto.pausedUntil ? new Date(dto.pausedUntil) : null;
    if (pausedUntil && pausedUntil.getTime() <= Date.now()) throw fail('PAUSE_IN_PAST');
    return this.db.transaction(async (tx) => {
      const id = await this.profileId(tx, principal.userId);
      await tx.orm
        .update(donorAvailability)
        .set({
          routineAvailable: dto.routineAvailable, urgentAvailable: dto.urgentAvailable, pausedUntil, contactStart: dto.contactStart, contactEnd: dto.contactEnd,
          contactDays: DAYS.filter((d) => dto.contactDays.includes(d)).join(','), version: sql`${donorAvailability.version} + 1`, updatedAt: new Date(),
        })
        .where(eq(donorAvailability.donorProfileId, id));
      await this.outbox.append(tx, {
        aggregateType: 'DONOR_PROFILE', aggregateId: id, eventType: 'DonorAvailabilityChanged', payload: {}, version: Date.now(),
      });
      return this.loadAvailability(tx, id);
    });
  }

  async proposeLocation(principal: Principal, dto: ProposeLocationDto) {
    if (!insideBangladesh(dto.latitude, dto.longitude)) throw fail('LOCATION_OUTSIDE_SERVICE_AREA');
    const size = dto.gridSizeM ?? 1000;
    return this.db.transaction(async (tx) => {
      const profileId = await this.profileId(tx, principal.userId);
      await this.requireConsent(tx, principal.userId, 'LOCATION_USE');
      const correlationId = randomUUID();
      const old = await tx.orm
        .update(donorLocation)
        .set({ status: 'Superseded', supersededAt: new Date(), version: sql`${donorLocation.version} + 1`, updatedAt: new Date() })
        .where(and(eq(donorLocation.donorProfileId, profileId), eq(donorLocation.status, 'Pending')))
        .returning({ id: donorLocation.id });
      for (const r of old) await this.recordLocation(tx, principal, r.id, 'Pending', 'Superseded', correlationId);
      const inserted = await tx.query<{ id: string }>(
        `WITH p AS (SELECT ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography AS g),
              t AS (SELECT ST_Transform(g::geometry, 32646) AS m FROM p)
         INSERT INTO idn.donor_location (donor_profile_id, source, status, exact_point, approx_point, grid_cell, grid_size_m, accuracy_m)
         SELECT $1, $4::donor_location_source, 'Pending', p.g, public.snap_to_grid(p.g, $5),
                $5 || ':' || floor(ST_X(t.m) / $5)::bigint || ':' || floor(ST_Y(t.m) / $5)::bigint, $5, $6
           FROM p, t RETURNING id`,
        [profileId, dto.longitude, dto.latitude, dto.source, size, dto.accuracyM ?? null],
      );
      const id = inserted.rows[0].id;
      await this.recordLocation(tx, principal, id, null, 'Pending', correlationId);
      return this.locationView(tx, profileId, id);
    });
  }

  async confirmLocation(principal: Principal, locationId: string) {
    return this.db.transaction(async (tx) => {
      const profileId = await this.profileId(tx, principal.userId);
      await this.requireConsent(tx, principal.userId, 'LOCATION_USE');
      const [pending] = await tx.orm
        .select({ id: donorLocation.id })
        .from(donorLocation)
        .where(and(eq(donorLocation.id, locationId), eq(donorLocation.donorProfileId, profileId), eq(donorLocation.status, 'Pending')))
        .for('update');
      if (!pending) throw new NotFoundException({ code: 'LOCATION_NOT_FOUND' });
      const correlationId = randomUUID();
      const [previous] = await tx.orm
        .update(donorLocation)
        .set({ status: 'Superseded', supersededAt: new Date(), version: sql`${donorLocation.version} + 1`, updatedAt: new Date() })
        .where(and(eq(donorLocation.donorProfileId, profileId), eq(donorLocation.status, 'Approved')))
        .returning({ id: donorLocation.id });
      const prevId = previous?.id ?? null;
      if (prevId) await this.recordLocation(tx, principal, prevId, 'Approved', 'Superseded', correlationId);
      const now = new Date();
      await tx.orm
        .update(donorLocation)
        .set({ status: 'Approved', validatedAt: now, approvedAt: now, confirmedByDonorAt: now, supersedesId: prevId, version: sql`${donorLocation.version} + 1`, updatedAt: now })
        .where(eq(donorLocation.id, locationId));
      await tx.orm
        .update(donorProfile)
        .set({
          approxLocation: sql`(select l.approx_point from idn.donor_location l where l.id = ${locationId})`, locationSource: 'APPROVED_LOCATION',
          version: sql`${donorProfile.version} + 1`, updatedAt: now,
        })
        .where(eq(donorProfile.id, profileId));
      await this.recordLocation(tx, principal, locationId, 'Pending', 'Approved', correlationId);
      await this.outbox.append(tx, {
        aggregateType: 'DONOR_LOCATION', aggregateId: locationId, eventType: 'DonorLocationApproved', payload: { donorProfileId: profileId },
      });
      return this.locationView(tx, profileId, locationId);
    });
  }

  async listLocations(principal: Principal) {
    const profileId = await this.profileId(this.db, principal.userId);
    const rows = await this.db.orm
      .select({ id: donorLocation.id })
      .from(donorLocation)
      .where(eq(donorLocation.donorProfileId, profileId))
      .orderBy(desc(donorLocation.createdAt))
      .limit(50);
    return Promise.all(rows.map((r) => this.locationView(this.db, profileId, r.id)));
  }

  async listConsents(principal: Principal) {
    const rows = await this.db.orm
      .select(this.consentColumns())
      .from(consentRecord)
      .where(and(eq(consentRecord.userId, principal.userId), isNull(consentRecord.withdrawnAt)))
      .orderBy(consentRecord.consentType);
    return rows.map(consentView);
  }

  async saveConsent(principal: Principal, type: string, dto: SaveConsentDto) {
    if (!dto.granted && LOCKED_CONSENTS.includes(type)) throw fail('CONSENT_CANNOT_BE_WITHDRAWN');
    const consentType = type as ConsentType;
    return this.db.transaction(async (tx) => {
      const [prev] = await tx.orm
        .select(this.consentColumns())
        .from(consentRecord)
        .where(and(eq(consentRecord.userId, principal.userId), eq(consentRecord.consentType, consentType), isNull(consentRecord.withdrawnAt)))
        .for('update');
      if (prev && prev.granted === dto.granted && prev.policyVersion === dto.policyVersion) return consentView(prev);
      if (prev) await tx.orm.update(consentRecord).set({ withdrawnAt: new Date() }).where(eq(consentRecord.id, prev.id));
      const [row] = await tx.orm
        .insert(consentRecord)
        .values({
          userId: principal.userId, consentType, granted: dto.granted, policyVersion: dto.policyVersion, capturedAt: new Date(),
          captureChannel: (dto.channel ?? 'PROFILE_SETTINGS') as CaptureChannel, language: dto.language,
        })
        .returning(this.consentColumns());
      const withdrew = !dto.granted && prev?.granted === true;
      await this.outbox.append(tx, {
        aggregateType: 'CONSENT', aggregateId: row.id, eventType: withdrew ? 'ConsentWithdrawn' : 'ConsentChanged',
        payload: { userId: principal.userId, consentType: type, granted: dto.granted },
      });
      if (withdrew && type === 'LOCATION_USE') {
        await tx.orm
          .update(donorProfile)
          .set({
            approxLocation: sql`(select a.centroid from cfg.area a where a.id = ${donorProfile.areaId})`, locationSource: 'AREA_CENTROID',
            version: sql`${donorProfile.version} + 1`, updatedAt: new Date(),
          })
          .where(eq(donorProfile.userId, principal.userId));
      }
      return consentView(row);
    });
  }

  async listNotificationPreferences(principal: Principal) {
    const rows = await this.db.orm.select(this.prefColumns()).from(notificationPreference).where(eq(notificationPreference.userId, principal.userId));
    const byCategory = new Map(rows.map((r) => [r.category, r]));
    return NOTIFICATION_CATEGORIES.map((c) =>
      prefView(byCategory.get(c as Category) ?? { category: c as Category, pushEnabled: false, smsEnabled: false, inappEnabled: false, quietStart: null, quietEnd: null }),
    );
  }

  async savePreference(principal: Principal, category: string, dto: SaveNotificationPreferenceDto) {
    if ((dto.quietStart == null) !== (dto.quietEnd == null)) throw fail('QUIET_HOURS_INCOMPLETE');
    const values = { pushEnabled: dto.pushEnabled, smsEnabled: dto.smsEnabled, inappEnabled: dto.inappEnabled, quietStart: dto.quietStart ?? null, quietEnd: dto.quietEnd ?? null };
    const [row] = await this.db.orm
      .insert(notificationPreference)
      .values({ userId: principal.userId, category: category as Category, ...values })
      .onConflictDoUpdate({
        target: [notificationPreference.userId, notificationPreference.category],
        set: { ...values, version: sql`${notificationPreference.version} + 1`, updatedAt: new Date() },
      })
      .returning(this.prefColumns());
    return prefView(row);
  }

  private consentColumns() {
    return {
      id: consentRecord.id, consentType: consentRecord.consentType, granted: consentRecord.granted, policyVersion: consentRecord.policyVersion,
      capturedAt: consentRecord.capturedAt, captureChannel: consentRecord.captureChannel, language: consentRecord.language,
    };
  }

  private prefColumns() {
    return {
      category: notificationPreference.category, pushEnabled: notificationPreference.pushEnabled, smsEnabled: notificationPreference.smsEnabled,
      inappEnabled: notificationPreference.inappEnabled, quietStart: notificationPreference.quietStart, quietEnd: notificationPreference.quietEnd,
    };
  }

  private async insertProfile(tx: Db, userId: string, dto: SaveDonorProfileDto, next: string | null): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const rows = await tx.orm
        .insert(donorProfile)
        .values({
          userId, donorCode: newDonorCode(), bloodGroup: dto.bloodGroup, areaId: dto.areaId ?? null,
          approxLocation: dto.areaId ? sql`(select centroid from cfg.area where id = ${dto.areaId})` : null, locationSource: 'AREA_CENTROID',
          travelRadiusKm: dto.travelRadiusKm ?? 10, lastDonationDate: dto.lastDonationDate ?? null, provisionalNextContactDate: next,
          nextContactBasis: dto.lastDonationDate ? 'SELF_REPORTED' : 'NONE',
        })
        .onConflictDoNothing({ target: donorProfile.donorCode })
        .returning({ id: donorProfile.id });
      if (rows[0]) return rows[0].id;
    }
    throw fail('DONOR_CODE_UNAVAILABLE', HttpStatus.SERVICE_UNAVAILABLE);
  }

  private async profileId(db: Db, userId: string): Promise<string> {
    const [row] = await db.orm.select({ id: donorProfile.id }).from(donorProfile).where(and(eq(donorProfile.userId, userId), isNull(donorProfile.deletedAt)));
    if (!row) throw new NotFoundException({ code: 'DONOR_PROFILE_NOT_FOUND' });
    return row.id;
  }

  private async requireConsent(db: Db, userId: string, type: ConsentType) {
    const [row] = await db.orm
      .select({ id: consentRecord.id })
      .from(consentRecord)
      .where(and(eq(consentRecord.userId, userId), eq(consentRecord.consentType, type), eq(consentRecord.granted, true), isNull(consentRecord.withdrawnAt)));
    if (!row) throw fail('CONSENT_REQUIRED');
  }

  private recordLocation(tx: Db, principal: Principal, id: string, from: string | null, to: string, correlationId: string) {
    return this.history.record(tx, {
      entityType: 'DONOR_LOCATION', entityId: id, from, to, actorUserId: principal.userId, actorRole: 'DON', source: 'USER', correlationId,
    });
  }

  private async loadProfile(db: Db, userId: string) {
    const [r] = await db.orm
      .select({
        donorCode: donorProfile.donorCode, bloodGroup: donorProfile.bloodGroup, bloodGroupStatus: donorProfile.bloodGroupStatus, areaId: donorProfile.areaId,
        travelRadiusKm: donorProfile.travelRadiusKm, lastDonationDate: donorProfile.lastDonationDate, provisionalNextContactDate: donorProfile.provisionalNextContactDate,
        nextContactBasis: donorProfile.nextContactBasis, donorStatus: donorProfile.donorStatus, locationSource: donorProfile.locationSource,
        approxLat: sql<number | null>`ST_Y(${donorProfile.approxLocation}::geometry)`.mapWith(Number), approxLon: sql<number | null>`ST_X(${donorProfile.approxLocation}::geometry)`.mapWith(Number),
        hasLocation: sql<boolean>`${donorProfile.approxLocation} is not null`, version: donorProfile.version,
      })
      .from(donorProfile)
      .where(and(eq(donorProfile.userId, userId), isNull(donorProfile.deletedAt)));
    if (!r) return null;
    const { approxLat, approxLon, hasLocation, ...rest } = r;
    return { ...rest, approximateLocation: hasLocation ? { latitude: approxLat, longitude: approxLon } : null };
  }

  private async loadAvailability(db: Db, profileId: string) {
    const [r] = await db.orm
      .select({
        routineAvailable: donorAvailability.routineAvailable, urgentAvailable: donorAvailability.urgentAvailable, pausedUntil: donorAvailability.pausedUntil,
        contactStart: donorAvailability.contactStart, contactEnd: donorAvailability.contactEnd, contactDays: donorAvailability.contactDays, version: donorAvailability.version,
      })
      .from(donorAvailability)
      .where(eq(donorAvailability.donorProfileId, profileId));
    return { ...r, contactStart: r.contactStart.slice(0, 5), contactEnd: r.contactEnd.slice(0, 5), contactDays: r.contactDays.split(',') };
  }

  private async locationView(db: Db, profileId: string, id: string) {
    const [r] = await db.orm
      .select({
        id: donorLocation.id, source: donorLocation.source, status: donorLocation.status, gridSizeM: donorLocation.gridSizeM, accuracyM: donorLocation.accuracyM,
        lat: sql<number>`ST_Y(${donorLocation.approxPoint}::geometry)`.mapWith(Number), lon: sql<number>`ST_X(${donorLocation.approxPoint}::geometry)`.mapWith(Number),
        confirmedAt: donorLocation.confirmedByDonorAt, approvedAt: donorLocation.approvedAt, supersededAt: donorLocation.supersededAt,
        rejectionReason: donorLocation.rejectionReason, createdAt: donorLocation.createdAt,
      })
      .from(donorLocation)
      .where(and(eq(donorLocation.id, id), eq(donorLocation.donorProfileId, profileId)));
    const { lat, lon, ...rest } = r;
    return { ...rest, approximateLocation: { latitude: lat, longitude: lon } };
  }
}
