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
    'SELECT COUNT(*) AS n FROM halls WHERE org_id = ? AND plan_locked = 0 AND archived_at IS NULL', orgId);
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

export interface PlanLimitChange {
  /** Halls suspended by this call (they were active, the plan has no room for them). */
  locked: { id: string; name: string }[];
  /** Halls brought back by this call (the plan has room for them again). */
  unlocked: { id: string; name: string }[];
}

/** Apply hall limits after a (possible) plan change, in both directions.
 *
 *  - More active halls than the plan allows: the plan's number of halls stay active
 *    (public ones first, then the oldest) and only the rest are suspended. Locking
 *    every hall used to take the whole venue site down, even the hall Free allows.
 *  - Room under the plan and halls suspended by an earlier downgrade: they come back
 *    (up to the limit), public again if they were public when suspended.
 *
 *  A suspended hall is made private, because venue-site queries read `is_public`;
 *  `public_before_lock` remembers what it was. Archived halls are never touched. */
export async function enforcePlanLimits(db: D1Database, orgId: string, plan: PlanId): Promise<PlanLimitChange> {
  const limit = getPlan(plan).limits.maxHalls;
  const change: PlanLimitChange = { locked: [], unlocked: [] };
  const active = await dbAll<{ id: string; name: string }>(db,
    `SELECT id, name FROM halls WHERE org_id = ? AND plan_locked = 0 AND archived_at IS NULL
      ORDER BY is_public DESC, created_at ASC, id ASC`, orgId);

  if (limit !== -1 && active.length > limit) {
    for (const hall of active.slice(limit)) {
      await lockHall(db, orgId, hall.id);
      change.locked.push(hall);
    }
    return change;
  }

  const room = limit === -1 ? Infinity : limit - active.length;
  if (room <= 0) return change;
  const locked = await dbAll<{ id: string; name: string }>(db,
    `SELECT id, name FROM halls WHERE org_id = ? AND plan_locked = 1 AND archived_at IS NULL
      ORDER BY COALESCE(public_before_lock, 0) DESC, created_at ASC, id ASC`, orgId);
  for (const hall of locked.slice(0, room)) {
    await unlockHall(db, orgId, hall.id);
    change.unlocked.push(hall);
  }
  return change;
}

/** Suspend a hall for the plan: private (venue-site queries read `is_public`), with
 *  `public_before_lock` remembering what it was so unlocking can restore it. */
export async function lockHall(db: D1Database, orgId: string, hallId: string): Promise<void> {
  await dbRun(db,
    `UPDATE halls SET plan_locked = 1, public_before_lock = is_public, is_public = 0
      WHERE id = ? AND org_id = ? AND plan_locked = 0`, hallId, orgId);
}

/** The plan is full: suspend `pauseId` and bring `reactivateId` back in its place
 *  (B84). Both go through lockHall/unlockHall, so each keeps its visibility: the
 *  swap used to leave the reactivated hall a draft and the paused one with nothing
 *  to restore. Undone, visibility included, when the plan still has no room.
 *  Returns whether the swap happened. */
export async function swapActiveHall(
  db: D1Database, orgId: string, plan: PlanId, reactivateId: string, pauseId: string
): Promise<boolean> {
  await lockHall(db, orgId, pauseId);
  if (!(await canAddHall(db, orgId, plan))) {
    await unlockHall(db, orgId, pauseId);
    return false;
  }
  await unlockHall(db, orgId, reactivateId);
  return true;
}

/** Lift a plan lock and restore the hall's visibility from before the lock. Callers
 *  check the plan's room first (canAddHall). */
export async function unlockHall(db: D1Database, orgId: string, hallId: string): Promise<void> {
  await dbRun(db,
    `UPDATE halls SET plan_locked = 0, is_public = COALESCE(public_before_lock, is_public), public_before_lock = NULL
      WHERE id = ? AND org_id = ? AND plan_locked = 1`, hallId, orgId);
}

/** Halls currently suspended by the plan. */
export async function lockedHalls(db: D1Database, orgId: string): Promise<{ id: string; name: string }[]> {
  return dbAll<{ id: string; name: string }>(db,
    'SELECT id, name FROM halls WHERE org_id = ? AND plan_locked = 1 AND archived_at IS NULL ORDER BY name', orgId);
}
