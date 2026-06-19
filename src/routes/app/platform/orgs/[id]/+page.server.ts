import { error, fail } from '@sveltejs/kit';
import { dbFirst, dbRun } from '$lib/db/index';
import { PLANS } from '$lib/plans';
import type { PlanId } from '$lib/plans';
import { enforcePlanLimits } from '$lib/limits';
import { isReservedSubdomain } from '$lib/reserved-subdomains';
import { listInvoices } from '$lib/stripe';
import { st } from '$lib/i18n-server';
import type { PageServerLoad, Actions } from './$types';

const VALID_PLANS: PlanId[] = ['free', 'starter', 'professional', 'enterprise'];

export const load: PageServerLoad = async ({ params, locals }) => {
  const org = await dbFirst<{
    id: string; name: string; slug: string; logo_url: string | null;
    suspended_at: string | null; created_at: string; member_count: number; reservation_count: number;
  }>(locals.db, `
    SELECT o.id, o.name, o.slug, o.logo_url, o.suspended_at, o.created_at,
           (SELECT COUNT(*) FROM organization_members m WHERE m.org_id = o.id) AS member_count,
           (SELECT COUNT(*) FROM reservations r WHERE r.org_id = o.id) AS reservation_count
    FROM organizations o WHERE o.id = ?`, params.id);
  if (!org) error(404, st(locals.locale).serverErrors.organizationNotFound);

  const sub = await dbFirst<{
    plan: string | null; status: string | null;
    stripe_customer_id: string | null; stripe_subscription_id: string | null;
    current_period_end: string | null;
  }>(locals.db,
    'SELECT plan, status, stripe_customer_id, stripe_subscription_id, current_period_end FROM subscriptions WHERE org_id = ?',
    params.id);

  // Invoices the org owes us (best-effort via Stripe).
  const invoices = sub?.stripe_customer_id ? await listInvoices(sub.stripe_customer_id, 50) : [];

  return { org, sub, plans: PLANS, invoices };
};

export const actions: Actions = {
  // Superadmin plan override — written straight to our subscriptions table.
  setPlan: async ({ request, params, locals }) => {
    const data = await request.formData();
    const plan = String(data.get('plan') ?? '') as PlanId;
    if (!VALID_PLANS.includes(plan)) return fail(400, { error: st(locals.locale).serverErrors.invalidPlan });
    await dbRun(locals.db, `
      INSERT INTO subscriptions (id, org_id, plan, status, updated_at)
      VALUES (?, ?, ?, 'active', datetime('now'))
      ON CONFLICT (org_id) DO UPDATE
        SET plan = excluded.plan, status = 'active', updated_at = datetime('now')`,
      crypto.randomUUID(), params.id, plan);
    await enforcePlanLimits(locals.db, params.id, plan);
    return { planChanged: plan };
  },

  // Change the org's subdomain (slug) — the <slug>.hallify.sk bubble + public URLs.
  setSlug: async ({ request, params, locals }) => {
    const data = await request.formData();
    const slug = String(data.get('slug') ?? '').trim().toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (!slug || slug.length < 2) return fail(400, { slugError: st(locals.locale).serverErrors.enterValidSubdomain });
    if (isReservedSubdomain(slug)) return fail(400, { slugError: st(locals.locale).serverErrors.subdomainReserved });
    const taken = await dbFirst<{ id: string }>(locals.db, 'SELECT id FROM organizations WHERE slug = ? AND id != ?', slug, params.id);
    if (taken) return fail(400, { slugError: st(locals.locale).serverErrors.subdomainTaken });
    await dbRun(locals.db, 'UPDATE organizations SET slug = ? WHERE id = ?', slug, params.id);
    return { slugChanged: slug };
  },

  suspend: async ({ params, locals }) => {
    await dbRun(locals.db, "UPDATE organizations SET suspended_at = datetime('now') WHERE id = ?", params.id);
    return { success: true };
  },
  unsuspend: async ({ params, locals }) => {
    await dbRun(locals.db, 'UPDATE organizations SET suspended_at = NULL WHERE id = ?', params.id);
    return { success: true };
  },
};
