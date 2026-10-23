import type { PageServerLoad, Actions } from './$types';
import { dbAll } from '$lib/db/index';
import type { HallRow, ReservationStatus } from '$lib/db/index';
import { fail, redirect } from '@sveltejs/kit';
import { st } from '$lib/i18n-server';
import { requireOrgPermission } from '$lib/server/access';
import { earliestBookableISO, todayISO } from '$lib/availability';
import { createReservation, STAFF_INITIAL_STATUSES } from '$lib/server/reservations';
import { parseListFilters, listReservations } from '$lib/server/reservation-list';
import { todayUtcISO } from '$lib/server/reservation-rules';
import { loadCapNotices } from '$lib/server/cap-notices';

/** Caps on the customer details an operator types in. They are stored in staff-only
 *  columns nothing else bounds — the UI's maxlength is a convenience, this is the rule. */
const CUSTOMER_NAME_MAX = 120;
const CUSTOMER_CONTACT_MAX = 160;
const NOTES_MAX = 2000;

export const load: PageServerLoad = async ({ locals, url }) => {
  const orgId = (await requireOrgPermission(locals, 'reservations.manage')).id;

  // Search, filters, sort and paging come from the URL and run in the database
  // (the list used to load every booking at once, newest request first).
  const filters = parseListFilters(url.searchParams);
  const list = await listReservations(locals.db, orgId, filters, todayUtcISO());

  // Halls for the manual-entry form and the hall filter. Halls that are not
  // accepting reservations are still listed — offered but disabled — because
  // silently hiding them looks like missing data to the operator.
  const halls = await dbAll<Pick<HallRow, 'id' | 'name' | 'max_people' | 'allow_reservations' | 'min_days_advance' | 'force_layouts'>>(
    locals.db,
    `SELECT id, name, max_people, allow_reservations, min_days_advance, force_layouts
     FROM halls WHERE org_id = ? AND plan_locked = 0 AND archived_at IS NULL ORDER BY name`,
    orgId
  );

  // Layouts, for the same form. A hall with force_layouts rejects a booking that
  // carries no template (createReservation enforces it), so without this list the
  // manual form would be a dead end for exactly those halls: every submit would
  // come back "a layout must be selected" with nothing on screen to select.
  const templates = await dbAll<{ id: string; hall_id: string; name: string }>(
    locals.db,
    `SELECT t.id, t.hall_id, t.name
     FROM floorplan_templates t
     JOIN halls h ON h.id = t.hall_id
     WHERE h.org_id = ?
     ORDER BY t.name`,
    orgId
  );

  return {
    // Months the plan's reservation cap has filled (M17).
    caps: await loadCapNotices(locals.db, orgId),
    reservations: list.rows,
    total: list.total,
    page: list.page,
    pages: list.pages,
    counts: list.counts,
    filters,
    templates,
    halls: halls.map(h => ({
      ...h,
      allow_reservations: !!h.allow_reservations,
      force_layouts: !!h.force_layouts,
      earliestDate: earliestBookableISO(h.min_days_advance),
    })),
    // Staff are not bound by the clients' notice period: the earliest date is today.
    today: todayISO(),
    staffStatuses: STAFF_INITIAL_STATUSES,
  };
};

export const actions: Actions = {
  // (The old `updateStatus` action lived here, unused, duplicating the status change
  //  without its clash check — reinstating onto a re-booked date was a 500. Status
  //  changes go through the reservation page and changeReservationStatus only.)

  /** A booking taken over the phone. The customer has no account and must not be
   *  made to create one, so the row is owned by the operator entering it; the
   *  caller's name, contact and the team's note go into staff-only columns (the
   *  client never sees them, even after the booking is assigned to them). Everything
   *  else (availability, the one-per-hall-day rule, capacity, the monthly cap) goes
   *  through the same createReservation path the self-service wizard uses, minus
   *  the client-facing notice period. */
  createManual: async ({ request, locals }) => {
    await requireOrgPermission(locals, 'reservations.manage');
    const orgId = locals.currentOrg!.id;
    const d = st(locals.locale);
    const data = await request.formData();

    const customerName = String(data.get('customerName') ?? '').trim();
    const customerContact = String(data.get('customerContact') ?? '').trim();
    const notes = String(data.get('notes') ?? '').trim();
    const initialStatus = String(data.get('initialStatus') ?? '') as ReservationStatus;

    if (!customerName) {
      return fail(400, { manualError: d.serverErrors.customerNameRequired });
    }
    if (customerName.length > CUSTOMER_NAME_MAX || customerContact.length > CUSTOMER_CONTACT_MAX || notes.length > NOTES_MAX) {
      return fail(400, { manualError: d.serverErrors.manualFieldTooLong });
    }

    const created = await createReservation(locals, {
      orgId,
      hallId: String(data.get('hallId') ?? ''),
      title: String(data.get('title') ?? ''),
      description: null,
      eventDate: String(data.get('eventDate') ?? ''),
      startTime: String(data.get('startTime') ?? ''),
      endTime: String(data.get('endTime') ?? ''),
      templateId: String(data.get('templateId') ?? ''),
      numGuests: parseInt(String(data.get('numGuests') ?? ''), 10) || null,
      eventType: String(data.get('eventType') ?? ''),
      eventTypeOther: String(data.get('eventTypeOther') ?? ''),
      byStaff: {
        initialStatus: STAFF_INITIAL_STATUSES.includes(initialStatus) ? initialStatus : null,
        customerName,
        customerContact,
        internalNotes: notes,
      },
    });

    if (!created.ok) return fail(created.status, { manualError: created.error });

    redirect(303, `/app/reservation/${created.id}`);
  }
};
