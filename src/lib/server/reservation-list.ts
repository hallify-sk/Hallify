// The staff reservations list: search, filters, sort, paging and CSV export.
//
// It used to load every reservation of the organisation at once, sorted by when the
// request came in, with status chips as the only filter. The filters now live in the
// URL (so a filtered view can be bookmarked or shared, and the dashboard can link to
// "pending"), and the database does the work.

import { dbAll, dbFirst } from '$lib/db/index';
import type { D1Database } from '@cloudflare/workers-types';
const ALLOWED_STATUSES = ['pending', 'waiting_payment', 'approved', 'planned', 'completed', 'cancelled'];

export const PAGE_SIZE = 50;
export const EXPORT_MAX = 5000;

export type When = 'upcoming' | 'past' | 'all';
export type Sort = 'date_asc' | 'date_desc' | 'created';

export interface ListFilters {
	q: string;
	status: string;
	hall: string;
	from: string;
	to: string;
	when: When;
	sort: Sort;
	page: number;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Read the filters from a URL, dropping anything malformed. */
export function parseListFilters(params: URLSearchParams): ListFilters {
	const rawStatus = params.get('status') ?? '';
	const status = ALLOWED_STATUSES.includes(rawStatus) ? rawStatus : '';
	const when = params.get('when');
	const sort = params.get('sort');
	const rawFrom = params.get('from') ?? '';
	const rawTo = params.get('to') ?? '';
	let from = ISO.test(rawFrom) ? rawFrom : '';
	let to = ISO.test(rawTo) ? rawTo : '';
	// A range typed back to front means the same days, not "nothing".
	if (from && to && from > to) [from, to] = [to, from];
	const q = (params.get('q') ?? '').trim().slice(0, 100);
	// A status, a date range or a search looks across all dates unless told otherwise:
	// "pending" from the dashboard must not hide a request because it is far ahead.
	const narrowed = !!(status || from || to || q);
	const w: When = when === 'upcoming' || when === 'past' || when === 'all' ? when : narrowed ? 'all' : 'upcoming';
	const defaultSort: Sort = w === 'past' ? 'date_desc' : w === 'upcoming' ? 'date_asc' : 'created';
	const page = Math.max(1, Math.min(10_000, parseInt(params.get('page') ?? '1', 10) || 1));
	return {
		q,
		status,
		hall: (params.get('hall') ?? '').slice(0, 64),
		from,
		to,
		when: w,
		sort: sort === 'date_asc' || sort === 'date_desc' || sort === 'created' ? sort : defaultSort,
		page,
	};
}

/** Escape LIKE wildcards in user input (the query uses ESCAPE '\'). */
export function likePattern(q: string): string {
	return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

const FROM = `FROM reservations r
	JOIN halls h ON h.id = r.hall_id
	LEFT JOIN users u ON u.id = r.user_id`;

/** WHERE clause and parameters. `withStatus: false` is for the per-status counts. */
export function buildWhere(orgId: string, f: ListFilters, todayISO: string, withStatus = true): { sql: string; params: unknown[] } {
	const parts = ['r.org_id = ?'];
	const params: unknown[] = [orgId];
	if (withStatus && f.status) { parts.push('r.status = ?'); params.push(f.status); }
	if (f.hall) { parts.push('r.hall_id = ?'); params.push(f.hall); }
	if (f.from) { parts.push('r.event_date >= ?'); params.push(f.from); }
	if (f.to) { parts.push('r.event_date <= ?'); params.push(f.to); }
	if (f.when === 'upcoming') { parts.push('r.event_date >= ?'); params.push(todayISO); }
	if (f.when === 'past') { parts.push('r.event_date < ?'); params.push(todayISO); }
	if (f.q) {
		const like = likePattern(f.q);
		parts.push(`(r.title LIKE ? ESCAPE '\\' OR r.customer_name LIKE ? ESCAPE '\\' OR r.customer_contact LIKE ? ESCAPE '\\'
			OR (COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) LIKE ? ESCAPE '\\'
			OR u.email LIKE ? ESCAPE '\\' OR h.name LIKE ? ESCAPE '\\')`);
		params.push(like, like, like, like, like, like);
	}
	return { sql: parts.join(' AND '), params };
}

export function orderBy(sort: Sort): string {
	if (sort === 'date_asc') return 'r.event_date ASC, r.start_time ASC, r.created_at ASC';
	if (sort === 'date_desc') return 'r.event_date DESC, r.start_time DESC, r.created_at DESC';
	return 'r.created_at DESC';
}

export interface ListRow {
	id: string; title: string; event_date: string; start_time: string | null; end_time: string | null;
	status: string; event_type: string | null; num_guests: number | null; created_at: string;
	hall_id: string; hall_name: string;
	customer_name: string | null; customer_contact: string | null;
	user_first_name: string | null; user_last_name: string | null; user_email: string | null;
	/** 1 when the client has not confirmed their email address (D11). */
	user_email_unverified: number;
}

const COLUMNS = `r.id, r.title, r.event_date, r.start_time, r.end_time, r.status, r.event_type, r.num_guests, r.created_at,
	r.hall_id, h.name AS hall_name, r.customer_name, r.customer_contact,
	u.first_name AS user_first_name, u.last_name AS user_last_name, u.email AS user_email,
	CASE WHEN u.id IS NOT NULL AND u.email_verified_at IS NULL AND u.deleted_at IS NULL THEN 1 ELSE 0 END AS user_email_unverified`;

export async function listReservations(db: D1Database, orgId: string, f: ListFilters, todayISO: string) {
	const w = buildWhere(orgId, f, todayISO);
	const total = (await dbFirst<{ n: number }>(db, `SELECT COUNT(*) AS n ${FROM} WHERE ${w.sql}`, ...w.params))?.n ?? 0;
	const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
	const page = Math.min(f.page, pages);
	const rows = await dbAll<ListRow>(db,
		`SELECT ${COLUMNS} ${FROM} WHERE ${w.sql} ORDER BY ${orderBy(f.sort)} LIMIT ? OFFSET ?`,
		...w.params, PAGE_SIZE, (page - 1) * PAGE_SIZE);

	const c = buildWhere(orgId, f, todayISO, false);
	const counts = await dbAll<{ status: string; n: number }>(db,
		`SELECT r.status, COUNT(*) AS n ${FROM} WHERE ${c.sql} GROUP BY r.status`, ...c.params);
	return { rows, total, page, pages, counts: Object.fromEntries(counts.map((x) => [x.status, x.n])) as Record<string, number> };
}

export async function exportRows(db: D1Database, orgId: string, f: ListFilters, todayISO: string): Promise<ListRow[]> {
	const w = buildWhere(orgId, f, todayISO);
	return dbAll<ListRow>(db, `SELECT ${COLUMNS} ${FROM} WHERE ${w.sql} ORDER BY ${orderBy(f.sort)} LIMIT ?`, ...w.params, EXPORT_MAX);
}

/** One CSV field. Values that a spreadsheet would run as a formula are prefixed with '. */
export function csvField(v: unknown): string {
	let s = v == null ? '' : String(v);
	if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
	return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
	// BOM so Excel opens the file as UTF-8 (Slovak letters intact).
	return '﻿' + [header, ...rows].map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n';
}
