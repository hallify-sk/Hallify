import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';

vi.mock('$lib/email', () => ({ notifyEventReminder: vi.fn(async () => true) }));

import { testD1 } from './test-d1';
import { clearReminder, sendEventReminders } from './reminders';
import { notifyEventReminder } from '$lib/email';

let db: D1Database;
let exec: (sql: string) => void;
const day = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

beforeEach(async () => {
	vi.clearAllMocks();
	({ db, exec } = await testD1());
	exec(`
		INSERT INTO organizations (id, name, slug) VALUES ('o1', 'Org', 'org');
		INSERT INTO users (id, email, password_hash, first_name, last_name, account_type) VALUES
		  ('client', 'c@x.sk', 'x', 'Cli', 'Ent', 'client'), ('staff', 's@x.sk', 'x', 'Sta', 'Ff', 'organization');
		INSERT INTO halls (id, org_id, name) VALUES ('h1', 'o1', 'Sála'), ('h2', 'o1', 'Salónik');
		INSERT INTO reservations (id, org_id, hall_id, user_id, title, event_date, status, invite_code, created_at) VALUES
		  ('due',      'o1', 'h1', 'client', 'A', '${day(2)}',  'approved',  'A', datetime('now', '-10 days')),
		  ('planned',  'o1', 'h1', 'client', 'B', '${day(3)}',  'planned',   'B', datetime('now', '-10 days')),
		  ('far',      'o1', 'h1', 'client', 'C', '${day(9)}',  'approved',  'C', datetime('now', '-10 days')),
		  ('pending',  'o1', 'h2', 'client', 'D', '${day(1)}',  'pending',   'D', datetime('now', '-10 days')),
		  ('staffown', 'o1', 'h2', 'staff',  'E', '${day(2)}',  'approved',  'E', datetime('now', '-10 days')),
		  ('fresh',    'o1', 'h1', 'client', 'F', '${day(1)}',  'approved',  'F', datetime('now', '-1 hours')),
		  ('today',    'o1', 'h1', 'client', 'G', '${day(0)}',  'approved',  'G', datetime('now', '-10 days'));
	`);
});

const reminded = () => vi.mocked(notifyEventReminder).mock.calls.map((c) => c[2]).sort();

describe('event reminders (M4)', () => {
	it('reminds confirmed client bookings within three days, once', async () => {
		expect(await sendEventReminders(db)).toBe(2);
		expect(reminded()).toEqual(['due', 'planned']);
		// A second run finds nothing left to send.
		expect(await sendEventReminders(db)).toBe(0);
		expect(notifyEventReminder).toHaveBeenCalledTimes(2);
	});

	it('reminds a moved event again before its new date', async () => {
		await sendEventReminders(db);
		vi.clearAllMocks();
		await clearReminder(db, 'due');
		expect(await sendEventReminders(db)).toBe(1);
		expect(reminded()).toEqual(['due']);
	});
});
