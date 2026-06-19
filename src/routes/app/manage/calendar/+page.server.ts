import { dbAll, fromJsonArr } from '$lib/db/index';
import type { PageServerLoad } from './$types';

type View = 'month' | 'week' | 'day' | 'agenda';

function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseAnchor(s: string | null): Date {
  if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

// Monday-start week index (Mon=0 … Sun=6)
function mondayIndex(jsDay: number): number {
  return jsDay === 0 ? 6 : jsDay - 1;
}

export const load: PageServerLoad = async ({ locals, url }) => {
  const orgId = locals.currentOrg!.id;

  const allowed: View[] = ['month', 'week', 'day', 'agenda'];
  const viewParam = url.searchParams.get('view') as View | null;
  const view: View = allowed.includes(viewParam as View) ? (viewParam as View) : 'month';
  const anchor = parseAnchor(url.searchParams.get('date'));

  // Visible range the current view needs events for.
  let rangeStart: Date;
  let rangeEnd: Date;
  if (view === 'month') {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    rangeStart = new Date(first);
    rangeStart.setDate(first.getDate() - mondayIndex(first.getDay()));
    rangeEnd = new Date(last);
    rangeEnd.setDate(last.getDate() + (6 - mondayIndex(last.getDay())));
  } else if (view === 'week') {
    rangeStart = new Date(anchor);
    rangeStart.setDate(anchor.getDate() - mondayIndex(anchor.getDay()));
    rangeEnd = new Date(rangeStart);
    rangeEnd.setDate(rangeStart.getDate() + 6);
  } else if (view === 'day') {
    rangeStart = new Date(anchor);
    rangeEnd = new Date(anchor);
  } else {
    // agenda: anchor day → next 90 days
    rangeStart = new Date(anchor);
    rangeEnd = new Date(anchor);
    rangeEnd.setDate(anchor.getDate() + 90);
  }

  const events = await dbAll<{
    id: string; title: string; event_date: string;
    start_time: string | null; end_time: string | null; status: string;
    hall_name: string; hall_id: string;
    booker_first: string | null; booker_last: string | null;
  }>(locals.db,
    `SELECT r.id, r.title, r.event_date, r.start_time, r.end_time, r.status,
            h.name AS hall_name, h.id AS hall_id,
            u.first_name AS booker_first, u.last_name AS booker_last
     FROM reservations r
     JOIN halls h ON h.id = r.hall_id
     LEFT JOIN users u ON u.id = r.user_id
     WHERE r.org_id = ?
       AND substr(r.event_date, 1, 10) >= ?
       AND substr(r.event_date, 1, 10) <= ?
       AND r.status != 'cancelled'
     ORDER BY r.event_date, r.start_time`,
    orgId, isoLocal(rangeStart), isoLocal(rangeEnd)
  );

  const halls = await dbAll<{ id: string; name: string; color: string; opening_hours: string | null }>(locals.db,
    `SELECT id, name, color, opening_hours FROM halls WHERE org_id = ? ORDER BY name`,
    orgId
  );

  // Raw blocking rules for the org's halls — expanded client-side over the visible range.
  const blocksRaw = await dbAll<{
    hall_id: string; block_type: string; date_from: string | null;
    date_to: string | null; days_of_week: unknown; reason: string | null;
  }>(locals.db,
    `SELECT hall_id, block_type, date_from, date_to, days_of_week, reason
     FROM hall_blocks
     WHERE hall_id IN (SELECT id FROM halls WHERE org_id = ?)`,
    orgId
  );
  const blocks = blocksRaw.map(b => ({
    ...b,
    days_of_week: (fromJsonArr(b.days_of_week as string | null) as number[]),
  }));

  // Summary for the anchor's month (independent of the active view).
  const monthFirst = isoLocal(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  const monthLast = isoLocal(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0));
  const statusCounts = await dbAll<{ status: string; n: number }>(locals.db,
    `SELECT status, COUNT(*) AS n FROM reservations
     WHERE org_id = ? AND substr(event_date, 1, 10) >= ? AND substr(event_date, 1, 10) <= ?
     GROUP BY status`,
    orgId, monthFirst, monthLast
  );
  const busiest = await dbAll<{ hall_name: string; n: number }>(locals.db,
    `SELECT h.name AS hall_name, COUNT(*) AS n
     FROM reservations r JOIN halls h ON h.id = r.hall_id
     WHERE r.org_id = ? AND substr(r.event_date, 1, 10) >= ? AND substr(r.event_date, 1, 10) <= ?
       AND r.status != 'cancelled'
     GROUP BY r.hall_id ORDER BY n DESC LIMIT 1`,
    orgId, monthFirst, monthLast
  );

  return {
    view,
    anchor: isoLocal(anchor),
    rangeStart: isoLocal(rangeStart),
    rangeEnd: isoLocal(rangeEnd),
    events,
    halls,
    blocks,
    summary: { statusCounts, busiest: busiest[0] ?? null },
  };
};
