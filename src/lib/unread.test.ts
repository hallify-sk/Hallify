import { describe, expect, it, beforeEach } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import { testD1 } from '$lib/server/test-d1';
import { unreadMessageCount, markTicketRead, markChannelRead } from './unread';

let db: D1Database;
let exec: (sql: string) => void;

beforeEach(async () => {
	({ db, exec } = await testD1());
	exec(`
		INSERT INTO organizations (id, name, slug) VALUES ('o1', 'Org', 'org');
		INSERT INTO users (id, email, password_hash, first_name, last_name, account_type) VALUES
		  ('client', 'c@x.sk', 'x', 'Cli', 'Ent', 'client'),
		  ('staff', 's@x.sk', 'x', 'Sta', 'Ff', 'organization'),
		  ('member', 'm@x.sk', 'x', 'Mem', 'Ber', 'organization');
		INSERT INTO organization_members (id, org_id, user_id, role, joined_at) VALUES
		  ('om1', 'o1', 'staff', 'owner', '2026-01-01 00:00:00'),
		  ('om2', 'o1', 'member', 'member', '2026-01-01 00:00:00');
		INSERT INTO tickets (id, org_id, user_id, subject, created_at) VALUES ('t1', 'o1', 'client', 'Hall – 1 Nov', '2026-10-01 09:00:00');
	`);
});

const msg = (id: string, sender: string, at: string, type = 'text', ticket = 't1') =>
	exec(`INSERT INTO messages (id, ticket_id, sender_id, body, message_type, created_at) VALUES ('${id}', '${ticket}', '${sender}', 'x', '${type}', '${at}')`);

describe('unreadMessageCount', () => {
	it('counts a first staff message to the client, and reading it clears the badge', async () => {
		msg('m1', 'staff', '2026-10-01 10:00:00');
		expect(await unreadMessageCount(db, 'client', null, false)).toBe(1);
		await markTicketRead(db, 'client', 't1');
		expect(await unreadMessageCount(db, 'client', null, false)).toBe(0);
	});

	it('ignores system messages and threads without an organisation', async () => {
		exec(`INSERT INTO tickets (id, org_id, user_id, subject) VALUES ('legacy', NULL, 'client', '[Reservation] X')`);
		msg('s1', 'staff', '2026-10-01 10:00:00', 'system', 'legacy');
		msg('s2', 'staff', '2026-10-01 10:00:00', 'system');
		expect(await unreadMessageCount(db, 'client', null, false)).toBe(0);
	});

	it('shows the staff inbox until someone answers or this staff member opens it', async () => {
		msg('m1', 'client', '2026-10-01 10:00:00');
		expect(await unreadMessageCount(db, 'staff', 'o1', true)).toBe(1);
		await markTicketRead(db, 'staff', 't1');
		expect(await unreadMessageCount(db, 'staff', 'o1', true)).toBe(0);
	});

	it('counts team channels with unread messages from colleagues', async () => {
		exec(`INSERT INTO channels (id, org_id, name, created_at) VALUES ('c1', 'o1', 'general', '2026-01-01 00:00:00')`);
		exec(`INSERT INTO channel_messages (id, channel_id, org_id, sender_id, body, created_at) VALUES ('cm1', 'c1', 'o1', 'staff', 'hi', '2026-10-01 10:00:00')`);
		expect(await unreadMessageCount(db, 'member', 'o1', false)).toBe(1);
		// One's own messages never count.
		expect(await unreadMessageCount(db, 'staff', 'o1', true)).toBe(0);
		await markChannelRead(db, 'member', 'c1');
		expect(await unreadMessageCount(db, 'member', 'o1', false)).toBe(0);
	});
});
