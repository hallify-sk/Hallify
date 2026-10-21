import { dbFirst, dbRun, fromJson, toJson } from '$lib/db/index';
import { normaliseServerUrl } from '$lib/analytics-servers';

/**
 * Settings that belong to Hallify itself, not to any organisation.
 *
 * Read on the root layout for every request, including the landing page and the
 * public bubbles, so everything here stays small and every read tolerates the
 * table not existing yet — migration 0009 may not have run on a given database,
 * and a missing settings row must never take the marketing site down.
 */

type Db = App.Locals['db'];

export const PLATFORM_KEYS = ['analytics', 'ai'] as const;
export type PlatformKey = (typeof PLATFORM_KEYS)[number];

export interface PlatformAnalytics {
  /** Hallify's own GTM container, run across the whole platform. */
  containerId: string;
  /** Whether it also runs on organisations' own public sites, beside their own
   *  container. On unless an admin turns it off. */
  includeBubbles: boolean;
  /** Server-side GTM origin (https://…), or '' to load from Google. */
  serverUrl: string;
}

export const DEFAULT_ANALYTICS: PlatformAnalytics = {
  containerId: '',
  includeBubbles: true,
  serverUrl: ''
};

export const GTM_PATTERN = /^GTM-[A-Z0-9]{4,}$/;

export async function readPlatformSetting<T>(db: Db, key: PlatformKey): Promise<T | null> {
  try {
    const row = await dbFirst<{ value: string | null }>(
      db,
      'SELECT value FROM platform_settings WHERE key = ?',
      key
    );
    return fromJson<T>(row?.value ?? null);
  } catch {
    // Pre-0009 the table does not exist. Unset, not broken.
    return null;
  }
}

export async function writePlatformSetting(
  db: Db,
  key: PlatformKey,
  value: unknown,
  userId: string | null
): Promise<void> {
  await dbRun(
    db,
    `INSERT OR REPLACE INTO platform_settings (key, value, updated_at, updated_by)
     VALUES (?, ?, datetime('now'), ?)`,
    key,
    toJson(value),
    userId
  );
}

/** Normalised, so a malformed or partial stored row still yields a usable object. */
export async function loadPlatformAnalytics(db: Db): Promise<PlatformAnalytics> {
  const stored = await readPlatformSetting<Partial<PlatformAnalytics>>(db, 'analytics');
  const id = String(stored?.containerId ?? '').trim().toUpperCase();
  return {
    containerId: GTM_PATTERN.test(id) ? id : '',
    includeBubbles: stored?.includeBubbles !== false,
    serverUrl: normaliseServerUrl(stored?.serverUrl) ?? ''
  };
}
