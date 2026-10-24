import { describe, expect, it, beforeAll } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import { testD1 } from './test-d1';
import { parseListFilters, listReservations, csvField, toCsv, likePattern } from './reservation-list';

let db: D1Database;
const TODAY = '2026-10-23';

beforeAll(async () => {
	const t = await testD1();
	db = t.db;
	t.exec(`
		INSERT INTO organizations (id, name, slug) VALUES ('o1', 'Org', 'org'), ('o2', 'Other', 'other');
		INSERT INTO users (id, email, password_hash, first_name, last_name) VALUES ('u1', 'jana@x.sk', 'x', 'Jana', 'Nováková');
		INSERT INTO halls (id, org_id, name) VALUES ('h1', 'o1', 'Veľká sála'), ('h2', 'o1', 'Malá sála'), ('h3', 'o2', 'Cudzia');
		INSERT INTO reservations (id, org_id, hall_id, user_id, title, event_date, status, invite_code, created_at, customer_name) VALUES
		  ('a', 'o1', 'h1', 'u1', 'Svadba 50%', '2026-11-01', 'pending', 'A', '2026-10-01 10:00:00', NULL),
		  ('b', 'o1', 'h2', 'u1', 'Firemný večierok', '2026-12-10', 'approved', 'B', '2026-10-05 10:00:00', 'Peter Telefón'),
		  ('c', 'o1', 'h1', 'u1', 'Stužková', '2026-09-01', 'completed', 'C', '2026-08-01 10:00:00', NULL),
		  ('d', 'o2', 'h3', 'u1', 'Cudzia', '2026-11-02', 'pending', 'D', '2026-10-01 10:00:00', NULL);
	`);
});

const run = (qs: string) => listReservations(db, 'o1', parseListFilters(new URLSearchParams(qs)), TODAY);

describe('reservations list', () => {
	it('shows upcoming events by event date by default, scoped to the org', async () => {
		const r = await run('');
		expect(r.rows.map((x) => x.id)).toEqual(['a', 'b']);
		expect(r.total).toBe(2);
	});
	it('splits past events, newest first', async () => {
		expect((await run('when=past')).rows.map((x) => x.id)).toEqual(['c']);
	});
	it('a status filter looks across all dates and keeps per-status counts', async () => {
		const r = await run('status=pending');
		expect(r.rows.map((x) => x.id)).toEqual(['a']);
		expect(r.counts).toEqual({ pending: 1, approved: 1, completed: 1 });
	});
	it('searches title, phone customer and client, treating % literally', async () => {
		expect((await run('q=peter')).rows.map((x) => x.id)).toEqual(['b']);
		expect((await run('q=Nov')).total).toBe(3);
		expect((await run('q=50%25')).rows.map((x) => x.id)).toEqual(['a']);
	});
	it('filters by hall and date range', async () => {
		expect((await run('hall=h1&when=all')).total).toBe(2);
		expect((await run('from=2026-11-15&to=2026-12-31')).rows.map((x) => x.id)).toEqual(['b']);
	});
	it('the upcoming tab has no date bounds of its own: today onward, no end', async () => {
		const f = parseListFilters(new URLSearchParams('when=upcoming'));
		expect(f).toMatchObject({ from: '', to: '' });
		expect((await run('when=upcoming&from=&to=')).rows.map((x) => x.id)).toEqual(['a', 'b']);
		// An end date narrows it; a start before today does not reach into the past.
		expect((await run('when=upcoming&to=2026-11-30')).rows.map((x) => x.id)).toEqual(['a']);
		expect((await run('when=upcoming&from=2026-01-01')).rows.map((x) => x.id)).toEqual(['a', 'b']);
	});
	it('reads a reversed date range the right way round', async () => {
		expect(parseListFilters(new URLSearchParams('from=2026-12-31&to=2026-11-15'))).toMatchObject({ from: '2026-11-15', to: '2026-12-31' });
		expect((await run('from=2026-12-31&to=2026-11-15')).rows.map((x) => x.id)).toEqual(['b']);
	});
	it('drops malformed parameters', () => {
		const f = parseListFilters(new URLSearchParams('status=hacked&from=yesterday&sort=x&page=-3'));
		expect(f).toMatchObject({ status: '', from: '', when: 'upcoming', sort: 'date_asc', page: 1 });
	});
});

describe('csv', () => {
	it('quotes separators and defuses formulas', () => {
		expect(csvField('a,b')).toBe('"a,b"');
		expect(csvField('say "hi"')).toBe('"say ""hi"""');
		expect(csvField('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
		expect(toCsv(['A'], [[1]])).toBe('﻿A\r\n1\r\n');
	});
	it('escapes LIKE wildcards', () => {
		expect(likePattern('50%_x')).toBe('%50\\%\\_x%');
	});
});
