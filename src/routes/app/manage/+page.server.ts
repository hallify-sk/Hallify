import { dbFirst, dbAll } from '$lib/db/index';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const orgId = locals.currentOrg!.id;

  // ─── Summary stats ───────────────────────────────────────────────────────
  const stats = await dbFirst<{
    total_halls: string;
    total_members: string;
    total_reservations: string;
    pending: string;
    open_tickets: string;
    upcoming_7d: string;
    completed: string;
  }>(locals.db, `
    SELECT
      (SELECT COUNT(*) FROM halls WHERE org_id = ?) AS total_halls,
      (SELECT COUNT(*) FROM organization_members WHERE org_id = ?) AS total_members,
      (SELECT COUNT(*) FROM reservations WHERE org_id = ?) AS total_reservations,
      (SELECT COUNT(*) FROM reservations WHERE org_id = ? AND status = 'pending') AS pending,
      (SELECT COUNT(*) FROM tickets WHERE org_id = ? AND status = 'open') AS open_tickets,
      (SELECT COUNT(*) FROM reservations WHERE org_id = ?
        AND event_date BETWEEN datetime('now') AND datetime('now', '+7 days')
        AND status NOT IN ('cancelled')) AS upcoming_7d,
      (SELECT COUNT(*) FROM reservations WHERE org_id = ? AND status = 'completed') AS completed
  `, orgId, orgId, orgId, orgId, orgId, orgId, orgId);

  // A bare aggregate SELECT always yields exactly one row, so this is unreachable —
  // but dbFirst is typed nullable, and a dashboard should render zeros rather than
  // make every consumer null-check.
  const safeStats = stats ?? {
    total_halls: '0', total_members: '0', total_reservations: '0',
    pending: '0', open_tickets: '0', upcoming_7d: '0', completed: '0',
  };

  // ─── Monthly reservations — last 6 months ────────────────────────────────
  // SQLite does not have generate_series; compute the 6 month buckets in JS
  const now = new Date();
  const monthBuckets: Array<{ month_label: string; month_iso: string }> = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleString('en-US', { month: 'short' });
    monthBuckets.push({ month_iso: iso, month_label: label });
  }

  const monthlyRaw = await dbAll<{ month_iso: string; count: number }>(locals.db, `
    SELECT strftime('%Y-%m', event_date) AS month_iso, COUNT(*) AS count
    FROM reservations
    WHERE org_id = ?
      AND status != 'cancelled'
      AND event_date >= date('now', '-5 months', 'start of month')
    GROUP BY month_iso
  `, orgId);

  const monthlyMap = new Map(monthlyRaw.map(r => [r.month_iso, r.count]));
  const monthly = monthBuckets.map(b => ({
    month_label: b.month_label,
    month_iso: b.month_iso,
    count: monthlyMap.get(b.month_iso) ?? 0,
  }));

  // ─── Reservations by status (for donut) ──────────────────────────────────
  const byStatus = await dbAll<{ status: string; count: number }>(locals.db, `
    SELECT status, COUNT(*) AS count
    FROM reservations
    WHERE org_id = ?
    GROUP BY status
    ORDER BY count DESC
  `, orgId);

  // ─── Halls with reservation counts ───────────────────────────────────────
  const halls = await dbAll<{
    id: string; name: string; color: string; max_people: number;
    reservation_count: number; upcoming_count: number;
  }>(locals.db, `
    SELECT h.id, h.name, h.color, h.max_people,
      COUNT(r.id) AS reservation_count,
      SUM(CASE WHEN r.event_date >= datetime('now') AND r.status != 'cancelled' THEN 1 ELSE 0 END) AS upcoming_count
    FROM halls h
    LEFT JOIN reservations r ON r.hall_id = h.id
    WHERE h.org_id = ?
    GROUP BY h.id
    ORDER BY reservation_count DESC
  `, orgId);

  // ─── Upcoming events (next 14 days) ──────────────────────────────────────
  const upcoming = await dbAll<{
    id: string; title: string; event_date: string; start_time: string | null;
    status: string; hall_name: string; hall_color: string;
    user_first_name: string; user_last_name: string;
  }>(locals.db, `
    SELECT r.id, r.title, r.event_date, r.start_time, r.status,
           h.name AS hall_name, h.color AS hall_color,
           u.first_name AS user_first_name, u.last_name AS user_last_name
    FROM reservations r
    JOIN halls h ON h.id = r.hall_id
    JOIN users u ON u.id = r.user_id
    WHERE r.org_id = ?
      AND r.event_date BETWEEN datetime('now') AND datetime('now', '+14 days')
      AND r.status != 'cancelled'
    ORDER BY r.event_date, r.start_time
    LIMIT 8
  `, orgId);

  // ─── Recent reservations ─────────────────────────────────────────────────
  const recent = await dbAll<{
    id: string; title: string; event_date: string; status: string;
    hall_name: string; hall_color: string;
    user_first_name: string; user_last_name: string;
    created_at: string;
  }>(locals.db, `
    SELECT r.id, r.title, r.event_date, r.status,
           h.name AS hall_name, h.color AS hall_color,
           u.first_name AS user_first_name, u.last_name AS user_last_name,
           r.created_at
    FROM reservations r
    JOIN halls h ON h.id = r.hall_id
    JOIN users u ON u.id = r.user_id
    WHERE r.org_id = ?
    ORDER BY r.created_at DESC
    LIMIT 7
  `, orgId);

  // ─── Online members ───────────────────────────────────────────────────────
  const presenceRow = await dbFirst<{ online_count: number }>(locals.db, `
    SELECT COUNT(*) AS online_count
    FROM user_presence
    WHERE org_id = ?
      AND last_seen_at > datetime('now', '-2 minutes')
  `, orgId);

  return {
    stats: safeStats,
    monthly,
    byStatus,
    halls,
    upcoming,
    recent,
    onlineCount: presenceRow?.online_count ?? 0,
  };
};
