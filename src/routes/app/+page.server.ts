import { redirect } from '@sveltejs/kit';
import { dbAll, dbFirst } from '$lib/db/index';
import type { ReservationRow } from '$lib/db/index';
import { hasConsoleAccess } from '$lib/server/access';
import type { PageServerLoad } from './$types';

/** What /app shows for an organisation member, empty for everyone else. */
const NO_DASHBOARD = {
  reservations: [] as ReservationRow[],
  stats: { total: 0, upcoming: 0, finished: 0, halls: 0 },
  eventDates: [] as string[],
};

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) redirect(303, '/app/login');
  if (locals.user.account_type === 'client') redirect(303, '/app/client');
  // No organisation is a normal, permanent state: most accounts belong to people
  // looking for a venue, not running one. They used to be sent to /priestory, whose
  // "go to the app" led straight back here — a loop with no home in it. They get
  // their own home: the directory, any invitations waiting for them, creating an
  // organisation as an option rather than a demand, and their profile.
  if (!locals.currentOrg) {
    const invites = await dbAll<{ token: string; orgName: string }>(
      locals.db,
      `SELECT i.token, o.name AS orgName
         FROM organization_invites i
         JOIN organizations o ON o.id = i.org_id
        WHERE lower(i.email) = lower(?) AND i.accepted_at IS NULL
          AND datetime(i.expires_at) > datetime('now')
        ORDER BY i.created_at DESC`,
      locals.user.email
    ).catch(() => []);
    return { ...NO_DASHBOARD, personal: { firstName: locals.user.first_name, invites } };
  }

  // Owners and anyone else who runs the venue belong on the console dashboard, not on
  // this personal one, which only lists events they booked themselves and so told an
  // owner with a full calendar "you have no events yet". Sign-in, the logo and "Home"
  // all land here, so this one redirect covers them.
  if (await hasConsoleAccess(locals)) redirect(303, '/app/manage');

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
    'SELECT COUNT(*) AS count FROM halls WHERE org_id = ? AND archived_at IS NULL',
    orgId
  );

  const eventDates = reservations
    .filter(r => r.status !== 'cancelled')
    .map(r => {
      const d = new Date(r.event_date);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });

  return {
    personal: null,
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
