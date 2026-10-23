import { dbAll, dbFirst, dbRun, toJson, fromJsonArr } from '$lib/db/index';
import type { HallRow } from '$lib/db/index';
import type { Permission } from '$lib/permissions';
import { requireOrgPermission } from '$lib/server/access';
import { assertCanBook } from '$lib/availability';
import { parseCsv, parseDate, parseTime, parseCount, type DateOrder } from './csv';
import { buildSeatableLayout } from '$lib/reservationLayout';
import { planSeating } from './seating-plan';
import type { Guest, MultiFloorState, TableObj } from '$lib/floorplan-types';
import {
	HALL_FIELDS, DAY_KEYS, allowedAmenityKeys, loadHallProfile, currentValue, validateHallPatch, type HallField
} from '$lib/server/hall-profile';
import { readPage, importImage, fetchPublic } from '$lib/server/web-page';
import {
	sniffDocument, pdfPageCount, extractPdfPages, storeDocument, loadDocumentRow, documentBytes,
	MAX_INLINE_PDF_PAGES, MAX_VIEW_PAGES, type R2Like
} from './documents';
import { buildDraft, describeWall } from '$lib/floorplan-draft';
import { migrateToMultiFloor } from '$lib/floorplan-types';
import { changesSchema, checkChanges, type OpContext } from './operations';
import { parseDow } from '$lib/availability';
import { getPlan } from '$lib/plans';
import type { FunctionTool } from './openai';
import type { OrgContext } from '../../../app.d';

/**
 * What the assistant can do, and on whose authority.
 *
 * Each tool names the permission it needs. The model is only offered the tools the
 * member holds, and the permission is checked again when a tool runs — the list is
 * a courtesy to the model, the check is the rule. This registry is meant to be the
 * single surface both the in-app assistant and (later) the MCP server use, so a
 * permission is enforced in one place for both.
 *
 * Tools never write. A tool that would change something creates a PROPOSAL, which
 * a person applies from the conversation (see ./proposals).
 */

export interface ToolContext {
	locals: App.Locals;
	org: OrgContext;
	userId: string;
	threadId: string;
	/** Photo storage, for tools that import images. Absent where R2 is not bound. */
	r2?: Parameters<typeof importImage>[0];
	/** Per-turn bookkeeping for tools that cost real money or time. */
	budget?: { pagesRead: number; refusedHosts: Set<string>; docsViewed?: number };
}

/** Documents one turn may look at: each is re-sent on every later step. */
const MAX_DOC_VIEWS = 3;

/** Pages one turn may read. Every later step re-sends what was read, so each page
 *  costs more the longer the turn runs. */
const MAX_PAGE_READS = 8;

/** Something the browser does for the user once the turn is over. */
export type ClientAction = { type: 'navigate'; path: string };

export interface ToolResult {
	output: unknown;
	proposalId?: string;
	clientAction?: ClientAction;
	/** A stored document the model should SEE on its next call (an image, or PDF pages). */
	showDocument?: { attachmentId: string; kind: 'image' | 'file'; note: string };
}

/** Where open_page may send someone: inside the app, no tricks. Access is still the
 *  page's own business — a link to something the member cannot see just refuses. */
export function safeAppPath(raw: unknown): string | null {
	if (typeof raw !== 'string') return null;
	const path = raw.trim();
	if (path.length > 200 || !path.startsWith('/app/')) return null;
	if (path.includes('..') || path.includes('//') || !/^[A-Za-z0-9/_?=&.-]+$/.test(path)) return null;
	return path;
}

interface Tool {
	name: string;
	description: string;
	permission: Permission;
	/** A schema, or one built for this member (propose_changes offers only the
	 *  operations they may perform). Null leaves the tool out entirely. */
	parameters: Record<string, unknown> | ((locals: App.Locals) => Promise<Record<string, unknown> | null>);
	run(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult>;
}

/** Whether the acting member holds a permission, without throwing. */
export async function memberCan(locals: App.Locals, permission: Permission): Promise<boolean> {
	try {
		await requireOrgPermission(locals, permission);
		return true;
	} catch {
		return false;
	}
}

const MAX_IMPORT_ROWS = 500;
const SAMPLE_ROWS = 8;
/** A file this small is handed over whole (a guest list, a note); larger ones only
 *  as columns and samples, for a mapping. */
const FULL_TEXT_CHARS = 12_000;

/** Strict-mode JSON schema helpers: every property required, null where optional. */
const str = (description: string) => ({ type: 'string', description });
const nullableStr = (description: string) => ({ type: ['string', 'null'], description });
const obj = (properties: Record<string, unknown>) => ({
	type: 'object',
	properties,
	required: Object.keys(properties),
	additionalProperties: false
});

async function loadAttachment(ctx: ToolContext, id: string) {
	return dbFirst<{ id: string; name: string; content: string; mime: string | null; page_count: number | null }>(ctx.locals.db,
		'SELECT id, name, content, mime, page_count FROM ai_attachments WHERE id = ? AND org_id = ? AND user_id = ?',
		id, ctx.org.id, ctx.userId);
}

/** A table as seating sees it. Unlabelled tables get "#n" in the order they were
 *  drawn, so the model and the preview can name them the same way. */
function flattenTables(layout: MultiFloorState) {
	const chairs = (t: TableObj) =>
		t.shape === 'round' ? Number(t.chairs) || 0
			: (Number(t.chairsTop) || 0) + (Number(t.chairsBottom) || 0) + (Number(t.chairsLeft) || 0) + (Number(t.chairsRight) || 0);
	let n = 0;
	return layout.floors.flatMap((f) => f.tables.map((t) => {
		n++;
		const size = chairs(t);
		return {
			floorId: f.id,
			id: t.id,
			label: t.label?.trim() || `#${n}`,
			assignments: Array.from({ length: size }, (_, i) => t.assignments?.[i] ?? null)
		};
	}));
}

function guestNamer(layout: MultiFloorState) {
	const byId = new Map(layout.guests.map((g) => [g.id, g]));
	return (id: string) => {
		const g = byId.get(id);
		return g ? `${g.firstName} ${g.lastName}`.trim() : id;
	};
}

/** A short fingerprint of the saved arrangement. A proposal remembers it, and Apply
 *  refuses if the seating was edited in between rather than overwrite that work. */
export async function layoutHash(raw: string | null): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw ?? ''));
	return [...new Uint8Array(digest)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** An event's seatable layout, scoped to the org, with its tables flattened. */
export async function loadSeating(ctx: { locals: App.Locals; org: OrgContext }, reservationId: string) {
	const reservation = await dbFirst<{
		id: string; title: string; event_date: string; num_guests: number | null; layout_json: string | null;
		hall_name: string; hall_floorplan_json: string | null;
	}>(ctx.locals.db,
		`SELECT r.id, r.title, r.event_date, r.num_guests, r.layout_json, h.name AS hall_name, h.floorplan_json AS hall_floorplan_json
		   FROM reservations r JOIN halls h ON h.id = r.hall_id WHERE r.id = ? AND r.org_id = ?`,
		reservationId, ctx.org.id);
	if (!reservation) return { error: 'No such reservation in this organisation.' } as const;
	if (!reservation.hall_floorplan_json) return { error: 'This hall has no floor plan yet, so there are no tables to seat guests at.' } as const;
	const { layout } = await buildSeatableLayout(ctx.locals.db, reservation.id, reservation.hall_floorplan_json, reservation.layout_json);
	const tables = flattenTables(layout);
	if (tables.length === 0 || tables.every((t) => t.assignments.length === 0)) {
		return { error: 'This event\'s layout has no tables with chairs yet. Choose a layout template or place tables in the layout editor first.' } as const;
	}
	return { reservation, layout, tables, baseHash: await layoutHash(reservation.layout_json) };
}

const TOOLS: Tool[] = [
	{
		name: 'list_halls',
		description: 'List the organisation\'s active halls (venues) with their id, capacity and whether they take bookings.',
		permission: 'halls.view',
		parameters: obj({}),
		async run(ctx) {
			const halls = await dbAll<{ id: string; name: string; max_people: number; allow_reservations: number; is_public: number }>(
				ctx.locals.db,
				`SELECT id, name, max_people, allow_reservations, is_public FROM halls
				  WHERE org_id = ? AND archived_at IS NULL ORDER BY name`,
				ctx.org.id);
			return { output: { halls } };
		}
	},
	{
		name: 'list_reservations',
		description: 'List reservations, optionally filtered by title text, date range (inclusive, YYYY-MM-DD), hall and status. Returns at most 100, earliest first.',
		permission: 'reservations.view',
		parameters: obj({
			query: nullableStr('Text the title contains (case-insensitive), or null'),
			from: nullableStr('Earliest event date, YYYY-MM-DD, or null'),
			to: nullableStr('Latest event date, YYYY-MM-DD, or null'),
			hall_id: nullableStr('Only this hall, or null for all'),
			status: {
				type: ['string', 'null'],
				enum: ['pending', 'waiting_payment', 'approved', 'planned', 'completed', 'cancelled', null],
				description: 'Only this status, or null for all'
			}
		}),
		async run(ctx, a) {
			const where = ['r.org_id = ?'];
			const params: unknown[] = [ctx.org.id];
			if (typeof a.query === 'string' && a.query.trim()) {
				// Escaped so a % or _ in a title searches for itself.
				where.push("r.title LIKE ? ESCAPE '\\'");
				params.push(`%${a.query.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
			}
			if (typeof a.from === 'string') { where.push('substr(r.event_date, 1, 10) >= ?'); params.push(a.from); }
			if (typeof a.to === 'string') { where.push('substr(r.event_date, 1, 10) <= ?'); params.push(a.to); }
			if (typeof a.hall_id === 'string') { where.push('r.hall_id = ?'); params.push(a.hall_id); }
			if (typeof a.status === 'string') { where.push('r.status = ?'); params.push(a.status); }
			const rows = await dbAll(ctx.locals.db,
				`SELECT r.id, r.title, substr(r.event_date, 1, 10) AS date, r.start_time, r.end_time, r.status,
				        r.num_guests, h.name AS hall,
				        NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), '') AS client
				   FROM reservations r JOIN halls h ON h.id = r.hall_id LEFT JOIN users u ON u.id = r.user_id
				  WHERE ${where.join(' AND ')}
				  ORDER BY r.event_date LIMIT 100`,
				...params);
			return { output: { count: rows.length, reservations: rows } };
		}
	},
	{
		name: 'read_attachment',
		description: 'Look at a file the user attached. A CSV or Excel sheet gives its columns, row count and first rows (and the whole text if small); a text file gives its text. Use this before proposing an import or seating.',
		permission: 'ai.use',
		parameters: obj({ attachment_id: str('The attachment id given in the user message') }),
		async run(ctx, a) {
			const file = await loadAttachment(ctx, String(a.attachment_id));
			if (!file) return { output: { error: 'No such attachment.' } };
			if (file.mime) {
				return { output: { name: file.name, kind: file.mime, page_count: file.page_count, note: 'A drawing, not text: use view_document to look at it.' } };
			}
			const fullText = file.content.length <= FULL_TEXT_CHARS ? file.content : null;
			// Plain text (a pasted guest list, a note) is not a table; don't pretend it is.
			if (!/\.(csv|tsv|xlsx)$/i.test(file.name)) {
				return { output: { name: file.name, text: fullText ?? file.content.slice(0, FULL_TEXT_CHARS), truncated: !fullText } };
			}
			const { delimiter, rows } = parseCsv(file.content);
			const [header = [], ...data] = rows;
			return {
				output: {
					name: file.name,
					delimiter,
					columns: header,
					row_count: data.length,
					sample: data.slice(0, SAMPLE_ROWS).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? '']))),
					text: fullText
				}
			};
		}
	},
	{
		name: 'propose_reservation_import',
		description:
			'Prepare an import of events from an attached CSV as new reservations. Map each field to a column name exactly as it ' +
			'appears in the file (or null if the file has no such column). Every row is validated against the halls\' rules; ' +
			'nothing is created until the user presses Apply on the preview. Call read_attachment first.',
		permission: 'reservations.manage',
		parameters: obj({
			attachment_id: str('The attachment id'),
			title_column: str('Column holding the event title'),
			date_column: str('Column holding the event date'),
			date_order: { type: 'string', enum: ['dmy', 'mdy', 'ymd'], description: 'Order of day, month and year in the date column, judged from the samples' },
			hall_column: nullableStr('Column naming the hall, or null'),
			default_hall_id: nullableStr('Hall id for rows with no hall column/value, or null'),
			start_time_column: nullableStr('Column with the start time, or null'),
			end_time_column: nullableStr('Column with the end time, or null'),
			guests_column: nullableStr('Column with the expected number of guests, or null'),
			description_columns: {
				type: 'array', items: { type: 'string' },
				description: 'Columns to combine into the reservation description (e.g. client name, phone, notes). Empty if none.'
			}
		}),
		async run(ctx, a) {
			const file = await loadAttachment(ctx, String(a.attachment_id));
			if (!file) return { output: { error: 'No such attachment.' } };
			const { rows } = parseCsv(file.content);
			const [header = [], ...data] = rows;
			const col = (name: unknown) => (typeof name === 'string' ? header.indexOf(name) : -1);

			const iTitle = col(a.title_column);
			const iDate = col(a.date_column);
			if (iTitle < 0 || iDate < 0) {
				return { output: { error: `Unknown column. The file's columns are: ${header.join(', ')}` } };
			}
			if (data.length > MAX_IMPORT_ROWS) {
				return { output: { error: `The file has ${data.length} rows; at most ${MAX_IMPORT_ROWS} can be imported at once.` } };
			}
			const iHall = col(a.hall_column);
			const iStart = col(a.start_time_column);
			const iEnd = col(a.end_time_column);
			const iGuests = col(a.guests_column);
			const iDesc = (Array.isArray(a.description_columns) ? a.description_columns : []).map(col).filter((i) => i >= 0);
			const order = (['dmy', 'mdy', 'ymd'].includes(String(a.date_order)) ? a.date_order : 'dmy') as DateOrder;

			const halls = await dbAll<HallRow>(ctx.locals.db,
				'SELECT * FROM halls WHERE org_id = ? AND archived_at IS NULL', ctx.org.id);
			const byName = new Map(halls.map((h) => [h.name.trim().toLowerCase(), h]));
			const byId = new Map(halls.map((h) => [h.id, h]));
			const fallback =
				(typeof a.default_hall_id === 'string' ? byId.get(a.default_hall_id) : undefined) ??
				(halls.length === 1 ? halls[0] : undefined);

			const seen = new Set<string>();
			const out = [];
			for (const [n, r] of data.entries()) {
				const cell = (i: number) => (i >= 0 ? (r[i] ?? '').trim() : '');
				const title = cell(iTitle).slice(0, 200);
				const event_date = parseDate(cell(iDate), order);
				const hallText = cell(iHall);
				const hall = hallText ? byName.get(hallText.toLowerCase()) ?? byId.get(hallText) : fallback;
				const description = iDesc.map((i) => (cell(i) ? `${header[i]}: ${cell(i)}` : '')).filter(Boolean).join('\n') || null;
				const row = {
					line: n + 2, // header is line 1
					title,
					event_date,
					start_time: parseTime(cell(iStart)),
					end_time: parseTime(cell(iEnd)),
					num_guests: parseCount(cell(iGuests)),
					hall_id: hall?.id ?? null,
					hall_name: hall?.name ?? (hallText || null),
					description,
					error: null as string | null
				};
				if (!title) row.error = 'missing_title';
				else if (!event_date) row.error = `bad_date:${cell(iDate)}`;
				else if (!hall) row.error = hallText ? `unknown_hall:${hallText}` : 'no_hall';
				else if (seen.has(`${hall.id}|${event_date}`)) row.error = 'duplicate_in_file';
				else {
					const check = await assertCanBook(ctx.locals.db, hall, event_date, ctx.userId, row.num_guests, ctx.locals.locale);
					if (!check.ok) row.error = check.reason ?? 'unavailable';
				}
				if (hall && event_date) seen.add(`${hall.id}|${event_date}`);
				out.push(row);
			}

			const ok = out.filter((r) => !r.error).length;
			const proposalId = crypto.randomUUID();
			await dbRun(ctx.locals.db,
				`INSERT INTO ai_proposals (id, org_id, thread_id, user_id, kind, payload) VALUES (?, ?, ?, ?, 'reservation_import', ?)`,
				proposalId, ctx.org.id, ctx.threadId, ctx.userId, toJson({ file: file.name, rows: out }));

			return {
				proposalId,
				output: {
					proposal_id: proposalId,
					rows: out.length,
					ready: ok,
					with_problems: out.length - ok,
					first_problems: out.filter((r) => r.error).slice(0, 8).map((r) => ({ line: r.line, title: r.title, problem: r.error })),
					note: 'A preview with an Apply button is now shown to the user. Summarise it briefly; do not list every row.'
				}
			};
		}
	}
,
	{
		name: 'get_reservation_seating',
		description:
			'Show an event\'s seating: its tables (label and number of chairs), who sits where, and the guests not yet seated. ' +
			'Use it before proposing seating, to learn the table labels and who is already on the guest list.',
		permission: 'reservations.view',
		parameters: obj({ reservation_id: str('The reservation id') }),
		async run(ctx, a) {
			const loaded = await loadSeating(ctx, String(a.reservation_id));
			if ('error' in loaded) return { output: { error: loaded.error } };
			const { layout, tables, reservation } = loaded;
			const name = guestNamer(layout);
			const seatedIds = new Set(tables.flatMap((t) => t.assignments.filter(Boolean) as string[]));
			return {
				output: {
					reservation: { title: reservation.title, date: reservation.event_date.slice(0, 10), hall: reservation.hall_name, expected_guests: reservation.num_guests },
					chairs_total: tables.reduce((n, t) => n + t.assignments.length, 0),
					tables: tables.map((t) => ({
						label: t.label, chairs: t.assignments.length,
						seated: t.assignments.filter(Boolean).map((id) => name(id as string))
					})),
					guests_total: layout.guests.length,
					unseated_guests: layout.guests.filter((g) => !seatedIds.has(g.id)).slice(0, 300).map((g) => name(g.id))
				}
			};
		}
	},
	{
		name: 'propose_seating',
		description:
			'Prepare a seating plan for an event from a list of names. A group is a family or a couple (keep_together=true) or ' +
			'one person; children go in their own parents\' group (match by surname or by what the list says), never a ' +
			'separate children\'s group unless the user asks for a children\'s table. Groups the user listed under one circle ' +
			'(e.g. "Kolegovia z práce", "Kamaráti", "Rodina nevesty") share that circle name: the plan seats each circle ' +
			'together where the tables allow and spreads the guests over the free tables. Give a table_label only when the ' +
			'user asked for a specific table, using a label from get_reservation_seating. Guests already on the list are matched ' +
			'by name, not duplicated. keep_existing=true keeps everyone already seated where they are; false re-seats everyone. ' +
			'Report groups_split_across_tables as it comes back; never say nothing was split unless it is empty.',
		permission: 'reservations.manage',
		parameters: obj({
			reservation_id: str('The reservation id'),
			keep_existing: { type: 'boolean', description: 'Keep guests who are already seated in their chairs' },
			reserved_tables: {
				type: 'array', items: { type: 'string' },
				description: 'Labels of tables that must only take guests explicitly given that table_label — the head table, ' +
					'and any table the user wants kept free. Head tables are reserved automatically as well.'
			},
			groups: {
				type: 'array',
				description: 'Guests in the groups they should sit in',
				items: obj({
					name: str('Short name for the group, e.g. "Novákovci"'),
					circle: nullableStr('The circle the user listed this group under, e.g. "Kolegovia z práce", or null'),
					table_label: nullableStr('A table label the user asked for, or null'),
					keep_together: { type: 'boolean', description: 'True for a family (with its children) or a couple' },
					guests: {
						type: 'array',
						items: obj({
							first_name: str('First name'),
							last_name: str('Last name, empty string if not known'),
							note: nullableStr('Dietary or accessibility note, or null')
						})
					}
				})
			}
		}),
		async run(ctx, a) {
			const loaded = await loadSeating(ctx, String(a.reservation_id));
			if ('error' in loaded) return { output: { error: loaded.error } };
			const { layout, tables, reservation, baseHash } = loaded;

			// Match people already on the guest list (RSVPs, earlier imports) by name.
			const norm = (f: string, l: string) => `${f} ${l}`.trim().toLowerCase().replace(/\s+/g, ' ');
			const known = new Map(layout.guests.map((g) => [norm(g.firstName, g.lastName), g.id]));
			const newGuests: Guest[] = [];
			const groups = (Array.isArray(a.groups) ? a.groups : []) as {
				name: string; circle: string | null; table_label: string | null; keep_together: boolean;
				guests: { first_name: string; last_name: string; note: string | null }[];
			}[];
			const seatingGroups = groups.map((g) => ({
				name: String(g.name ?? '').slice(0, 80),
				circle: typeof g.circle === 'string' && g.circle.trim() ? g.circle.trim().slice(0, 80) : null,
				preferredTable: typeof g.table_label === 'string' ? g.table_label : null,
				keepTogether: g.keep_together === true,
				guestIds: (Array.isArray(g.guests) ? g.guests : []).slice(0, 1000).map((p) => {
					const first = String(p.first_name ?? '').trim().slice(0, 60);
					const last = String(p.last_name ?? '').trim().slice(0, 60);
					const key = norm(first, last);
					let id = known.get(key);
					if (!id) {
						id = `ai_${crypto.randomUUID().slice(0, 8)}`;
						newGuests.push({ id, firstName: first, lastName: last, group: String(g.name ?? '').slice(0, 80),
							...(p.note ? { note: String(p.note).slice(0, 200) } : {}) });
						known.set(key, id);
					}
					return id;
				})
			}));
			if (!seatingGroups.some((g) => g.guestIds.length)) return { output: { error: 'No guests were given.' } };

			const keepExisting = a.keep_existing !== false;
			const reserved = (Array.isArray(a.reserved_tables) ? a.reserved_tables : []).map(String);
			const result = planSeating(tables, seatingGroups, { keepExisting, reserved });
			const name = guestNamer({ ...layout, guests: [...layout.guests, ...newGuests] });

			const proposalId = crypto.randomUUID();
			await dbRun(ctx.locals.db,
				`INSERT INTO ai_proposals (id, org_id, thread_id, user_id, kind, payload) VALUES (?, ?, ?, ?, 'seating', ?)`,
				proposalId, ctx.org.id, ctx.threadId, ctx.userId, toJson({
					reservationId: reservation.id, title: reservation.title, baseHash, keepExisting, newGuests,
					tables: result.tables.map((t) => ({ floorId: t.floorId, id: t.id, label: t.label, assignments: t.assignments })),
					names: Object.fromEntries(result.tables.flatMap((t) => t.assignments.filter(Boolean).map((id) => [id, name(id as string)]))),
					unseated: result.unseated.map(name),
					split: result.split
				}));

			const seated = result.tables.reduce((n, t) => n + t.assignments.filter(Boolean).length, 0);
			return {
				proposalId,
				output: {
					proposal_id: proposalId,
					new_guests_added: newGuests.length,
					seated_total: seated,
					tables_used: result.tables.filter((t) => t.assignments.some(Boolean)).length,
					could_not_be_seated: result.unseated.map(name),
					// Mention these: the tables could not keep them whole (groups and circles).
					groups_split_across_tables: result.split,
					guests_per_table: result.tables.filter((t) => t.assignments.some(Boolean)).map((t) => `${t.label}: ${t.assignments.filter(Boolean).length}/${t.assignments.length}`),
					note: 'A preview with an Apply button is now shown to the user. Summarise it briefly; do not list every guest.'
				}
			};
		}
	}
,
	{
		name: 'read_web_page',
		description:
			'Open a public web page and read it: its title, description, main text (prices, capacity, contacts) and the photos ' +
			'on it with their alt text, and embeds (virtual tours, videos) whose photos it cannot see. Use it on the venue\'s own pages ' +
			'after a web search, to get facts and photo URLs. One page often has only one or two photos: for a gallery, read ' +
			'more pages (the operator\'s site, its gallery or event pages, other listings of the venue).',
		permission: 'ai.use',
		parameters: obj({ url: str('The page URL, http(s)') }),
		async run(ctx, a) {
			const budget = (ctx.budget ??= { pagesRead: 0, refusedHosts: new Set() });
			let host = '';
			try { host = new URL(String(a.url)).hostname.replace(/^www\./, ''); } catch { /* reported by readPage */ }
			if (host && budget.refusedHosts.has(host)) {
				return { output: { error: `${host} already refused this session — do not retry it; use another source.` } };
			}
			if (budget.pagesRead >= MAX_PAGE_READS) {
				return { output: { error: `Page-reading limit for this request reached (${MAX_PAGE_READS}). Work with what you have.` } };
			}
			budget.pagesRead++;
			const page = await readPage(String(a.url));
			if ('error' in page) {
				if (host && /refused|did not answer/.test(page.error)) budget.refusedHosts.add(host);
				return { output: { error: `Could not read the page: ${page.error}.` } };
			}
			const few = page.images.length < 3;
			return { output: few ? { ...page, photo_note:
				`Only ${page.images.length} photo(s) on this page${page.embeds.some((e) => e.kind === 'virtual tour') ? ' (its other views are inside a virtual tour, which cannot be imported)' : ''}. ` +
				'If the user wants a gallery, look on other pages before proposing one, and if you still have fewer photos than they asked for, say how many you found.' } : page };
		}
	},
	{
		name: 'get_hall',
		description:
			'Read a hall\'s public profile as it is now: name, description, capacity, address, contacts, pricing, amenities ' +
			'and opening hours, plus the amenity keys this organisation can use. Read it before proposing changes to it.',
		permission: 'halls.view',
		parameters: obj({ hall_id: str('The hall id') }),
		async run(ctx, a) {
			const hall = await loadHallProfile(ctx.locals.db, ctx.org.id, String(a.hall_id));
			if (!hall) return { output: { error: 'No such hall in this organisation.' } };
			return {
				output: {
					hall: Object.fromEntries(HALL_FIELDS.map((f) => [f, currentValue(hall, f)])),
					listed_publicly: !!hall.is_public,
					amenity_keys_available: await allowedAmenityKeys(ctx.locals.db, ctx.org.id),
					day_keys: DAY_KEYS
				}
			};
		}
	},
	{
		name: 'propose_hall_update',
		description:
			'Propose changes to a hall\'s public profile, ALL in this one call (from a real venue: every field you found, not ' +
			'one at a time); null leaves a field as it is. Photos come from read_web_page and are copied into Hallify: ' +
			'cover_photo_url is the best wide shot of the hall itself (not a logo, people or another event); gallery_photo_urls ' +
			'is the FULL new gallery (list existing /uploads/ photos to keep them), gathered from several pages when several ' +
			'are wanted; if you found fewer than asked, say so. Never invent a phone, email, price or capacity: use what the ' +
			'user gave or a reliable page says (the venue\'s own first), else null; list those pages in sources. The ' +
			'description: the user\'s language, your own words, 2-4 sentences.',
		permission: 'halls.manage',
		parameters: obj({
			hall_id: str('The hall id'),
			name: nullableStr('New name, or null'),
			description: nullableStr('New description, or null'),
			max_people: { type: ['integer', 'null'], description: 'Capacity (guests), or null' },
			address: nullableStr('Full street address with town and postcode, or null'),
			pricing_info: nullableStr('Pricing text, or null'),
			price_band: { type: ['integer', 'null'], enum: [1, 2, 3, null], description: '1 budget, 2 mid, 3 premium, or null' },
			contact_phone: nullableStr('Phone, or null'),
			contact_email: nullableStr('Email, or null'),
			contact_website: nullableStr('Website URL, or null'),
			amenities: {
				type: ['array', 'null'], items: { type: 'string' },
				description: 'The full new set of amenity keys (from get_hall), or null to leave them'
			},
			opening_hours: {
				type: ['array', 'null'],
				description: 'Opening hours for the days given, or null',
				items: obj({
					day: { type: 'string', enum: [...DAY_KEYS] },
					open: { type: 'boolean', description: 'Open that day' },
					from: str('Opening time HH:MM'),
					to: str('Closing time HH:MM')
				})
			},
			cover_photo_url: nullableStr('Cover photo: an image URL from read_web_page, or null'),
			gallery_photo_urls: {
				type: ['array', 'null'], items: { type: 'string' },
				description: 'The full new gallery: image URLs from read_web_page and/or existing /uploads/ photos, or null to leave it'
			},
			sources: { type: 'array', items: { type: 'string' }, description: 'URLs of the pages the facts came from; empty if the user gave them' }
		}),
		async run(ctx, a) {
			const hall = await loadHallProfile(ctx.locals.db, ctx.org.id, String(a.hall_id));
			if (!hall) return { output: { error: 'No such hall in this organisation.' } };

			// Photos are copied into our storage now, so the preview shows exactly what
			// would be saved, served from our own domain.
			const maxGallery = getPlan(ctx.org.subscription.plan).limits.maxGalleryImages;
			const photoProblems: string[] = [];
			const own = (u: string) => u.startsWith('/uploads/halls/');
			const imported = new Map<string, string | null>(); // one download per source photo
			const bring = async (u: string): Promise<string | null> => {
				if (own(u)) return u;
				if (imported.has(u)) return imported.get(u)!;
				if (!ctx.r2) { photoProblems.push(`${u}: photo storage is not available here`); return null; }
				let stored: string | null = null;
				try {
					stored = await importImage(ctx.r2, ctx.userId, u);
					if (!stored) photoProblems.push(`${u}: not a usable photo (JPEG/PNG/WebP, 8 KB–8 MB, publicly reachable)`);
				} catch {
					photoProblems.push(`${u}: could not be downloaded`);
				}
				imported.set(u, stored);
				return stored;
			};
			const raw: Record<string, unknown> = { ...a };
			if (typeof a.cover_photo_url === 'string' && a.cover_photo_url) {
				raw.cover_image_url = (await bring(a.cover_photo_url)) ?? undefined;
			}
			if (Array.isArray(a.gallery_photo_urls)) {
				// The cover is shown on its own; repeating it as the gallery's first photo
				// only makes the gallery look like it has one picture more than it has.
				let urls = [...new Set(a.gallery_photo_urls.map(String))].filter((u) => u !== a.cover_photo_url);
				if (urls.length < new Set(a.gallery_photo_urls.map(String)).size) {
					photoProblems.push('the cover photo was also in the gallery list; it is shown once, as the cover, so the gallery has one photo fewer than you listed');
				}
				if (maxGallery !== -1 && urls.length > maxGallery) {
					photoProblems.push(`only the first ${maxGallery} gallery photos were kept (the plan's limit)`);
					urls = urls.slice(0, maxGallery);
				}
				const stored: string[] = [];
				for (const u of urls) {
					const s = await bring(u);
					if (s) stored.push(s);
				}
				raw.gallery_images = stored;
			}

			const checked = await validateHallPatch(ctx.locals.db, ctx.org.id, raw, { maxGallery });
			if (!checked.ok) return { output: { error: checked.error } };

			// Only what actually differs from today goes into the preview.
			const before: Record<string, unknown> = {};
			const after: Record<string, unknown> = {};
			for (const field of Object.keys(checked.patch) as HallField[]) {
				const now = currentValue(hall, field);
				const next = checked.patch[field];
				if (JSON.stringify(now) === JSON.stringify(next)) continue;
				before[field] = now;
				after[field] = next;
			}
			if (!Object.keys(after).length) return { output: { error: 'Nothing would change: the hall already has these values.' } };

			const sources = (Array.isArray(a.sources) ? a.sources : [])
				.map(String).filter((u) => /^https?:\/\//i.test(u)).slice(0, 8);
			const proposalId = crypto.randomUUID();
			await dbRun(ctx.locals.db,
				`INSERT INTO ai_proposals (id, org_id, thread_id, user_id, kind, payload) VALUES (?, ?, ?, ?, 'hall_update', ?)`,
				proposalId, ctx.org.id, ctx.threadId, ctx.userId,
				toJson({ hallId: hall.id, hallName: hall.name, before, after, sources }));
			return {
				proposalId,
				output: {
					proposal_id: proposalId,
					fields_changed: Object.keys(after),
					// The real counts, so the reply says what the card shows.
					cover_photo: 'cover_image_url' in after,
					gallery_photos: Array.isArray(after.gallery_images) ? after.gallery_images.length : null,
					photo_problems: photoProblems,
					note: 'A preview with each field before and after is now shown to the user. Summarise it briefly and mention anything you could not find. Give photo counts exactly as cover_photo and gallery_photos say.'
				}
			};
		}
	},
	{
		name: 'view_document',
		description:
			'LOOK at a drawing or document: an image, or pages of a PDF — from a web URL or a file the user attached. ' +
			`You will see it on your next step. A PDF longer than ${MAX_INLINE_PDF_PAGES} pages is only shown as the pages you ` +
			`ask for (at most ${MAX_VIEW_PAGES}, numbered from 1 as in the PDF viewer); if you do not know them, call once ` +
			'without pages to learn the page count. Use it for floor plans, technical drawings and photos you must examine.',
		permission: 'ai.use',
		parameters: obj({
			url: nullableStr('Public URL of an image or PDF, or null'),
			attachment_id: nullableStr('Id of a file the user attached, or null'),
			pages: { type: ['array', 'null'], items: { type: 'integer' }, description: 'PDF pages to show (1-based), or null' }
		}),
		async run(ctx, a) {
			const budget = (ctx.budget ??= { pagesRead: 0, refusedHosts: new Set() });
			if ((budget.docsViewed ?? 0) >= MAX_DOC_VIEWS) {
				return { output: { error: `Document limit for this request reached (${MAX_DOC_VIEWS}). Work with what you have seen.` } };
			}
			const r2 = ctx.r2 as R2Like | undefined;
			if (!r2) return { output: { error: 'Document storage is not available here.' } };
			const pages = Array.isArray(a.pages) ? a.pages.map(Number).filter(Number.isFinite) : null;

			// The bytes: a file the user attached, or a public document from the web.
			let name: string;
			let bytes: ArrayBuffer;
			if (typeof a.attachment_id === 'string' && a.attachment_id) {
				const row = await loadDocumentRow(ctx.locals.db, ctx.org.id, a.attachment_id);
				const data = row ? await documentBytes(r2, row) : null;
				if (!row || !data) return { output: { error: 'No such attached drawing.' } };
				name = row.name;
				bytes = data;
			} else if (typeof a.url === 'string' && a.url) {
				const got = await fetchPublic(a.url, { maxBytes: 40 * 1024 * 1024, timeoutMs: 20000, accept: 'application/pdf,image/*' }).catch(() => null);
				if (!got || !got.ok) return { output: { error: `Could not fetch the document${got && !got.ok ? `: ${got.reason}` : ''}.` } };
				name = decodeURIComponent(new URL(got.url).pathname.split('/').pop() || 'document');
				bytes = got.body;
			} else {
				return { output: { error: 'Give a url or an attachment_id.' } };
			}

			const mime = sniffDocument(new Uint8Array(bytes.slice(0, 12)));
			if (!mime) return { output: { error: 'That is not a PDF or an image (JPEG, PNG, WebP).' } };
			let count: number | null = null;
			if (mime === 'application/pdf') {
				try { count = await pdfPageCount(bytes); } catch { return { output: { error: 'That PDF could not be opened.' } }; }
				if (count > MAX_INLINE_PDF_PAGES && !pages?.length) {
					return { output: { page_count: count, note: `The PDF has ${count} pages. Call view_document again with the pages you need (at most ${MAX_VIEW_PAGES}).` } };
				}
				if (pages?.length) {
					try {
						const cut = await extractPdfPages(bytes, pages);
						bytes = cut.bytes.slice().buffer;
						name = `${name.replace(/\.pdf$/i, '')} (s. ${cut.pages.join(', ')}).pdf`;
					} catch (e) {
						return { output: { error: e instanceof Error ? e.message : 'Those pages could not be taken out.' } };
					}
				}
			}

			const id = await storeDocument(ctx.locals.db, r2, {
				orgId: ctx.org.id, userId: ctx.userId, threadId: ctx.threadId, name, mime, bytes, pageCount: count
			});
			budget.docsViewed = (budget.docsViewed ?? 0) + 1;
			return {
				output: { showing: name, page_count: count, note: 'The document is attached to your next step. Look at it carefully.' },
				showDocument: { attachmentId: id, kind: mime === 'application/pdf' ? 'file' : 'image', note: `Document you asked to view: ${name}` }
			};
		}
	},
	{
		name: 'get_floorplan',
		description:
			'Read a hall\'s saved floor plan: its size, every wall (a straight run with thickness, or the outline of a ' +
			'shaped wall) and every zone, in metres. Use it before changing an existing plan — never ask the user for a ' +
			'screenshot of something you can read here.',
		permission: 'halls.view',
		parameters: obj({ hall_id: str('The hall id') }),
		async run(ctx, a) {
			const hall = await dbFirst<{ name: string; floorplan_json: string | null }>(ctx.locals.db,
				'SELECT name, floorplan_json FROM halls WHERE id = ? AND org_id = ?', String(a.hall_id), ctx.org.id);
			if (!hall) return { output: { error: 'No such hall in this organisation.' } };
			if (!hall.floorplan_json) return { output: { hall: hall.name, floorplan: null, note: 'This hall has no floor plan yet.' } };
			const state = migrateToMultiFloor(hall.floorplan_json);
			const all = state.floors.flatMap((f) => [...f.walls.flatMap((w) => w.points), ...f.zones.flatMap((z) => z.points)]);
			const span = (k: 'x' | 'y') => all.length ? Math.round((Math.max(...all.map((p) => p[k])) - Math.min(...all.map((p) => p[k]))) * 100) / 100 : 0;
			return {
				output: {
					hall: hall.name,
					size_m: { w: span('x'), h: span('y') },
					floors: state.floors.map((f) => ({
						name: f.name,
						walls: f.walls.map((w) => describeWall(w.points)),
						zones: f.zones.map((z) => ({ label: z.label, color: z.color, points: z.points })),
						tables: f.tables.length
					}))
				}
			};
		}
	},
	{
		name: 'propose_floorplan',
		description:
			'Draw a hall\'s floor plan (new, or a complete redraw of an existing one — read it first with get_floorplan). ' +
			'Coordinates in METRES, x to the right, y downwards, on a 0.5 m grid: every point and every thickness is rounded to the nearest 0.5 m (thinnest wall 0.5 m), so draw at that precision. Work out the scale from dimension labels or a scale bar; if ' +
			'there is none, from a known size (a door ~0.9 m) and say so in notes. ' +
			'WALLS ARE CONNECTED RUNS, not boxes: each continuous stretch of wall is ONE entry whose points follow its centre ' +
			'line through every corner, with its thickness (old outer walls 0.5–0.8 m, inner 0.1–0.3 m). Corners are joined ' +
			'cleanly. A wall going all the way round with no opening is one entry with closed=true. Break a run only where ' +
			'there is a door or opening. Draw curves and rounded corners with several points (every 10–15°). ' +
			'Zones: labelled areas (stage, bar, balcony) as polygons. Only the event space and what serves it, not the whole ' +
			'building. To resize, multiply coordinates but keep wall thicknesses. In notes, say what the scale is based on and ' +
			'what is approximate. The user sees the drawing and confirms it.',
		permission: 'floorplans.manage',
		parameters: obj({
			hall_id: str('The hall id'),
			replace_existing: { type: 'boolean', description: 'True to replace walls and zones of a plan that already exists' },
			walls: {
				type: 'array',
				description: 'Wall runs: each a centre line through its corners',
				items: obj({
					points: { type: 'array', items: obj({ x: { type: 'number' }, y: { type: 'number' } }), description: 'Centre line, in order' },
					thickness: { type: 'number', description: 'Wall thickness in metres; rounded to 0.5 m steps, at least 0.5' },
					closed: { type: 'boolean', description: 'True if the wall goes all the way round with no opening' }
				})
			},
			zones: {
				type: 'array',
				items: obj({
					label: str('Short label shown on the plan'),
					color: nullableStr('#rrggbb, or null for a default'),
					points: { type: 'array', items: obj({ x: { type: 'number' }, y: { type: 'number' } }) }
				})
			},
			notes: str('What the scale is based on and what is approximate, in the user\'s language'),
			sources: { type: 'array', items: { type: 'string' }, description: 'Where the drawing came from (URLs or file names)' }
		}),
		async run(ctx, a) {
			const hall = await dbFirst<{ id: string; name: string; floorplan_json: string | null }>(ctx.locals.db,
				'SELECT id, name, floorplan_json FROM halls WHERE id = ? AND org_id = ?', String(a.hall_id), ctx.org.id);
			if (!hall) return { output: { error: 'No such hall in this organisation.' } };
			const existing = hall.floorplan_json ? migrateToMultiFloor(hall.floorplan_json) : null;
			const hasWalls = !!existing?.floors.some((f) => f.walls.length || f.zones.length);
			if (hasWalls && a.replace_existing !== true) {
				return { output: { error: 'This hall already has a floor plan. Ask the user whether to replace it, then set replace_existing.' } };
			}
			const built = buildDraft(a.walls, a.zones);
			if (!built.ok) return { output: { error: built.error } };

			const proposalId = crypto.randomUUID();
			await dbRun(ctx.locals.db,
				`INSERT INTO ai_proposals (id, org_id, thread_id, user_id, kind, payload) VALUES (?, ?, ?, ?, 'floorplan', ?)`,
				proposalId, ctx.org.id, ctx.threadId, ctx.userId, toJson({
					hallId: hall.id, hallName: hall.name, baseHash: await layoutHash(hall.floorplan_json),
					replaces: hasWalls, ...built.draft,
					notes: String(a.notes ?? '').slice(0, 1000),
					sources: (Array.isArray(a.sources) ? a.sources : []).map(String).slice(0, 6)
				}));
			return {
				proposalId,
				output: {
					proposal_id: proposalId,
					size_m: built.draft.size,
					walls: built.draft.walls.length,
					zones: built.draft.zones.length,
					note: 'The user now sees the drawing with a confirm button. Summarise briefly, including the scale basis and what is approximate.'
				}
			};
		}
	},
	{
		name: 'get_reservation',
		description: 'Everything about one reservation: event, date and times, hall, status, guests, client and contact, booked extras, seating progress and the latest messages with the client.',
		permission: 'reservations.view',
		parameters: obj({ reservation_id: str('The reservation id') }),
		async run(ctx, a) {
			const r = await dbFirst<Record<string, unknown> & { hall_id: string; extras_json: string | null; layout_json: string | null; user_id: string }>(ctx.locals.db,
				`SELECT r.id, r.title, r.description, substr(r.event_date, 1, 10) AS date, r.start_time, r.end_time, r.status, r.num_guests,
				        r.event_type, r.invite_code, r.created_at, r.hall_id, r.extras_json, r.layout_json, r.user_id, h.name AS hall,
				        NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), '') AS client, u.email AS client_email
				   FROM reservations r JOIN halls h ON h.id = r.hall_id LEFT JOIN users u ON u.id = r.user_id
				  WHERE r.id = ? AND r.org_id = ?`, String(a.reservation_id), ctx.org.id);
			if (!r) return { output: { error: 'No such reservation in this organisation.' } };
			const extraIds = fromJsonArr(r.extras_json).map(String);
			const extras = extraIds.length
				? await dbAll<{ id: string; name: string; price_cents: number; pricing: string }>(ctx.locals.db,
					`SELECT id, name, price_cents, pricing FROM hall_extras WHERE hall_id = ? AND id IN (${extraIds.map(() => '?').join(',')})`, r.hall_id, ...extraIds)
				: [];
			const layout = r.layout_json ? migrateToMultiFloor(r.layout_json) : null;
			const seats = layout ? layout.floors.flatMap((f) => f.tables.flatMap((t) => t.assignments ?? [])) : [];
			const messages = await memberCan(ctx.locals, 'messages.view')
				? await dbAll(ctx.locals.db,
					`SELECT m.created_at, CASE WHEN m.sender_id = t.user_id THEN 'client' ELSE 'staff' END AS from_who, substr(m.body, 1, 400) AS body
					   FROM messages m JOIN tickets t ON t.id = m.ticket_id
					  WHERE t.org_id = ? AND t.reservation_id = ? AND m.message_type = 'text'
					  ORDER BY m.created_at DESC LIMIT 8`, ctx.org.id, r.id)
				: null;
			const { extras_json: _e, layout_json: _l, user_id: _u, ...rest } = r;
			return {
				output: {
					...rest,
					extras: extras.map((x) => ({ id: x.id, name: x.name, price_eur: x.price_cents / 100, pricing: x.pricing })),
					seating: layout ? { guests_listed: layout.guests.length, seated: seats.filter(Boolean).length, chairs: seats.length } : null,
					latest_messages: messages
				}
			};
		}
	},
	{
		name: 'check_availability',
		description: 'Whether a hall can be booked on given dates, by the same rules a real booking meets (blocked days, opening days, monthly plan cap, notice period, other bookings). Up to 31 dates.',
		permission: 'reservations.view',
		parameters: obj({
			hall_id: str('The hall id'),
			dates: { type: 'array', items: { type: 'string' }, description: 'Dates YYYY-MM-DD' },
			guests: { type: ['integer', 'null'], description: 'Expected guests, to check capacity, or null' }
		}),
		async run(ctx, a) {
			const hall = await dbFirst<HallRow>(ctx.locals.db, 'SELECT * FROM halls WHERE id = ? AND org_id = ?', String(a.hall_id), ctx.org.id);
			if (!hall) return { output: { error: 'No such hall in this organisation.' } };
			const dates = (Array.isArray(a.dates) ? a.dates : []).map(String).slice(0, 31);
			const out = [];
			for (const d of dates) {
				const r = await assertCanBook(ctx.locals.db, hall, d, ctx.userId, a.guests == null ? null : Number(a.guests), ctx.locals.locale);
				out.push({ date: d, available: r.ok, reason: r.ok ? null : r.reason });
			}
			return { output: { hall: hall.name, accepting_bookings: !!hall.allow_reservations, dates: out } };
		}
	},
	{
		name: 'get_hall_setup',
		description: 'A hall\'s booking setup: booking rules, blocked periods (with ids), bookable extras (with ids and prices), table types (with ids) and layout templates. Read it before changing any of them.',
		permission: 'halls.view',
		parameters: obj({ hall_id: str('The hall id') }),
		async run(ctx, a) {
			const id = String(a.hall_id);
			const hall = await dbFirst<Record<string, unknown>>(ctx.locals.db,
				`SELECT name, allow_reservations, auto_approve, custom_layouts, force_layouts, allow_feedback,
				        min_days_advance, min_cancel_days, pre_reservation_text, is_public, archived_at, plan_locked
				   FROM halls WHERE id = ? AND org_id = ?`, id, ctx.org.id);
			if (!hall) return { output: { error: 'No such hall in this organisation.' } };
			const [blocks, extras, tableTypes, templates] = await Promise.all([
				dbAll<{ id: string; block_type: string; date_from: string | null; date_to: string | null; days_of_week: unknown; reason: string | null }>(ctx.locals.db,
					'SELECT id, block_type, date_from, date_to, days_of_week, reason FROM hall_blocks WHERE hall_id = ? ORDER BY date_from', id),
				dbAll<{ id: string; name: string; description: string | null; price_cents: number; pricing: string }>(ctx.locals.db,
					'SELECT id, name, description, price_cents, pricing FROM hall_extras WHERE hall_id = ? ORDER BY created_at', id),
				dbAll(ctx.locals.db, 'SELECT id, name, shape, width, height, radius, max_chairs, amount FROM table_types WHERE hall_id = ? ORDER BY name', id),
				dbAll(ctx.locals.db, 'SELECT id, name, event_type FROM floorplan_templates WHERE hall_id = ? ORDER BY name', id)
			]);
			return {
				output: {
					hall,
					blocked_periods: blocks.map((b) => ({ ...b, days_of_week: parseDow(b.days_of_week), weekday_numbering: '0=Sunday…6=Saturday' })),
					extras: extras.map((x) => ({ id: x.id, name: x.name, description: x.description, price_eur: x.price_cents / 100, pricing: x.pricing })),
					table_types: tableTypes,
					layout_templates: templates
				}
			};
		}
	},
	{
		name: 'list_message_threads',
		description: 'Conversations with clients, newest first: subject, client, open or closed, the reservation it is about, and the last message.',
		permission: 'messages.view',
		parameters: obj({
			status: { type: ['string', 'null'], enum: ['open', 'closed', null], description: 'Only open or closed threads, or null for all' },
			query: nullableStr('Text in the subject or client name, or null')
		}),
		async run(ctx, a) {
			const where = ['t.org_id = ?'];
			const params: unknown[] = [ctx.org.id];
			if (typeof a.status === 'string') { where.push('t.status = ?'); params.push(a.status); }
			if (typeof a.query === 'string' && a.query.trim()) {
				where.push("(t.subject LIKE ? OR (u.first_name || ' ' || u.last_name) LIKE ?)");
				params.push(`%${a.query.trim()}%`, `%${a.query.trim()}%`);
			}
			const rows = await dbAll(ctx.locals.db,
				`SELECT t.id, t.subject, t.status, t.reservation_id, t.updated_at,
				        NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), '') AS client,
				        (SELECT substr(m.body, 1, 200) FROM messages m WHERE m.ticket_id = t.id AND m.message_type = 'text' ORDER BY m.created_at DESC LIMIT 1) AS last_message
				   FROM tickets t LEFT JOIN users u ON u.id = t.user_id
				  WHERE ${where.join(' AND ')} ORDER BY t.updated_at DESC LIMIT 40`, ...params);
			return { output: { threads: rows } };
		}
	},
	{
		name: 'get_message_thread',
		description: 'The messages of one conversation, oldest first (the latest 40). To reply, use propose_changes with reservation_message.',
		permission: 'messages.view',
		parameters: obj({ thread_id: str('The thread id from list_message_threads') }),
		async run(ctx, a) {
			const t = await dbFirst<{ id: string; subject: string; user_id: string; reservation_id: string | null }>(ctx.locals.db,
				'SELECT id, subject, user_id, reservation_id FROM tickets WHERE id = ? AND org_id = ?', String(a.thread_id), ctx.org.id);
			if (!t) return { output: { error: 'No such conversation in this organisation.' } };
			const msgs = await dbAll<{ created_at: string; from_who: string; body: string | null; message_type: string }>(ctx.locals.db,
				`SELECT created_at, CASE WHEN sender_id = ? THEN 'client' ELSE 'staff' END AS from_who, body, message_type
				   FROM (SELECT * FROM messages WHERE ticket_id = ? ORDER BY created_at DESC LIMIT 40) ORDER BY created_at`, t.user_id, t.id);
			return { output: { subject: t.subject, reservation_id: t.reservation_id, messages: msgs.filter((m) => m.message_type === 'text').map(({ message_type: _m, ...m }) => m) } };
		}
	},
	{
		name: 'get_stats',
		description: 'Booking numbers for a period: reservations by status, by hall (with guests) and by month. Dates inclusive, YYYY-MM-DD.',
		permission: 'reservations.view',
		parameters: obj({ from: str('First day YYYY-MM-DD'), to: str('Last day YYYY-MM-DD') }),
		async run(ctx, a) {
			const range = [ctx.org.id, String(a.from), String(a.to)];
			const base = `FROM reservations r JOIN halls h ON h.id = r.hall_id WHERE r.org_id = ? AND substr(r.event_date, 1, 10) BETWEEN ? AND ?`;
			const [byStatus, byHall, byMonth] = await Promise.all([
				dbAll(ctx.locals.db, `SELECT r.status, COUNT(*) AS count ${base} GROUP BY r.status`, ...range),
				dbAll(ctx.locals.db, `SELECT h.name AS hall, COUNT(*) AS reservations, SUM(COALESCE(r.num_guests, 0)) AS guests ${base} AND r.status != 'cancelled' GROUP BY h.id ORDER BY reservations DESC`, ...range),
				dbAll(ctx.locals.db, `SELECT substr(r.event_date, 1, 7) AS month, COUNT(*) AS reservations ${base} AND r.status != 'cancelled' GROUP BY month ORDER BY month`, ...range)
			]);
			return { output: { from: a.from, to: a.to, by_status: byStatus, by_hall: byHall, by_month: byMonth } };
		}
	},
	{
		name: 'propose_changes',
		description:
			'Make one or MANY changes at once, shown to the user as a single preview with one confirm button: create reservations, ' +
			'change statuses, message clients, set booking extras, change booking rules, block or unblock dates, add/edit/remove ' +
			'extras and table types, create a hall. Put everything the user asked for into ONE call, in order. A hall created ' +
			'here can be used by later operations as hall_id "ref:<its ref>". Every operation is checked now; if any would fail ' +
			'you get the problems back and nothing is proposed — fix them and call again.',
		permission: 'ai.use',
		parameters: async (locals) => (await changesSchema((p) => memberCan(locals, p)))?.schema ?? null,
		async run(ctx, a) {
			const opCtx: OpContext = { locals: ctx.locals, org: ctx.org, can: (p) => memberCan(ctx.locals, p) };
			const checked = await checkChanges(opCtx, a.operations);
			if (!checked.ok) return { output: { error: 'Some operations would fail; nothing was proposed.', problems: checked.problems } };
			const proposalId = crypto.randomUUID();
			await dbRun(ctx.locals.db,
				`INSERT INTO ai_proposals (id, org_id, thread_id, user_id, kind, payload) VALUES (?, ?, ?, ?, 'changes', ?)`,
				proposalId, ctx.org.id, ctx.threadId, ctx.userId, toJson({ ops: checked.ops }));
			return {
				proposalId,
				output: {
					proposal_id: proposalId,
					operations: checked.ops.map((o) => o.title),
					note: 'The user sees every operation listed with one confirm button. Summarise in a sentence or two.'
				}
			};
		}
	},
	{
		name: 'open_page',
		description:
			'Open a page of the app for the user, in the window they are using. Use it when they ask to go to, open or see ' +
			'something, or right after a change so they can look at it. Paths: /app/manage (dashboard), /app/manage/reservations, ' +
			'/app/manage/calendar, /app/manage/halls, /app/manage/halls/{hall_id}, /app/manage/halls/{hall_id}/editor (floor plan), ' +
			'/app/reservation/{reservation_id}, /app/reservation/{reservation_id}/layout (table layout and seating), ' +
			'/app/manage/messages, /app/manage/settings/ai.',
		permission: 'ai.use',
		parameters: obj({ path: str('The page path, starting with /app/') }),
		async run(_ctx, a) {
			const path = safeAppPath(a.path);
			if (!path) return { output: { error: 'That is not a page of this app.' } };
			return { output: { opened: path }, clientAction: { type: 'navigate', path } };
		}
	}
];

/** The tools this member may use, in the shape the Responses API expects. */
export async function toolsFor(locals: App.Locals): Promise<FunctionTool[]> {
	const out: FunctionTool[] = [];
	for (const t of TOOLS) {
		if (!(await memberCan(locals, t.permission))) continue;
		const parameters = typeof t.parameters === 'function' ? await t.parameters(locals) : t.parameters;
		if (parameters) out.push({ type: 'function', name: t.name, description: t.description, parameters, strict: true });
	}
	return out;
}

/** Run one tool call. Unknown tools, bad JSON and missing permissions come back to
 *  the model as errors it can explain, never as exceptions that end the turn. */
export async function runTool(ctx: ToolContext, name: string, rawArgs: string): Promise<ToolResult> {
	const tool = TOOLS.find((t) => t.name === name);
	if (!tool) return { output: { error: `Unknown tool ${name}` } };
	if (!(await memberCan(ctx.locals, tool.permission))) {
		return { output: { error: `The user does not have the "${tool.permission}" permission needed for this.` } };
	}
	let args: Record<string, unknown>;
	try {
		args = JSON.parse(rawArgs || '{}');
	} catch {
		return { output: { error: 'Arguments were not valid JSON.' } };
	}
	try {
		return await tool.run(ctx, args);
	} catch (err) {
		console.error(`AI tool ${name} failed:`, err);
		return { output: { error: 'The tool failed unexpectedly.' } };
	}
}
