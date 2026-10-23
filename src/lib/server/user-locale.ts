// Which language a person reads, so emails can be sent in it.
//
// users.locale (migration 0016) is written when someone signed in picks a language:
// the switcher sets the hallify-lang cookie, and hooks.server.ts copies an explicit
// choice (cookie or ?lang=) onto the account. NULL means never chosen; senders then
// fall back to the organisation's default language, then to Slovak.

import { dbFirst, dbRun } from '$lib/db/index';
import type { D1Database } from '@cloudflare/workers-types';

export type UserLocale = 'sk' | 'en';

export const isUserLocale = (v: unknown): v is UserLocale => v === 'sk' || v === 'en';

/** What this isolate last wrote per user, so the UPDATE runs once per change, not on
 *  every request. Bounded: cleared when it grows past a few thousand entries. */
const synced = new Map<string, UserLocale>();
const SYNC_CACHE_MAX = 5000;

/** Record the language a signed-in person chose. Returns the write (or null when it
 *  is already known), for the caller to keep alive; failures are swallowed, since
 *  the column may not exist yet on a database that has not run 0016. */
export function syncUserLocale(db: D1Database, userId: string, locale: UserLocale): Promise<void> | null {
	if (synced.get(userId) === locale) return null;
	if (synced.size >= SYNC_CACHE_MAX) synced.clear();
	synced.set(userId, locale);
	return dbRun(db, 'UPDATE users SET locale = ? WHERE id = ? AND (locale IS NULL OR locale != ?)', locale, userId, locale)
		.then(() => undefined)
		.catch(() => { synced.delete(userId); });
}

/** The organisation's default language (Settings → its 'locale' key), if set. */
export async function orgDefaultLocale(db: D1Database, orgId: string | null | undefined): Promise<UserLocale | null> {
	if (!orgId) return null;
	try {
		const row = await dbFirst<{ value: string }>(db, "SELECT value FROM org_settings WHERE org_id = ? AND key = 'locale'", orgId);
		const lang = row?.value ? (JSON.parse(row.value as string) as { default?: unknown }).default : null;
		return isUserLocale(lang) ? lang : null;
	} catch {
		return null;
	}
}

/** The stored language of the account behind an address. The same address can hold
 *  a staff account and client accounts on several venue sites; the one belonging to
 *  `orgId` wins, then the staff account. */
export async function storedLocaleForEmail(db: D1Database, email: string, orgId?: string | null): Promise<UserLocale | null> {
	try {
		const row = await dbFirst<{ locale: string | null }>(db,
			`SELECT locale FROM users
			  WHERE email = ? AND locale IS NOT NULL
			  ORDER BY CASE WHEN org_id = ? THEN 0 WHEN org_id IS NULL THEN 1 ELSE 2 END
			  LIMIT 1`,
			email, orgId ?? '');
		return isUserLocale(row?.locale) ? row!.locale as UserLocale : null;
	} catch {
		return null;
	}
}

export async function storedLocaleForUser(db: D1Database, userId: string | null | undefined): Promise<UserLocale | null> {
	if (!userId) return null;
	try {
		const row = await dbFirst<{ locale: string | null }>(db, 'SELECT locale FROM users WHERE id = ?', userId);
		return isUserLocale(row?.locale) ? row!.locale as UserLocale : null;
	} catch {
		return null;
	}
}

/** The language to write to `email` in: their own choice, else the venue's default,
 *  else Slovak. */
export async function recipientLocale(db: D1Database, email: string, orgId?: string | null): Promise<UserLocale> {
	return (await storedLocaleForEmail(db, email, orgId)) ?? (await orgDefaultLocale(db, orgId)) ?? 'sk';
}
