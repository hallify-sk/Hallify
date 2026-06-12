import sql from '$lib/db/index';
import type { UserRow } from '$lib/db/index';
import type { Cookies } from '@sveltejs/kit';

const COOKIE = 'session_id';
const TTL_DAYS = 30;

export type SessionUser = Pick<UserRow, 'id' | 'email' | 'first_name' | 'last_name' | 'is_platform_admin' | 'account_type'>;

/** Create a new session, set the cookie, return the session id.
 *  Automatically sets current_org_id to the user's first org. */
export async function createSession(userId: string, cookies: Cookies): Promise<string> {
  const expiresAt = new Date(Date.now() + TTL_DAYS * 86_400_000);

  const [firstOrg] = await sql<{ org_id: string }[]>`
    SELECT org_id FROM organization_members
    WHERE user_id = ${userId}
    ORDER BY joined_at
    LIMIT 1
  `;

  const [{ id }] = await sql<[{ id: string }]>`
    INSERT INTO sessions (user_id, expires_at, current_org_id)
    VALUES (${userId}, ${expiresAt}, ${firstOrg?.org_id ?? null})
    RETURNING id
  `;

  cookies.set(COOKIE, id, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: false, // set true in production
    maxAge: TTL_DAYS * 86400,
  });
  return id;
}

/** Read the session cookie and return the associated user + current org id, or null. */
export async function getSessionUser(
  cookies: Cookies
): Promise<(SessionUser & { currentOrgId: string | null; sessionId: string }) | null> {
  const sessionId = cookies.get(COOKIE);
  if (!sessionId) return null;

  const rows = await sql<(SessionUser & { current_org_id: string | null })[]>`
    SELECT u.id, u.email, u.first_name, u.last_name, u.is_platform_admin, u.account_type, s.current_org_id
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.id = ${sessionId}
      AND s.expires_at > NOW()
  `;
  const row = rows[0];
  if (!row) return null;

  return { ...row, currentOrgId: row.current_org_id, sessionId };
}

/** Switch the active org for a session. */
export async function switchOrg(sessionId: string, orgId: string): Promise<void> {
  await sql`UPDATE sessions SET current_org_id = ${orgId} WHERE id = ${sessionId}`;
}

/** Delete the session from DB and clear the cookie. */
export async function deleteSession(cookies: Cookies): Promise<void> {
  const sessionId = cookies.get(COOKIE);
  if (sessionId) {
    await sql`DELETE FROM sessions WHERE id = ${sessionId}`;
  }
  cookies.delete(COOKIE, { path: '/' });
}
