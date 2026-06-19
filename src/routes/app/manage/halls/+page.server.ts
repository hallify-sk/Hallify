import { fail } from '@sveltejs/kit';
import { dbAll, dbRun } from '$lib/db/index';
import type { HallRow } from '$lib/db/index';
import { getPlan } from '$lib/plans';
import { canAddHall, activeHallCount } from '$lib/limits';
import { st } from '$lib/i18n-server';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
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
  create: async ({ request, locals }) => {
    const orgId = locals.currentOrg!.id;
    const data = await request.formData();
    const name = String(data.get('name') ?? '').trim();
    const description = String(data.get('description') ?? '').trim();
    const maxPeople = Number(data.get('maxPeople') ?? 100);
    const color = String(data.get('color') ?? '#3b82f6').trim();

    if (!name) return fail(400, { error: st(locals.locale).serverErrors.hallNameRequired });

    // Enforce the plan's active-hall limit.
    if (!(await canAddHall(locals.db, orgId, locals.currentOrg!.subscription.plan))) {
      const limit = getPlan(locals.currentOrg!.subscription.plan).limits.maxHalls;
      return fail(403, { error: `Your plan allows ${limit} hall${limit === 1 ? '' : 's'}. Upgrade or reactivate to add more.` });
    }

    const id = crypto.randomUUID();
    await dbRun(
      locals.db,
      'INSERT INTO halls (id, org_id, name, description, max_people, color) VALUES (?, ?, ?, ?, ?, ?)',
      id, orgId, name, description || null, maxPeople, color
    );
    return { success: true };
  },

  delete: async ({ request, locals }) => {
    const orgId = locals.currentOrg!.id;
    const data = await request.formData();
    const id = String(data.get('id') ?? '');
    if (!id) return fail(400, { error: st(locals.locale).serverErrors.missingId });
    // Scoped delete — only delete halls owned by this org
    await dbRun(locals.db, 'DELETE FROM halls WHERE id = ? AND org_id = ?', id, orgId);
    return { success: true };
  }
};
