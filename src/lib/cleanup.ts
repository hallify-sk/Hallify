/** Reaping of expired rows.
 *
 *  Only `reservation_holds` was ever cleaned (inline, on request). Sessions,
 *  password-reset tokens, org/reservation invites and rate-limit counters accumulated
 *  forever — unbounded growth, and expired-but-present auth rows are a liability of
 *  their own.
 *
 *  Driven by the Cron Trigger in wrangler.toml (see `scheduled` in src/index.ts-style
 *  handler exported from hooks). Safe to run concurrently and repeatedly.
 */
import { dbRun } from '$lib/db/index';
import type { D1Database } from '@cloudflare/workers-types';

export interface CleanupResult {
  task: string;
  changes: number;
  error?: string;
}

/** Each entry is independent: one failing must not stop the rest. */
const TASKS: { task: string; sql: string }[] = [
  // Sessions carry a 30-day TTL; getSessionUser already ignores expired ones.
  { task: 'sessions', sql: "DELETE FROM sessions WHERE expires_at <= datetime('now')" },
  // One-hour reset tokens, and any already consumed.
  { task: 'password_resets', sql: "DELETE FROM password_resets WHERE expires_at <= datetime('now') OR used = 1" },
  // 14-day invites, plus accepted ones that no longer serve a purpose.
  { task: 'organization_invites', sql: "DELETE FROM organization_invites WHERE expires_at <= datetime('now') OR accepted_at IS NOT NULL" },
  { task: 'reservation_invites', sql: "DELETE FROM reservation_invites WHERE expires_at <= datetime('now')" },
  // Holds are swept inline too, but a stuck request could leave strays.
  { task: 'reservation_holds', sql: "DELETE FROM reservation_holds WHERE expires_at <= datetime('now')" },
  // Rate-limit windows are minutes/hours long; anything a day old is dead weight.
  { task: 'rate_limits', sql: "DELETE FROM rate_limits WHERE window_start <= datetime('now', '-1 day')" },
  // Delivered webhook attempts and email logs are diagnostic; keep 90 days.
  { task: 'webhook_deliveries', sql: "DELETE FROM webhook_deliveries WHERE delivered_at <= datetime('now', '-90 days')" },
  { task: 'email_log', sql: "DELETE FROM email_log WHERE created_at <= datetime('now', '-90 days')" },
];

export async function runCleanup(db: D1Database): Promise<CleanupResult[]> {
  const results: CleanupResult[] = [];
  for (const { task, sql } of TASKS) {
    try {
      const res = await dbRun(db, sql);
      results.push({ task, changes: res.meta?.changes ?? 0 });
    } catch (e) {
      results.push({ task, changes: 0, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return results;
}
