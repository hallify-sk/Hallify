// Test-only D1 helpers over node:sqlite with the real migrations applied, so SQL the
// app sends to D1 can be exercised in vitest. Never imported by app code.
//  - testD1(): a fresh database with every migration, plus a raw exec.
//  - sqliteWithSchema(extra) / migratedSqlite(upTo) + d1(sqlite): baseline plus named
//    migrations, or migrations up to a given number, and a D1
//    binding over a sqlite handle the test keeps (prepare → bind → all/first/run).
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { D1Database } from '@cloudflare/workers-types';

type Row = Record<string, unknown>;
export async function testD1(): Promise<{ db: D1Database; exec: (sql: string) => void }> {
	const { DatabaseSync } = await import('node:sqlite');
	const raw = new DatabaseSync(':memory:');
	const dir = join(process.cwd(), 'migrations');
	for (const f of readdirSync(dir).filter((n) => /^\d{4}[a-z]?_.*\.sql$/.test(n)).sort()) {
		raw.exec(readFileSync(join(dir, f), 'utf8'));
	}
	raw.exec('PRAGMA foreign_keys = ON;');

	const prepare = (sql: string) => {
		let params: unknown[] = [];
		const stmt = {
			bind(...p: unknown[]) {
				params = p.map((v) => (typeof v === 'boolean' ? (v ? 1 : 0) : v === undefined ? null : v));
				return stmt;
			},
			async all<T = Row>() {
				return { results: raw.prepare(sql).all(...(params as never[])) as T[], success: true, meta: {} };
			},
			async first<T = Row>() {
				return ((raw.prepare(sql).get(...(params as never[])) as T | undefined) ?? null) as T | null;
			},
			async run() {
				const r = raw.prepare(sql).run(...(params as never[]));
				return { success: true, results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
			},
		};
		return stmt;
	};

	return { db: { prepare } as unknown as D1Database, exec: (sql: string) => raw.exec(sql) };
}

const MIGRATIONS = new URL('../../../migrations/', import.meta.url);

/** A fresh in-memory database with the migrations up to and including `upTo` applied. */
export function migratedSqlite(upTo = '9999'): DatabaseSync {
	const sqlite = new DatabaseSync(':memory:');
	const files = readdirSync(MIGRATIONS).filter((f) => /^\d{4}[a-z]?_.*\.sql$/.test(f) && f.slice(0, 5) <= `${upTo}~`).sort();
	for (const f of files) sqlite.exec(readFileSync(new URL(f, MIGRATIONS), 'utf8'));
	return sqlite;
}

/** A fresh in-memory database with the baseline schema plus any extra migrations. */
export function sqliteWithSchema(extraMigrations: string[] = []): DatabaseSync {
	const sqlite = new DatabaseSync(':memory:');
	for (const name of ['0001_baseline.sql', ...extraMigrations]) {
		sqlite.exec(readFileSync(new URL(name, MIGRATIONS), 'utf8'));
	}
	return sqlite;
}

export function d1(sqlite: DatabaseSync): App.Locals['db'] {
	const statement = (sql: string, values: unknown[] = []) => ({
		bind: (...args: unknown[]) => statement(sql, args),
		all: async () => ({ results: sqlite.prepare(sql).all(...(values as never[])) }),
		first: async () => sqlite.prepare(sql).get(...(values as never[])) ?? null,
		run: async () => {
			const r = sqlite.prepare(sql).run(...(values as never[]));
			return { success: true, meta: { changes: Number(r.changes) } };
		}
	});
	return {
		prepare: (sql: string) => statement(sql),
		batch: async (list: ReturnType<typeof statement>[]) => Promise.all(list.map((s) => s.run()))
	} as unknown as App.Locals['db'];
}
