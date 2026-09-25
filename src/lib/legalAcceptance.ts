import { dbRun } from '$lib/db/index';
import { LEGAL_UPDATED } from '$lib/legal';
import type { D1Database } from '@cloudflare/workers-types';

/** Name of the "I agree to the Terms (incl. the DPA)" checkbox, shared by the signup
 *  form and the first-subscription dialog on the billing page. */
export const ACCEPT_TERMS_FIELD = 'acceptTerms';

/** True when the submitted form ticked the acceptance checkbox. The browser's
 *  `required` enforces it too; this is the server-side check. */
export function acceptedTerms(data: FormData): boolean {
  return data.get(ACCEPT_TERMS_FIELD) === 'on';
}

/** Record that a user accepted the current legal documents (migration 0004).
 *
 *  Best-effort, like the rate limiter: if the write fails — e.g. the migration hasn't
 *  been applied yet — it is logged and the signup or checkout goes ahead. The user
 *  did accept (the checkbox is enforced above); only the evidence row is missing. */
export async function recordLegalAcceptance(
  db: D1Database,
  opts: { userId: string; orgId?: string | null; context: 'register' | 'checkout' },
): Promise<void> {
  try {
    await dbRun(
      db,
      'INSERT INTO legal_acceptances (id, user_id, org_id, context, version) VALUES (?, ?, ?, ?, ?)',
      crypto.randomUUID(), opts.userId, opts.orgId ?? null, opts.context, LEGAL_UPDATED,
    );
  } catch (err) {
    console.error('[legal] acceptance not recorded', opts.context, opts.userId, err);
  }
}
