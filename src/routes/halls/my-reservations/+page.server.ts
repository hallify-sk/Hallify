import { redirect } from '@sveltejs/kit';
import { loginUrl } from '$lib/login-redirect';
import { dbAll } from '$lib/db/index';
import type { PageServerLoad } from './$types';

interface MyReservation {
  id: string;
  title: string;
  description: string | null;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  status: string;
  invite_code: string;
  num_guests: number | null;
  hall_name: string;
  hall_slug: string | null;
}

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) redirect(303, loginUrl(url, '/login'));

  const orgId = locals.domainOrg!.id;

  // Belt-and-suspenders: a client's reservations are all in their org anyway,
  // but scoping by org_id guarantees nothing from another bubble can appear.
  const reservations = await dbAll<MyReservation>(
    locals.db,
    `SELECT r.id, r.title, r.description, r.event_date, r.start_time, r.end_time,
            r.status, r.invite_code, r.num_guests, h.name AS hall_name, h.slug AS hall_slug
     FROM reservations r
     JOIN halls h ON h.id = r.hall_id
     WHERE r.user_id = ? AND r.org_id = ?
     ORDER BY r.event_date DESC`,
    locals.user.id, orgId
  );

  return { reservations };
};
