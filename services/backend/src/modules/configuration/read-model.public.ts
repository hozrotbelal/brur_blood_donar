import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import { Db } from '../../platform/db/database.service';
import { configSetting } from './schema';

export async function activeGlobalSettings(db: Db, keys: string[]): Promise<Map<string, unknown>> {
  if (keys.length === 0) return new Map();
  const rows = await db.orm
    .selectDistinctOn([configSetting.key], { key: configSetting.key, value: configSetting.value })
    .from(configSetting)
    .where(and(inArray(configSetting.key, keys), eq(configSetting.status, 'Active'), or(isNull(configSetting.scopeType), eq(configSetting.scopeType, 'GLOBAL'))))
    .orderBy(configSetting.key, desc(configSetting.version));
  return new Map(rows.map((r) => [r.key, r.value]));
}
