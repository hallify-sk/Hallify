// Organization lifecycle: close an org by ARCHIVING a permanent record (for
// legal/accounting retention, kept indefinitely) and then removing all live
// operational data.
//
// Cloudflare D1 defaults PRAGMA foreign_keys OFF, so `ON DELETE CASCADE` does
// NOT fire automatically — we delete every descendant row by hand, child-first.
// Keep this in sync with the schema's org-scoped tables.
import { dbRun, dbFirst, dbAll } from '$lib/db/index';
import { listInvoices } from '$lib/stripe';
import { deleteCustomHostname, isCFEnabled } from '$lib/cloudflare-saas';
import type { D1Database } from '@cloudflare/workers-types';

export interface CloseOpts {
	closedBy?: string | null;        // user id who closed it
	closedByEmail?: string | null;   // their email (denormalized for the record)
	reason?: 'owner_closed' | 'auto_empty' | 'user_deleted';
}

/** Snapshot the org's key records into closed_organizations (kept forever),
 *  then permanently delete the org and all its operational data. */
export async function archiveAndDeleteOrg(db: D1Database, orgId: string, opts: CloseOpts = {}): Promise<void> {
	const org = await dbFirst<{ id: string; name: string; slug: string | null; created_at: string }>(
		db, 'SELECT id, name, slug, created_at FROM organizations WHERE id = ?', orgId);
	if (!org) return; // already gone

	const sub = await dbFirst<{ plan: string | null; status: string | null; stripe_customer_id: string | null; stripe_subscription_id: string | null; current_period_end: string | null }>(
		db, 'SELECT plan, status, stripe_customer_id, stripe_subscription_id, current_period_end FROM subscriptions WHERE org_id = ?', orgId);

	const members = await dbAll<{ email: string; first_name: string; last_name: string; role: string; joined_at: string }>(
		db, `SELECT u.email, u.first_name, u.last_name, m.role, m.joined_at
		     FROM organization_members m JOIN users u ON u.id = m.user_id
		     WHERE m.org_id = ? ORDER BY m.role, m.joined_at`, orgId);

	const reservations = await dbAll<{ title: string; event_date: string; status: string; num_guests: number | null; created_at: string; hall_name: string | null }>(
		db, `SELECT r.title, r.event_date, r.status, r.num_guests, r.created_at, h.name AS hall_name
		     FROM reservations r LEFT JOIN halls h ON h.id = r.hall_id
		     WHERE r.org_id = ? ORDER BY r.event_date DESC`, orgId);

	const halls = await dbAll<{ name: string; address: string | null; is_public: number; created_at: string }>(
		db, 'SELECT name, address, is_public, created_at FROM halls WHERE org_id = ? ORDER BY created_at', orgId);

	const customDomains = await dbAll<{ domain: string; verified_at: string | null; created_at: string }>(
		db, 'SELECT domain, verified_at, created_at FROM custom_domains WHERE org_id = ? ORDER BY created_at', orgId);

	// Billing invoices come from Stripe (kept for accounting). Best-effort — if
	// Stripe is unreachable or there's no customer, archive without them.
	const invoices = sub?.stripe_customer_id ? await listInvoices(sub.stripe_customer_id) : [];

	const snapshot = JSON.stringify({ subscription: sub ?? null, members, reservations, halls, customDomains, invoices });

	await dbRun(db,
		`INSERT INTO closed_organizations
			(id, org_id, name, slug, plan, status, stripe_customer_id, stripe_subscription_id,
			 member_count, reservation_count, org_created_at, closed_by, closed_by_email, closed_reason, snapshot)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		crypto.randomUUID(), org.id, org.name, org.slug,
		sub?.plan ?? null, sub?.status ?? null, sub?.stripe_customer_id ?? null, sub?.stripe_subscription_id ?? null,
		members.length, reservations.length, org.created_at,
		opts.closedBy ?? null, opts.closedByEmail ?? null, opts.reason ?? 'owner_closed', snapshot
	);

	await deleteOrgCascade(db, orgId);
}

/** Permanently delete one organization and everything scoped to it (no archive). */
export async function deleteOrgCascade(db: D1Database, orgId: string): Promise<void> {
	// ── Grandchildren (depend on halls / tickets / channels / webhooks / reservations) ──
	await dbRun(db, 'DELETE FROM webhook_deliveries WHERE webhook_id IN (SELECT id FROM org_webhooks WHERE org_id = ?)', orgId);
	await dbRun(db, 'DELETE FROM channel_messages WHERE channel_id IN (SELECT id FROM channels WHERE org_id = ?)', orgId);
	await dbRun(db, 'DELETE FROM messages WHERE ticket_id IN (SELECT id FROM tickets WHERE org_id = ?)', orgId);
	await dbRun(db, 'DELETE FROM rsvp_entries WHERE reservation_id IN (SELECT id FROM reservations WHERE org_id = ? OR hall_id IN (SELECT id FROM halls WHERE org_id = ?))', orgId, orgId);
	await dbRun(db, 'DELETE FROM table_types WHERE hall_id IN (SELECT id FROM halls WHERE org_id = ?)', orgId);
	await dbRun(db, 'DELETE FROM floorplan_templates WHERE hall_id IN (SELECT id FROM halls WHERE org_id = ?)', orgId);
	await dbRun(db, 'DELETE FROM hall_blocks WHERE hall_id IN (SELECT id FROM halls WHERE org_id = ?)', orgId);
	await dbRun(db, 'DELETE FROM reservation_holds WHERE org_id = ? OR hall_id IN (SELECT id FROM halls WHERE org_id = ?)', orgId, orgId);

	// ── Children ──
	await dbRun(db, 'DELETE FROM reservations WHERE org_id = ? OR hall_id IN (SELECT id FROM halls WHERE org_id = ?)', orgId, orgId);
	await dbRun(db, 'DELETE FROM tickets WHERE org_id = ?', orgId);

	// ── Bubble client accounts (account_type='client', users.org_id = this org)
	// belong ONLY to this org, so remove them and everything still tied to them:
	// their NULL-org_id tickets (created by postSystemMessage) + those tickets'
	// messages, plus sessions/resets. Org/admin members are NOT touched here —
	// they may belong to other orgs; their memberships are removed below.
	const clientsOfOrg = '(SELECT id FROM users WHERE org_id = ? AND account_type = ?)';
	await dbRun(db, `DELETE FROM messages WHERE ticket_id IN (SELECT id FROM tickets WHERE user_id IN ${clientsOfOrg})`, orgId, 'client');
	await dbRun(db, `DELETE FROM tickets WHERE user_id IN ${clientsOfOrg}`, orgId, 'client');
	await dbRun(db, `DELETE FROM sessions WHERE user_id IN ${clientsOfOrg}`, orgId, 'client');
	await dbRun(db, `DELETE FROM password_resets WHERE user_id IN ${clientsOfOrg}`, orgId, 'client');
	await dbRun(db, 'DELETE FROM users WHERE org_id = ? AND account_type = ?', orgId, 'client');

	await dbRun(db, 'DELETE FROM halls WHERE org_id = ?', orgId);
	await dbRun(db, 'DELETE FROM org_webhooks WHERE org_id = ?', orgId);
	await dbRun(db, 'DELETE FROM channels WHERE org_id = ?', orgId);
	await dbRun(db, 'DELETE FROM user_presence WHERE org_id = ?', orgId);
	await dbRun(db, 'DELETE FROM org_settings WHERE org_id = ?', orgId);
	await dbRun(db, 'DELETE FROM organization_invites WHERE org_id = ?', orgId);
	await dbRun(db, 'DELETE FROM organization_members WHERE org_id = ?', orgId);
	await dbRun(db, 'DELETE FROM subscriptions WHERE org_id = ?', orgId);
	await dbRun(db, 'DELETE FROM rsvp_templates WHERE org_id = ?', orgId);
	await dbRun(db, 'DELETE FROM announcement_targets WHERE org_id = ?', orgId);

	// Remove the org's custom hostnames from Cloudflare FIRST — deleting the DB
	// rows alone leaves the CF custom_hostname orphaned, which then blocks anyone
	// (including a re-add) with "Duplicate custom hostname found".
	if (isCFEnabled()) {
		const domains = await dbAll<{ cf_hostname_id: string | null }>(db,
			'SELECT cf_hostname_id FROM custom_domains WHERE org_id = ? AND cf_hostname_id IS NOT NULL', orgId);
		for (const d of domains) {
			if (d.cf_hostname_id) {
				try { await deleteCustomHostname(d.cf_hostname_id); } catch { /* best-effort — still drop the row */ }
			}
		}
	}
	await dbRun(db, 'DELETE FROM custom_domains WHERE org_id = ?', orgId);

	// Detach any sessions still pointed at this org so users don't load a dead org.
	await dbRun(db, 'UPDATE sessions SET current_org_id = NULL WHERE current_org_id = ?', orgId);

	// ── The org itself ──
	await dbRun(db, 'DELETE FROM organizations WHERE id = ?', orgId);
}

/** Count the members of an org. */
export async function orgMemberCount(db: D1Database, orgId: string): Promise<number> {
	const row = await dbFirst<{ count: number }>(db, 'SELECT COUNT(*) AS count FROM organization_members WHERE org_id = ?', orgId);
	return Number(row?.count ?? 0);
}

/** If an org has zero members, archive + destroy it (enforces "no org without a user"). */
export async function destroyOrgIfEmpty(db: D1Database, orgId: string, reason: CloseOpts['reason'] = 'auto_empty'): Promise<boolean> {
	if (await orgMemberCount(db, orgId) === 0) {
		await archiveAndDeleteOrg(db, orgId, { reason });
		return true;
	}
	return false;
}

/** Delete a user account and clean up: remove their memberships first (D1 doesn't
 *  cascade), then the user + their sessions/resets, then archive+destroy any org
 *  left with no members. Keeps the "no org without a user" invariant. */
export async function deleteUserAndCleanup(db: D1Database, userId: string): Promise<void> {
	const orgIds = (await dbAll<{ org_id: string }>(db, 'SELECT org_id FROM organization_members WHERE user_id = ?', userId)).map(r => r.org_id);
	await dbRun(db, 'DELETE FROM organization_members WHERE user_id = ?', userId);
	// The user's own tickets (and their messages) would otherwise be orphaned.
	await dbRun(db, 'DELETE FROM messages WHERE ticket_id IN (SELECT id FROM tickets WHERE user_id = ?)', userId);
	await dbRun(db, 'DELETE FROM tickets WHERE user_id = ?', userId);
	await dbRun(db, 'DELETE FROM sessions WHERE user_id = ?', userId);
	await dbRun(db, 'DELETE FROM password_resets WHERE user_id = ?', userId);
	await dbRun(db, 'DELETE FROM users WHERE id = ?', userId);
	for (const oid of orgIds) await destroyOrgIfEmpty(db, oid, 'user_deleted');
}
