// Recorded acceptance of the Terms (and acknowledgement of the Privacy Policy) when a
// client creates an account on a venue's site. The legal_acceptances table exists in
// production, but no code wrote to it, so there was no evidence anyone had agreed.
// migrations/0019_legal_acceptances.sql creates it where it is missing.

import { dbRun } from '$lib/db/index';
import { LEGAL_UPDATED } from '$lib/legal';
import type { D1Database } from '@cloudflare/workers-types';

/** Name of the "I agree" checkbox on the registration form. */
export const ACCEPT_TERMS_FIELD = 'acceptTerms';

/** Server-side check of the checkbox; the browser's `required` is only a convenience. */
export function acceptedTerms(data: FormData): boolean {
	return data.get(ACCEPT_TERMS_FIELD) === 'on';
}

/**
 * One row per acceptance, with the version (LEGAL_UPDATED) the person saw.
 * Best-effort: a failed write is logged and the sign-up goes ahead, because the
 * person did accept; only the evidence row is missing.
 */
export async function recordLegalAcceptance(
	db: D1Database,
	opts: { userId: string; orgId?: string | null; context: 'register' | 'checkout' }
): Promise<void> {
	try {
		await dbRun(
			db,
			'INSERT INTO legal_acceptances (id, user_id, org_id, context, version) VALUES (?, ?, ?, ?, ?)',
			crypto.randomUUID(), opts.userId, opts.orgId ?? null, opts.context, LEGAL_UPDATED
		);
	} catch (err) {
		console.error('[legal] acceptance not recorded', opts.context, opts.userId, err);
	}
}
