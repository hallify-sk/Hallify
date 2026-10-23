// Test-only: an in-memory SQLite database with every migration applied, behind the
// slice of the D1 binding that $lib/db/index uses (prepare → bind → first/all/run).
// Imported by *.test.ts files only; never by app code.

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';

export function migratedDatabase(): DatabaseSync {
	const sqlite = new DatabaseSync(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON');
	const dir = new URL('../../../migrations/', import.meta.url);
	for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
		sqlite.exec(readFileSync(new URL(f, dir), 'utf8'));
	}
	return sqlite;
}

export function d1(sqlite: DatabaseSync): App.Locals['db'] {
	const stmt = (sql: string, values: unknown[] = []) => ({
		bind: (...args: unknown[]) => stmt(sql, args),
		first: async () => (sqlite.prepare(sql).get(...(values as never[])) as unknown) ?? null,
		all: async () => ({ results: sqlite.prepare(sql).all(...(values as never[])) }),
		run: async () => {
			const r = sqlite.prepare(sql).run(...(values as never[]));
			return { meta: { changes: Number(r.changes) } };
		}
	});
	return { prepare: (sql: string) => stmt(sql) } as unknown as App.Locals['db'];
}
