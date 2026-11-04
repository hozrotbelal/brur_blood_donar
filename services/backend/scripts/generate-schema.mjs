// Generates Drizzle schema files from a database that has every migration applied.
// Usage: DATABASE_URL=postgres://... node scripts/generate-schema.mjs [--check]
// --check compares the generated output with the committed files and exits 1 on any difference.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Client } = require('pg');
const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const CHECK = process.argv.includes('--check');
const drift = [];

function emit(path, content) {
  if (!CHECK) {
    writeFileSync(path, content);
    return;
  }
  const current = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (current !== content) drift.push(path);
}

const MODULES = {
  idn: 'modules/identity', req: 'modules/request', src: 'modules/matching', crd: 'modules/case-workflow', sup: 'modules/support',
  ntf: 'modules/notification', mod: 'modules/moderation', apt: 'modules/appointments', com: 'modules/community', rpt: 'modules/reporting',
  aud: 'modules/audit', cfg: 'modules/configuration', platform: 'platform/db',
};

const camel = (s) => s.replace(/[^a-zA-Z0-9]+([a-zA-Z0-9])/g, (_, c) => c.toUpperCase()).replace(/^[A-Z]/, (c) => c.toLowerCase());
const enumConst = (name) => camel(name) + 'Enum';
const q = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

function column(col, enums) {
  const { name, type, notNull, def } = col;
  let base = type;
  let isArray = false;
  if (base.endsWith('[]')) {
    isArray = true;
    base = base.slice(0, -2);
  }
  const imports = new Set();
  let expr;
  let m;
  if (enums.has(base)) {
    expr = `${enumConst(base)}(${q(name)})`;
    imports.add(`enum:${enumConst(base)}`);
  } else if (base === 'uuid') expr = `uuid(${q(name)})`;
  else if (base === 'text') expr = `text(${q(name)})`;
  else if ((m = /^character varying(?:\((\d+)\))?$/.exec(base))) expr = m[1] ? `varchar(${q(name)}, { length: ${m[1]} })` : `varchar(${q(name)})`;
  else if ((m = /^character(?:\((\d+)\))?$/.exec(base))) expr = m[1] ? `char(${q(name)}, { length: ${m[1]} })` : `char(${q(name)})`;
  else if (base === 'boolean') expr = `boolean(${q(name)})`;
  else if (base === 'integer') expr = `integer(${q(name)})`;
  else if (base === 'smallint') expr = `smallint(${q(name)})`;
  else if (base === 'bigint') expr = `bigint(${q(name)}, { mode: 'bigint' })`;
  else if (base === 'double precision') expr = `doublePrecision(${q(name)})`;
  else if (base === 'real') expr = `real(${q(name)})`;
  else if ((m = /^numeric(?:\((\d+),(\d+)\))?$/.exec(base))) expr = m[1] ? `numeric(${q(name)}, { precision: ${m[1]}, scale: ${m[2]} })` : `numeric(${q(name)})`;
  else if (base === 'timestamp with time zone') expr = `timestamp(${q(name)}, { withTimezone: true, mode: 'date' })`;
  else if (base === 'timestamp without time zone') expr = `timestamp(${q(name)}, { mode: 'date' })`;
  else if (base === 'date') expr = `date(${q(name)}, { mode: 'string' })`;
  else if (base === 'time without time zone') expr = `time(${q(name)})`;
  else if (base === 'interval') expr = `interval(${q(name)})`;
  else if (base === 'jsonb') expr = `jsonb(${q(name)})`;
  else if (base === 'json') expr = `json(${q(name)})`;
  else if (base === 'inet') expr = `inet(${q(name)})`;
  else if (base === 'bytea') {
    expr = `bytea(${q(name)})`;
    imports.add('custom:bytea');
  } else if (base.startsWith('geography') || base.startsWith('geometry')) {
    expr = `geography(${q(name)})`;
    imports.add('custom:geography');
  } else {
    throw new Error(`unmapped type ${type} on ${name}`);
  }
  if (imports.size === 0) imports.add(`core:${expr.split('(')[0]}`);
  if (isArray) expr += '.array()';
  if (col.primaryKey && col.singlePk) expr += '.primaryKey()';
  if (notNull && !(col.primaryKey && col.singlePk)) expr += '.notNull()';
  if (def !== null && def !== undefined) {
    const d = def.trim();
    if (/^gen_random_uuid\(\)$/.test(d)) expr += '.defaultRandom()';
    else if (/^now\(\)$/.test(d)) expr += '.defaultNow()';
    else if (/^(true|false)$/.test(d)) expr += `.default(${d})`;
    else if (/^-?\d+(\.\d+)?$/.test(d)) expr += base === 'bigint' ? `.default(${d}n)` : /numeric/.test(base) ? `.default(${q(d)})` : `.default(${d})`;
    else if ((m = /^'((?:[^']|'')*)'::[\w ."]+$/.exec(d)) && !isArray && (enums.has(base) || base === 'text' || base.startsWith('character'))) expr += `.default(${q(m[1].replace(/''/g, "'"))})`;
    else {
      expr += `.default(sql\`${d.replace(/`/g, '\\`')}\`)`;
      imports.add('orm:sql');
    }
  }
  return { expr, imports };
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const enumRows = (await client.query(
    `SELECT t.typname AS name, array_agg(e.enumlabel::text ORDER BY e.enumsortorder) AS labels
       FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' GROUP BY t.typname ORDER BY t.typname`,
  )).rows;
  const enums = new Map(enumRows.map((r) => [r.name, r.labels]));

  const tables = (await client.query(
    `SELECT n.nspname AS schema, c.relname AS name, c.relkind
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('r','p') AND NOT c.relispartition AND n.nspname = ANY($1)
      ORDER BY n.nspname, c.relname`,
    [Object.keys(MODULES)],
  )).rows;

  const columns = (await client.query(
    `SELECT n.nspname AS schema, c.relname AS table, a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull AS not_null,
            pg_get_expr(d.adbin, d.adrelid) AS def, a.attnum,
            EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = c.oid AND i.indisprimary AND a.attnum = ANY (i.indkey)) AS pk
       FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
       LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
      WHERE a.attnum > 0 AND NOT a.attisdropped AND c.relkind IN ('r','p') AND NOT c.relispartition AND n.nspname = ANY($1)
      ORDER BY n.nspname, c.relname, a.attnum`,
    [Object.keys(MODULES)],
  )).rows;
  await client.end();

  const enumLines = [...enums.entries()].map(([name, labels]) => `export const ${enumConst(name)} = pgEnum(${q(name)}, [${labels.map(q).join(', ')}]);`);
  emit(join(root, 'platform/db/enums.ts'), `// Generated by scripts/generate-schema.mjs from the migrated database. Do not edit by hand.\nimport { pgEnum } from 'drizzle-orm/pg-core';\n\n${enumLines.join('\n')}\n`);

  for (const [schema, dir] of Object.entries(MODULES)) {
    const own = tables.filter((t) => t.schema === schema);
    if (own.length === 0) continue;
    const core = new Set(['pgSchema']);
    const enumImports = new Set();
    const custom = new Set();
    let needSql = false;
    const defs = [];
    for (const t of own) {
      const cols = columns.filter((c) => c.schema === schema && c.table === t.name);
      const pkCols = cols.filter((c) => c.pk);
      const lines = [];
      for (const c of cols) {
        const { expr, imports } = column({ name: c.name, type: c.type, notNull: c.not_null, def: c.def, primaryKey: c.pk, singlePk: pkCols.length === 1 }, enums);
        for (const i of imports) {
          const [kind, value] = i.split(':');
          if (kind === 'core') core.add(value);
          else if (kind === 'enum') enumImports.add(value);
          else if (kind === 'custom') custom.add(value);
          else if (kind === 'orm') needSql = true;
        }
        lines.push(`  ${camel(c.name)}: ${expr},`);
      }
      let extra = '';
      if (pkCols.length > 1) {
        core.add('primaryKey');
        extra = `, (t) => [primaryKey({ columns: [${pkCols.map((c) => `t.${camel(c.name)}`).join(', ')}] })]`;
      }
      defs.push(`export const ${camel(t.name)} = ${camel(schema)}Schema.table(${q(t.name)}, {\n${lines.join('\n')}\n}${extra});`);
    }
    const depth = dir.split('/').length;
    const platformPath = dir === 'platform/db' ? '.' : `${'../'.repeat(depth)}platform/db`;
    const header = [
      '// Generated by scripts/generate-schema.mjs from the migrated database. Do not edit by hand; change a migration and regenerate.',
      needSql ? "import { sql } from 'drizzle-orm';" : null,
      `import { ${[...core].sort().join(', ')} } from 'drizzle-orm/pg-core';`,
      enumImports.size ? `import { ${[...enumImports].sort().join(', ')} } from '${platformPath}/enums';` : null,
      custom.size ? `import { ${[...custom].sort().join(', ')} } from '${platformPath}/column-types';` : null,
      '',
      `export const ${camel(schema)}Schema = pgSchema(${q(schema)});`,
      '',
    ].filter((l) => l !== null);
    if (!CHECK) mkdirSync(join(root, dir), { recursive: true });
    emit(join(root, dir, 'schema.ts'), `${header.join('\n')}\n${defs.join('\n\n')}\n`);
    if (!CHECK) console.log(`${dir}/schema.ts: ${own.length} tables`);
  }
}

main()
  .then(() => {
    if (!CHECK) return;
    if (drift.length) {
      console.error(['schema files differ from the database:', ...drift.map((d) => '  ' + d), 'Run npm run schema:generate and commit the result.'].join(String.fromCharCode(10)));
      process.exit(1);
    }
    console.log('schema files match the database');
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
