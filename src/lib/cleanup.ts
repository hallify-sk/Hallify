/** Reaping of expired rows.
 *
 *  Only `reservation_holds` was ever cleaned (inline, on request). Sessions,
 *  password-reset tokens, org/reservation invites and rate-limit counters accumulated
 *  forever — unbounded growth, and expired-but-present auth rows are a liability of
 *  their own.
 *
 *  Driven hourly by the Cron Trigger in wrangler.toml: `worker.js` adds a `scheduled`
 *  handler that calls POST /api/cron/cleanup (src/lib/server/scheduled.ts). hooks.server.ts
 *  also runs it opportunistically off traffic as a fallback. Safe to run concurrently
 *  and repeatedly.
 */
import { dbRun } from '$lib/db/index';
import type { D1Database } from '@cloudflare/workers-types';

export interface CleanupResult {
  task: string;
  changes: number;
  error?: string;
}

/** Each entry is independent: one failing must not stop the rest.
 *
 *  Sessions, resets and invites store expires_at as an ISO string with a 'T' and a 'Z';
 *  compared as text with datetime('now') ('YYYY-MM-DD HH:MM:SS') a row expiring today
 *  looked alive until midnight UTC. Those columns go through datetime() first. */
const TASKS: { task: string; sql: string }[] = [
  // Sessions carry a 30-day TTL; getSessionUser already ignores expired ones.
  { task: 'sessions', sql: "DELETE FROM sessions WHERE datetime(expires_at) <= datetime('now')" },
  // One-hour reset tokens, and any already consumed.
  { task: 'password_resets', sql: "DELETE FROM password_resets WHERE datetime(expires_at) <= datetime('now') OR used = 1" },
  // 14-day invites, plus accepted ones that no longer serve a purpose.
  { task: 'organization_invites', sql: "DELETE FROM organization_invites WHERE datetime(expires_at) <= datetime('now') OR accepted_at IS NOT NULL" },
  { task: 'reservation_invites', sql: "DELETE FROM reservation_invites WHERE datetime(expires_at) <= datetime('now')" },
  // Holds are swept inline too, but a stuck request could leave strays.
  { task: 'reservation_holds', sql: "DELETE FROM reservation_holds WHERE expires_at <= datetime('now')" },
  // Rate-limit windows are minutes/hours long; anything a day old is dead weight.
  { task: 'rate_limits', sql: "DELETE FROM rate_limits WHERE window_start <= datetime('now', '-1 day')" },
  // Delivered webhook attempts and email logs are diagnostic; keep 90 days.
  { task: 'webhook_deliveries', sql: "DELETE FROM webhook_deliveries WHERE delivered_at <= datetime('now', '-90 days')" },
  { task: 'email_log', sql: "DELETE FROM email_log WHERE created_at <= datetime('now', '-90 days')" },
  // MCP: expired tokens and codes (stored as datetime() text, compared directly), and
  // connections that are revoked or have no token left, after 90 days.
  { task: 'mcp_tokens', sql: "DELETE FROM mcp_tokens WHERE expires_at <= datetime('now')" },
  { task: 'mcp_auth_codes', sql: "DELETE FROM mcp_auth_codes WHERE expires_at <= datetime('now', '-1 day')" },
  { task: 'mcp_grants', sql: "DELETE FROM mcp_grants WHERE created_at <= datetime('now', '-90 days') AND NOT EXISTS (SELECT 1 FROM mcp_tokens t WHERE t.grant_id = mcp_grants.id)" },
  // Registered clients nobody ever approved.
  { task: 'mcp_clients', sql: "DELETE FROM mcp_clients WHERE created_at <= datetime('now', '-30 days') AND NOT EXISTS (SELECT 1 FROM mcp_grants g WHERE g.client_id = mcp_clients.id) AND NOT EXISTS (SELECT 1 FROM mcp_auth_codes a WHERE a.client_id = mcp_clients.id)" },
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
