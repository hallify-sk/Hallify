import { dbAll, dbFirst, dbRun } from '$lib/db/index';
import type { UserRow } from '$lib/db/index';
import { dev } from '$app/environment';
import type { Cookies } from '@sveltejs/kit';
import type { D1Database } from '@cloudflare/workers-types';

const COOKIE = 'session_id';
const TTL_DAYS = 30;

export type SessionUser = Pick<UserRow, 'id' | 'email' | 'first_name' | 'last_name' | 'is_platform_admin' | 'account_type' | 'org_id'>;

/** Create a new session, set the cookie, return the session id.
 *  Automatically sets current_org_id to the user's first org. */
export async function createSession(userId: string, cookies: Cookies, db: D1Database): Promise<string> {
  const expiresAt = new Date(Date.now() + TTL_DAYS * 86_400_000).toISOString();

  const firstOrg = await dbFirst<{ org_id: string }>(db, 'SELECT org_id FROM organization_members WHERE user_id = ? ORDER BY joined_at LIMIT 1', userId);

  const id = crypto.randomUUID();
  await dbRun(db, 'INSERT INTO sessions (id, user_id, expires_at, current_org_id) VALUES (?, ?, ?, ?)', id, userId, expiresAt, firstOrg?.org_id ?? null);

  cookies.set(COOKIE, id, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: !dev, // HTTPS-only everywhere except local dev (localhost is plain HTTP)
    maxAge: TTL_DAYS * 86400,
  });
  return id;
}

/** Read the session cookie and return the associated user + current org id, or null.
 *
 *  `domainOrgId` is the org owning the current request's bubble (null on the main app).
 *  It enforces tenant isolation: a client is only "logged in" inside its own bubble,
 *  and org/platform users are never "logged in" inside a bubble. A mismatch returns
 *  null (treated as logged-out — the cookie is inert in the wrong context). */
export async function getSessionUser(
  cookies: Cookies,
  db: D1Database,
  domainOrgId: string | null = null
): Promise<(SessionUser & { currentOrgId: string | null; sessionId: string }) | null> {
  const sessionId = cookies.get(COOKIE);
  if (!sessionId) return null;

  const row = await dbFirst<SessionUser & { current_org_id: string | null }>(db, 'SELECT u.id, u.email, u.first_name, u.last_name, u.is_platform_admin, u.account_type, u.org_id, s.current_org_id FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > datetime(\'now\')', sessionId);
  if (!row) return null;

  // Tenant isolation (defense-in-depth on top of host-scoped cookies):
  if (row.account_type === 'client') {
    // A client may only be active inside the bubble of its own org.
    if (!domainOrgId || row.org_id !== domainOrgId) return null;
  } else if (domainOrgId) {
    // Org/platform users may be active inside a bubble ONLY if they are a member
    // of that bubble's org — this lets a venue owner sign in and manage from
    // their own domain. Anyone who is not a member gets no session here.
    const member = await dbFirst<{ ok: number }>(
      db,
      'SELECT 1 AS ok FROM organization_members WHERE user_id = ? AND org_id = ? LIMIT 1',
      row.id,
      domainOrgId
    );
    if (!member) return null;
  }

  return { ...row, is_platform_admin: row.is_platform_admin ? 1 : 0, currentOrgId: row.current_org_id, sessionId };
}

/** Switch the active org for a session. */
export async function switchOrg(sessionId: string, orgId: string, db: D1Database): Promise<void> {
  await dbRun(db, 'UPDATE sessions SET current_org_id = ? WHERE id = ?', orgId, sessionId);
}

/** Delete the session from DB and clear the cookie. */
export async function deleteSession(cookies: Cookies, db: D1Database): Promise<void> {
  const sessionId = cookies.get(COOKIE);
  if (sessionId) await dbRun(db, 'DELETE FROM sessions WHERE id = ?', sessionId);
  cookies.delete(COOKIE, { path: '/' });
}
