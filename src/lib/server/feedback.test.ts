import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';

const envMock = vi.hoisted(() => ({
	env: { BREVO_API_KEY: 'test-key', APP_URL: 'https://hallify.sk', HALLIFY_DOMAIN: 'hallify.sk' } as Record<string, string | undefined>,
}));
vi.mock('$env/dynamic/private', () => envMock);

import { testD1 } from './test-d1';
import { clientFeedback, hallFeedback, loadFeedback, saveFeedback, sendFeedbackInvites } from './feedback';
import { deleteUserAndCleanup } from '$lib/orgLifecycle';

let db: D1Database;
let exec: (sql: string) => void;
let sent: Array<{ to: string; subject: string; html: string }>;
const day = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

beforeEach(async () => {
	({ db, exec } = await testD1());
	exec(`
		INSERT INTO organizations (id, name, slug) VALUES ('org', 'Kaštieľ', 'kastiel'), ('off', 'Zavreté', 'zavrete');
		UPDATE organizations SET suspended_at = datetime('now') WHERE id = 'off';
		INSERT INTO users (id, email, password_hash, first_name, last_name, account_type, org_id) VALUES
		  ('client', 'client@example.com', 'x', 'Jana', 'Nová', 'client', 'org'),
		  ('staff', 'staff@example.com', 'x', 'Sta', 'Ff', 'organization', NULL);
		INSERT INTO halls (id, org_id, name, allow_feedback) VALUES
		  ('hall', 'org', 'Veľká sála', 1), ('quiet', 'org', 'Salónik', 0), ('susp', 'off', 'Iná', 1);
		INSERT INTO reservations (id, org_id, hall_id, user_id, title, event_date, status, invite_code) VALUES
		  ('done',     'org', 'hall',  'client', 'Svadba',    '${day(-2)}',  'completed', 'A'),
		  ('old',      'org', 'hall',  'client', 'Stužková',  '${day(-40)}', 'completed', 'B'),
		  ('quietone', 'org', 'quiet', 'client', 'Oslava',    '${day(-2)}',  'completed', 'C'),
		  ('upcoming', 'org', 'hall',  'client', 'Krst',      '${day(5)}',   'approved',  'D'),
		  ('staffown', 'org', 'hall',  'staff',  'Porada',    '${day(-4)}',  'completed', 'E'),
		  ('suspended','off', 'susp',  'client', 'Ples',      '${day(-2)}',  'completed', 'F'),
		  ('rated',    'org', 'hall',  'client', 'Jubileum',  '${day(-3)}',  'completed', 'G');
	`);
	sent = [];
	vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
		const body = JSON.parse(init.body);
		sent.push({ to: body.to[0].email, subject: body.subject, html: body.htmlContent });
		return new Response('{}', { status: 201 });
	}));
});

afterEach(() => vi.unstubAllGlobals());

describe('feedback invitations (D5)', () => {
	it('invites a client once, only for a just-finished event at a hall that asks', async () => {
		await saveFeedback(db, { reservationId: 'rated', orgId: 'org', hallId: 'hall', userId: 'client', rating: 5, comment: null });
		expect(await sendFeedbackInvites(db)).toBe(1);
		expect(sent).toHaveLength(1);
		expect(sent[0].to).toBe('client@example.com');
		expect(sent[0].subject).toBe('Ako sa vám páčilo podujatie Svadba?');
		expect(sent[0].html).toContain('/halls/my-reservations/done#feedback');
		expect(sent[0].html).toContain('Ohodnotiť podujatie');
		// A second run finds nothing left.
		expect(await sendFeedbackInvites(db)).toBe(0);
		expect(sent).toHaveLength(1);
	});
});

describe('storing feedback', () => {
	it('keeps one rating per reservation and lets it change', async () => {
		await saveFeedback(db, { reservationId: 'done', orgId: 'org', hallId: 'hall', userId: 'client', rating: 3, comment: 'Dobré' });
		await saveFeedback(db, { reservationId: 'done', orgId: 'org', hallId: 'hall', userId: 'client', rating: 5, comment: null });
		const row = await loadFeedback(db, 'done');
		expect(row?.rating).toBe(5);
		expect(row?.comment).toBeNull();
		expect(await loadFeedback(db, 'old')).toBeNull();
	});

	it('refuses a rating outside one to five', async () => {
		await expect(saveFeedback(db, { reservationId: 'done', orgId: 'org', hallId: 'hall', userId: 'client', rating: 6, comment: null })).rejects.toThrow();
	});

	it('summarises a hall and lists a client\'s ratings', async () => {
		await saveFeedback(db, { reservationId: 'done', orgId: 'org', hallId: 'hall', userId: 'client', rating: 5, comment: 'Krásne' });
		await saveFeedback(db, { reservationId: 'rated', orgId: 'org', hallId: 'hall', userId: 'client', rating: 4, comment: null });
		const hall = await hallFeedback(db, 'org', 'hall');
		expect(hall?.summary.count).toBe(2);
		expect(hall?.summary.average).toBe(4.5);
		expect(hall?.recent[0].client_name).toBe('Jana Nová');
		// Another organisation sees nothing of it.
		expect((await hallFeedback(db, 'off', 'hall'))?.summary.count).toBe(0);
		const mine = await clientFeedback(db, 'org', 'client');
		expect(mine.map((f) => f.reservation_id)).toEqual(['done', 'rated']);
	});

	it('goes with the client when their account is deleted', async () => {
		await saveFeedback(db, { reservationId: 'done', orgId: 'org', hallId: 'hall', userId: 'client', rating: 5, comment: null });
		exec(`INSERT INTO client_notes (org_id, client_key, notes) VALUES ('org', 'u:client', 'VIP')`);
		await deleteUserAndCleanup(db, 'client');
		expect(await loadFeedback(db, 'done')).toBeNull();
		expect(await clientFeedback(db, 'org', 'client')).toEqual([]);
	});
});
