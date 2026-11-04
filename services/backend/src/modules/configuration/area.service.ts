import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, ilike, or, sql } from 'drizzle-orm';
import { DatabaseService } from '../../platform/db/database.service';
import { AreaDto, AreaPageDto, AreaQueryDto } from './area.dto';
import { area } from './schema';

@Injectable()
export class AreaService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async list(query: AreaQueryDto): Promise<AreaPageDto> {
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;
    const term = query.q?.trim();
    const pattern = term ? `%${term}%` : undefined;
    const rows = await this.db.orm
      .select({
        id: area.id, parentId: area.parentId, level: area.level, code: area.code, nameEn: area.nameEn, nameBn: area.nameBn,
        total: sql<number>`count(*) over()`.mapWith(Number),
      })
      .from(area)
      .where(
        and(
          eq(area.isActive, true),
          query.level ? eq(area.level, query.level) : undefined,
          query.parentId ? eq(area.parentId, query.parentId) : undefined,
          pattern ? or(ilike(area.code, pattern), ilike(area.nameEn, pattern), ilike(area.nameBn, pattern)) : undefined,
        ),
      )
      .orderBy(asc(area.level), asc(area.nameEn))
      .limit(limit)
      .offset(offset);
    const total = rows[0]?.total ?? 0;
    const items: AreaDto[] = rows.map(({ total: _t, ...row }) => row);
    return { items, total, limit, offset };
  }
}
