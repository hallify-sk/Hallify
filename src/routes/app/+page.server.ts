import { redirect } from '@sveltejs/kit';
import sql from '$lib/db/index';
import type { ReservationRow } from '$lib/db/index';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) redirect(303, '/app/login');
  if (locals.user.account_type === 'client') redirect(303, '/app/client');
  if (!locals.currentOrg) redirect(303, '/app/org/new');

  const orgId = locals.currentOrg.id;

  const reservations = await sql<ReservationRow[]>`
    SELECT r.*, h.name AS hall_name
    FROM reservations r
    JOIN halls h ON h.id = r.hall_id
    WHERE r.user_id = ${locals.user.id}
      AND r.org_id = ${orgId}
    ORDER BY r.event_date DESC
  `;

  const today = new Date().toISOString().split('T')[0];
  const [stats] = await sql<[{ total: string; upcoming: string; finished: string }]>`
    SELECT
      COUNT(*)::text AS total,
      COUNT(*) FILTER (WHERE r.event_date >= ${today}::date AND r.status != 'cancelled')::text AS upcoming,
      COUNT(*) FILTER (WHERE r.event_date < ${today}::date)::text AS finished
    FROM reservations r
    WHERE r.user_id = ${locals.user.id}
      AND r.org_id = ${orgId}
  `;

  const [hallCount] = await sql<[{ count: string }]>`
    SELECT COUNT(*)::text AS count FROM halls WHERE org_id = ${orgId}
  `;

  const eventDates = reservations
    .filter(r => r.status !== 'cancelled')
    .map(r => {
      const d = new Date(r.event_date);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });

  return {
    reservations,
    stats: {
      total: Number(stats.total),
      upcoming: Number(stats.upcoming),
      finished: Number(stats.finished),
      halls: Number(hallCount.count),
    },
    eventDates,
  };
};
