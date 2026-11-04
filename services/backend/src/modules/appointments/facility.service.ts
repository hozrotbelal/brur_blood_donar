import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { DatabaseService } from '../../platform/db/database.service';
import { FacilityDto, FacilityPageDto, FacilityQueryDto } from './facility.dto';
import { facility } from './schema';

@Injectable()
export class FacilityService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async list(query: FacilityQueryDto): Promise<FacilityPageDto> {
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;
    const term = query.q?.trim();
    const pattern = term ? `%${term}%` : undefined;
    const rows = await this.db.orm
      .select({
        id: facility.id, type: facility.facilityType, nameEn: facility.nameEn, nameBn: facility.nameBn, areaId: facility.areaId,
        isVerified: facility.isVerified, supportsBooking: facility.supportsBooking, total: sql<number>`count(*) over()`.mapWith(Number),
      })
      .from(facility)
      .where(
        and(
          eq(facility.status, 'Active'),
          query.areaId ? eq(facility.areaId, query.areaId) : undefined,
          query.type ? eq(facility.facilityType, query.type) : undefined,
          pattern ? or(ilike(facility.nameEn, pattern), ilike(facility.nameBn, pattern)) : undefined,
        ),
      )
      .orderBy(desc(facility.isVerified), asc(facility.nameEn))
      .limit(limit)
      .offset(offset);
    const total = rows[0]?.total ?? 0;
    const items: FacilityDto[] = rows.map(({ total: _t, ...row }) => row);
    return { items, total, limit, offset };
  }
}
