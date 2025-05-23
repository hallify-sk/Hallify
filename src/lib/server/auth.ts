import { hash, verify } from '@node-rs/argon2';
import { sha256 } from '@oslojs/crypto/sha2';
import { encodeBase32LowerCaseNoPadding, encodeHexLowerCase } from '@oslojs/encoding';
import { type Permission, type User, type UserSession, users, userSessions } from './schema';
import type { Cookies } from '@sveltejs/kit';
import { minimatch } from 'minimatch';
import { parsePermissionPaths } from '$lib/util';
import { db } from './db';
import { eq, getTableColumns } from 'drizzle-orm';

export async function hashPassword(password: string): Promise<string> {
	return await hash(password, {
		algorithm: 2,
		memoryCost: 19456,
		timeCost: 2,
		outputLen: 32,
		parallelism: 1
	});
}

export async function checkPermission(
	permission: Permission,
	accessed_path: string
): Promise<boolean> {
	const { allowed_paths, disallowed_paths } = parsePermissionPaths(permission);
	const foundAllowed = allowed_paths.some((path) => {
		if (minimatch(accessed_path, path)) {
			return true;
		} else {
			return false;
		}
	});
	const foundDisallowed = disallowed_paths.some((path) => {
		if (minimatch(accessed_path, path)) {
			return true;
		} else {
			return false;
		}
	});
	if (foundDisallowed) {
		return false;
	} else {
		return foundAllowed;
	}
}

export async function validatePassword(password: string, hash: string): Promise<boolean> {
	return await verify(hash, password);
}

export function generateSessionToken(): string {
	const bytes = new Uint8Array(20);
	crypto.getRandomValues(bytes);
	const token = encodeBase32LowerCaseNoPadding(bytes);
	return token;
}

export async function createSession(token: string, userId: number): Promise<UserSession> {
	const sessionId = encodeHexLowerCase(sha256(new TextEncoder().encode(token)));
	const session = await db
		.insert(userSessions)
		.values({
			id: sessionId,
			user_id: userId,
			expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30)
		})
		.returning();
	return session[0];
}

export async function validateSessionToken(token: string): Promise<SessionValidationResult> {
	const sessionId = encodeHexLowerCase(sha256(new TextEncoder().encode(token)));
	const session = (
		await db.select().from(userSessions).where(eq(userSessions.id, sessionId)).limit(1)
	)[0];

	if (!session) {
		return { session: null, user: null };
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const { password_hash, ...rest } = getTableColumns(users);

	const user = (
		await db
			.select({ ...rest })
			.from(users)
			.where(eq(users.id, session.user_id))
			.limit(1)
	)[0];

	if (!user) {
		//Something went horribly wrong, maybe the user was deleted and tried to login again with the same session token
		//Shouldn't happen, but just in case
		//Also TypeScript doesn't bite me now
		await db.delete(userSessions).where(eq(userSessions.id, sessionId));
		return { session: null, user: null };
	}

	if (Date.now() >= session.expires_at.getTime()) {
		await db.delete(userSessions).where(eq(userSessions.id, sessionId));
		return { session: null, user: null };
	}
	if (Date.now() >= session.expires_at.getTime() - 1000 * 60 * 60 * 24 * 15) {
		session.expires_at = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
		await db
			.update(userSessions)
			.set({ expires_at: session.expires_at })
			.where(eq(userSessions.id, sessionId));
	}
	return { session, user };
}

export type UserWithoutPassword = Omit<User, 'password_hash'>;

export type SessionValidationResult =
	| { session: UserSession; user: UserWithoutPassword }
	| { session: null; user: null };

export async function invalidateSession(sessionId: string): Promise<void> {
	const session = (
		await db.select().from(userSessions).where(eq(userSessions.id, sessionId)).limit(1)
	)[0];
	if (!session) {
		return;
	}
	await db.delete(userSessions).where(eq(userSessions.id, sessionId));
}

export function setSessionTokenCookie(cookies: Cookies, token: string, expiresAt: Date): void {
	cookies.set('session', token, {
		httpOnly: true,
		sameSite: 'lax',
		expires: expiresAt,
		path: '/'
	});
}

export function deleteSessionTokenCookie(cookies: Cookies): void {
	cookies.set('session', '', {
		httpOnly: true,
		sameSite: 'lax',
		maxAge: 0,
		path: '/'
	});
}
