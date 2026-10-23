import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';

vi.mock('$env/dynamic/private', () => ({ env: { APP_URL: 'https://hallify.sk' } }));
vi.mock('$lib/email', () => ({ sendEmail: vi.fn(async () => true) }));

import { testD1 } from './test-d1';
import { loadCapNotices, nextPlanForCap, noteMonthUsage, recordTurnedAway } from './cap-notices';
import { sendEmail } from '$lib/email';

let db: D1Database;
let exec: (sql: string) => void;
const hall = { id: 'h1', org_id: 'o1', name: 'Veľká sála' };
// A month safely in the future, whatever today is.
const d = new Date();
const month = `${d.getFullYear() + 1}-03`;

function book(n: number, from = 1) {
	const rows = Array.from({ length: n }, (_, i) =>
		`('r${from + i}', 'o1', 'h1', 'client', 'Akcia', '${month}-${String(from + i).padStart(2, '0')}', 'pending', 'I${from + i}')`);
	exec(`INSERT INTO reservations (id, org_id, hall_id, user_id, title, event_date, status, invite_code) VALUES ${rows.join(',')};`);
}

beforeEach(async () => {
	vi.clearAllMocks();
	({ db, exec } = await testD1());
	exec(`
		INSERT INTO organizations (id, name, slug) VALUES ('o1', 'Org', 'org');
		INSERT INTO users (id, email, password_hash, first_name, last_name, account_type) VALUES
		  ('owner', 'owner@x.sk', 'x', 'O', 'W', 'organization'), ('client', 'c@x.sk', 'x', 'C', 'L', 'client');
		INSERT INTO organization_members (id, org_id, user_id, role) VALUES ('m1', 'o1', 'owner', 'owner');
		INSERT INTO halls (id, org_id, name) VALUES ('h1', 'o1', 'Veľká sála');
	`);
});

describe('monthly cap notices (M17)', () => {
	it('suggests the next plan with a higher cap', () => {
		expect(nextPlanForCap('free')).toMatchObject({ id: 'starter', cap: 12 });
		expect(nextPlanForCap('professional')).toMatchObject({ id: 'enterprise', cap: -1 });
		expect(nextPlanForCap('enterprise')).toBeNull();
	});

	it('emails the owner once, when the booking that fills the month is made', async () => {
		book(4);
		await noteMonthUsage(db, hall, `${month}-04`);
		expect(sendEmail).not.toHaveBeenCalled();

		book(1, 5);
		await noteMonthUsage(db, hall, `${month}-05`);
		expect(sendEmail).toHaveBeenCalledOnce();
		const [, to, subject, html] = vi.mocked(sendEmail).mock.calls[0];
		expect(to).toBe('owner@x.sk');
		expect(subject).toContain('Veľká sála');
		expect(html).toContain('Starter');
		expect(html).toContain('https://hallify.sk/app/billing');

		await noteMonthUsage(db, hall, `${month}-05`);
		expect(sendEmail).toHaveBeenCalledOnce();
	});

	it('counts clients turned away, and shows the full month to the console', async () => {
		book(5);
		await recordTurnedAway(db, hall, `${month}-20`);
		await recordTurnedAway(db, hall, `${month}-21`);
		expect(sendEmail).toHaveBeenCalledOnce();

		const caps = await loadCapNotices(db, 'o1');
		expect(caps.next).toMatchObject({ id: 'starter' });
		expect(caps.notices).toEqual([{ hallId: 'h1', hallName: 'Veľká sála', month, booked: 5, cap: 5, turnedAway: 2 }]);
	});

	it('drops the notice once the month has room again or the plan allows more', async () => {
		book(5);
		exec(`UPDATE reservations SET status = 'cancelled' WHERE id = 'r1'`);
		expect((await loadCapNotices(db, 'o1')).notices).toEqual([]);
		exec(`UPDATE reservations SET status = 'pending' WHERE id = 'r1';
		      INSERT INTO subscriptions (id, org_id, plan, status) VALUES ('s1', 'o1', 'starter', 'active');`);
		expect((await loadCapNotices(db, 'o1')).notices).toEqual([]);
	});
});
