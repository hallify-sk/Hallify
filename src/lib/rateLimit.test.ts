import { describe, expect, it } from 'vitest';
import { rateLimit, rateLimitStatus } from './rateLimit';
import { d1, sqliteWithSchema } from './server/test-d1';

const rule = { limit: 3, windowSeconds: 900 };

describe('rateLimitStatus', () => {
	it('reads the counter without consuming it', async () => {
		const db = d1(sqliteWithSchema(['0002_rate_limits.sql']));
		for (let i = 0; i < 10; i++) expect((await rateLimitStatus(db, 'k', rule)).ok).toBe(true);
	});

	it('blocks once `limit` failures have been recorded, and only then', async () => {
		const db = d1(sqliteWithSchema(['0002_rate_limits.sql']));
		await rateLimit(db, 'k', rule);
		await rateLimit(db, 'k', rule);
		expect((await rateLimitStatus(db, 'k', rule)).ok).toBe(true);
		await rateLimit(db, 'k', rule);
		const status = await rateLimitStatus(db, 'k', rule);
		expect(status.ok).toBe(false);
		expect(status.retryAfterMinutes).toBeGreaterThanOrEqual(1);
		expect((await rateLimitStatus(db, 'other', rule)).ok).toBe(true);
	});

	it('ignores an expired window', async () => {
		const sqlite = sqliteWithSchema(['0002_rate_limits.sql']);
		sqlite.exec("INSERT INTO rate_limits (key, count, window_start) VALUES ('k', 99, datetime('now', '-1 hour'))");
		expect((await rateLimitStatus(d1(sqlite), 'k', rule)).ok).toBe(true);
	});
});
