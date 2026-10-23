// A minimal D1 binding over node:sqlite, for tests of code that talks to the
// database through $lib/db (prepare → bind → all/first/run). Tests only.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';

const MIGRATIONS = new URL('../../../migrations/', import.meta.url);

/** A fresh in-memory database with the migrations up to and including `upTo` applied. */
export function migratedSqlite(upTo = '9999'): DatabaseSync {
	const sqlite = new DatabaseSync(':memory:');
	const files = readdirSync(MIGRATIONS).filter((f) => /^\d{4}[a-z]?_.*\.sql$/.test(f) && f.slice(0, 5) <= `${upTo}~`).sort();
	for (const f of files) sqlite.exec(readFileSync(new URL(f, MIGRATIONS), 'utf8'));
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
