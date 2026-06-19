import { dbFirst, dbAll } from '$lib/db/index';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const stats = await dbFirst<{
    total_orgs: string; total_users: string; active_subscriptions: string; total_reservations: string;
  }>(locals.db, `
    SELECT
      (SELECT COUNT(*) FROM organizations WHERE suspended_at IS NULL) AS total_orgs,
      (SELECT COUNT(*) FROM users) AS total_users,
      (SELECT COUNT(*) FROM subscriptions WHERE status IN ('active', 'trialing') AND plan != 'free') AS active_subscriptions,
      (SELECT COUNT(*) FROM reservations) AS total_reservations
  `);

  const recentOrgs = await dbAll<{
    id: string; name: string; slug: string; plan: string; status: string; created_at: string;
  }>(locals.db, `
    SELECT o.id, o.name, o.slug, s.plan, s.status, o.created_at
    FROM organizations o
    LEFT JOIN subscriptions s ON s.org_id = o.id
    ORDER BY o.created_at DESC
    LIMIT 10
  `);

  return { stats, recentOrgs };
};
