import { dbFirst, dbAll } from '$lib/db/index';
import { env } from '$env/dynamic/private';
import { requirePlatformAdmin } from '$lib/guards';
import { SLA } from '$lib/legal';
import { getEmailHealth } from '$lib/email';
import type { PageServerLoad } from './$types';

/**
 * Platform overview.
 *
 * Everything here is measured from the database or from which secrets are bound.
 * Two things a platform admin would reasonably expect are NOT here, because this
 * code cannot honestly produce them:
 *
 *   CPU / memory — Cloudflare Workers exposes neither. The /api/system-metrics
 *                  endpoint returns nulls for exactly this reason.
 *   Real uptime  — a Worker cannot measure its own downtime; while it is down there
 *                  is nothing running to record the fact. Self-reported uptime would
 *                  read 100% through an outage. The SLA target is shown instead,
 *                  labelled as a target, with a note that measuring it needs an
 *                  outside prober.
 */

/** Rows older than this are ignored when judging current delivery health. */
const HEALTH_WINDOW = "-24 hours";

export const load: PageServerLoad = async ({ locals }) => {
  requirePlatformAdmin(locals);

  const stats = await dbFirst<{
    total_orgs: string; suspended_orgs: string; closed_orgs: string;
    total_users: string; platform_admins: string;
    active_subscriptions: string; manual_plans: string; partners: string;
    total_reservations: string;
    orgs_7d: string; users_7d: string; reservations_7d: string;
    orgs_30d: string; users_30d: string; reservations_30d: string;
  }>(locals.db, `
    SELECT
      (SELECT COUNT(*) FROM organizations WHERE suspended_at IS NULL) AS total_orgs,
      (SELECT COUNT(*) FROM organizations WHERE suspended_at IS NOT NULL) AS suspended_orgs,
      (SELECT COUNT(*) FROM closed_organizations) AS closed_orgs,
      (SELECT COUNT(*) FROM users) AS total_users,
      (SELECT COUNT(*) FROM users WHERE is_platform_admin = 1) AS platform_admins,
      -- Paid = backed by a Stripe subscription. Plans set by hand on the platform
      -- page are counted apart: they used to be counted as paid, which showed
      -- revenue that did not exist.
      (SELECT COUNT(*) FROM subscriptions WHERE status IN ('active','trialing') AND plan != 'free'
         AND stripe_subscription_id IS NOT NULL) AS active_subscriptions,
      (SELECT COUNT(*) FROM subscriptions WHERE status IN ('active','trialing') AND plan != 'free'
         AND stripe_subscription_id IS NULL) AS manual_plans,
      -- Partners are the organisations marked as Hallify partners, nothing else.
      (SELECT COUNT(*) FROM organizations WHERE suspended_at IS NULL AND is_hallify_partner = 1) AS partners,
      (SELECT COUNT(*) FROM reservations) AS total_reservations,
      (SELECT COUNT(*) FROM organizations WHERE created_at >= datetime('now','-7 days')) AS orgs_7d,
      (SELECT COUNT(*) FROM users WHERE created_at >= datetime('now','-7 days')) AS users_7d,
      (SELECT COUNT(*) FROM reservations WHERE created_at >= datetime('now','-7 days')) AS reservations_7d,
      (SELECT COUNT(*) FROM organizations WHERE created_at >= datetime('now','-30 days')) AS orgs_30d,
      (SELECT COUNT(*) FROM users WHERE created_at >= datetime('now','-30 days')) AS users_30d,
      (SELECT COUNT(*) FROM reservations WHERE created_at >= datetime('now','-30 days')) AS reservations_30d
  `);

  // Delivery health. A failure rate here is the clearest early signal that something
  // is broken for real users: nobody reports "I did not get an email".
  const email = await dbFirst<{ sent: string; failed: string }>(locals.db, `
    SELECT
      COALESCE(SUM(CASE WHEN status = 'sent'   THEN 1 ELSE 0 END), 0) AS sent,
      COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) AS failed
    FROM email_log WHERE created_at >= datetime('now', ?)
  `, HEALTH_WINDOW);

  const webhooks = await dbFirst<{ delivered: string; failed: string; pending: string }>(locals.db, `
    SELECT
      COALESCE(SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END), 0) AS delivered,
      COALESCE(SUM(CASE WHEN status = 'failed'    THEN 1 ELSE 0 END), 0) AS failed,
      COALESCE(SUM(CASE WHEN status = 'pending'   THEN 1 ELSE 0 END), 0) AS pending
    FROM webhook_deliveries WHERE delivered_at >= datetime('now', ?)
  `, HEALTH_WINDOW);

  const plans = await dbAll<{ plan: string; count: string }>(locals.db, `
    SELECT COALESCE(s.plan, 'free') AS plan, COUNT(*) AS count
    FROM organizations o LEFT JOIN subscriptions s ON s.org_id = o.id
    WHERE o.suspended_at IS NULL
    GROUP BY COALESCE(s.plan, 'free')
  `);

  const reservationStatus = await dbAll<{ status: string; count: string }>(locals.db, `
    SELECT status, COUNT(*) AS count FROM reservations GROUP BY status
  `);

  // Who holds the keys. LAUNCH.md asks for this to be audited after the
  // privilege-escalation window, and it is not visible anywhere else.
  const admins = await dbAll<{ id: string; email: string; first_name: string; last_name: string; created_at: string }>(
    locals.db,
    `SELECT id, email, first_name, last_name, created_at FROM users
      WHERE is_platform_admin = 1 ORDER BY created_at`
  );

  // Schema state, so a half-applied rollout is visible rather than mysterious.
  let migrations: { applied: number; latest: string | null } = { applied: 0, latest: null };
  try {
    const row = await dbFirst<{ applied: string; latest: string | null }>(locals.db,
      `SELECT COUNT(*) AS applied, MAX(name) AS latest FROM d1_migrations`);
    migrations = { applied: Number(row?.applied ?? 0), latest: row?.latest ?? null };
  } catch {
    // The table only exists once Wrangler has run a migration here.
  }

  // Presence only — never the values. An unset secret is a silent outage: email
  // simply stops sending, and nothing surfaces until a customer complains.
  const config = [
    { key: 'BREVO_API_KEY',        set: !!env.BREVO_API_KEY,        critical: true },
    { key: 'STRIPE_SECRET_KEY',    set: !!env.STRIPE_SECRET_KEY,    critical: true },
    { key: 'STRIPE_WEBHOOK_SECRET',set: !!env.STRIPE_WEBHOOK_SECRET,critical: true },
    { key: 'APP_URL',              set: !!env.APP_URL,              critical: true },
    { key: 'CF_API_TOKEN',         set: !!env.CF_API_TOKEN,         critical: false },
    { key: 'CF_ZONE_ID',           set: !!env.CF_ZONE_ID,           critical: false },
  ];

  const recentOrgs = await dbAll<{
    id: string; name: string; slug: string; plan: string; status: string; created_at: string;
  }>(locals.db, `
    SELECT o.id, o.name, o.slug, s.plan, s.status, o.created_at
    FROM organizations o
    LEFT JOIN subscriptions s ON s.org_id = o.id
    ORDER BY o.created_at DESC
    LIMIT 10
  `);

  // Work queues that wait on the platform team, so the overview says what needs doing.
  const fpOpen = await dbFirst<{ n: string }>(locals.db,
    `SELECT COUNT(*) AS n FROM floorplan_requests WHERE status IN ('requested','contacted','scheduled')`).catch(() => null);
  const setupOpen = await dbFirst<{ n: string }>(locals.db,
    `SELECT COUNT(*) AS n FROM setup_requests WHERE status IN ('requested','contacted','in_progress')`).catch(() => null);

  const num = (v: string | undefined) => Number(v ?? 0);

  return {
    // A bare aggregate SELECT always yields one row; the fallback keeps the type
    // honest and renders zeros instead of pushing a null check into every card.
    stats: {
      totalOrgs: num(stats?.total_orgs),
      suspendedOrgs: num(stats?.suspended_orgs),
      closedOrgs: num(stats?.closed_orgs),
      totalUsers: num(stats?.total_users),
      platformAdmins: num(stats?.platform_admins),
      activeSubscriptions: num(stats?.active_subscriptions),
      manualPlans: num(stats?.manual_plans),
      partners: num(stats?.partners),
      totalReservations: num(stats?.total_reservations),
      orgs7d: num(stats?.orgs_7d), users7d: num(stats?.users_7d), reservations7d: num(stats?.reservations_7d),
      orgs30d: num(stats?.orgs_30d), users30d: num(stats?.users_30d), reservations30d: num(stats?.reservations_30d),
    },
    // Down = every email is failing (key missing or refused), not one bad address.
    emailHealth: await getEmailHealth(locals.db),
    health: {
      emailSent: num(email?.sent),
      emailFailed: num(email?.failed),
      webhooksDelivered: num(webhooks?.delivered),
      webhooksFailed: num(webhooks?.failed),
      webhooksPending: num(webhooks?.pending),
    },
    plans: plans.map((p) => ({ plan: p.plan, count: num(p.count) })),
    reservationStatus: reservationStatus.map((r) => ({ status: r.status, count: num(r.count) })),
    admins,
    migrations,
    config,
    slaTarget: SLA.uptimeTargetEn,
    recentOrgs,
    queues: { floorplan: num(fpOpen?.n), setup: num(setupOpen?.n) },
  };
};
