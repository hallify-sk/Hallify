// Test-only: a D1-shaped wrapper around node:sqlite with the real migrations applied,
// so SQL that the app sends to D1 can be exercised in vitest. Never imported by app code.
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
