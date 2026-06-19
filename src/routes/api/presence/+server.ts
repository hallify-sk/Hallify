import type { RequestHandler } from './$types';
import { dbAll, dbRun } from '$lib/db/index';

/** POST — upsert the current user's presence for their active org. */
export const POST: RequestHandler = async ({ locals }) => {
  const user = locals.user;
  const org = locals.currentOrg;
  if (!user || !org) return new Response(null, { status: 401 });

  await dbRun(
    locals.db,
    'INSERT OR REPLACE INTO user_presence (user_id, org_id, last_seen_at) VALUES (?, ?, datetime(\'now\'))',
    user.id,
    org.id
  );

  return new Response(null, { status: 204 });
};

/** GET — return IDs of members online in the current org (seen within 2 min). */
export const GET: RequestHandler = async ({ locals }) => {
  const user = locals.user;
  const org = locals.currentOrg;
  if (!user || !org) return new Response(null, { status: 401 });

  const rows = await dbAll<{ user_id: string }>(
    locals.db,
    "SELECT user_id FROM user_presence WHERE org_id = ? AND last_seen_at > datetime('now', '-2 minutes')",
    org.id
  );

  return Response.json({ online: rows.map(r => r.user_id) });
};
