import { dbFirst, fromJson } from '$lib/db/index';
import { PLANS, type PlanId } from '$lib/plans';
import { brandLogo, brandName, type SavedBranding } from './brand';
import type { D1Database } from '@cloudflare/workers-types';

/**
 * The venue's saved branding when its plan includes it and the subscription is
 * current (the rule the /halls layout applies), otherwise {}.
 */
export async function loadVenueBranding(db: D1Database, orgId: string): Promise<SavedBranding> {
	try {
		const [row, sub] = await Promise.all([
			dbFirst<{ value: string | null }>(db, `SELECT value FROM org_settings WHERE org_id = ? AND key = 'branding'`, orgId),
			dbFirst<{ plan: string | null; status: string | null }>(db, 'SELECT plan, status FROM subscriptions WHERE org_id = ?', orgId)
		]);
		const plan = (sub?.plan ?? 'free') as PlanId;
		const paid = (PLANS[plan]?.limits.customBranding ?? false) && (sub?.status === 'active' || sub?.status === 'trialing');
		return paid ? (fromJson<SavedBranding>(row?.value ?? null) ?? {}) : {};
	} catch {
		return {};
	}
}

/** The venue as its sign-in pages show it: branded name and logo. */
export async function venueIdentity<T extends { id: string; name: string; logoUrl: string | null }>(
	db: D1Database,
	org: T
): Promise<T> {
	const b = await loadVenueBranding(db, org.id);
	return { ...org, name: brandName(b, org.name), logoUrl: brandLogo(b, org.logoUrl) };
}
