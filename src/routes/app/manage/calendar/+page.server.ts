import sql from '$lib/db/index';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
  const orgId = locals.currentOrg!.id;
  const now = new Date();
  const year  = Number(url.searchParams.get('year')  ?? now.getFullYear());
  const month = Number(url.searchParams.get('month') ?? now.getMonth() + 1);

  const firstDay = new Date(year, month - 1, 1);
  const lastDay  = new Date(year, month, 0);

  const events = await sql<Array<{
    id: string; title: string; event_date: Date; start_time: string; end_time: string;
    status: string; hall_name: string; hall_id: string;
  }>>`
    SELECT r.id, r.title, r.event_date, r.start_time, r.end_time, r.status,
           h.name AS hall_name, h.id AS hall_id
    FROM reservations r
    JOIN halls h ON h.id = r.hall_id
    WHERE r.org_id = ${orgId}
      AND r.event_date >= ${firstDay.toISOString().split('T')[0]}
      AND r.event_date <= ${lastDay.toISOString().split('T')[0]}
      AND r.status != 'cancelled'
    ORDER BY r.event_date, r.start_time
  `;

  const halls = await sql<Array<{ id: string; name: string; color: string }>>`
    SELECT id, name, color FROM halls WHERE org_id = ${orgId} ORDER BY name
  `;

  return { events, halls, year, month };
};
