/** Fixed-window rate limiting backed by D1.
 *
 *  Deliberately application-level rather than a Cloudflare WAF rule or the Workers
 *  rate-limit binding: this works identically on local dev, dev-remote and prod, needs
 *  no dashboard configuration, and can be tested. The cost is one D1 upsert per guarded
 *  attempt, which is negligible at the volumes these endpoints see.
 *
 *  Fixed windows can allow up to 2x the limit across a window boundary. That is fine
 *  for the abuse this guards against (credential stuffing, email bombing); it is not a
 *  billing meter.
 */
import { dbFirst, dbRun } from '$lib/db/index';
import type { D1Database } from '@cloudflare/workers-types';

export interface RateLimitResult {
  /** False when the caller has exceeded the limit and should be rejected. */
  ok: boolean;
  /** Seconds until the current window expires (0 when ok). */
  retryAfter: number;
  /** Whole minutes until retry, minimum 1 — for user-facing copy. */
  retryAfterMinutes: number;
}

export interface RateLimitRule {
  limit: number;
  windowSeconds: number;
}

/** Tuned per surface. Generous enough for a person who mistypes, tight enough that
 *  automated guessing is pointless. */
export const RATE_LIMITS = {
  /** Sign-in attempts from one IP. */
  loginIp:          { limit: 20, windowSeconds: 15 * 60 },
  /** Sign-in attempts against one account — stops slow credential stuffing. */
  loginEmail:       { limit: 8,  windowSeconds: 15 * 60 },
  /** Account creation from one IP. */
  register:         { limit: 5,  windowSeconds: 60 * 60 },
  /** Password-reset requests from one IP (email bombing). */
  forgotIp:         { limit: 8,  windowSeconds: 60 * 60 },
  /** Password-reset requests for one address. */
  forgotEmail:      { limit: 4,  windowSeconds: 60 * 60 },
  /** Reset-token submissions from one IP (token guessing). */
  resetToken:       { limit: 15, windowSeconds: 15 * 60 },
  /** Image uploads per user. */
  upload:           { limit: 60, windowSeconds: 60 * 60 },
} as const satisfies Record<string, RateLimitRule>;

/** Consume one unit against `key`. Call once per attempt, before doing the work.
 *
 *  Never throws: if the counter can't be read or written the request is allowed
 *  through, because a rate limiter must not take the whole site down with it. */
export async function rateLimit(
  db: D1Database,
  key: string,
  rule: RateLimitRule
): Promise<RateLimitResult> {
  const expiry = `-${rule.windowSeconds} seconds`;

  try {
    // One statement: start a window, or increment within the live one, or reset an
    // expired one. RETURNING avoids a second round trip.
    const row = await dbFirst<{ count: number; window_start: string }>(
      db,
      `INSERT INTO rate_limits (key, count, window_start)
         VALUES (?, 1, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET
         count        = CASE WHEN rate_limits.window_start <= datetime('now', ?) THEN 1 ELSE rate_limits.count + 1 END,
         window_start = CASE WHEN rate_limits.window_start <= datetime('now', ?) THEN datetime('now') ELSE rate_limits.window_start END
       RETURNING count, window_start`,
      key, expiry, expiry
    );

    if (!row) return allow();

    // Opportunistic sweep, only when a brand-new window opened, so it stays cheap.
    if (row.count === 1) {
      dbRun(db, "DELETE FROM rate_limits WHERE window_start <= datetime('now', '-1 day')").catch(() => {});
    }

    if (row.count <= rule.limit) return allow();

    // window_start is 'YYYY-MM-DD HH:MM:SS' UTC from SQLite's datetime().
    const startedAt = Date.parse(row.window_start.replace(' ', 'T') + 'Z');
    const elapsed = Number.isNaN(startedAt) ? 0 : Math.floor((Date.now() - startedAt) / 1000);
    const retryAfter = Math.max(1, rule.windowSeconds - elapsed);

    return {
      ok: false,
      retryAfter,
      retryAfterMinutes: Math.max(1, Math.ceil(retryAfter / 60)),
    };
  } catch {
    return allow();
  }
}

function allow(): RateLimitResult {
  return { ok: true, retryAfter: 0, retryAfterMinutes: 0 };
}

/** Build a counter key. Identifiers are lowercased so `A@b.com` and `a@b.com` share
 *  a bucket, and truncated so a hostile client can't bloat the table with long keys. */
export function rateLimitKey(bucket: string, identifier: string): string {
  return `${bucket}:${identifier.toLowerCase().slice(0, 200)}`;
}

/** Fill the {minutes} placeholder in the localized "too many attempts" message. */
export function tooManyAttemptsMessage(template: string, minutes: number): string {
  return template.replace('{minutes}', String(minutes));
}
