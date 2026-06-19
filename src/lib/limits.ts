// ─── Plan-limit enforcement helpers ───────────────────────────────────────
// Counts live in D1; the numbers come from plans.ts. Keep all enforcement here
// so every call site (hall create, booking, invites, downgrade) agrees.

import { dbFirst, dbAll, dbRun } from '$lib/db/index';
import { getPlan } from '$lib/plans';
import type { PlanId } from '$lib/plans';
import type { D1Database } from '@cloudflare/workers-types';

/** The 'YYYY-MM' key for an event date string (reservations are capped per this). */
export function monthKey(eventDate: string): string {
  return String(eventDate).slice(0, 7);
}

/** Non-cancelled reservations a hall already has in the given event's month. */
export async function reservationsInHallMonth(db: D1Database, hallId: string, eventDate: string): Promise<number> {
  const row = await dbFirst<{ n: number }>(db,
    "SELECT COUNT(*) AS n FROM reservations WHERE hall_id = ? AND status != 'cancelled' AND substr(event_date, 1, 7) = ?",
    hallId, monthKey(eventDate));
  return row?.n ?? 0;
}

/** Whether a new reservation on `eventDate` would exceed the plan's per-hall/month cap. */
export async function reservationCapReached(
  db: D1Database, hallId: string, eventDate: string, plan: PlanId
): Promise<{ reached: boolean; limit: number; used: number }> {
  const limit = getPlan(plan).limits.maxReservationsPerHallMonth;
  if (limit === -1) return { reached: false, limit, used: 0 };
  const used = await reservationsInHallMonth(db, hallId, eventDate);
  return { reached: used >= limit, limit, used };
}

/** Active (non-plan-locked) halls in an org. */
export async function activeHallCount(db: D1Database, orgId: string): Promise<number> {
  const row = await dbFirst<{ n: number }>(db,
    'SELECT COUNT(*) AS n FROM halls WHERE org_id = ? AND plan_locked = 0', orgId);
  return row?.n ?? 0;
}

/** Whether the org can have one more active hall. */
export async function canAddHall(db: D1Database, orgId: string, plan: PlanId): Promise<boolean> {
  const limit = getPlan(plan).limits.maxHalls;
  if (limit === -1) return true;
  return (await activeHallCount(db, orgId)) < limit;
}

/** Members currently in an org (used to enforce the seat cap on invite). */
export async function memberCount(db: D1Database, orgId: string): Promise<number> {
  const row = await dbFirst<{ n: number }>(db,
    'SELECT COUNT(*) AS n FROM organization_members WHERE org_id = ?', orgId);
  return row?.n ?? 0;
}

export async function canAddMember(db: D1Database, orgId: string, plan: PlanId): Promise<boolean> {
  const limit = getPlan(plan).limits.maxMembers;
  if (limit === -1) return true;
  return (await memberCount(db, orgId)) < limit;
}

/** Whether the hall can have one more bookable extra under the org's plan. */
export async function canAddExtra(db: D1Database, hallId: string, plan: PlanId): Promise<boolean> {
  const limit = getPlan(plan).limits.maxExtrasPerHall;
  if (limit === -1) return true;
  const row = await dbFirst<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM hall_extras WHERE hall_id = ?', hallId);
  return (row?.n ?? 0) < limit;
}

/** Apply hall limits after a (possible) plan change: if the org now has more
 *  ACTIVE halls than the plan allows, lock ALL of them (private + suspended) so
 *  the owner can deliberately reactivate up to the new limit. No-op otherwise. */
export async function enforcePlanLimits(db: D1Database, orgId: string, plan: PlanId): Promise<void> {
  const limit = getPlan(plan).limits.maxHalls;
  if (limit === -1) return;
  const active = await activeHallCount(db, orgId);
  if (active <= limit) return;
  await dbRun(db, 'UPDATE halls SET plan_locked = 1, is_public = 0 WHERE org_id = ?', orgId);
}

/** Lock a single hall (used when an owner reactivates and we want to swap). */
export async function lockedHalls(db: D1Database, orgId: string): Promise<{ id: string; name: string }[]> {
  return dbAll<{ id: string; name: string }>(db,
    'SELECT id, name FROM halls WHERE org_id = ? AND plan_locked = 1 ORDER BY name', orgId);
}
