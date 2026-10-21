import { fail, redirect } from '@sveltejs/kit';
import { dbAll } from '$lib/db/index';
import type { HallRow } from '$lib/db/index';
import { getPlan } from '$lib/plans';
import { activeHallCount } from '$lib/limits';
import { st } from '$lib/i18n-server';
import type { Actions, PageServerLoad } from './$types';
import { requireOrgPermission } from '$lib/server/access';
import { createHall } from '$lib/server/ops/hall-ops';

/** A name can only arrive here from a POST, so it is bounded server-side. */
const MAX_NAME_LENGTH = 120;

export const load: PageServerLoad = async ({ locals }) => {
  await requireOrgPermission(locals, 'halls.manage');
  const orgId = locals.currentOrg!.id;
  const halls = await dbAll<HallRow & { reservation_count: string }>(
    locals.db,
    'SELECT h.*, CAST(COUNT(r.id) AS TEXT) AS reservation_count FROM halls h LEFT JOIN reservations r ON r.hall_id = h.id WHERE h.org_id = ? GROUP BY h.id ORDER BY h.name',
    orgId
  );
  const plan = getPlan(locals.currentOrg!.subscription.plan);
  return {
    halls,
    hallLimit: plan.limits.maxHalls,
    activeHalls: await activeHallCount(locals.db, orgId),
  };
};

export const actions: Actions = {
  /** Create and go. The operator no longer fills a name here and then hunts for the
   *  new hall in the list: the row is created with sensible defaults and the request
   *  is redirected to the detail page, which is where every field (the name included)
   *  actually lives. A `name` may still be posted — by an older client, or by hand —
   *  so it is accepted, trimmed and bounded rather than trusted or ignored. */
  create: async ({ request, locals }) => {
    const org = await requireOrgPermission(locals, 'halls.manage');
    const data = await request.formData();
    const typedName = String(data.get('name') ?? '').trim().slice(0, MAX_NAME_LENGTH);
    const name = typedName || st(locals.locale).halls.untitledHall;

    // The plan's active-hall limit and the new-hall defaults live in createHall.
    const res = await createHall(locals.db, org.id, org.subscription.plan, name, null, locals.locale);
    if (!res.ok) return fail(res.status, { error: res.error });
    const id = res.id;
    redirect(303, `/app/manage/halls/${id}`);
  },

  // There is deliberately no delete here. Retiring a hall happens on its own page,
  // behind its open bookings and a typed confirmation: archived if it has any
  // history, deleted outright only if nobody ever booked it.
};
