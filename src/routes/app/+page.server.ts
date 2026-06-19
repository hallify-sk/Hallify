import { redirect } from '@sveltejs/kit';
import { dbAll, dbFirst } from '$lib/db/index';
import type { ReservationRow } from '$lib/db/index';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) redirect(303, '/app/login');
  if (locals.user.account_type === 'client') redirect(303, '/app/client');
  if (!locals.currentOrg) redirect(303, '/app/org/new');

  const orgId = locals.currentOrg.id;

  const reservations = await dbAll<ReservationRow>(
    locals.db,
    `SELECT r.*, h.name AS hall_name
    FROM reservations r
    JOIN halls h ON h.id = r.hall_id
    WHERE r.user_id = ?
      AND r.org_id = ?
    ORDER BY r.event_date DESC`,
    locals.user.id,
    orgId
  );

  const today = new Date().toISOString().split('T')[0];
  const stats = await dbFirst<{ total: number; upcoming: number; finished: number }>(
    locals.db,
    `SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN r.event_date >= ? AND r.status != 'cancelled' THEN 1 ELSE 0 END) AS upcoming,
      SUM(CASE WHEN r.event_date < ? THEN 1 ELSE 0 END) AS finished
    FROM reservations r
    WHERE r.user_id = ?
      AND r.org_id = ?`,
    today,
    today,
    locals.user.id,
    orgId
  );

  const hallCount = await dbFirst<{ count: number }>(
    locals.db,
    'SELECT COUNT(*) AS count FROM halls WHERE org_id = ?',
    orgId
  );

  const eventDates = reservations
    .filter(r => r.status !== 'cancelled')
    .map(r => {
      const d = new Date(r.event_date);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });

  return {
    reservations,
    stats: {
      total: Number(stats?.total ?? 0),
      upcoming: Number(stats?.upcoming ?? 0),
      finished: Number(stats?.finished ?? 0),
      halls: Number(hallCount?.count ?? 0),
    },
    eventDates,
  };
};
