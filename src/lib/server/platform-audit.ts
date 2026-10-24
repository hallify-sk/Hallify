// Platform audit log: who among the platform admins did what, to whom, and when.
// Admin grants, plan overrides, suspensions and View-as sessions used to leave no
// trace at all. Writing is best-effort: a logging failure must never undo or block
// the action it describes.
import { dbAll, dbRun } from '$lib/db/index';
import type { D1Database } from '@cloudflare/workers-types';

export type AuditAction =
	| 'org.plan'
	| 'org.slug'
	| 'org.suspend'
	| 'org.unsuspend'
	| 'org.partner'
	| 'org.view_as'
	| 'org.ai_credits'
	| 'user.admin_grant'
	| 'user.admin_revoke'
	| 'user.email_verified'
	| 'announcement.create'
	| 'announcement.update'
	| 'announcement.delete'
	| 'settings.update'
	| 'email.templates'
	| 'webhook.create'
	| 'webhook.update'
	| 'webhook.enable'
	| 'webhook.disable'
	| 'webhook.roll_secret'
	| 'webhook.delete'
	| 'listing.create'
	| 'listing.update'
	| 'listing.delete';

export interface AuditTarget {
	type: 'org' | 'user' | 'announcement' | 'settings' | 'email' | 'webhook';
	id?: string | null;
	label?: string | null;
}

export async function logPlatformAction(
	locals: Pick<App.Locals, 'db' | 'user'>,
	action: AuditAction,
	target: AuditTarget,
	details?: Record<string, unknown>
): Promise<void> {
	try {
		await dbRun(locals.db,
			`INSERT INTO platform_audit_log (id, actor_id, actor_email, action, target_type, target_id, target_label, details)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			crypto.randomUUID(), locals.user?.id ?? null, locals.user?.email ?? null, action,
			target.type, target.id ?? null, target.label ?? null, details ? JSON.stringify(details) : null);
	} catch (e) {
		console.error('[audit] could not record', action, e);
	}
}

export interface AuditRow {
	id: string;
	actor_email: string | null;
	action: string;
	target_type: string | null;
	target_id: string | null;
	target_label: string | null;
	details: string | null;
	created_at: string;
}

/** Latest entries, optionally narrowed to one target (an org's page shows its own). */
export async function listAudit(db: D1Database, opts: { targetType?: string; targetId?: string; action?: string; limit?: number } = {}): Promise<AuditRow[]> {
	const where: string[] = [];
	const params: unknown[] = [];
	if (opts.targetType) { where.push('target_type = ?'); params.push(opts.targetType); }
	if (opts.targetId) { where.push('target_id = ?'); params.push(opts.targetId); }
	if (opts.action) { where.push('action LIKE ?'); params.push(`${opts.action}%`); }
	try {
		return await dbAll<AuditRow>(db,
			`SELECT id, actor_email, action, target_type, target_id, target_label, details, created_at
			 FROM platform_audit_log ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
			 ORDER BY created_at DESC LIMIT ?`,
			...params, Math.min(Math.max(opts.limit ?? 100, 1), 500));
	} catch {
		return []; // table not migrated yet
	}
}
