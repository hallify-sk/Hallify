import type { RequestHandler } from './$types';
import sql from '$lib/db';

/** POST — upsert the current user's presence for their active org. */
export const POST: RequestHandler = async ({ locals }) => {
  const user = locals.user;
  const org = locals.currentOrg;
  if (!user || !org) return new Response(null, { status: 401 });

  await sql`
    INSERT INTO user_presence (user_id, org_id, last_seen_at)
    VALUES (${user.id}, ${org.id}, NOW())
    ON CONFLICT (user_id, org_id) DO UPDATE SET last_seen_at = NOW()
  `;

  return new Response(null, { status: 204 });
};

/** GET — return IDs of members online in the current org (seen within 2 min). */
export const GET: RequestHandler = async ({ locals }) => {
  const user = locals.user;
  const org = locals.currentOrg;
  if (!user || !org) return new Response(null, { status: 401 });

  const rows = await sql<{ user_id: string }[]>`
    SELECT user_id FROM user_presence
    WHERE org_id = ${org.id}
      AND last_seen_at > NOW() - INTERVAL '2 minutes'
  `;

  return Response.json({ online: rows.map(r => r.user_id) });
};
