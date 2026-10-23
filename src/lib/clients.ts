// The venue's client list (D10): everyone who booked with the venue or registered on
// its site, built from what the database already knows.
//
// A client is one of two things:
//  * an account: a client user of this venue (users.account_type = 'client'), key
//    'u:<user id>'. Everything they booked themselves, or that was assigned to them,
//    counts towards them.
//  * a guest: someone the team booked for without an account (a phone booking's
//    customer, or the invitee of an event not yet accepted). Keyed by their contact:
//    'e:<email>' or 'p:<phone digits>', or by their name ('n:<name>') when the team
//    wrote down no contact. A guest whose email matches an account is that account.
//
// Pure functions only: $lib/server/clients loads the rows and the routes render them.

export type ClientKind = 'account' | 'guest';

export interface ClientAccountRow {
	id: string;
	first_name: string;
	last_name: string;
	email: string;
	created_at: string;
}

export interface ClientBookingRow {
	id: string;
	user_id: string;
	/** The owner is a client account (not a team member who typed the booking in). */
	owner_is_client: number | boolean;
	customer_name: string | null;
	customer_contact: string | null;
	/** A pending invitation's invitee, when the event was handed to someone. */
	invite_email: string | null;
	invite_name: string | null;
	title: string;
	event_date: string;
	status: string;
	hall_id: string;
	hall_name: string;
	created_at: string;
}

export interface ClientNoteRow {
	client_key: string;
	phone: string | null;
	notes: string | null;
	updated_at?: string | null;
	updated_by_name?: string | null;
}

export interface ClientSummary {
	key: string;
	/** The id in /app/manage/clients/[id]. */
	urlId: string;
	kind: ClientKind;
	userId: string | null;
	name: string;
	email: string | null;
	phone: string | null;
	/** Reservations that were not cancelled. */
	bookings: number;
	/** The nearest event from today on, not cancelled or completed. */
	nextEvent: string | null;
	/** The latest event before today that was not cancelled. */
	lastEvent: string | null;
	ratingAverage: number | null;
	ratingCount: number;
	/** Registration (accounts) or the first booking (guests). */
	since: string | null;
}

// ── Keys ─────────────────────────────────────────────────────────────────────

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();

/** For matching and searching: lower case, no diacritics, single spaces. */
export function fold(s: string | null | undefined): string {
	return collapse(String(s ?? '')).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** "+421 905 123 456", "0905/123 456" → "421905123456", "0905123456". Null when the
 *  text is not a phone number (too few digits, or letters in it). */
export function phoneDigits(raw: string | null | undefined): string | null {
	const s = String(raw ?? '').trim();
	if (!s || /[a-z@]/i.test(s)) return null;
	const digits = s.replace(/\D/g, '').replace(/^00/, '');
	return digits.length >= 6 ? digits : null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A free-text contact split into an email or a phone number (or neither). */
export function splitContact(raw: string | null | undefined): { email: string | null; phone: string | null } {
	const s = collapse(String(raw ?? ''));
	if (!s) return { email: null, phone: null };
	const email = s.split(/[\s,;]+/).find((part) => EMAIL.test(part));
	if (email) {
		const rest = s.replace(email, '').replace(/^[\s,;]+|[\s,;]+$/g, '');
		return { email: email.toLowerCase(), phone: phoneDigits(rest) ? rest : null };
	}
	return { email: null, phone: phoneDigits(s) ? s : null };
}

/** The key of a guest from what the team wrote down; null when there is nothing. */
export function guestKey(name: string | null | undefined, contact: string | null | undefined): string | null {
	const c = splitContact(contact);
	if (c.email) return `e:${c.email}`;
	const digits = phoneDigits(c.phone);
	if (digits) return `p:${digits}`;
	const n = fold(name);
	return n ? `n:${n}` : null;
}

function toBase64Url(s: string): string {
	const bytes = new TextEncoder().encode(s);
	let bin = '';
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string | null {
	try {
		const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
		return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
	} catch {
		return null;
	}
}

/** The URL id of a client key: the user id for an account, an encoded key otherwise. */
export function clientUrlId(key: string): string {
	return key.startsWith('u:') ? key.slice(2) : `g.${toBase64Url(key)}`;
}

/** The client key behind a URL id, or null when it is not one. */
export function parseClientUrlId(id: string): string | null {
	if (id.startsWith('g.')) {
		const key = fromBase64Url(id.slice(2));
		return key && /^[epn]:./.test(key) ? key : null;
	}
	return /^[A-Za-z0-9_-]{1,64}$/.test(id) ? `u:${id}` : null;
}

/** Which client a booking belongs to, or null for a team member's own event. */
export function bookingClientKey(b: ClientBookingRow, accountByEmail: Map<string, string>): string | null {
	if (b.owner_is_client) return `u:${b.user_id}`;
	const key = b.invite_email
		? `e:${b.invite_email.trim().toLowerCase()}`
		: b.customer_name || b.customer_contact ? guestKey(b.customer_name, b.customer_contact) : null;
	if (key?.startsWith('e:')) {
		const account = accountByEmail.get(key.slice(2));
		if (account) return `u:${account}`;
	}
	return key;
}

// ── The list ─────────────────────────────────────────────────────────────────

const ACTIVE = (status: string) => status !== 'cancelled';
const UPCOMING = (status: string) => status !== 'cancelled' && status !== 'completed';

export function buildClientList(input: {
	accounts: ClientAccountRow[];
	bookings: ClientBookingRow[];
	ratings: Array<{ user_id: string | null; rating: number }>;
	notes: ClientNoteRow[];
	todayISO: string;
}): ClientSummary[] {
	const byKey = new Map<string, ClientSummary>();
	const accountByEmail = new Map<string, string>();
	for (const a of input.accounts) {
		accountByEmail.set(a.email.trim().toLowerCase(), a.id);
		const key = `u:${a.id}`;
		byKey.set(key, {
			key, urlId: clientUrlId(key), kind: 'account', userId: a.id,
			name: collapse(`${a.first_name ?? ''} ${a.last_name ?? ''}`) || a.email,
			email: a.email, phone: null,
			bookings: 0, nextEvent: null, lastEvent: null, ratingAverage: null, ratingCount: 0,
			since: a.created_at,
		});
	}

	for (const b of input.bookings) {
		const key = bookingClientKey(b, accountByEmail);
		if (!key) continue;
		let c = byKey.get(key);
		if (!c) {
			if (key.startsWith('u:')) continue; // an account of another venue: not ours to list
			const contact = splitContact(b.customer_contact);
			c = {
				key, urlId: clientUrlId(key), kind: 'guest', userId: null,
				name: collapse(b.invite_name ?? '') || collapse(b.customer_name ?? '') || contact.email || contact.phone || '—',
				email: b.invite_email?.trim().toLowerCase() || contact.email,
				phone: contact.phone,
				bookings: 0, nextEvent: null, lastEvent: null, ratingAverage: null, ratingCount: 0,
				since: b.created_at,
			};
			byKey.set(key, c);
		} else if (c.kind === 'guest') {
			const contact = splitContact(b.customer_contact);
			c.email ??= contact.email;
			c.phone ??= contact.phone;
			if (b.created_at < (c.since ?? '￿')) c.since = b.created_at;
		}
		const day = b.event_date.slice(0, 10);
		if (ACTIVE(b.status)) c.bookings++;
		if (UPCOMING(b.status) && day >= input.todayISO && (!c.nextEvent || day < c.nextEvent)) c.nextEvent = day;
		if (ACTIVE(b.status) && day < input.todayISO && (!c.lastEvent || day > c.lastEvent)) c.lastEvent = day;
	}

	const sums = new Map<string, { sum: number; n: number }>();
	for (const r of input.ratings) {
		if (!r.user_id) continue;
		const s = sums.get(r.user_id) ?? { sum: 0, n: 0 };
		s.sum += r.rating;
		s.n++;
		sums.set(r.user_id, s);
	}
	for (const c of byKey.values()) {
		const s = c.userId ? sums.get(c.userId) : undefined;
		if (s) {
			c.ratingCount = s.n;
			c.ratingAverage = Math.round((s.sum / s.n) * 10) / 10;
		}
	}

	for (const n of input.notes) {
		const c = byKey.get(n.client_key);
		if (c && n.phone?.trim()) c.phone = n.phone.trim();
	}
	return [...byKey.values()];
}

export const CLIENT_SORTS = ['name', 'bookings', 'next', 'last', 'rating', 'newest'] as const;
export type ClientSort = (typeof CLIENT_SORTS)[number];
export const CLIENTS_PAGE_SIZE = 50;

export interface ClientFilters {
	q: string;
	sort: ClientSort;
	page: number;
}

export function parseClientFilters(params: URLSearchParams): ClientFilters {
	const q = (params.get('q') ?? '').trim().slice(0, 100);
	const sortRaw = params.get('sort') ?? '';
	const sort = (CLIENT_SORTS as readonly string[]).includes(sortRaw) ? (sortRaw as ClientSort) : 'name';
	const page = Math.max(1, Math.min(10_000, parseInt(params.get('page') ?? '1', 10) || 1));
	return { q, sort, page };
}

/** Does the client match the search? Name, email and phone, ignoring case and
 *  diacritics; a number typed with spaces finds the phone however it was written. */
export function matchesClient(c: ClientSummary, q: string): boolean {
	const needle = fold(q);
	if (!needle) return true;
	if (fold(c.name).includes(needle) || fold(c.email).includes(needle)) return true;
	const digits = q.replace(/\D/g, '').replace(/^00/, '');
	if (digits.length >= 3) {
		const phone = (c.phone ?? '').replace(/\D/g, '').replace(/^00/, '');
		if (phone.includes(digits)) return true;
	}
	return false;
}

const byName = (a: ClientSummary, b: ClientSummary) => fold(a.name).localeCompare(fold(b.name), 'sk') || a.key.localeCompare(b.key);
/** Values that exist first, then the rest by name. */
function nullsLast<T>(get: (c: ClientSummary) => T | null, cmp: (x: T, y: T) => number) {
	return (a: ClientSummary, b: ClientSummary) => {
		const x = get(a), y = get(b);
		if (x == null && y == null) return byName(a, b);
		if (x == null) return 1;
		if (y == null) return -1;
		return cmp(x, y) || byName(a, b);
	};
}

export function sortClients(list: ClientSummary[], sort: ClientSort): ClientSummary[] {
	const out = [...list];
	switch (sort) {
		case 'bookings': return out.sort((a, b) => b.bookings - a.bookings || byName(a, b));
		case 'next': return out.sort(nullsLast((c) => c.nextEvent, (x, y) => x.localeCompare(y)));
		case 'last': return out.sort(nullsLast((c) => c.lastEvent, (x, y) => y.localeCompare(x)));
		case 'rating': return out.sort(nullsLast((c) => c.ratingAverage, (x, y) => y - x));
		case 'newest': return out.sort(nullsLast((c) => c.since, (x, y) => y.localeCompare(x)));
		default: return out.sort(byName);
	}
}

/** Search, sort and one page of the list. */
export function queryClients(list: ClientSummary[], f: ClientFilters): { rows: ClientSummary[]; total: number; page: number; pages: number } {
	const matching = sortClients(list.filter((c) => matchesClient(c, f.q)), f.sort);
	const pages = Math.max(1, Math.ceil(matching.length / CLIENTS_PAGE_SIZE));
	const page = Math.min(f.page, pages);
	return { rows: matching.slice((page - 1) * CLIENTS_PAGE_SIZE, page * CLIENTS_PAGE_SIZE), total: matching.length, page, pages };
}

// ── Staff notes ──────────────────────────────────────────────────────────────

export const CLIENT_PHONE_MAX = 40;
export const CLIENT_NOTES_MAX = 5000;

export function parseClientNotes(input: { phone?: string | null; notes?: string | null }):
	| { ok: true; values: { phone: string | null; notes: string | null } }
	| { ok: false; field: 'phone' | 'notes' } {
	const phone = collapse(String(input.phone ?? ''));
	if (phone.length > CLIENT_PHONE_MAX) return { ok: false, field: 'phone' };
	const notes = String(input.notes ?? '').replace(/\r\n/g, '\n').trim();
	if (notes.length > CLIENT_NOTES_MAX) return { ok: false, field: 'notes' };
	return { ok: true, values: { phone: phone || null, notes: notes || null } };
}
