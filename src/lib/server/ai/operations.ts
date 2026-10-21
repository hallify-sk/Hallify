import { dbAll, dbFirst } from '$lib/db/index';
import type { HallRow, ReservationStatus } from '$lib/db/index';
import type { Permission } from '$lib/permissions';
import { assertCanBook } from '$lib/availability';
import { canAddHall, canAddExtra } from '$lib/limits';
import { getPlan } from '$lib/plans';
import { createReservation } from '$lib/server/reservations';
import { changeReservationStatus, messageReservationClient, setReservationExtras, ALLOWED_STATUSES } from '$lib/server/ops/reservation-ops';
import {
	addHallBlock, removeHallBlock, addHallExtra, updateHallExtra, removeHallExtra,
	addTableType, removeTableType, updateBookingSettings, createHall, normalizeTableType, BOOKING_FLAGS,
	type BookingSettings
} from '$lib/server/ops/hall-ops';
import { st } from '$lib/i18n-server';
import type { OrgContext } from '../../../app.d';

/**
 * Many changes, one confirmation.
 *
 * `propose_changes` takes a list of operations of any kind — book an event, change a
 * status, message a client, set booking rules, block dates, add extras or table
 * types, create a hall — checks each one now, and stores them as a single proposal.
 * The preview lists every operation in plain words; Apply runs them in order through
 * the same functions the console's own buttons use, and reports each one.
 *
 * A hall created in the batch can be used by later operations in it: give it a `ref`
 * and refer to it as hall_id "ref:<that ref>".
 */

export interface OpContext {
	locals: App.Locals;
	org: OrgContext;
	can: (p: Permission) => Promise<boolean>;
}

export interface CheckedOp {
	type: string;
	args: Record<string, unknown>;
	title: string;
	lines: string[];
}

type CheckResult = { ok: true; title: string; lines?: string[]; args?: Record<string, unknown> } | { ok: false; error: string };

interface OpDef {
	type: string;
	permission: Permission;
	/** Properties besides `type`; every one required, null where optional (strict mode). */
	properties: Record<string, unknown>;
	check(ctx: OpContext, a: Record<string, unknown>, refs: Set<string>): Promise<CheckResult>;
	apply(ctx: OpContext, a: Record<string, unknown>, refs: Map<string, string>): Promise<{ ok: true; note?: string; ref?: [string, string] } | { ok: false; error: string }>;
}

const s = (description: string) => ({ type: 'string', description });
const ns = (description: string) => ({ type: ['string', 'null'], description });
const nb = (description: string) => ({ type: ['boolean', 'null'], description });
const nn = (description: string) => ({ type: ['number', 'null'], description });
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{1,2}:\d{2}$/;

const L = (locale: 'sk' | 'en') => st(locale).ai.ops;
const fmtDate = (d: string, locale: 'sk' | 'en') =>
	new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString(locale === 'en' ? 'en-GB' : 'sk-SK', { day: 'numeric', month: 'short', year: 'numeric' });
const yesNo = (v: unknown, locale: 'sk' | 'en') => (v ? L(locale).yes : L(locale).no);

async function hallName(ctx: OpContext, id: string): Promise<string | null> {
	return (await dbFirst<{ name: string }>(ctx.locals.db, 'SELECT name FROM halls WHERE id = ? AND org_id = ?', id, ctx.org.id))?.name ?? null;
}

/** A hall id, or a reference to a hall created earlier in the same batch. */
function hallRef(raw: unknown, refs: Set<string>): { ref: string } | { id: string } | null {
	const v = String(raw ?? '');
	if (v.startsWith('ref:')) return refs.has(v.slice(4)) ? { ref: v.slice(4) } : null;
	return v ? { id: v } : null;
}
function resolveHall(raw: unknown, refs: Map<string, string>): string {
	const v = String(raw ?? '');
	return v.startsWith('ref:') ? refs.get(v.slice(4)) ?? '' : v;
}
async function hallLabel(ctx: OpContext, raw: unknown, refs: Set<string>): Promise<string | null> {
	const h = hallRef(raw, refs);
	if (!h) return null;
	return 'ref' in h ? `“${h.ref}”` : hallName(ctx, h.id);
}

async function reservationOf(ctx: OpContext, id: string) {
	return dbFirst<{ id: string; title: string; status: string; event_date: string; hall_id: string; hall: string; user_id: string; client: string | null }>(
		ctx.locals.db,
		`SELECT r.id, r.title, r.status, r.event_date, r.hall_id, h.name AS hall, r.user_id,
		        NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), '') AS client
		   FROM reservations r JOIN halls h ON h.id = r.hall_id LEFT JOIN users u ON u.id = r.user_id
		  WHERE r.id = ? AND r.org_id = ?`, id, ctx.org.id);
}

const actor = (ctx: OpContext) => ctx.locals.user!;

const OPS: OpDef[] = [
	{
		type: 'reservation_create',
		permission: 'reservations.manage',
		properties: {
			hall_id: s('Hall id, or ref:<ref> of a hall created earlier in this batch'),
			title: s('Event title'),
			date: s('YYYY-MM-DD'),
			start_time: ns('HH:MM or null'),
			end_time: ns('HH:MM or null'),
			guests: nn('Expected guests or null'),
			description: ns('Notes (client, contact, wishes) or null')
		},
		async check(ctx, a, refs) {
			const loc = ctx.locals.locale;
			const h = hallRef(a.hall_id, refs);
			if (!h) return { ok: false, error: 'Unknown hall.' };
			if (!String(a.title ?? '').trim()) return { ok: false, error: 'An event needs a title.' };
			if (!ISO.test(String(a.date))) return { ok: false, error: 'Date must be YYYY-MM-DD.' };
			if ('id' in h) {
				const hall = await dbFirst<HallRow>(ctx.locals.db, 'SELECT * FROM halls WHERE id = ? AND org_id = ?', h.id, ctx.org.id);
				if (!hall) return { ok: false, error: 'Unknown hall.' };
				const ok = await assertCanBook(ctx.locals.db, hall, String(a.date), ctx.locals.user!.id, a.guests == null ? null : Number(a.guests), loc);
				if (!ok.ok) return { ok: false, error: ok.reason ?? 'That date is not available.' };
			}
			const time = [a.start_time, a.end_time].filter(Boolean).join('–');
			return {
				ok: true,
				title: L(loc).createReservation(String(a.title).trim()),
				lines: [[fmtDate(String(a.date), loc), time, await hallLabel(ctx, a.hall_id, refs)].filter(Boolean).join(' · '),
					a.guests ? L(loc).guests(Number(a.guests)) : ''].filter(Boolean)
			};
		},
		async apply(ctx, a, refs) {
			const res = await createReservation(ctx.locals, {
				orgId: ctx.org.id, hallId: resolveHall(a.hall_id, refs), title: String(a.title), eventDate: String(a.date),
				startTime: TIME.test(String(a.start_time ?? '')) ? String(a.start_time) : null,
				endTime: TIME.test(String(a.end_time ?? '')) ? String(a.end_time) : null,
				numGuests: a.guests == null ? null : Number(a.guests), description: (a.description as string | null) ?? null
			});
			return res.ok ? { ok: true } : { ok: false, error: res.error };
		}
	},
	{
		type: 'reservation_status',
		permission: 'reservations.manage',
		properties: {
			reservation_id: s('Reservation id'),
			status: { type: 'string', enum: ALLOWED_STATUSES, description: 'New status' }
		},
		async check(ctx, a) {
			const r = await reservationOf(ctx, String(a.reservation_id));
			if (!r) return { ok: false, error: 'Unknown reservation.' };
			if (!ALLOWED_STATUSES.includes(a.status as ReservationStatus)) return { ok: false, error: 'Unknown status.' };
			const t = st(ctx.locals.locale).status as Record<string, string>;
			return {
				ok: true,
				title: L(ctx.locals.locale).changeStatus(r.title),
				lines: [`${t[r.status] ?? r.status} → ${t[String(a.status)] ?? a.status}`, `${fmtDate(r.event_date, ctx.locals.locale)} · ${r.hall}`,
					...(r.client ? [L(ctx.locals.locale).clientNotified(r.client)] : [])]
			};
		},
		async apply(ctx, a) {
			const res = await changeReservationStatus(ctx.locals, ctx.org.id, String(a.reservation_id), a.status as ReservationStatus, actor(ctx));
			return res.ok ? { ok: true } : { ok: false, error: res.error };
		}
	},
	{
		type: 'reservation_message',
		permission: 'messages.send',
		properties: { reservation_id: s('Reservation id'), text: s('The message to the client, in the language they wrote in') },
		async check(ctx, a) {
			const r = await reservationOf(ctx, String(a.reservation_id));
			if (!r) return { ok: false, error: 'Unknown reservation.' };
			const text = String(a.text ?? '').trim();
			if (!text) return { ok: false, error: 'The message is empty.' };
			return { ok: true, title: L(ctx.locals.locale).message(r.client ?? r.title), lines: [`“${text}”`], args: { ...a, text: text.slice(0, 4000) } };
		},
		async apply(ctx, a) {
			const res = await messageReservationClient(ctx.locals, ctx.org.id, String(a.reservation_id), String(a.text), actor(ctx));
			return res.ok ? { ok: true } : { ok: false, error: res.error };
		}
	},
	{
		type: 'reservation_extras',
		permission: 'reservations.manage',
		properties: { reservation_id: s('Reservation id'), extra_ids: { type: 'array', items: { type: 'string' }, description: 'The full set of extra ids booked' } },
		async check(ctx, a) {
			const r = await reservationOf(ctx, String(a.reservation_id));
			if (!r) return { ok: false, error: 'Unknown reservation.' };
			const offered = await dbAll<{ id: string; name: string }>(ctx.locals.db, 'SELECT id, name FROM hall_extras WHERE hall_id = ?', r.hall_id);
			const ids = (Array.isArray(a.extra_ids) ? a.extra_ids : []).map(String);
			const names = offered.filter((x) => ids.includes(x.id)).map((x) => x.name);
			return { ok: true, title: L(ctx.locals.locale).setExtras(r.title), lines: [names.length ? names.join(', ') : '—'] };
		},
		async apply(ctx, a) {
			const res = await setReservationExtras(ctx.locals.db, ctx.org.id, String(a.reservation_id), (a.extra_ids as string[]) ?? []);
			return res.ok ? { ok: true } : { ok: false, error: res.error };
		}
	},
	{
		type: 'hall_create',
		permission: 'halls.manage',
		properties: {
			ref: s('A short name to refer to this hall later in the batch, e.g. "new"'),
			name: s('Hall name'),
			max_people: nn('Capacity or null')
		},
		async check(ctx, a, refs) {
			if (!(await canAddHall(ctx.locals.db, ctx.org.id, ctx.org.subscription.plan))) {
				const limit = getPlan(ctx.org.subscription.plan).limits.maxHalls;
				return { ok: false, error: st(ctx.locals.locale).serverErrors.hallLimitReached.replace('{limit}', String(limit)) };
			}
			refs.add(String(a.ref ?? 'new'));
			return { ok: true, title: L(ctx.locals.locale).createHall(String(a.name ?? '')), lines: [L(ctx.locals.locale).newHallNote] };
		},
		async apply(ctx, a) {
			const res = await createHall(ctx.locals.db, ctx.org.id, ctx.org.subscription.plan, String(a.name ?? ''),
				a.max_people == null ? null : Number(a.max_people), ctx.locals.locale);
			return res.ok ? { ok: true, ref: [String(a.ref ?? 'new'), res.id] } : { ok: false, error: res.error };
		}
	},
	{
		type: 'hall_settings',
		permission: 'halls.manage',
		properties: {
			hall_id: s('Hall id, or ref:<ref>'),
			allow_reservations: nb('Take bookings, or null to leave'),
			auto_approve: nb('Approve new bookings automatically, or null'),
			custom_layouts: nb('Clients may arrange their own tables, or null'),
			force_layouts: nb('Clients must pick a layout template, or null'),
			allow_feedback: nb('Ask guests for feedback, or null'),
			min_days_advance: nn('Days of notice a booking needs, or null'),
			min_cancel_days: nn('Days before the event a client can still cancel, or null'),
			pre_reservation_text: ns('Text shown before booking, or null')
		},
		async check(ctx, a, refs) {
			const loc = ctx.locals.locale;
			const h = hallRef(a.hall_id, refs);
			if (!h) return { ok: false, error: 'Unknown hall.' };
			const now = 'id' in h ? await dbFirst<Record<string, unknown>>(ctx.locals.db, 'SELECT * FROM halls WHERE id = ? AND org_id = ?', h.id, ctx.org.id) : {};
			if (!now) return { ok: false, error: 'Unknown hall.' };
			const labels = L(loc).settings as Record<string, string>;
			const lines: string[] = [];
			for (const f of [...BOOKING_FLAGS, 'min_days_advance', 'min_cancel_days', 'pre_reservation_text'] as const) {
				if (a[f] == null) continue;
				const show = (v: unknown) => (BOOKING_FLAGS.includes(f as typeof BOOKING_FLAGS[number]) ? yesNo(v, loc) : String(v ?? '—'));
				lines.push(`${labels[f] ?? f}: ${'id' in h ? `${show(now[f])} → ` : ''}${show(a[f])}`);
			}
			if (!lines.length) return { ok: false, error: 'No setting to change.' };
			return { ok: true, title: L(loc).bookingRules(await hallLabel(ctx, a.hall_id, refs) ?? ''), lines };
		},
		async apply(ctx, a, refs) {
			const patch: BookingSettings = {};
			for (const f of BOOKING_FLAGS) if (typeof a[f] === 'boolean') patch[f] = a[f] as boolean;
			if (a.min_days_advance != null) patch.min_days_advance = Number(a.min_days_advance);
			if (a.min_cancel_days != null) patch.min_cancel_days = Number(a.min_cancel_days);
			if (typeof a.pre_reservation_text === 'string') patch.pre_reservation_text = a.pre_reservation_text;
			const res = await updateBookingSettings(ctx.locals.db, ctx.org.id, resolveHall(a.hall_id, refs), patch, ctx.locals.locale);
			return res.ok ? { ok: true } : { ok: false, error: res.error };
		}
	},
	{
		type: 'block_add',
		permission: 'halls.manage',
		properties: {
			hall_id: s('Hall id, or ref:<ref>'),
			date_from: ns('YYYY-MM-DD, or null for a weekly block'),
			date_to: ns('YYYY-MM-DD, or null for a weekly block'),
			weekdays: { type: ['array', 'null'], items: { type: 'integer' }, description: '0=Sunday … 6=Saturday: every week (no dates) or only these days inside the range; null = every day of the range' },
			reason: ns('Why (shown to staff only), or null')
		},
		async check(ctx, a, refs) {
			const loc = ctx.locals.locale;
			if (!hallRef(a.hall_id, refs)) return { ok: false, error: 'Unknown hall.' };
			const range = a.date_from && a.date_to;
			if (range && (!ISO.test(String(a.date_from)) || !ISO.test(String(a.date_to)) || String(a.date_to) < String(a.date_from))) {
				return { ok: false, error: 'The dates must be YYYY-MM-DD, from before to.' };
			}
			const days = (Array.isArray(a.weekdays) ? a.weekdays : []).map(Number).filter((d) => d >= 0 && d <= 6);
			if (!range && !days.length) return { ok: false, error: 'Give a date range or weekdays.' };
			const dayNames = st(loc).dayNamesFull; // Monday first; JS weekdays are Sunday first
			const dayLabel = days.map((d) => dayNames[(d + 6) % 7]).join(', ');
			const lines = [range ? `${fmtDate(String(a.date_from), loc)} – ${fmtDate(String(a.date_to), loc)}${days.length ? ` (${dayLabel})` : ''}` : L(loc).everyWeek(dayLabel)];
			if (a.reason) lines.push(String(a.reason));
			const h = hallRef(a.hall_id, refs);
			if (range && h && 'id' in h) {
				const clash = await dbAll<{ title: string; event_date: string }>(ctx.locals.db,
					`SELECT title, event_date FROM reservations WHERE hall_id = ? AND status != 'cancelled'
					   AND substr(event_date, 1, 10) BETWEEN ? AND ? LIMIT 5`, h.id, a.date_from, a.date_to);
				if (clash.length) lines.push(L(loc).blockClashes(clash.map((c) => `${c.title} (${fmtDate(c.event_date, loc)})`).join(', ')));
			}
			return { ok: true, title: L(loc).blockDates(await hallLabel(ctx, a.hall_id, refs) ?? ''), lines };
		},
		async apply(ctx, a, refs) {
			const days = (Array.isArray(a.weekdays) ? a.weekdays : []).map(Number);
			const res = await addHallBlock(ctx.locals.db, ctx.org.id, resolveHall(a.hall_id, refs), {
				type: a.date_from && a.date_to ? 'date_range' : 'weekly',
				dateFrom: (a.date_from as string | null) ?? null, dateTo: (a.date_to as string | null) ?? null,
				days: days.length ? days : null, reason: (a.reason as string | null) ?? null
			}, ctx.locals.locale);
			return res.ok ? { ok: true } : { ok: false, error: res.error };
		}
	},
	{
		type: 'block_remove',
		permission: 'halls.manage',
		properties: { block_id: s('Blocked period id (from get_hall_setup)') },
		async check(ctx, a) {
			const b = await dbFirst<{ date_from: string | null; date_to: string | null; reason: string | null; hall: string }>(ctx.locals.db,
				`SELECT b.date_from, b.date_to, b.reason, h.name AS hall FROM hall_blocks b JOIN halls h ON h.id = b.hall_id
				  WHERE b.id = ? AND h.org_id = ?`, String(a.block_id), ctx.org.id);
			if (!b) return { ok: false, error: 'Unknown blocked period.' };
			const loc = ctx.locals.locale;
			return { ok: true, title: L(loc).unblock(b.hall), lines: [[b.date_from && b.date_to ? `${fmtDate(b.date_from, loc)} – ${fmtDate(b.date_to, loc)}` : '', b.reason ?? ''].filter(Boolean).join(' · ') || '—'] };
		},
		async apply(ctx, a) {
			const res = await removeHallBlock(ctx.locals.db, ctx.org.id, String(a.block_id));
			return res.ok ? { ok: true } : { ok: false, error: res.error };
		}
	},
	{
		type: 'extra_add',
		permission: 'halls.manage',
		properties: {
			hall_id: s('Hall id, or ref:<ref>'), name: s('Extra name'), description: ns('Description or null'),
			price_eur: { type: 'number', description: 'Price in euros' },
			pricing: { type: 'string', enum: ['fixed', 'per_guest'], description: 'Fixed price, or per guest' }
		},
		async check(ctx, a, refs) {
			const h = hallRef(a.hall_id, refs);
			if (!h) return { ok: false, error: 'Unknown hall.' };
			if (!String(a.name ?? '').trim()) return { ok: false, error: 'An extra needs a name.' };
			if ('id' in h && !(await canAddExtra(ctx.locals.db, h.id, ctx.org.subscription.plan))) return { ok: false, error: 'The plan\'s limit of extras for this hall is reached.' };
			const loc = ctx.locals.locale;
			return { ok: true, title: L(loc).addExtra(String(a.name), await hallLabel(ctx, a.hall_id, refs) ?? ''), lines: [L(loc).price(Number(a.price_eur) || 0, a.pricing === 'per_guest')] };
		},
		async apply(ctx, a, refs) {
			const res = await addHallExtra(ctx.locals.db, ctx.org.id, ctx.org.subscription.plan, resolveHall(a.hall_id, refs), {
				name: String(a.name), description: (a.description as string | null) ?? null, priceEur: Number(a.price_eur) || 0,
				pricing: a.pricing === 'per_guest' ? 'per_guest' : 'fixed'
			}, ctx.locals.locale);
			return res.ok ? { ok: true } : { ok: false, error: res.error };
		}
	},
	{
		type: 'extra_update',
		permission: 'halls.manage',
		properties: {
			extra_id: s('Extra id (from get_hall_setup)'), name: s('Name'), description: ns('Description or null'),
			price_eur: { type: 'number', description: 'Price in euros' },
			pricing: { type: 'string', enum: ['fixed', 'per_guest'], description: 'Fixed price, or per guest' }
		},
		async check(ctx, a) {
			const x = await dbFirst<{ name: string; price_cents: number; pricing: string }>(ctx.locals.db,
				'SELECT e.name, e.price_cents, e.pricing FROM hall_extras e JOIN halls h ON h.id = e.hall_id WHERE e.id = ? AND h.org_id = ?', String(a.extra_id), ctx.org.id);
			if (!x) return { ok: false, error: 'Unknown extra.' };
			const loc = ctx.locals.locale;
			return { ok: true, title: L(loc).editExtra(x.name), lines: [`${x.name}, ${L(loc).price(x.price_cents / 100, x.pricing === 'per_guest')} → ${a.name}, ${L(loc).price(Number(a.price_eur) || 0, a.pricing === 'per_guest')}`] };
		},
		async apply(ctx, a) {
			const res = await updateHallExtra(ctx.locals.db, ctx.org.id, String(a.extra_id), {
				name: String(a.name), description: (a.description as string | null) ?? null, priceEur: Number(a.price_eur) || 0,
				pricing: a.pricing === 'per_guest' ? 'per_guest' : 'fixed'
			}, ctx.locals.locale);
			return res.ok ? { ok: true } : { ok: false, error: res.error };
		}
	},
	{
		type: 'extra_remove',
		permission: 'halls.manage',
		properties: { extra_id: s('Extra id') },
		async check(ctx, a) {
			const x = await dbFirst<{ name: string; hall: string }>(ctx.locals.db,
				'SELECT e.name, h.name AS hall FROM hall_extras e JOIN halls h ON h.id = e.hall_id WHERE e.id = ? AND h.org_id = ?', String(a.extra_id), ctx.org.id);
			return x ? { ok: true, title: L(ctx.locals.locale).removeExtra(x.name, x.hall) } : { ok: false, error: 'Unknown extra.' };
		},
		async apply(ctx, a) {
			const res = await removeHallExtra(ctx.locals.db, ctx.org.id, String(a.extra_id));
			return res.ok ? { ok: true } : { ok: false, error: res.error };
		}
	},
	{
		type: 'table_type_add',
		permission: 'halls.manage',
		properties: {
			hall_id: s('Hall id, or ref:<ref>'), name: s('e.g. "Okrúhly stôl 8"'),
			shape: { type: 'string', enum: ['rect', 'round'], description: 'Shape' },
			width: nn('Rect width in metres, or null'), height: nn('Rect depth in metres, or null'),
			radius: nn('Round table radius in metres, or null'),
			max_chairs: { type: 'integer', description: 'Chairs per table' },
			amount: nn('How many the venue owns (0 = unlimited), or null')
		},
		async check(ctx, a, refs) {
			if (!hallRef(a.hall_id, refs)) return { ok: false, error: 'Unknown hall.' };
			const t = normalizeTableType({ name: a.name as string, shape: a.shape as 'rect', width: a.width as number, height: a.height as number,
				radius: a.radius as number, maxChairs: a.max_chairs as number, amount: (a.amount as number) ?? 0 }, ctx.locals.locale);
			if ('error' in t) return { ok: false, error: t.error };
			const loc = ctx.locals.locale;
			const dims = t.shape === 'round' ? `⌀ ${t.radius * 2} m` : `${t.width} × ${t.height} m`;
			return { ok: true, title: L(loc).addTableType(t.name, await hallLabel(ctx, a.hall_id, refs) ?? ''), lines: [`${dims} · ${L(loc).chairs(t.maxChairs)}${t.amount ? ` · ×${t.amount}` : ''}`] };
		},
		async apply(ctx, a, refs) {
			const res = await addTableType(ctx.locals.db, ctx.org.id, resolveHall(a.hall_id, refs), {
				name: a.name as string, shape: a.shape as 'rect', width: a.width as number, height: a.height as number,
				radius: a.radius as number, maxChairs: a.max_chairs as number, amount: (a.amount as number) ?? 0, color: null
			}, ctx.locals.locale);
			return res.ok ? { ok: true } : { ok: false, error: res.error };
		}
	},
	{
		type: 'table_type_remove',
		permission: 'halls.manage',
		properties: { hall_id: s('Hall id'), table_type_id: s('Table type id (from get_hall_setup)') },
		async check(ctx, a) {
			const x = await dbFirst<{ name: string; hall: string }>(ctx.locals.db,
				'SELECT t.name, h.name AS hall FROM table_types t JOIN halls h ON h.id = t.hall_id WHERE t.id = ? AND t.hall_id = ? AND h.org_id = ?',
				String(a.table_type_id), String(a.hall_id), ctx.org.id);
			return x ? { ok: true, title: L(ctx.locals.locale).removeTableType(x.name, x.hall) } : { ok: false, error: 'Unknown table type.' };
		},
		async apply(ctx, a) {
			const res = await removeTableType(ctx.locals.db, ctx.org.id, String(a.hall_id), String(a.table_type_id));
			return res.ok ? { ok: true } : { ok: false, error: res.error };
		}
	}
];

/** The JSON schema for propose_changes: a list of operations, each one of the kinds
 *  this member may perform. */
export async function changesSchema(can: (p: Permission) => Promise<boolean>): Promise<{ schema: Record<string, unknown>; kinds: string[] } | null> {
	const allowed: OpDef[] = [];
	for (const op of OPS) if (await can(op.permission)) allowed.push(op);
	if (!allowed.length) return null;
	const branch = (op: OpDef) => ({
		type: 'object',
		properties: { type: { type: 'string', enum: [op.type] }, ...op.properties },
		required: ['type', ...Object.keys(op.properties)],
		additionalProperties: false
	});
	return {
		kinds: allowed.map((o) => o.type),
		schema: {
			type: 'object',
			properties: {
				operations: { type: 'array', description: 'Every change to make, in order', items: { anyOf: allowed.map(branch) } }
			},
			required: ['operations'],
			additionalProperties: false
		}
	};
}

/** Check a batch now. Any operation that would fail is reported, and nothing is stored. */
export async function checkChanges(ctx: OpContext, raw: unknown): Promise<{ ok: true; ops: CheckedOp[] } | { ok: false; problems: string[] }> {
	const list = (Array.isArray(raw) ? raw : []) as Record<string, unknown>[];
	if (!list.length) return { ok: false, problems: ['No operations given.'] };
	if (list.length > 50) return { ok: false, problems: ['At most 50 operations at once.'] };
	const refs = new Set<string>();
	const ops: CheckedOp[] = [];
	const problems: string[] = [];
	for (const [i, a] of list.entries()) {
		const def = OPS.find((o) => o.type === a.type);
		if (!def) { problems.push(`#${i + 1}: unknown operation ${a.type}`); continue; }
		if (!(await ctx.can(def.permission))) { problems.push(`#${i + 1}: the user lacks the "${def.permission}" permission`); continue; }
		const r = await def.check(ctx, a, refs);
		if (!r.ok) { problems.push(`#${i + 1} (${def.type}): ${r.error}`); continue; }
		ops.push({ type: def.type, args: r.args ?? a, title: r.title, lines: r.lines ?? [] });
	}
	return problems.length ? { ok: false, problems } : { ok: true, ops };
}

/** Run a confirmed batch in order. One operation failing does not stop the rest. */
export async function applyChanges(ctx: OpContext, ops: CheckedOp[]): Promise<{ ok: boolean; error?: string }[]> {
	const refs = new Map<string, string>();
	const results: { ok: boolean; error?: string }[] = [];
	for (const op of ops) {
		const def = OPS.find((o) => o.type === op.type);
		if (!def || !(await ctx.can(def.permission))) { results.push({ ok: false, error: 'forbidden' }); continue; }
		try {
			const r = await def.apply(ctx, op.args, refs);
			if (r.ok && r.ref) refs.set(r.ref[0], r.ref[1]);
			results.push(r.ok ? { ok: true } : { ok: false, error: r.error });
		} catch (err) {
			console.error(`AI operation ${op.type} failed:`, err);
			results.push({ ok: false, error: 'unexpected error' });
		}
	}
	return results;
}

