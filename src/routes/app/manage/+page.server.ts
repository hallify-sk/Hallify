import sql from '$lib/db/index';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const orgId = locals.currentOrg!.id;

  // ─── Summary stats ───────────────────────────────────────────────────────
  const [stats] = await sql<[{
    total_halls: string;
    total_members: string;
    total_reservations: string;
    pending: string;
    open_tickets: string;
    upcoming_7d: string;
    completed: string;
  }]>`
    SELECT
      (SELECT COUNT(*)::text FROM halls WHERE org_id = ${orgId}) AS total_halls,
      (SELECT COUNT(*)::text FROM organization_members WHERE org_id = ${orgId}) AS total_members,
      (SELECT COUNT(*)::text FROM reservations WHERE org_id = ${orgId}) AS total_reservations,
      (SELECT COUNT(*)::text FROM reservations WHERE org_id = ${orgId} AND status = 'pending') AS pending,
      (SELECT COUNT(*)::text FROM tickets WHERE org_id = ${orgId} AND status = 'open') AS open_tickets,
      (SELECT COUNT(*)::text FROM reservations WHERE org_id = ${orgId}
        AND event_date BETWEEN NOW() AND NOW() + INTERVAL '7 days'
        AND status NOT IN ('cancelled')) AS upcoming_7d,
      (SELECT COUNT(*)::text FROM reservations WHERE org_id = ${orgId} AND status = 'completed') AS completed
  `;

  // ─── Monthly reservations — always 6 rows ────────────────────────────────
  const monthly = await sql<Array<{ month_label: string; month_iso: string; count: number }>>`
    WITH months AS (
      SELECT generate_series(
        date_trunc('month', NOW() - INTERVAL '5 months'),
        date_trunc('month', NOW()),
        '1 month'::interval
      ) AS m
    )
    SELECT
      TO_CHAR(months.m, 'Mon') AS month_label,
      TO_CHAR(months.m, 'YYYY-MM') AS month_iso,
      COUNT(r.id)::int AS count
    FROM months
    LEFT JOIN reservations r
      ON date_trunc('month', r.event_date) = months.m
     AND r.org_id = ${orgId}
     AND r.status != 'cancelled'
    GROUP BY months.m
    ORDER BY months.m
  `;

  // ─── Reservations by status (for donut) ──────────────────────────────────
  const byStatus = await sql<Array<{ status: string; count: number }>>`
    SELECT status, COUNT(*)::int AS count
    FROM reservations
    WHERE org_id = ${orgId}
    GROUP BY status
    ORDER BY count DESC
  `;

  // ─── Halls with reservation counts ───────────────────────────────────────
  const halls = await sql<Array<{
    id: string; name: string; color: string; max_people: number;
    reservation_count: number; upcoming_count: number;
  }>>`
    SELECT h.id, h.name, h.color, h.max_people,
      COUNT(r.id)::int AS reservation_count,
      COUNT(r.id) FILTER (WHERE r.event_date >= NOW() AND r.status != 'cancelled')::int AS upcoming_count
    FROM halls h
    LEFT JOIN reservations r ON r.hall_id = h.id
    WHERE h.org_id = ${orgId}
    GROUP BY h.id
    ORDER BY reservation_count DESC
  `;

  // ─── Upcoming events (next 14 days) ──────────────────────────────────────
  const upcoming = await sql<Array<{
    id: string; title: string; event_date: Date; start_time: string | null;
    status: string; hall_name: string; hall_color: string;
    user_first_name: string; user_last_name: string;
  }>>`
    SELECT r.id, r.title, r.event_date, r.start_time, r.status,
           h.name AS hall_name, h.color AS hall_color,
           u.first_name AS user_first_name, u.last_name AS user_last_name
    FROM reservations r
    JOIN halls h ON h.id = r.hall_id
    JOIN users u ON u.id = r.user_id
    WHERE r.org_id = ${orgId}
      AND r.event_date BETWEEN NOW() AND NOW() + INTERVAL '14 days'
      AND r.status != 'cancelled'
    ORDER BY r.event_date, r.start_time
    LIMIT 8
  `;

  // ─── Recent reservations ─────────────────────────────────────────────────
  const recent = await sql<Array<{
    id: string; title: string; event_date: Date; status: string;
    hall_name: string; hall_color: string;
    user_first_name: string; user_last_name: string;
    created_at: Date;
  }>>`
    SELECT r.id, r.title, r.event_date, r.status,
           h.name AS hall_name, h.color AS hall_color,
           u.first_name AS user_first_name, u.last_name AS user_last_name,
           r.created_at
    FROM reservations r
    JOIN halls h ON h.id = r.hall_id
    JOIN users u ON u.id = r.user_id
    WHERE r.org_id = ${orgId}
    ORDER BY r.created_at DESC
    LIMIT 7
  `;

  // ─── Online members ───────────────────────────────────────────────────────
  const [presenceRow] = await sql<[{ online_count: number }]>`
    SELECT COUNT(*)::int AS online_count
    FROM user_presence
    WHERE org_id = ${orgId}
      AND last_seen_at > NOW() - INTERVAL '2 minutes'
  `;

  return {
    stats,
    monthly,
    byStatus,
    halls,
    upcoming,
    recent,
    onlineCount: presenceRow?.online_count ?? 0,
  };
};
