import { redirect } from '@sveltejs/kit';
import { loginUrl } from '$lib/login-redirect';
import { dbAll } from '$lib/db/index';
import { venueClientAccess, type ClientAccess } from '$lib/server/reservation-client-access';
import { todayUtcISO } from '$lib/server/reservation-rules';
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
  cancelled_by: string | null;
  has_reason: number;
  hall_name: string;
  hall_slug: string | null;
  /** 'member': shared with this client by its owner or the venue (0038). */
  access: ClientAccess;
  /** Something to pay that has not been paid (waiting for payment, or a deposit due). */
  payment_open: number;
}

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) redirect(303, loginUrl(url, '/login'));

  const orgId = locals.domainOrg!.id;

  // Belt-and-suspenders: a client's reservations are all in their org anyway,
  // but scoping by org_id guarantees nothing from another bubble can appear.
  // Their own bookings and the ones shared with them (0038); `access` tells them apart.
  const a = venueClientAccess(locals.user.id);
  const reservations = await dbAll<MyReservation>(
    locals.db,
    `SELECT r.id, r.title, r.description, r.event_date, r.start_time, r.end_time,
            r.status, r.invite_code, r.num_guests, r.cancelled_by,
            CASE WHEN TRIM(COALESCE(r.status_reason, '')) != '' THEN 1 ELSE 0 END AS has_reason,
            -- An amount still due, as the booking page works it out (amountDue).
            CASE WHEN r.paid_in_full_at IS NULL AND (
                   (r.deposit_cents > 0 AND r.deposit_paid_at IS NULL)
                OR (r.deposit_paid_at IS NOT NULL AND r.price_cents > COALESCE(r.deposit_cents, 0))
                OR (r.deposit_paid_at IS NULL AND r.price_cents > 0)) THEN 1 ELSE 0 END AS payment_open,
            h.name AS hall_name, h.slug AS hall_slug,
            ${a.access.sql} AS access
     FROM reservations r
     JOIN halls h ON h.id = r.hall_id
     WHERE ${a.where.sql} AND r.org_id = ?
     ORDER BY r.event_date DESC`,
    ...a.access.params, ...a.where.params, orgId
  );

  return { reservations, todayISO: todayUtcISO() };
};
