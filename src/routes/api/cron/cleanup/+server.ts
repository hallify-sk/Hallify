import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { runCleanup } from '$lib/cleanup';
import { sendEventReminders } from '$lib/server/reminders';
import { sendFeedbackInvites } from '$lib/server/feedback';
import type { RequestHandler } from './$types';

/** Explicit housekeeping run, for an external scheduler.
 *
 *  Cleanup also happens opportunistically off request traffic (see hooks.server.ts),
 *  so this is a belt-and-braces path — useful for a quiet deployment, or to force a
 *  sweep after a data incident.
 *
 *  Requires `CRON_SECRET` (a Worker secret). If it isn't configured the route is
 *  disabled rather than open: an unauthenticated DELETE endpoint is not something to
 *  leave running by default.
 *
 *      curl -X POST https://hallify.sk/api/cron/cleanup -H "authorization: Bearer $CRON_SECRET"
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  const secret = env.CRON_SECRET;
  if (!secret) error(404, 'Not found');

  const auth = request.headers.get('authorization') ?? '';
  const provided = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  // Length check first so the comparison below can't be used as a length oracle.
  if (provided.length !== secret.length) error(401, 'Unauthorized');
  let diff = 0;
  for (let i = 0; i < secret.length; i++) diff |= provided.charCodeAt(i) ^ secret.charCodeAt(i);
  if (diff !== 0) error(401, 'Unauthorized');

  const results = await runCleanup(locals.db);
  const reminders = await sendEventReminders(locals.db);
  const feedbackInvites = await sendFeedbackInvites(locals.db);
  return json({ ok: true, results, reminders, feedbackInvites }, { headers: { 'cache-control': 'no-store' } });
};
