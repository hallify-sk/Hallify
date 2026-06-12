import sql from '$lib/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const [stats] = await sql<[{
    total_orgs: string; total_users: string; active_subscriptions: string; total_reservations: string;
  }]>`
    SELECT
      (SELECT COUNT(*)::text FROM organizations WHERE suspended_at IS NULL) AS total_orgs,
      (SELECT COUNT(*)::text FROM users) AS total_users,
      (SELECT COUNT(*)::text FROM subscriptions WHERE status IN ('active', 'trialing') AND plan != 'free') AS active_subscriptions,
      (SELECT COUNT(*)::text FROM reservations) AS total_reservations
  `;

  const recentOrgs = await sql<{
    id: string; name: string; slug: string; plan: string; status: string; created_at: Date;
  }[]>`
    SELECT o.id, o.name, o.slug, s.plan, s.status, o.created_at
    FROM organizations o
    LEFT JOIN subscriptions s ON s.org_id = o.id
    ORDER BY o.created_at DESC
    LIMIT 10
  `;

  return { stats, recentOrgs };
};
