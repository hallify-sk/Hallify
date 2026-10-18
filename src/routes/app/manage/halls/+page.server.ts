import { fail, redirect } from '@sveltejs/kit';
import { dbAll, dbRun } from '$lib/db/index';
import type { HallRow } from '$lib/db/index';
import { getPlan } from '$lib/plans';
import { canAddHall, activeHallCount } from '$lib/limits';
import { st } from '$lib/i18n-server';
import type { Actions, PageServerLoad } from './$types';
import { requireOrgPermission } from '$lib/server/access';

/** Brand accent. The markup default on the hall detail form and this fallback must
 *  agree, or a hall created here changes colour the first time it is saved. */
const DEFAULT_HALL_COLOR = '#f05ca1';
const DEFAULT_MAX_PEOPLE = 100;
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

    // Enforce the plan's active-hall limit.
    if (!(await canAddHall(locals.db, org.id, org.subscription.plan))) {
      const limit = getPlan(org.subscription.plan).limits.maxHalls;
      return fail(403, {
        error: st(locals.locale).serverErrors.hallLimitReached.replace('{limit}', String(limit)),
      });
    }

    const id = crypto.randomUUID();
    // allow_reservations and is_public are written EXPLICITLY, against the stored
    // column defaults (1 and 0): a new venue is listed in discovery straight away —
    // this is a discovery product — but takes no bookings until the operator has it
    // ready and opts in. The column defaults are deliberately left alone so existing
    // halls keep exactly what their operator chose (see migration 0006).
    await dbRun(
      locals.db,
      `INSERT INTO halls (id, org_id, name, max_people, color, allow_reservations, is_public)
       VALUES (?, ?, ?, ?, ?, 0, 1)`,
      id, org.id, name, DEFAULT_MAX_PEOPLE, DEFAULT_HALL_COLOR
    );
    redirect(303, `/app/manage/halls/${id}`);
  },

  delete: async ({ request, locals }) => {
    await requireOrgPermission(locals, 'halls.manage');
    const orgId = locals.currentOrg!.id;
    const data = await request.formData();
    const id = String(data.get('id') ?? '');
    if (!id) return fail(400, { error: st(locals.locale).serverErrors.missingId });
    // Scoped delete — only delete halls owned by this org
    await dbRun(locals.db, 'DELETE FROM halls WHERE id = ? AND org_id = ?', id, orgId);
    return { success: true };
  }
};
