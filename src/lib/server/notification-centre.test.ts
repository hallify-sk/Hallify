import { beforeEach, describe, expect, it } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import { testD1 } from './test-d1';
import {
	listNotifications,
	markAllNotificationsRead,
	markNotificationRead,
	notifyFeedback,
	notifyLayoutProblems,
	notifyOrg,
	notifyPayment,
	unreadNotificationCount,
	type NotificationViewer
} from './notification-centre';

let db: D1Database;
let exec: (sql: string) => void;

const ALL: NotificationViewer['areas'] = ['reservations', 'messages', 'members', 'halls'];
const owner: NotificationViewer = { orgId: 'o1', userId: 'owner', areas: ALL };
const member: NotificationViewer = { orgId: 'o1', userId: 'member', areas: ['halls'] };

beforeEach(async () => {
	({ db, exec } = await testD1());
	exec(`
		INSERT INTO organizations (id, name, slug) VALUES ('o1', 'Reduta', 'reduta'), ('o2', 'Iná', 'ina');
		INSERT INTO users (id, email, password_hash, first_name, last_name, account_type) VALUES
		  ('owner', 'o@x.sk', 'x', 'O', 'W', 'organization'),
		  ('member', 'm@x.sk', 'x', 'M', 'E', 'organization'),
		  ('client', 'c@x.sk', 'x', 'Jana', 'K', 'client'),
		  ('other', 'z@x.sk', 'x', 'Z', 'Z', 'organization');
		INSERT INTO organization_members (id, org_id, user_id, role, joined_at) VALUES
		  ('m1', 'o1', 'owner', 'owner', '2020-01-01 00:00:00'),
		  ('m2', 'o1', 'member', 'member', '2020-01-01 00:00:00'),
		  ('m3', 'o2', 'other', 'owner', '2020-01-01 00:00:00');
	`);
});

const booking = (extra: Partial<Parameters<typeof notifyOrg>[1]> = {}) =>
	notifyOrg(db, {
		orgId: 'o1', kind: 'booking.requested',
		params: { title: 'Svadba', hall: 'Veľká sála', date: '2027-05-22', client: 'Jana K' },
		link: '/app/reservation/r1', actorId: 'client', ...extra
	});

describe('notifyOrg and what a member sees (D12)', () => {
	it('stores the event and shows it, unread, to a member whose permissions open its area', async () => {
		await booking();
		const { items, unread } = await listNotifications(db, owner);
		expect(unread).toBe(1);
		expect(items).toHaveLength(1);
		expect(items[0]).toMatchObject({ kind: 'booking.requested', link: '/app/reservation/r1', read: false });
		expect(items[0].params).toMatchObject({ title: 'Svadba', client: 'Jana K' });
	});

	it('hides events from areas the member cannot open', async () => {
		await booking();
		expect(await unreadNotificationCount(db, member)).toBe(0);
		expect((await listNotifications(db, member)).items).toEqual([]);
	});

	it('shows announcements to everybody, even with no area at all', async () => {
		await notifyOrg(db, { orgId: 'o1', kind: 'announcement.posted', params: { channel: 'oznamy' }, actorId: 'owner' });
		expect(await unreadNotificationCount(db, { orgId: 'o1', userId: 'member', areas: [] })).toBe(1);
		// …but not to the one who posted it.
		expect(await unreadNotificationCount(db, owner)).toBe(0);
	});

	it('never shows another organisation its events', async () => {
		await booking();
		expect(await unreadNotificationCount(db, { orgId: 'o2', userId: 'other', areas: ALL })).toBe(0);
	});

	it('shows nothing from before the member joined', async () => {
		exec(`UPDATE organization_members SET joined_at = '2999-01-01 00:00:00' WHERE user_id = 'owner'`);
		await booking();
		expect(await unreadNotificationCount(db, owner)).toBe(0);
	});

	it('drops a link that is not an app path', async () => {
		await booking({ link: 'https://evil.example/' });
		await booking({ link: '//evil.example/x', dedupeKey: null });
		const { items } = await listNotifications(db, owner);
		expect(items.map((i) => i.link)).toEqual([null, null]);
	});

	it('collapses a repeat within the hour into one row, unread again', async () => {
		const msg = (excerpt: string) => notifyOrg(db, {
			orgId: 'o1', kind: 'message.received', params: { client: 'Jana K', excerpt },
			link: '/app/manage/messages/t1', actorId: 'client', dedupeKey: 'message:t1'
		});
		await msg('Dobrý deň');
		const first = (await listNotifications(db, owner)).items[0];
		await markNotificationRead(db, owner, first.id);
		expect(await unreadNotificationCount(db, owner)).toBe(0);

		await msg('Ešte jedna otázka');
		const { items, unread } = await listNotifications(db, owner);
		expect(items).toHaveLength(1);
		expect(items[0].params.excerpt).toBe('Ešte jedna otázka');
		expect(unread).toBe(1);
	});

	it('keeps separate events separate', async () => {
		await booking({ link: '/app/reservation/r1' });
		await booking({ link: '/app/reservation/r2' });
		expect(await unreadNotificationCount(db, owner)).toBe(2);
	});

	it('forgets notifications older than the retention window', async () => {
		await booking();
		exec(`UPDATE org_notifications SET created_at = '2001-01-01 00:00:00.000'`);
		expect((await listNotifications(db, owner)).items).toEqual([]);
		// The next write prunes it for good.
		await booking({ link: '/app/reservation/r2' });
		const left = (await listNotifications(db, owner)).items;
		expect(left.map((i) => i.link)).toEqual(['/app/reservation/r2']);
	});

	it('never throws, even without its tables', async () => {
		exec('DROP TABLE org_notification_reads; DROP TABLE org_notifications;');
		await expect(booking()).resolves.toBeUndefined();
		expect(await unreadNotificationCount(db, owner)).toBe(0);
		expect(await listNotifications(db, owner)).toEqual({ items: [], unread: 0 });
	});
});

describe('event helpers', () => {
	it('records feedback, once per booking', async () => {
		await notifyFeedback(db, { orgId: 'o1', reservationId: 'r1', title: 'Svadba', client: 'Jana K', rating: 4, actorId: 'client' });
		await notifyFeedback(db, { orgId: 'o1', reservationId: 'r1', title: 'Svadba', client: 'Jana K', rating: 5, actorId: 'client' });
		const { items } = await listNotifications(db, owner);
		expect(items).toHaveLength(1);
		expect(items[0]).toMatchObject({ kind: 'feedback.received', link: '/app/reservation/r1' });
		expect(items[0].params.rating).toBe(5);
	});

	it('records payment states separately, and not to the member who marked them', async () => {
		await notifyPayment(db, { orgId: 'o1', reservationId: 'r1', title: 'Svadba', status: 'deposit_received', actorId: 'member' });
		await notifyPayment(db, { orgId: 'o1', reservationId: 'r1', title: 'Svadba', status: 'paid', actorId: 'member' });
		expect(await unreadNotificationCount(db, owner)).toBe(2);
		expect(await unreadNotificationCount(db, { ...member, areas: ALL })).toBe(0);
	});

	it('records layout problems only when there are some, for those who see halls', async () => {
		await notifyLayoutProblems(db, { orgId: 'o1', hallId: 'h1', hall: 'Sála', templates: 0, events: 0 });
		expect(await unreadNotificationCount(db, member)).toBe(0);
		await notifyLayoutProblems(db, { orgId: 'o1', hallId: 'h1', hall: 'Sála', templates: 2, events: 1 });
		const { items } = await listNotifications(db, member);
		expect(items).toHaveLength(1);
		expect(items[0]).toMatchObject({ kind: 'layout.problems', link: '/app/manage/halls/h1' });
	});
});

describe('reading notifications', () => {
	it('marks one read, for that member only', async () => {
		await booking();
		const viewerB: NotificationViewer = { orgId: 'o1', userId: 'member', areas: ALL };
		const [n] = (await listNotifications(db, owner)).items;
		expect(await markNotificationRead(db, owner, n.id)).toBe(true);
		expect(await unreadNotificationCount(db, owner)).toBe(0);
		expect(await unreadNotificationCount(db, viewerB)).toBe(1);
		// Marking twice is harmless.
		expect(await markNotificationRead(db, owner, n.id)).toBe(true);
	});

	it('refuses to mark a notification the member may not see', async () => {
		await booking();
		const [n] = (await listNotifications(db, owner)).items;
		expect(await markNotificationRead(db, member, n.id)).toBe(false);
		expect(await markNotificationRead(db, { orgId: 'o2', userId: 'other', areas: ALL }, n.id)).toBe(false);
	});

	it('marks everything read, and what comes later is unread again', async () => {
		await booking({ link: '/app/reservation/r1' });
		await booking({ link: '/app/reservation/r2' });
		await markAllNotificationsRead(db, owner);
		expect(await unreadNotificationCount(db, owner)).toBe(0);
		const { items } = await listNotifications(db, owner);
		expect(items.every((i) => i.read)).toBe(true);

		// A later event: pushed past the mark (the clock may not have ticked).
		await booking({ link: '/app/reservation/r3' });
		exec(`UPDATE org_notifications SET created_at = '2999-01-01 00:00:00.000' WHERE link = '/app/reservation/r3'`);
		expect(await unreadNotificationCount(db, owner)).toBe(1);
	});
});
