import { drizzle } from 'drizzle-orm/node-postgres';
import { Db } from '../src/platform/db/database.service';

export interface Captured {
  text: string;
  values: unknown[];
}

export interface FakeDb extends Db {
  statements: Captured[];
}

type Responder = (statement: Captured) => { rows: unknown[] } | undefined;

export function fakeDb(respond: Responder = () => undefined): FakeDb {
  const statements: Captured[] = [];
  const run = async (config: string | { text: string; values?: unknown[] }, values?: unknown[]) => {
    const statement = typeof config === 'string' ? { text: config, values: values ?? [] } : { text: config.text, values: config.values ?? values ?? [] };
    statements.push(statement);
    const answer = respond(statement) ?? { rows: [] };
    return { rows: answer.rows, rowCount: answer.rows.length, command: '', oid: 0, fields: [] };
  };
  const client = { query: run } as never;
  return {
    statements,
    orm: drizzle({ client }),
    query: ((text: string, params?: unknown[]) => run(text, params)) as Db['query'],
  };
}
