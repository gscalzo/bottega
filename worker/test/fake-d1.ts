/**
 * A D1Database-shaped fake over node's built-in SQLite, so the Worker routes
 * can be unit-tested in plain node. The schema is the real one: every file in
 * migrations/ is applied in name order, so the fake cannot drift from D1.
 *
 * Only the subset of the D1 API that worker/db.ts uses is implemented:
 * prepare → bind → first / all / run, and batch.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import type { SQLInputValue, SQLOutputValue } from 'node:sqlite';

const MIGRATIONS_DIR = new URL('../../migrations/', import.meta.url);

/** D1 accepts booleans and undefined as bind values; node:sqlite does not. */
function toSqlValue(v: unknown): SQLInputValue {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v === undefined) return null;
  return v as SQLInputValue;
}

function meta(changes: number, lastRowId: number): D1Response['meta'] {
  return {
    duration: 0,
    size_after: 0,
    rows_read: 0,
    rows_written: 0,
    last_row_id: lastRowId,
    changed_db: changes > 0,
    changes,
  };
}

/** node:sqlite rows have a null prototype; hand out plain objects. */
function plain<T>(row: Record<string, SQLOutputValue>): T {
  return { ...row } as T;
}

class FakeStatement {
  constructor(
    private readonly raw: DatabaseSync,
    private readonly sql: string,
    private readonly params: SQLInputValue[] = [],
  ) {}

  bind(...values: unknown[]): FakeStatement {
    return new FakeStatement(this.raw, this.sql, values.map(toSqlValue));
  }

  first<T>(colName?: string): Promise<T | null> {
    const row = this.raw.prepare(this.sql).get(...this.params);
    if (row === undefined) return Promise.resolve(null);
    if (colName === undefined) return Promise.resolve(plain<T>(row));
    return Promise.resolve((row[colName] ?? null) as T);
  }

  all<T>(): Promise<D1Result<T>> {
    const results = this.raw
      .prepare(this.sql)
      .all(...this.params)
      .map((r) => plain<T>(r));
    return Promise.resolve({ success: true, meta: meta(0, 0), results });
  }

  run<T>(): Promise<D1Result<T>> {
    const { changes, lastInsertRowid } = this.raw.prepare(this.sql).run(...this.params);
    return Promise.resolve({
      success: true,
      meta: meta(Number(changes), Number(lastInsertRowid)),
      results: [],
    });
  }
}

class FakeD1 {
  constructor(private readonly raw: DatabaseSync) {}

  prepare(sql: string): FakeStatement {
    return new FakeStatement(this.raw, sql);
  }

  /** D1 runs a batch in one transaction; these fake statements are plain. */
  batch<T>(statements: FakeStatement[]): Promise<D1Result<T>[]> {
    return Promise.all(statements.map((s) => s.all<T>()));
  }
}

export interface FakeD1Handle {
  /** Pass as `env.DB`. */
  db: D1Database;
  /** The underlying SQLite handle, for seeding rows the routes cannot write. */
  raw: DatabaseSync;
}

export function createFakeD1(): FakeD1Handle {
  const raw = new DatabaseSync(':memory:');
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) raw.exec(readFileSync(new URL(file, MIGRATIONS_DIR), 'utf8'));
  // The only cast: FakeD1 implements the D1Database surface db.ts uses.
  return { db: new FakeD1(raw) as unknown as D1Database, raw };
}
