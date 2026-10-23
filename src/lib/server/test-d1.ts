// A D1Database stand-in over node:sqlite, for tests only (never imported by app code).
// Covers what $lib/db/index uses: prepare().bind().first() / .all() / .run().

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import type { D1Database } from '@cloudflare/workers-types';

/** A fresh in-memory database with the baseline schema plus any extra migrations. */
export function sqliteWithSchema(extraMigrations: string[] = []): DatabaseSync {
	const sqlite = new DatabaseSync(':memory:');
	for (const name of ['0001_baseline.sql', ...extraMigrations]) {
		sqlite.exec(readFileSync(new URL(`../../../migrations/${name}`, import.meta.url), 'utf8'));
	}
	return sqlite;
}

type Value = string | number | null;

export function d1(sqlite: DatabaseSync): D1Database {
	function statement(sql: string, values: Value[] = []) {
		return {
			bind: (...args: unknown[]) => statement(sql, args as Value[]),
			first: async () => (sqlite.prepare(sql).get(...values) as unknown) ?? null,
			all: async () => ({ results: sqlite.prepare(sql).all(...values) }),
			run: async () => {
				const info = sqlite.prepare(sql).run(...values);
				return { success: true, meta: { changes: Number(info.changes) } };
			}
		};
	}
	return { prepare: (sql: string) => statement(sql) } as unknown as D1Database;
}
