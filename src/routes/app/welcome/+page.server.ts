import { fail, isHttpError, redirect } from '@sveltejs/kit';
import { dbFirst, dbRun, fromJson, toJson } from '$lib/db/index';
import { requireOrgPermission } from '$lib/server/access';
import { uniqueHallSlug } from '$lib/server/hall-naming';
import type { OrgContext } from '../../../app.d';
import { st } from '$lib/i18n-server';
import { PLANS, getPlan } from '$lib/plans';
import { canAddHall } from '$lib/limits';
import {
  DEFAULT_ONBOARDING,
  furthest,
  nextStep,
  resolveOnboarding,
  type OnboardingStep
} from '$lib/onboarding';
import { SETUP_SERVICE_PRICE_CENTS } from '$lib/setup-service';
import type { PageServerLoad, Actions } from './$types';

/**
 * First run, for a brand-new organisation.
 *
 * It sets the organisation up — creates a public venue, rewrites a venue's address
 * and booking switch, records the org's progress — so every action requires the
 * permission for what it changes, not mere membership: a plain member used to be
 * able to POST saveDetails with any hall id and switch its online booking off.
 * The page itself is for whoever may change settings; anyone else is sent home
 * rather than shown a 403, and someone with no organisation goes to their own home.
 */

/** May change the organisation's setup (the wizard's own progress, plan, add-ons). */
const SETUP = 'settings.manage' as const;
/** May create venues and edit their address and booking switch. */
const HALLS = 'halls.manage' as const;

const MAX_NAME = 80;

async function loadState(db: App.Locals['db'], orgId: string) {
  const row = await dbFirst<{ value: string | null }>(
    db,
    `SELECT value FROM org_settings WHERE org_id = ? AND key = 'onboarding'`,
    orgId
  );
  return resolveOnboarding(fromJson(row?.value ?? null));
}

async function saveState(db: App.Locals['db'], orgId: string, state: typeof DEFAULT_ONBOARDING) {
  await dbRun(
    db,
    `INSERT OR REPLACE INTO org_settings (org_id, key, value, updated_at)
     VALUES (?, 'onboarding', ?, datetime('now'))`,
    orgId,
    toJson(state)
  );
}

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) redirect(303, `/app/login?redirect=${encodeURIComponent(url.pathname + url.search)}`);
  if (!locals.currentOrg) redirect(303, '/app/');
  let org: OrgContext;
  try {
    org = await requireOrgPermission(locals, SETUP);
  } catch (e) {
    if (isHttpError(e) && e.status === 403) redirect(303, '/app/');
    throw e;
  }
  const state = await loadState(locals.db, org.id);

  // Finished is finished. Coming back to the URL later lands on the console
  // rather than restarting a flow they have already been through.
  if (state.completed && url.searchParams.get('again') !== '1') {
    redirect(303, '/app/manage');
  }

  const hallCount = (await dbFirst<{ n: number }>(
    locals.db,
    'SELECT COUNT(*) AS n FROM halls WHERE org_id = ? AND archived_at IS NULL',
    org.id
  ))?.n ?? 0;

  // The venue made during the flow, so its screen can show what was created
  // rather than an empty form the operator has already filled in.
  const hall = state.hallId
    ? await dbFirst<{ id: string; name: string; max_people: number; address: string | null; is_public: number; latitude: number | null; longitude: number | null }>(
        locals.db,
        'SELECT id, name, max_people, address, is_public, latitude, longitude FROM halls WHERE id = ? AND org_id = ?',
        state.hallId,
        org.id
      )
    : null;

  let setupRequested = false;
  try {
    setupRequested = !!(await dbFirst<{ id: string }>(
      locals.db,
      `SELECT id FROM setup_requests WHERE org_id = ? AND status != 'cancelled' LIMIT 1`,
      org.id
    ));
  } catch {
    // Table arrives with migration 0010.
  }

  return {
    state,
    hall,
    hallCount,
    setupRequested,
    setupPriceCents: SETUP_SERVICE_PRICE_CENTS,
    plan: org.subscription.plan,
    plans: PLANS,
    orgName: org.name
  };
};

export const actions: Actions = {
  /** Step 1. The single thing that makes the product do anything for them. */
  createVenue: async ({ request, locals }) => {
    await requireOrgPermission(locals, SETUP);
    const org = await requireOrgPermission(locals, HALLS);
    const data = await request.formData();
    const name = String(data.get('name') ?? '').trim().slice(0, MAX_NAME);
    const capacity = Number(data.get('capacity') ?? 0);

    // `step` ties an error to the screen that produced it, so it does not follow
    // the operator onto the next one.
    if (!name) return fail(400, { error: st(locals.locale).serverErrors.nameRequired, step: 'venue' as OnboardingStep });

    if (!(await canAddHall(locals.db, org.id, org.subscription.plan))) {
      const limit = getPlan(org.subscription.plan).limits.maxHalls;
      return fail(403, {
        error: st(locals.locale).serverErrors.hallLimitReached.replace('{limit}', String(limit)),
        step: 'venue' as OnboardingStep
      });
    }

    const id = crypto.randomUUID();
    // Same deliberate choice the console's own create makes: listed in discovery
    // straight away, taking no bookings until the operator opts in. With a slug:
    // the venue site lists only halls that have one, so without it the new venue's
    // public site was an empty page.
    await dbRun(
      locals.db,
      `INSERT INTO halls (id, org_id, name, max_people, color, allow_reservations, is_public, slug)
       VALUES (?, ?, ?, ?, '#a6225e', 0, 1, ?)`,
      id,
      org.id,
      name,
      Number.isFinite(capacity) && capacity > 0 ? Math.min(capacity, 100_000) : 50,
      await uniqueHallSlug(locals.db, org.id, name, null, locals.locale === 'en' ? 'hall' : 'sala')
    );

    const state = await loadState(locals.db, org.id);
    await saveState(locals.db, org.id, {
      ...state,
      hallId: id,
      step: furthest(state.step, 'details')
    });

    return { created: true };
  },

  /** Step 2. Address and whether it takes bookings yet — the two that decide
   *  whether the public listing is any use. */
  saveDetails: async ({ request, locals }) => {
    await requireOrgPermission(locals, SETUP);
    const org = await requireOrgPermission(locals, HALLS);
    const data = await request.formData();
    const hallId = String(data.get('hallId') ?? '');
    const address = String(data.get('address') ?? '').trim().slice(0, 200);
    const allowReservations = data.get('allowReservations') === 'on' ? 1 : 0;

    // Whatever the map ended up pointing at — geocoded, or dragged afterwards.
    // Validated rather than trusted: these arrive from a form like anything else.
    const num = (v: FormDataEntryValue | null, max: number) => {
      const n = Number(String(v ?? ''));
      return String(v ?? '') !== '' && Number.isFinite(n) && Math.abs(n) <= max ? n : null;
    };
    const latitude = num(data.get('latitude'), 90);
    const longitude = num(data.get('longitude'), 180);

    // Scope by org: an id alone must never reach another tenant's venue.
    const hall = await dbFirst<{ id: string }>(
      locals.db,
      'SELECT id FROM halls WHERE id = ? AND org_id = ?',
      hallId,
      org.id
    );
    if (!hall) return fail(404, { error: st(locals.locale).serverErrors.hallNotFound, step: 'details' as OnboardingStep });

    // Both coordinates or neither: half a position is not a position.
    const hasPosition = latitude !== null && longitude !== null;
    await dbRun(
      locals.db,
      `UPDATE halls SET address = ?, allow_reservations = ?, latitude = ?, longitude = ?
        WHERE id = ? AND org_id = ?`,
      address || null,
      allowReservations,
      hasPosition ? latitude : null,
      hasPosition ? longitude : null,
      hallId,
      org.id
    );

    const state = await loadState(locals.db, org.id);
    await saveState(locals.db, org.id, { ...state, step: furthest(state.step, 'plan') });
    return { saved: true };
  },

  /** Move on without doing the current step. Skipping is a first-class outcome. */
  advance: async ({ request, locals }) => {
    const org = await requireOrgPermission(locals, SETUP);
    const data = await request.formData();
    const from = String(data.get('from') ?? '') as OnboardingStep;

    const state = await loadState(locals.db, org.id);
    await saveState(locals.db, org.id, { ...state, step: furthest(state.step, nextStep(from)) });
    return { advanced: true };
  },

  /**
   * Leave without finishing.
   *
   * Explicitly does NOT mark the flow complete. Skipping used to, which meant
   * the dashboard prompt vanished and the only route back was an undocumented
   * query parameter — "skip" quietly became "never show me this again", which
   * is not what the word means. Progress is kept, so coming back resumes.
   */
  leave: async ({ locals }) => {
    await requireOrgPermission(locals, SETUP);
    redirect(303, '/app/manage');
  },

  /** Reached the end. This is the only thing that marks it done. */
  finish: async ({ locals }) => {
    const org = await requireOrgPermission(locals, SETUP);
    const state = await loadState(locals.db, org.id);
    await saveState(locals.db, org.id, { ...state, completed: true });
    redirect(303, '/app/manage');
  }
};
