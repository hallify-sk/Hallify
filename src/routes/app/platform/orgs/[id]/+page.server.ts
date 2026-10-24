import { error, fail } from '@sveltejs/kit';
import { dbFirst, dbRun } from '$lib/db/index';
import { PLANS } from '$lib/plans';
import type { PlanId } from '$lib/plans';
import { enforcePlanLimits } from '$lib/limits';
import { isReservedSubdomain } from '$lib/reserved-subdomains';
import { listInvoices } from '$lib/stripe';
import { st } from '$lib/i18n-server';
import type { PageServerLoad, Actions } from './$types';
import { requirePlatformAdmin } from '$lib/guards';
import { slugify } from '$lib/slug';
import { logPlatformAction, listAudit } from '$lib/server/platform-audit';
import { adjustAiCredits, aiBalanceCredits, parseCreditAdjustment } from '$lib/server/platform-credits';
import { aiPlatformEnabled } from '$lib/server/ai/availability';

/** The longest subdomain label DNS allows. */
const MAX_SLUG = 63;

const VALID_PLANS: PlanId[] = ['free', 'starter', 'professional', 'enterprise'];

export const load: PageServerLoad = async ({ params, locals }) => {
  const org = await dbFirst<{
    id: string; name: string; slug: string; logo_url: string | null;
    suspended_at: string | null; created_at: string; member_count: number; reservation_count: number; is_hallify_partner: number;
  }>(locals.db, `
    SELECT o.id, o.name, o.slug, o.logo_url, o.suspended_at, o.created_at, o.is_hallify_partner,
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

  const aiBalance = await aiBalanceCredits(locals.db, params.id);
  const audit = await listAudit(locals.db, { targetType: 'org', targetId: params.id, limit: 30 });

  return { org, sub, plans: PLANS, invoices, aiBalance, audit };
};

export const actions: Actions = {
  setPartner: async ({ request, params, locals }) => {
    requirePlatformAdmin(locals);
    const org = await dbFirst<{ id: string }>(locals.db, 'SELECT id FROM organizations WHERE id = ?', params.id);
    if (!org) error(404, st(locals.locale).serverErrors.organizationNotFound);
    const form = await request.formData();
    const partner = form.get('partner') === 'on';
    await dbRun(locals.db, 'UPDATE organizations SET is_hallify_partner = ? WHERE id = ?', partner ? 1 : 0, params.id);
    await logPlatformAction(locals, 'org.partner', { type: 'org', id: params.id }, { partner });
    return { partnerSaved: true };
  },
  // Superadmin plan override — written straight to our subscriptions table.
  setPlan: async ({ request, params, locals }) => {
    requirePlatformAdmin(locals);
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
    const org = await dbFirst<{ name: string }>(locals.db, 'SELECT name FROM organizations WHERE id = ?', params.id);
    await logPlatformAction(locals, 'org.plan', { type: 'org', id: params.id, label: org?.name }, { plan });
    return { planChanged: plan };
  },

  // Change the org's subdomain (slug) — the <slug>.hallify.sk bubble + public URLs.
  setSlug: async ({ request, params, locals }) => {
    requirePlatformAdmin(locals);
    const data = await request.formData();
    // A subdomain is one DNS label: at most 63 characters. An 80-character slug used
    // to be saved and produced a hostname that cannot exist.
    const typed = String(data.get('slug') ?? '').trim();
    const slug = slugify(typed, 200);
    if (!slug || slug.length < 2) return fail(400, { slugError: st(locals.locale).serverErrors.enterValidSubdomain });
    if (slug.length > MAX_SLUG) return fail(400, { slugError: st(locals.locale).platformOrgs.subdomainTooLong(MAX_SLUG) });
    if (isReservedSubdomain(slug)) return fail(400, { slugError: st(locals.locale).serverErrors.subdomainReserved });
    const taken = await dbFirst<{ id: string }>(locals.db, 'SELECT id FROM organizations WHERE slug = ? AND id != ?', slug, params.id);
    if (taken) return fail(400, { slugError: st(locals.locale).serverErrors.subdomainTaken });
    const before = await dbFirst<{ slug: string; name: string }>(locals.db, 'SELECT slug, name FROM organizations WHERE id = ?', params.id);
    await dbRun(locals.db, 'UPDATE organizations SET slug = ? WHERE id = ?', slug, params.id);
    await logPlatformAction(locals, 'org.slug', { type: 'org', id: params.id, label: before?.name }, { from: before?.slug, to: slug });
    return { slugChanged: slug };
  },

  suspend: async ({ params, locals }) => {
    requirePlatformAdmin(locals);
    await dbRun(locals.db, "UPDATE organizations SET suspended_at = datetime('now') WHERE id = ?", params.id);
    await logPlatformAction(locals, 'org.suspend', { type: 'org', id: params.id });
    return { success: true };
  },
  unsuspend: async ({ params, locals }) => {
    requirePlatformAdmin(locals);
    await dbRun(locals.db, 'UPDATE organizations SET suspended_at = NULL WHERE id = ?', params.id);
    await logPlatformAction(locals, 'org.unsuspend', { type: 'org', id: params.id });
    return { success: true };
  },

  /** Grant (positive) or take back (negative) AI credits, with a reason that goes
   *  into the organisation's credit history and the audit log. */
  adjustCredits: async ({ request, params, locals }) => {
    requirePlatformAdmin(locals);
    const data = await request.formData();
    const credits = parseCreditAdjustment(data.get('credits'));
    const reason = String(data.get('reason') ?? '').trim().slice(0, 160);
    const t = st(locals.locale).platformOrgs;
    // The assistant is off on the platform: no credits to adjust.
    if (!(await aiPlatformEnabled(locals))) return fail(404, { creditsError: t.creditsFailed });
    if (credits == null) return fail(400, { creditsError: t.creditsInvalid });
    if (!reason) return fail(400, { creditsError: t.creditsReasonRequired });
    const org = await dbFirst<{ name: string }>(locals.db, 'SELECT name FROM organizations WHERE id = ?', params.id);
    if (!org) error(404, st(locals.locale).serverErrors.organizationNotFound);
    let applied: number;
    try {
      applied = await adjustAiCredits(locals.db, params.id, credits, locals.user?.id ?? null, reason);
    } catch {
      return fail(500, { creditsError: t.creditsFailed });
    }
    await logPlatformAction(locals, 'org.ai_credits', { type: 'org', id: params.id, label: org.name }, { requested: credits, applied, reason });
    return { creditsApplied: applied };
  },
};
