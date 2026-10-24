import { dbAll, dbFirst, dbRun } from '$lib/db/index';
import type { ReservationStatus } from '$lib/db/index';
import type { SessionUser } from '$lib/auth';
import { getPlan, planName, type PlanId } from '$lib/plans';
import type { Permission } from '$lib/permissions';
import { orgPermissions } from '$lib/server/access';
import { memberCan, runTool, toolSpec } from '$lib/server/ai/tools';
import { changeReservationStatus, ALLOWED_STATUSES, DECLINE_REASON_MAX } from '$lib/server/ops/reservation-ops';
import { loadHallProfile, validateHallPatch, applyHallPatch } from '$lib/server/hall-profile';
import { MESSAGE_MAX } from '$lib/server/threads';
import { notifyNewMessage } from '$lib/email';
import { dispatchWebhooks } from '$lib/notifications';
import { listAudit } from '$lib/server/platform-audit';
import { canWrite, type AccessGrant } from './oauth';
import { countLiveConnections } from './connections';
import type { McpToolDescriptor, ToolOutcome } from './jsonrpc';
import type { OrgContext } from '../../../app.d';

/**
 * What a connected agent may do, and on whose authority.
 *
 * The agent acts AS the member who connected it. Organisation tools reuse the
 * in-app assistant's read tools (src/lib/server/ai/tools.ts) through `runTool`, so a
 * permission is enforced in one place for both: the member's own role in that
 * organisation decides, call by call. On top of that, per organisation:
 *
 *   - the plan must include MCP (Professional, Enterprise);
 *   - the organisation must not be suspended, and the person must still be a member;
 *   - its owner must not have cut this connection off (mcp_org_revocations).
 *
 * Writes exist only when the person ticked "allow changes" (scope mcp:write), and
 * only these three, each through the same function the console's own button uses,
 * each recorded in the organisation's MCP activity log "via MCP (<client>)".
 *
 * Platform tools are read-only and only for platform administrators.
 */

type Db = App.Locals['db'];

export interface McpCaller {
	db: Db;
	grant: AccessGrant;
	user: SessionUser;
	locale: 'sk' | 'en';
}

/** The person behind a grant, as a session would see them. Client accounts (venue
 *  site guests) have nothing to connect to here and are refused. */
export async function loadCaller(db: Db, grant: AccessGrant): Promise<McpCaller | null> {
	const u = await dbFirst<SessionUser & { locale: string | null; deleted_at: string | null }>(db,
		`SELECT id, email, first_name, last_name, is_platform_admin, account_type, org_id, email_verified_at, locale, deleted_at
		   FROM users WHERE id = ?`, grant.userId);
	if (!u || u.deleted_at || u.account_type === 'client') return null;
	const { locale, deleted_at: _d, ...user } = u;
	return { db, grant, user: { ...user, is_platform_admin: user.is_platform_admin ? 1 : 0 }, locale: locale === 'en' ? 'en' : 'sk' };
}

// ── Organisations ─────────────────────────────────────────────────────────────

export interface Membership {
	id: string;
	name: string;
	slug: string;
	logo_url: string | null;
	role: OrgContext['role'];
	plan: PlanId;
	status: OrgContext['subscription']['status'];
	stripe_customer_id: string | null;
	current_period_end: string | null;
	cut_off: number;
}

export async function memberships(caller: McpCaller): Promise<Membership[]> {
	return dbAll<Membership>(caller.db,
		`SELECT o.id, o.name, o.slug, o.logo_url, m.role, COALESCE(s.plan, 'free') AS plan, COALESCE(s.status, 'active') AS status,
		        s.stripe_customer_id, s.current_period_end,
		        EXISTS (SELECT 1 FROM mcp_org_revocations r WHERE r.grant_id = ? AND r.org_id = o.id) AS cut_off
		   FROM organization_members m
		   JOIN organizations o ON o.id = m.org_id
		   LEFT JOIN subscriptions s ON s.org_id = o.id
		  WHERE m.user_id = ? AND o.suspended_at IS NULL
		  ORDER BY o.name`,
		caller.grant.grantId, caller.user.id);
}

/** Why an organisation's data is not reachable over MCP, or null when it is. */
export function unavailableReason(m: Membership): string | null {
	if (m.cut_off) return `The owner of ${m.name} has turned off this connection's access to it.`;
	if (!getPlan(m.plan).limits.mcp) {
		return `${m.name} is on the ${planName(m.plan)} plan. Connecting AI assistants over MCP is part of the Professional and Enterprise plans.`;
	}
	return null;
}

const DEFAULT_BRANDING = { appName: 'Hallify', logoUrl: '/Hallify.svg', primaryColor: '#f05ca1', accentColor: '#f05ca1' };

/** What `locals` would be for this person working in this organisation's console. */
export function orgLocals(caller: McpCaller, m: Membership): App.Locals {
	const org: OrgContext = {
		id: m.id, name: m.name, slug: m.slug, logoUrl: m.logo_url, role: m.role, impersonated: false,
		subscription: { plan: m.plan, status: m.status, stripeCustomerId: m.stripe_customer_id, currentPeriodEnd: m.current_period_end }
	};
	return { db: caller.db, user: caller.user, currentOrg: org, domainOrg: null, branding: DEFAULT_BRANDING, locale: caller.locale };
}

type Resolved = { ok: true; locals: App.Locals; org: OrgContext; membership: Membership } | { ok: false; error: string };

export async function resolveOrg(caller: McpCaller, raw: unknown, list?: Membership[]): Promise<Resolved> {
	const all = list ?? (await memberships(caller));
	let m: Membership | undefined;
	if (typeof raw === 'string' && raw.trim()) {
		const key = raw.trim();
		m = all.find((x) => x.id === key || x.slug === key);
		if (!m) return { ok: false, error: `You are not a member of an organisation "${key}" (or it is suspended). Call list_organisations for the ones you can use.` };
	} else {
		const usable = all.filter((x) => !unavailableReason(x));
		if (usable.length === 1) m = usable[0];
		else if (!usable.length) {
			return { ok: false, error: all.length ? all.map((x) => unavailableReason(x)).join(' ') : 'You are not a member of any organisation.' };
		} else {
			return { ok: false, error: `You belong to several organisations; pass organization_id. Options: ${usable.map((x) => `${x.name} (${x.id})`).join(', ')}.` };
		}
	}
	const why = unavailableReason(m);
	if (why) return { ok: false, error: why };
	const locals = orgLocals(caller, m);
	return { ok: true, locals, org: locals.currentOrg!, membership: m };
}

// ── Activity ──────────────────────────────────────────────────────────────────

export const viaMcp = (clientName: string) => `via MCP (${clientName})`;

/** What an activity row says, as data: the page words it in the reader's language. */
export interface McpActivityDetail {
	label: string;
	from?: string;
	to?: string;
}

/** One change an agent made, in the organisation's MCP activity log ("via MCP
 *  (<client>)": the client's name is stored on the row). Never throws. */
export async function logMcpActivity(
	caller: McpCaller,
	orgId: string,
	a: { tool: string; targetType: string; targetId: string; detail: McpActivityDetail }
): Promise<void> {
	try {
		await dbRun(caller.db,
			`INSERT INTO mcp_activity (id, org_id, user_id, actor_name, grant_id, client_name, tool, target_type, target_id, summary)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			crypto.randomUUID(), orgId, caller.user.id, `${caller.user.first_name} ${caller.user.last_name}`.trim(),
			caller.grant.grantId, caller.grant.clientName, a.tool, a.targetType, a.targetId,
			JSON.stringify({ ...a.detail, label: a.detail.label.slice(0, 300) }));
	} catch (err) {
		console.error('logMcpActivity failed:', err);
	}
}

// ── Tool definitions ──────────────────────────────────────────────────────────

type Kind = 'account' | 'org-read' | 'org-write' | 'platform';

interface McpTool extends McpToolDescriptor {
	kind: Kind;
	run(caller: McpCaller, args: Record<string, unknown>): Promise<ToolOutcome>;
}

const ORG_ARG = {
	type: 'string',
	description: 'The organisation id (or slug) from list_organisations. May be left out when you can use exactly one.'
};

const annotations = (title: string, o: { write?: boolean; destructive?: boolean; idempotent?: boolean; openWorld?: boolean } = {}) => ({
	title,
	readOnlyHint: !o.write,
	destructiveHint: !!o.destructive,
	idempotentHint: o.write ? !!o.idempotent : true,
	openWorldHint: !!o.openWorld
});

/** The in-app assistant's strict schema, made friendlier for any client: optional
 *  (nullable) properties are no longer required, and the organisation is added. */
export function mcpSchema(parameters: Record<string, unknown>): Record<string, unknown> {
	const props = { organization_id: ORG_ARG, ...((parameters.properties as Record<string, Record<string, unknown>>) ?? {}) };
	const nullable = (p: Record<string, unknown>) => Array.isArray(p?.type) && (p.type as unknown[]).includes('null');
	const required = Object.keys((parameters.properties as object) ?? {}).filter((k) => !nullable(props[k as keyof typeof props] as Record<string, unknown>));
	return { type: 'object', properties: props, ...(required.length ? { required } : {}), additionalProperties: false };
}

/** The assistant's read tools, as offered over MCP. */
const READ_TOOLS: { name: string; title: string; description?: string }[] = [
	{ name: 'list_halls', title: 'List halls' },
	{ name: 'get_hall', title: 'Hall profile' },
	{ name: 'get_hall_setup', title: 'Hall booking setup' },
	{ name: 'get_floorplan', title: 'Hall floor plan' },
	{ name: 'list_reservations', title: 'List reservations' },
	{ name: 'get_reservation', title: 'Reservation details' },
	{ name: 'get_reservation_seating', title: 'Event seating' },
	{ name: 'check_availability', title: 'Check availability' },
	{ name: 'list_message_threads', title: 'Client conversations' },
	{
		name: 'get_message_thread', title: 'Conversation messages',
		description: 'The messages of one conversation with a client, oldest first (the latest 40). To answer, use reply_to_message_thread when this connection may make changes.'
	},
	{ name: 'get_stats', title: 'Booking statistics' }
];

function readTool(def: (typeof READ_TOOLS)[number]): McpTool | null {
	const spec = toolSpec(def.name);
	if (!spec) return null;
	return {
		kind: 'org-read',
		name: spec.name,
		title: def.title,
		description: `${def.description ?? spec.description} Needs the "${spec.permission}" permission in that organisation.`,
		inputSchema: mcpSchema(spec.parameters),
		annotations: annotations(def.title),
		async run(caller, args) {
			const r = await resolveOrg(caller, args.organization_id);
			if (!r.ok) return { ok: false, error: r.error };
			const { organization_id: _o, ...rest } = args;
			const res = await runTool(
				{ locals: r.locals, org: r.org, userId: caller.user.id, threadId: `mcp:${caller.grant.grantId}` },
				spec.name, JSON.stringify(rest));
			const out = res.output as Record<string, unknown> | null;
			if (out && typeof out === 'object' && typeof out.error === 'string') return { ok: false, error: out.error, data: out };
			return { ok: true, data: { organization: { id: r.org.id, name: r.org.name }, ...(out ?? {}) } };
		}
	};
}

async function requirePermission(locals: App.Locals, permission: Permission): Promise<string | null> {
	return (await memberCan(locals, permission)) ? null : `You do not have the "${permission}" permission in this organisation.`;
}

const WRITE_TOOLS: McpTool[] = [
	{
		kind: 'org-write',
		name: 'set_reservation_status',
		title: 'Change a reservation\'s status',
		description:
			'Approve, plan, complete or cancel a reservation, exactly as the status menu on the reservation page does: the client is ' +
			'e-mailed and the change is recorded in the reservation\'s history "via MCP". Cancelling with a reason declines the ' +
			'request and sends the client that reason. Pass expected_current_status (from get_reservation) so a booking someone ' +
			'else changed meanwhile is not overwritten. Needs "reservations.manage".',
		inputSchema: {
			type: 'object',
			properties: {
				organization_id: ORG_ARG,
				reservation_id: { type: 'string', description: 'The reservation id' },
				status: { type: 'string', enum: ALLOWED_STATUSES, description: 'The new status' },
				expected_current_status: { type: 'string', enum: ALLOWED_STATUSES, description: 'The status you saw; nothing changes if it moved on since' },
				reason: { type: 'string', description: `Only with status "cancelled": the reason the client reads (max ${DECLINE_REASON_MAX} characters)` }
			},
			required: ['reservation_id', 'status'],
			additionalProperties: false
		},
		annotations: annotations('Change a reservation\'s status', { write: true, destructive: true, idempotent: true, openWorld: true }),
		async run(caller, a) {
			const r = await resolveOrg(caller, a.organization_id);
			if (!r.ok) return { ok: false, error: r.error };
			const denied = await requirePermission(r.locals, 'reservations.manage');
			if (denied) return { ok: false, error: denied };
			const status = String(a.status ?? '') as ReservationStatus;
			if (!ALLOWED_STATUSES.includes(status)) return { ok: false, error: `status must be one of ${ALLOWED_STATUSES.join(', ')}.` };
			const reason = typeof a.reason === 'string' && a.reason.trim() ? a.reason.trim() : null;
			if (reason && status !== 'cancelled') return { ok: false, error: 'A reason can only be given when cancelling.' };
			if (reason && reason.length > DECLINE_REASON_MAX) return { ok: false, error: `The reason is longer than ${DECLINE_REASON_MAX} characters.` };
			// The reservation's history names the person and the agent that acted for them.
			const actor = { id: caller.user.id, first_name: caller.user.first_name, last_name: `${caller.user.last_name} · ${viaMcp(caller.grant.clientName)}` };
			const reservationId = String(a.reservation_id ?? '');
			const res = await changeReservationStatus(r.locals, r.org.id, reservationId, status, actor, {
				expectedFrom: typeof a.expected_current_status === 'string' ? a.expected_current_status : null,
				reason
			});
			if (!res.ok) return { ok: false, error: res.error };
			if (res.from !== status || reason) {
				await logMcpActivity(caller, r.org.id, {
					tool: 'set_reservation_status', targetType: 'reservation', targetId: reservationId,
					detail: { label: res.title, from: res.from, to: status }
				});
			}
			return { ok: true, data: { reservation_id: reservationId, title: res.title, from: res.from, status, changed: res.from !== status || !!reason } };
		}
	},
	{
		kind: 'org-write',
		name: 'reply_to_message_thread',
		title: 'Reply to a client conversation',
		description:
			'Send a message in a conversation with a client (thread id from list_message_threads), as the console\'s reply box does: ' +
			'it is sent in your name and the client is e-mailed. Closed conversations cannot be answered. Needs "messages.send".',
		inputSchema: {
			type: 'object',
			properties: {
				organization_id: ORG_ARG,
				thread_id: { type: 'string', description: 'The conversation id' },
				text: { type: 'string', description: `The message (max ${MESSAGE_MAX} characters), in the language the client writes in` }
			},
			required: ['thread_id', 'text'],
			additionalProperties: false
		},
		annotations: annotations('Reply to a client conversation', { write: true, destructive: false, idempotent: false, openWorld: true }),
		async run(caller, a) {
			const r = await resolveOrg(caller, a.organization_id);
			if (!r.ok) return { ok: false, error: r.error };
			const denied = await requirePermission(r.locals, 'messages.send');
			if (denied) return { ok: false, error: denied };
			const text = typeof a.text === 'string' ? a.text.trim() : '';
			if (!text) return { ok: false, error: 'The message is empty.' };
			if (text.length > MESSAGE_MAX) return { ok: false, error: `The message is longer than ${MESSAGE_MAX} characters.` };
			const threadId = String(a.thread_id ?? '');
			// Scoped to the organisation before anything is written.
			const tk = await dbFirst<{ subject: string; status: string; user_email: string | null; reservation_id: string | null }>(caller.db,
				`SELECT t.subject, t.status, u.email AS user_email, t.reservation_id
				   FROM tickets t JOIN users u ON u.id = t.user_id WHERE t.id = ? AND t.org_id = ?`, threadId, r.org.id);
			if (!tk) return { ok: false, error: 'No such conversation in this organisation.' };
			if (tk.status !== 'open') return { ok: false, error: 'This conversation is closed.' };
			await dbRun(caller.db, `INSERT INTO messages (id, ticket_id, sender_id, body, message_type) VALUES (?, ?, ?, ?, 'text')`,
				crypto.randomUUID(), threadId, caller.user.id, text);
			await dbRun(caller.db, `UPDATE tickets SET updated_at = datetime('now') WHERE id = ? AND org_id = ?`, threadId, r.org.id);
			if (tk.user_email) {
				notifyNewMessage(caller.db, r.org.id, tk.user_email, tk.subject, `${caller.user.first_name} ${caller.user.last_name}`,
					{ ticketId: threadId, reservationId: tk.reservation_id ?? undefined, message: text }).catch(() => {});
			}
			dispatchWebhooks(caller.db, r.org.id, 'ticket.reply', { ticket_id: threadId, reservation_id: tk.reservation_id }).catch(() => {});
			await logMcpActivity(caller, r.org.id, { tool: 'reply_to_message_thread', targetType: 'thread', targetId: threadId, detail: { label: tk.subject } });
			return { ok: true, data: { thread_id: threadId, sent: true } };
		}
	},
	{
		kind: 'org-write',
		name: 'update_hall_description',
		title: 'Update a hall\'s description',
		description:
			'Replace the public description of a hall (read it first with get_hall). The new text is shown on the venue\'s site ' +
			'as soon as it is saved. Needs "halls.manage".',
		inputSchema: {
			type: 'object',
			properties: {
				organization_id: ORG_ARG,
				hall_id: { type: 'string', description: 'The hall id' },
				description: { type: 'string', description: 'The full new description (max 4000 characters)' }
			},
			required: ['hall_id', 'description'],
			additionalProperties: false
		},
		annotations: annotations('Update a hall\'s description', { write: true, destructive: true, idempotent: true }),
		async run(caller, a) {
			const r = await resolveOrg(caller, a.organization_id);
			if (!r.ok) return { ok: false, error: r.error };
			const denied = await requirePermission(r.locals, 'halls.manage');
			if (denied) return { ok: false, error: denied };
			const hall = await loadHallProfile(caller.db, r.org.id, String(a.hall_id ?? ''));
			if (!hall) return { ok: false, error: 'No such hall in this organisation.' };
			if (typeof a.description !== 'string' || !a.description.trim()) return { ok: false, error: 'The description is empty.' };
			if (a.description.trim().length > 4000) return { ok: false, error: 'The description is longer than 4000 characters.' };
			const checked = await validateHallPatch(caller.db, r.org.id, { description: a.description });
			if (!checked.ok) return { ok: false, error: checked.error };
			await applyHallPatch(caller.db, r.org.id, hall, checked.patch);
			await logMcpActivity(caller, r.org.id, { tool: 'update_hall_description', targetType: 'hall', targetId: hall.id, detail: { label: hall.name } });
			return { ok: true, data: { hall_id: hall.id, hall: hall.name, description: checked.patch.description } };
		}
	}
];

const limitArg = (max: number) => ({ type: 'integer', minimum: 1, maximum: max, description: `At most this many rows (default 25, max ${max})` });
const clampLimit = (raw: unknown, max: number) => Math.min(Math.max(Number.isInteger(raw) ? (raw as number) : 25, 1), max);
const likeArg = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

const PLATFORM_TOOLS: McpTool[] = [
	{
		kind: 'platform',
		name: 'platform_stats',
		title: 'Platform statistics',
		description: 'Platform administrators only. Hallify-wide numbers: organisations by plan, accounts, halls, reservations, open floor-plan requests and MCP connections.',
		inputSchema: { type: 'object', properties: {}, additionalProperties: false },
		annotations: annotations('Platform statistics'),
		async run(caller) {
			const db = caller.db;
			const one = async (sql: string) => Number((await dbFirst<{ n: number }>(db, sql))?.n ?? 0);
			const [orgsByPlan, usersByType] = await Promise.all([
				dbAll(db, `SELECT COALESCE(s.plan, 'free') AS plan, COUNT(*) AS organisations FROM organizations o LEFT JOIN subscriptions s ON s.org_id = o.id GROUP BY 1 ORDER BY 2 DESC`),
				dbAll(db, `SELECT account_type, COUNT(*) AS accounts FROM users WHERE deleted_at IS NULL GROUP BY 1 ORDER BY 2 DESC`)
			]);
			return {
				ok: true,
				data: {
					organisations: { total: await one('SELECT COUNT(*) AS n FROM organizations'), suspended: await one('SELECT COUNT(*) AS n FROM organizations WHERE suspended_at IS NOT NULL'), by_plan: orgsByPlan },
					accounts: { by_type: usersByType, platform_admins: await one('SELECT COUNT(*) AS n FROM users WHERE is_platform_admin = 1 AND deleted_at IS NULL') },
					halls: { active: await one('SELECT COUNT(*) AS n FROM halls WHERE archived_at IS NULL'), archived: await one('SELECT COUNT(*) AS n FROM halls WHERE archived_at IS NOT NULL') },
					reservations: {
						total: await one('SELECT COUNT(*) AS n FROM reservations'),
						created_last_30_days: await one("SELECT COUNT(*) AS n FROM reservations WHERE created_at >= datetime('now', '-30 days')"),
						upcoming: await one("SELECT COUNT(*) AS n FROM reservations WHERE substr(event_date, 1, 10) >= date('now') AND status != 'cancelled'")
					},
					floorplan_requests_open: await one("SELECT COUNT(*) AS n FROM floorplan_requests WHERE status IN ('requested', 'contacted', 'scheduled')"),
					mcp_connections_active: await countLiveConnections(db)
				}
			};
		}
	},
	{
		kind: 'platform',
		name: 'platform_search_organisations',
		title: 'Search organisations',
		description: 'Platform administrators only. Organisations by name, slug or id, with plan, status, members and halls. Newest first.',
		inputSchema: {
			type: 'object',
			properties: {
				query: { type: 'string', description: 'Text in the name, slug or id; leave out for all' },
				plan: { type: 'string', enum: ['free', 'starter', 'professional', 'enterprise'], description: 'Only this plan' },
				limit: limitArg(100)
			},
			additionalProperties: false
		},
		annotations: annotations('Search organisations'),
		async run(caller, a) {
			const where: string[] = [];
			const params: unknown[] = [];
			if (typeof a.query === 'string' && a.query.trim()) {
				where.push("(o.name LIKE ? ESCAPE '\\' OR o.slug LIKE ? ESCAPE '\\' OR o.id = ?)");
				params.push(likeArg(a.query.trim()), likeArg(a.query.trim()), a.query.trim());
			}
			if (typeof a.plan === 'string') { where.push("COALESCE(s.plan, 'free') = ?"); params.push(a.plan); }
			const rows = await dbAll(caller.db,
				`SELECT o.id, o.name, o.slug, COALESCE(s.plan, 'free') AS plan, COALESCE(s.status, 'active') AS subscription_status,
				        o.suspended_at, o.created_at,
				        (SELECT COUNT(*) FROM organization_members m WHERE m.org_id = o.id) AS members,
				        (SELECT COUNT(*) FROM halls h WHERE h.org_id = o.id AND h.archived_at IS NULL) AS halls
				   FROM organizations o LEFT JOIN subscriptions s ON s.org_id = o.id
				  ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
				  ORDER BY o.created_at DESC LIMIT ?`, ...params, clampLimit(a.limit, 100));
			return { ok: true, data: { count: rows.length, organisations: rows } };
		}
	},
	{
		kind: 'platform',
		name: 'platform_search_users',
		title: 'Search accounts',
		description: 'Platform administrators only. Accounts by e-mail or name: type, platform-admin flag, e-mail verification and the organisations they belong to.',
		inputSchema: {
			type: 'object',
			properties: { query: { type: 'string', description: 'Text in the e-mail or name' }, limit: limitArg(100) },
			required: ['query'],
			additionalProperties: false
		},
		annotations: annotations('Search accounts'),
		async run(caller, a) {
			const q = typeof a.query === 'string' ? a.query.trim() : '';
			if (q.length < 2) return { ok: false, error: 'Give at least two characters to search for.' };
			const rows = await dbAll(caller.db,
				`SELECT u.id, u.email, TRIM(u.first_name || ' ' || u.last_name) AS name, u.account_type, u.is_platform_admin,
				        u.email_verified_at IS NOT NULL AS email_verified, u.created_at,
				        (SELECT GROUP_CONCAT(o.name || ' (' || m.role || ')', ', ') FROM organization_members m JOIN organizations o ON o.id = m.org_id WHERE m.user_id = u.id) AS organisations
				   FROM users u
				  WHERE u.deleted_at IS NULL
				    AND (u.email LIKE ? ESCAPE '\\' OR (u.first_name || ' ' || u.last_name) LIKE ? ESCAPE '\\' OR u.id = ?)
				  ORDER BY u.created_at DESC LIMIT ?`, likeArg(q), likeArg(q), q, clampLimit(a.limit, 100));
			return { ok: true, data: { count: rows.length, accounts: rows } };
		}
	},
	{
		kind: 'platform',
		name: 'platform_floorplan_requests',
		title: 'Floor-plan requests',
		description: 'Platform administrators only. The floor-plan service queue: open requests (oldest first) or those with one status.',
		inputSchema: {
			type: 'object',
			properties: { status: { type: 'string', enum: ['open', 'requested', 'contacted', 'scheduled', 'delivered', 'cancelled'], description: 'Default "open": requested, contacted or scheduled' }, limit: limitArg(100) },
			additionalProperties: false
		},
		annotations: annotations('Floor-plan requests'),
		async run(caller, a) {
			const status = typeof a.status === 'string' ? a.status : 'open';
			const statuses = status === 'open' ? ['requested', 'contacted', 'scheduled'] : [status];
			const rows = await dbAll(caller.db,
				`SELECT f.id, f.status, f.note, f.created_at, f.updated_at, o.name AS organisation, o.id AS organisation_id,
				        h.name AS hall, u.email AS requested_by
				   FROM floorplan_requests f
				   JOIN organizations o ON o.id = f.org_id JOIN halls h ON h.id = f.hall_id LEFT JOIN users u ON u.id = f.requested_by
				  WHERE f.status IN (${statuses.map(() => '?').join(',')})
				  ORDER BY f.created_at ${status === 'open' ? 'ASC' : 'DESC'} LIMIT ?`, ...statuses, clampLimit(a.limit, 100));
			return { ok: true, data: { status, count: rows.length, requests: rows } };
		}
	},
	{
		kind: 'platform',
		name: 'platform_audit_log',
		title: 'Platform audit log',
		description: 'Platform administrators only. The latest actions platform administrators took (plan changes, suspensions, settings…), newest first.',
		inputSchema: {
			type: 'object',
			properties: { action: { type: 'string', description: 'Only actions starting with this, e.g. "org." or "settings.update"' }, limit: limitArg(200) },
			additionalProperties: false
		},
		annotations: annotations('Platform audit log'),
		async run(caller, a) {
			const rows = await listAudit(caller.db, { action: typeof a.action === 'string' && a.action.trim() ? a.action.trim() : undefined, limit: clampLimit(a.limit, 200) });
			return { ok: true, data: { count: rows.length, entries: rows } };
		}
	}
];

const LIST_ORGANISATIONS: McpTool = {
	kind: 'account',
	name: 'list_organisations',
	title: 'Your organisations',
	description:
		'Who you are signed in as, what this connection may do, and the organisations you belong to: for each, its id (pass it as ' +
		'organization_id to the other tools), your role and permissions, its plan, and whether its data can be used over MCP.',
	inputSchema: { type: 'object', properties: {}, additionalProperties: false },
	annotations: annotations('Your organisations'),
	async run(caller) {
		const list = await memberships(caller);
		const organisations = [];
		for (const m of list) {
			const why = unavailableReason(m);
			organisations.push({
				id: m.id, name: m.name, slug: m.slug, role: m.role, plan: m.plan,
				available: !why,
				...(why ? { unavailable_because: why } : { permissions: [...(await orgPermissions(orgLocals(caller, m)))] })
			});
		}
		return {
			ok: true,
			data: {
				you: { name: `${caller.user.first_name} ${caller.user.last_name}`.trim(), email: caller.user.email, platform_admin: !!caller.user.is_platform_admin },
				connection: { client: caller.grant.clientName, may_make_changes: canWrite(caller.grant.scope) },
				organisations
			}
		};
	}
};

const ORG_READ_TOOLS = READ_TOOLS.map(readTool).filter((t): t is McpTool => !!t);

/** Every tool, for tests and documentation. */
export const ALL_TOOLS: McpTool[] = [LIST_ORGANISATIONS, ...ORG_READ_TOOLS, ...WRITE_TOOLS, ...PLATFORM_TOOLS];

/** The tools this caller may use: organisation tools when at least one of their
 *  organisations can be used over MCP, writes only with "allow changes", platform
 *  tools only for platform administrators. */
export async function toolsForCaller(caller: McpCaller, list?: Membership[]): Promise<McpTool[]> {
	const orgs = list ?? (await memberships(caller));
	// On the plan is enough to list them: a call to an organisation whose owner cut
	// this connection off then says so, instead of the tool silently vanishing.
	const anyOrg = orgs.some((m) => getPlan(m.plan).limits.mcp);
	return ALL_TOOLS.filter((t) => {
		if (t.kind === 'account') return true;
		if (t.kind === 'org-read') return anyOrg;
		if (t.kind === 'org-write') return anyOrg && canWrite(caller.grant.scope);
		return !!caller.user.is_platform_admin;
	});
}

export const describe = ({ name, title, description, inputSchema, annotations }: McpTool): McpToolDescriptor =>
	({ name, title, description, inputSchema, annotations });

/** Run a tool by name for this caller; null when they may not see it at all. */
export async function callTool(caller: McpCaller, name: string, args: Record<string, unknown>): Promise<ToolOutcome | null> {
	const tool = (await toolsForCaller(caller)).find((t) => t.name === name);
	if (!tool) return null;
	try {
		return await tool.run(caller, args);
	} catch (err) {
		console.error(`MCP tool ${name} failed:`, err);
		return { ok: false, error: 'The tool failed unexpectedly.' };
	}
}

export const SERVER_INSTRUCTIONS =
	'Hallify manages event venues (halls), their reservations and conversations with clients. ' +
	'Start with list_organisations: it tells you which organisations you can work in and their ids. ' +
	'Every organisation tool takes organization_id. You act as the signed-in member, with their permissions. ' +
	'Dates are YYYY-MM-DD. Changes are possible only when the member allowed them when connecting; each one is recorded as made via MCP.';
