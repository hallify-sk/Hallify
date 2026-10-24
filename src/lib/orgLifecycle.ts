// Organization lifecycle: close an org by ARCHIVING a permanent record (for
// legal/accounting retention, kept indefinitely) and then removing all live
// operational data.
//
// D1 enforces foreign keys (PRAGMA foreign_keys is ON), but several references
// have no ON DELETE action — reservations.hall_id among them — so a parent row
// cannot simply be deleted out from under them. We delete every descendant row by
// hand, child-first. Keep this in sync with the schema's org-scoped tables.
import { dbRun, dbFirst, dbAll } from '$lib/db/index';
import { listInvoices, cancelSubscription } from '$lib/stripe';
import { sendEmail } from '$lib/email';
import { closureEmail, groupByClient } from '$lib/org-closure-email';
import { deleteCustomHostname, isCFEnabled } from '$lib/cloudflare-saas';
import { deleteUnusedHallImages, orgUploadUrls, type R2Deleter } from '$lib/server/hall-images';
import { revokeMcpForClosingOrg } from '$lib/server/mcp/connections';
import { revokeUserGrants } from '$lib/server/mcp/oauth';
import type { D1Database } from '@cloudflare/workers-types';
import { dispatchPlatformEvent } from '$lib/server/platform-webhooks';

export interface CloseOpts {
	closedBy?: string | null;        // user id who closed it
	closedByEmail?: string | null;   // their email (denormalized for the record)
	reason?: 'owner_closed' | 'auto_empty' | 'user_deleted';
	/** Refuse to delete anything when the Stripe subscription cannot be cancelled.
	 *  The owner closing by hand can retry; automatic clean-ups go ahead and record
	 *  the failure in the archive instead. */
	strictBilling?: boolean;
	/** Storage, to delete the organisation's uploaded pictures with it (B152). Without
	 *  it they stay in storage and stay public. */
	r2?: R2Deleter | null;
}

export interface CloseResult {
	/** A live Stripe subscription was found and set to end (no further charges). */
	subscriptionCancelled: boolean;
	/** Clients told by email that their upcoming bookings are gone. */
	clientsNotified: number;
	/** Clients whose email could not be sent. */
	clientsNotNotified: number;
}

/** Thrown (with strictBilling) when Stripe would keep charging a closed organisation. */
export class BillingCancelError extends Error {
	constructor(cause: unknown) {
		super(cause instanceof Error ? cause.message : String(cause));
		this.name = 'BillingCancelError';
	}
}

/** Stripe statuses that still bill: anything that is not already over. */
function subscriptionStillBills(status: string | null | undefined): boolean {
	return status !== 'cancelled';
}

/** People with an upcoming, not cancelled booking at this org who are not its staff:
 *  closing deletes their booking and (for venue-site accounts) their account. */
export async function upcomingClientBookings(db: D1Database, orgId: string) {
	return dbAll<{ email: string | null; first_name: string | null; title: string; event_date: string; hall_name: string | null }>(db,
		`SELECT u.email, u.first_name, r.title, r.event_date, h.name AS hall_name
		 FROM reservations r
		 JOIN users u ON u.id = r.user_id
		 LEFT JOIN halls h ON h.id = r.hall_id
		 WHERE (r.org_id = ? OR r.hall_id IN (SELECT id FROM halls WHERE org_id = ?))
		   AND r.event_date >= date('now')
		   AND r.status NOT IN ('cancelled', 'completed')
		   AND u.id NOT IN (SELECT user_id FROM organization_members WHERE org_id = ?)
		 ORDER BY r.event_date`,
		orgId, orgId, orgId);
}

/** Snapshot the org's key records into closed_organizations (kept forever),
 *  then permanently delete the org and all its operational data.
 *
 *  Before anything is deleted: the Stripe subscription is cancelled (it used to keep
 *  charging a closed organisation), and every client with an upcoming booking is
 *  emailed, because their booking and venue-site account are about to disappear. */
export async function archiveAndDeleteOrg(db: D1Database, orgId: string, opts: CloseOpts = {}): Promise<CloseResult> {
	const result: CloseResult = { subscriptionCancelled: false, clientsNotified: 0, clientsNotNotified: 0 };
	const org = await dbFirst<{ id: string; name: string; slug: string | null; created_at: string }>(
		db, 'SELECT id, name, slug, created_at FROM organizations WHERE id = ?', orgId);
	if (!org) return result; // already gone

	const sub = await dbFirst<{ plan: string | null; status: string | null; stripe_customer_id: string | null; stripe_subscription_id: string | null; current_period_end: string | null }>(
		db, 'SELECT plan, status, stripe_customer_id, stripe_subscription_id, current_period_end FROM subscriptions WHERE org_id = ?', orgId);

	// ── Stop billing first. With strictBilling a failure aborts before any data is
	// touched, so the owner can simply try again.
	let billingError: string | null = null;
	if (sub?.stripe_subscription_id && subscriptionStillBills(sub.status)) {
		try {
			await cancelSubscription(sub.stripe_subscription_id);
			result.subscriptionCancelled = true;
		} catch (e) {
			if (opts.strictBilling) throw new BillingCancelError(e);
			billingError = e instanceof Error ? e.message : String(e);
			console.error('[orgLifecycle] could not cancel Stripe subscription', sub.stripe_subscription_id, e);
		}
	}

	// ── Tell clients with upcoming bookings, while their addresses still exist.
	const recipients = groupByClient(await upcomingClientBookings(db, orgId));
	for (const rec of recipients) {
		const { subject, html } = closureEmail(org.name, rec);
		let ok = false;
		try { ok = await sendEmail(db, rec.email, subject, html, 'orgClosed'); } catch { ok = false; }
		if (ok) result.clientsNotified++;
		else result.clientsNotNotified++;
	}

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

	const snapshot = JSON.stringify({
		subscription: sub ?? null, members, reservations, halls, customDomains, invoices,
		closure: {
			subscriptionCancelled: result.subscriptionCancelled,
			billingError,
			clientsNotified: result.clientsNotified,
			clientsNotNotified: result.clientsNotNotified,
		},
	});

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

	// Its pictures are public for as long as they are stored: collect them while the
	// rows that point at them exist, delete them once nothing does (B152).
	const uploads = await orgUploadUrls(db, orgId).catch(() => [] as string[]);
	// And the floor plans Hallify delivered to it (private, but theirs alone).
	const mappingFiles = (await dbAll<{ k: string }>(db,
		'SELECT delivery_file_key AS k FROM floorplan_requests WHERE org_id = ? AND delivery_file_key IS NOT NULL', orgId)
		.catch(() => [])).map((r) => r.k);
	await deleteOrgCascade(db, orgId);
	dispatchPlatformEvent(db, 'org.closed', {
		org_id: org.id, name: org.name, slug: org.slug, reason: opts.reason ?? 'owner_closed', plan: sub?.plan ?? null,
		member_count: members.length, reservation_count: reservations.length, subscription_cancelled: result.subscriptionCancelled,
	});
	await deleteUnusedHallImages(db, opts.r2, uploads);
	if (opts.r2 && mappingFiles.length) await Promise.resolve(opts.r2.delete(mappingFiles)).catch(() => {});
	return result;
}

/** Permanently delete one organization and everything scoped to it (no archive). */
export async function deleteOrgCascade(db: D1Database, orgId: string): Promise<void> {
	// Connected AI agents: revoked for members left with no organisation, and the
	// organisation's MCP records removed — while the memberships still say who is who.
	await revokeMcpForClosingOrg(db, orgId);

	// ── Grandchildren (depend on halls / tickets / channels / webhooks / reservations) ──
	await dbRun(db, 'DELETE FROM webhook_deliveries WHERE webhook_id IN (SELECT id FROM org_webhooks WHERE org_id = ?)', orgId);
	await dbRun(db, 'DELETE FROM channel_messages WHERE channel_id IN (SELECT id FROM channels WHERE org_id = ?)', orgId);
	await dbRun(db, 'DELETE FROM messages WHERE ticket_id IN (SELECT id FROM tickets WHERE org_id = ?)', orgId);
	await dbRun(db, 'DELETE FROM rsvp_entries WHERE reservation_id IN (SELECT id FROM reservations WHERE org_id = ? OR hall_id IN (SELECT id FROM halls WHERE org_id = ?))', orgId, orgId);
	await dbRun(db, 'DELETE FROM table_types WHERE hall_id IN (SELECT id FROM halls WHERE org_id = ?)', orgId);
	await dbRun(db, 'DELETE FROM floorplan_templates WHERE hall_id IN (SELECT id FROM halls WHERE org_id = ?)', orgId);
	await dbRun(db, 'DELETE FROM hall_blocks WHERE hall_id IN (SELECT id FROM halls WHERE org_id = ?)', orgId);
	await dbRun(db, 'DELETE FROM reservation_holds WHERE org_id = ? OR hall_id IN (SELECT id FROM halls WHERE org_id = ?)', orgId, orgId);
	// Client feedback and the client list's notes (migration 0031b; absent before it).
	await dbRun(db, 'DELETE FROM reservation_feedback WHERE org_id = ?', orgId).catch(() => {});
	await dbRun(db, 'DELETE FROM client_notes WHERE org_id = ?', orgId).catch(() => {});

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

export type LeaveRefusal = 'notMember' | 'lastMember' | 'onlyOwner';

/** Remove one person from an organisation, with what was granted to them there.
 *  Roles and per-member overrides used to stay behind and came back when the same
 *  person was later re-invited as a plain member. Returns why it was refused, or
 *  null when they have left. */
export async function leaveOrganization(db: D1Database, orgId: string, userId: string): Promise<LeaveRefusal | null> {
	const me = await dbFirst<{ role: string }>(db,
		'SELECT role FROM organization_members WHERE org_id = ? AND user_id = ?', orgId, userId);
	if (!me) return 'notMember';
	// The last member cannot leave: an organisation always has someone to pay the
	// bill and answer clients. They close it instead.
	if (await orgMemberCount(db, orgId) <= 1) return 'lastMember';
	if (me.role === 'owner') {
		const owners = await dbFirst<{ count: number }>(db,
			`SELECT COUNT(*) AS count FROM organization_members WHERE org_id = ? AND role = 'owner'`, orgId);
		if (Number(owners?.count ?? 0) <= 1) return 'onlyOwner';
	}
	await dbRun(db, 'DELETE FROM org_member_roles WHERE org_id = ? AND user_id = ?', orgId, userId);
	await dbRun(db, 'DELETE FROM org_member_overrides WHERE org_id = ? AND user_id = ?', orgId, userId);
	await dbRun(db, 'DELETE FROM organization_members WHERE org_id = ? AND user_id = ?', orgId, userId);
	await dbRun(db, 'UPDATE sessions SET current_org_id = NULL WHERE user_id = ? AND current_org_id = ?', userId, orgId);
	return null;
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
	await revokeUserGrants(db, userId, 'account_deleted');
	await dbRun(db, 'DELETE FROM organization_members WHERE user_id = ?', userId);
	// The user's own tickets (and their messages) would otherwise be orphaned.
	await dbRun(db, 'DELETE FROM messages WHERE ticket_id IN (SELECT id FROM tickets WHERE user_id = ?)', userId);
	await dbRun(db, 'DELETE FROM tickets WHERE user_id = ?', userId);
	await dbRun(db, 'DELETE FROM sessions WHERE user_id = ?', userId);
	await dbRun(db, 'DELETE FROM password_resets WHERE user_id = ?', userId);
	// reservations.user_id is NOT NULL with an FK to users, so deleting someone who
	// still owns bookings threw and surfaced to the admin as a 500. Clear the
	// reservations (and their dependents) first.
	await dbRun(db, 'DELETE FROM rsvp_entries WHERE reservation_id IN (SELECT id FROM reservations WHERE user_id = ?)', userId);
	await dbRun(db, 'DELETE FROM reservation_invites WHERE reservation_id IN (SELECT id FROM reservations WHERE user_id = ?)', userId);
	await dbRun(db, 'DELETE FROM reservation_holds WHERE user_id = ?', userId);
	// Their feedback and the venue's notes about them go with them (migration 0031b).
	await dbRun(db, 'DELETE FROM reservation_feedback WHERE user_id = ? OR reservation_id IN (SELECT id FROM reservations WHERE user_id = ?)', userId, userId).catch(() => {});
	await dbRun(db, 'DELETE FROM client_notes WHERE client_key = ?', `u:${userId}`).catch(() => {});
	await dbRun(db, 'DELETE FROM reservations WHERE user_id = ?', userId);
	await dbRun(db, 'DELETE FROM users WHERE id = ?', userId);
	dispatchPlatformEvent(db, 'user.deleted', { user_id: userId, orgs_closed: null, orgs_handed_over: null });
	for (const oid of orgIds) await destroyOrgIfEmpty(db, oid, 'user_deleted');
}
