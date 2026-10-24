import { dbAll, dbFirst, dbRun } from '$lib/db/index';
import { canWrite, revokeGrant, revokeUserGrants } from './oauth';

/**
 * Connected apps, as people manage them: a person sees and revokes their own; an
 * organisation's owner sees which members' connections can reach the organisation
 * and can cut one off from it (their other organisations keep working).
 *
 * A connection is live while it has an unexpired token. Every read tolerates a
 * database without migration 0038.
 */

type Db = App.Locals['db'];

const LIVE = `g.revoked_at IS NULL AND EXISTS (SELECT 1 FROM mcp_tokens t WHERE t.grant_id = g.id AND t.expires_at > datetime('now'))`;

/** Live connections across the platform (the platform settings page). */
export async function countLiveConnections(db: Db): Promise<number> {
	try {
		return Number((await dbFirst<{ n: number }>(db, `SELECT COUNT(*) AS n FROM mcp_grants g WHERE ${LIVE}`))?.n ?? 0);
	} catch {
		return 0;
	}
}

export interface UserConnection {
	id: string;
	client_name: string;
	redirect_host: string | null;
	writes: boolean;
	created_at: string;
	last_used_at: string | null;
}

function firstHost(redirectUris: string): string | null {
	try {
		const [first] = JSON.parse(redirectUris) as string[];
		return first ? new URL(first).host : null;
	} catch {
		return null;
	}
}

export async function listUserConnections(db: Db, userId: string): Promise<UserConnection[]> {
	try {
		const rows = await dbAll<{ id: string; client_name: string; redirect_uris: string; scope: string; created_at: string; last_used_at: string | null }>(db,
			`SELECT g.id, c.name AS client_name, c.redirect_uris, g.scope, g.created_at, g.last_used_at
			   FROM mcp_grants g JOIN mcp_clients c ON c.id = g.client_id
			  WHERE g.user_id = ? AND ${LIVE}
			  ORDER BY COALESCE(g.last_used_at, g.created_at) DESC`, userId);
		return rows.map((r) => ({
			id: r.id, client_name: r.client_name, redirect_host: firstHost(r.redirect_uris), writes: canWrite(r.scope),
			created_at: r.created_at, last_used_at: r.last_used_at
		}));
	} catch {
		return [];
	}
}

/** Revoke one of the person's own connections. False when it is not theirs. */
export async function revokeUserConnection(db: Db, userId: string, grantId: string): Promise<boolean> {
	const row = await dbFirst<{ id: string }>(db, 'SELECT id FROM mcp_grants WHERE id = ? AND user_id = ?', grantId, userId);
	if (!row) return false;
	await revokeGrant(db, row.id, 'user_revoked');
	return true;
}

export interface OrgConnection extends UserConnection {
	member_name: string;
	member_email: string;
	cut_off: boolean;
}

/** Live connections of the organisation's current members. */
export async function listOrgConnections(db: Db, orgId: string): Promise<OrgConnection[]> {
	try {
		const rows = await dbAll<{
			id: string; client_name: string; redirect_uris: string; scope: string; created_at: string; last_used_at: string | null;
			member_name: string; member_email: string; cut_off: number;
		}>(db,
			`SELECT g.id, c.name AS client_name, c.redirect_uris, g.scope, g.created_at, g.last_used_at,
			        TRIM(u.first_name || ' ' || u.last_name) AS member_name, u.email AS member_email,
			        EXISTS (SELECT 1 FROM mcp_org_revocations r WHERE r.grant_id = g.id AND r.org_id = m.org_id) AS cut_off
			   FROM organization_members m
			   JOIN mcp_grants g ON g.user_id = m.user_id
			   JOIN mcp_clients c ON c.id = g.client_id
			   JOIN users u ON u.id = m.user_id
			  WHERE m.org_id = ? AND ${LIVE}
			  ORDER BY member_name, g.created_at`, orgId);
		return rows.map((r) => ({
			id: r.id, client_name: r.client_name, redirect_host: firstHost(r.redirect_uris), writes: canWrite(r.scope),
			created_at: r.created_at, last_used_at: r.last_used_at, member_name: r.member_name, member_email: r.member_email,
			cut_off: !!r.cut_off
		}));
	} catch {
		return [];
	}
}

/** Cut a member's connection off from this organisation. False when the connection
 *  does not belong to a member of it. */
export async function revokeOrgConnection(db: Db, orgId: string, grantId: string, byUserId: string): Promise<boolean> {
	const row = await dbFirst<{ id: string }>(db,
		`SELECT g.id FROM mcp_grants g JOIN organization_members m ON m.user_id = g.user_id AND m.org_id = ? WHERE g.id = ?`,
		orgId, grantId);
	if (!row) return false;
	await dbRun(db, 'INSERT OR IGNORE INTO mcp_org_revocations (grant_id, org_id, revoked_by) VALUES (?, ?, ?)', row.id, orgId, byUserId);
	return true;
}

export interface McpActivityRow {
	id: string;
	actor_name: string | null;
	client_name: string;
	tool: string;
	summary: string | null;
	created_at: string;
}

export async function listOrgMcpActivity(db: Db, orgId: string, limit = 20): Promise<McpActivityRow[]> {
	try {
		return await dbAll<McpActivityRow>(db,
			`SELECT id, actor_name, client_name, tool, summary, created_at FROM mcp_activity
			  WHERE org_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?`, orgId, limit);
	} catch {
		return [];
	}
}

/**
 * An organisation is closing. Members keep their connections for their other
 * organisations (access is checked against live membership on every call, so this
 * one drops out by itself); a member for whom it was the ONLY organisation, and who
 * is not a platform administrator, has nothing left to connect to, so their
 * connections are revoked. Call before the memberships are deleted.
 */
export async function revokeMcpForClosingOrg(db: Db, orgId: string): Promise<void> {
	try {
		const alone = await dbAll<{ user_id: string }>(db,
			`SELECT m.user_id FROM organization_members m JOIN users u ON u.id = m.user_id
			  WHERE m.org_id = ? AND u.is_platform_admin = 0
			    AND NOT EXISTS (SELECT 1 FROM organization_members o WHERE o.user_id = m.user_id AND o.org_id != m.org_id)`, orgId);
		for (const r of alone) await revokeUserGrants(db, r.user_id, 'org_closed');
		await dbRun(db, 'DELETE FROM mcp_org_revocations WHERE org_id = ?', orgId);
		await dbRun(db, 'DELETE FROM mcp_activity WHERE org_id = ?', orgId);
	} catch {
		/* before migration 0038 */
	}
}
