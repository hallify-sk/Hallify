// Recorded acceptance of the Terms (and acknowledgement of the Privacy Policy) when an
// account is created, on the apex or on a venue's site, and of the Data Processing
// Agreement when an account creates an organisation. The legal_acceptances table exists in
// production, but no code wrote to it, so there was no evidence anyone had agreed.
// migrations/0019_legal_acceptances.sql creates it where it is missing.

import { dbRun } from '$lib/db/index';
import { LEGAL_UPDATED } from '$lib/legal';
import type { D1Database } from '@cloudflare/workers-types';

/** Name of the "I agree" checkbox on the registration form. */
export const ACCEPT_TERMS_FIELD = 'acceptTerms';

/** Name of the Data Processing Agreement checkbox on the create-organisation form. */
export const ACCEPT_DPA_FIELD = 'acceptDpa';

/** Server-side check of the checkbox; the browser's `required` is only a convenience. */
export function acceptedTerms(data: FormData): boolean {
	return data.get(ACCEPT_TERMS_FIELD) === 'on';
}

/** Server-side check of the DPA checkbox on /app/org/new. */
export function acceptedDpa(data: FormData): boolean {
	return data.get(ACCEPT_DPA_FIELD) === 'on';
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

/**
 * The Data Processing Agreement, accepted on an organisation's behalf when it is
 * created: from then on the organisation is the controller of the data it puts in
 * and Hallify its processor. Its own table (migrations/0035_dpa_acceptances.sql),
 * because legal_acceptances.context cannot take a new value without a rebuild.
 * Best-effort for the same reason as recordLegalAcceptance.
 */
export async function recordDpaAcceptance(
	db: D1Database,
	opts: { userId: string; orgId: string }
): Promise<void> {
	try {
		await dbRun(
			db,
			'INSERT INTO dpa_acceptances (id, org_id, user_id, version) VALUES (?, ?, ?, ?)',
			crypto.randomUUID(), opts.orgId, opts.userId, LEGAL_UPDATED
		);
	} catch (err) {
		console.error('[legal] DPA acceptance not recorded', opts.orgId, opts.userId, err);
	}
}
