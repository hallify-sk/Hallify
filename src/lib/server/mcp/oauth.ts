import { dbAll, dbFirst, dbRun, wroteRow } from '$lib/db/index';

/**
 * The OAuth 2.1 authorization server behind /mcp.
 *
 * Small on purpose, and only what MCP needs: dynamic client registration (RFC 7591),
 * the authorization-code grant with PKCE S256 (no plain, no implicit, no password),
 * refresh tokens that rotate on every use with reuse detection, revocation
 * (RFC 7009) and resource indicators (RFC 8707) binding every token to this
 * server's /mcp.
 *
 * Nothing secret is stored: codes, tokens and client secrets are kept as SHA-256
 * hashes, so a copy of the database cannot be replayed against the API.
 *
 * A GRANT is one approval on the consent page. Tokens belong to a grant; revoking
 * the grant ends every token it issued.
 */

type Db = App.Locals['db'];

export const SCOPE_READ = 'mcp:read';
export const SCOPE_WRITE = 'mcp:write';
export const SUPPORTED_SCOPES = [SCOPE_READ, SCOPE_WRITE] as const;

export const ACCESS_TTL_SECONDS = 60 * 60;
export const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;
export const CODE_TTL_SECONDS = 10 * 60;

const MAX_REDIRECT_URIS = 10;
const MAX_CLIENT_NAME = 100;

// ── Primitives ────────────────────────────────────────────────────────────────

function base64url(bytes: Uint8Array): string {
	let s = '';
	for (const b of bytes) s += String.fromCharCode(b);
	return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sha256Hex(value: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** An unguessable value (256 bits), with a prefix so a leaked one is recognisable. */
export function randomSecret(prefix: string): string {
	return `${prefix}${base64url(crypto.getRandomValues(new Uint8Array(32)))}`;
}

/** Constant-time string comparison (both are hex hashes or base64url of fixed size). */
function safeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

const VERIFIER = /^[A-Za-z0-9\-._~]{43,128}$/;
const CHALLENGE = /^[A-Za-z0-9\-_]{43}$/;

export function isValidChallenge(challenge: unknown): challenge is string {
	return typeof challenge === 'string' && CHALLENGE.test(challenge);
}

/** PKCE S256 (RFC 7636 §4.6): BASE64URL(SHA256(verifier)) must equal the challenge. */
export async function pkceMatches(verifier: unknown, challenge: string): Promise<boolean> {
	if (typeof verifier !== 'string' || !VERIFIER.test(verifier)) return false;
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
	return safeEqual(base64url(new Uint8Array(digest)), challenge);
}

// ── Scopes ────────────────────────────────────────────────────────────────────

/** The supported scopes asked for, in canonical order. An empty request means
 *  everything (the consent page still defaults to read-only). Null when the request
 *  names a scope this server does not know. */
export function parseScope(raw: unknown): string[] | null {
	const asked = typeof raw === 'string' ? raw.split(/\s+/).filter(Boolean) : [];
	if (!asked.length) return [...SUPPORTED_SCOPES];
	if (asked.some((s) => !(SUPPORTED_SCOPES as readonly string[]).includes(s))) return null;
	return SUPPORTED_SCOPES.filter((s) => asked.includes(s));
}

/** What a grant can do: reading is always part of it. */
export function grantScope(allowWrites: boolean): string {
	return allowWrites ? `${SCOPE_READ} ${SCOPE_WRITE}` : SCOPE_READ;
}

export const canWrite = (scope: string) => scope.split(' ').includes(SCOPE_WRITE);

// ── Redirect URIs ─────────────────────────────────────────────────────────────

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

/** https anywhere, or http on the loopback interface (a desktop agent's local
 *  listener). No fragments, no credentials, nothing else. */
export function isAllowedRedirectUri(raw: unknown): raw is string {
	if (typeof raw !== 'string' || raw.length > 2000) return false;
	let u: URL;
	try {
		u = new URL(raw);
	} catch {
		return false;
	}
	if (u.hash || raw.includes('#') || u.username || u.password) return false;
	if (u.protocol === 'https:') return !!u.hostname;
	if (u.protocol === 'http:') return LOOPBACK.has(u.hostname);
	return false;
}

/** Exact match against a registered URI; for loopback, any port (RFC 8252 §7.3). */
export function redirectUriMatches(registered: string[], given: unknown): boolean {
	if (typeof given !== 'string' || !isAllowedRedirectUri(given)) return false;
	if (registered.includes(given)) return true;
	const g = new URL(given);
	if (g.protocol !== 'http:' || !LOOPBACK.has(g.hostname)) return false;
	return registered.some((r) => {
		const u = new URL(r);
		return u.protocol === 'http:' && u.hostname === g.hostname && u.pathname === g.pathname && u.search === g.search;
	});
}

// ── Clients (RFC 7591) ────────────────────────────────────────────────────────

export interface McpClient {
	id: string;
	name: string;
	redirectUris: string[];
	authMethod: 'none' | 'client_secret_post' | 'client_secret_basic';
	secretHash: string | null;
}

type ClientRow = { id: string; name: string; redirect_uris: string; auth_method: McpClient['authMethod']; secret_hash: string | null };

const toClient = (r: ClientRow): McpClient => ({
	id: r.id,
	name: r.name,
	redirectUris: (() => { try { return JSON.parse(r.redirect_uris) as string[]; } catch { return []; } })(),
	authMethod: r.auth_method,
	secretHash: r.secret_hash
});

export async function getClient(db: Db, id: unknown): Promise<McpClient | null> {
	if (typeof id !== 'string' || !id || id.length > 100) return null;
	const r = await dbFirst<ClientRow>(db, 'SELECT id, name, redirect_uris, auth_method, secret_hash FROM mcp_clients WHERE id = ?', id);
	return r ? toClient(r) : null;
}

/** Printable, single-line, bounded: the name is shown on the consent page and in
 *  activity logs, and is chosen by whoever registers. */
export function cleanClientName(raw: unknown): string {
	// eslint-disable-next-line no-control-regex
	const s = typeof raw === 'string' ? raw.replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, '').replace(/\s+/g, ' ').trim() : '';
	return s.slice(0, MAX_CLIENT_NAME) || 'MCP client';
}

export type RegisterResult =
	| { ok: true; body: Record<string, unknown> }
	| { ok: false; error: 'invalid_redirect_uri' | 'invalid_client_metadata'; description: string };

export async function registerClient(db: Db, meta: Record<string, unknown>): Promise<RegisterResult> {
	const uris = meta.redirect_uris;
	if (!Array.isArray(uris) || !uris.length || uris.length > MAX_REDIRECT_URIS) {
		return { ok: false, error: 'invalid_redirect_uri', description: `redirect_uris must list 1–${MAX_REDIRECT_URIS} URIs.` };
	}
	if (!uris.every(isAllowedRedirectUri)) {
		return { ok: false, error: 'invalid_redirect_uri', description: 'Redirect URIs must use https, or http on localhost / 127.0.0.1.' };
	}
	const method = (meta.token_endpoint_auth_method ?? 'none') as string;
	if (!['none', 'client_secret_post', 'client_secret_basic'].includes(method)) {
		return { ok: false, error: 'invalid_client_metadata', description: 'token_endpoint_auth_method must be none, client_secret_post or client_secret_basic.' };
	}
	const grantTypes = Array.isArray(meta.grant_types) ? meta.grant_types.map(String) : ['authorization_code', 'refresh_token'];
	if (!grantTypes.includes('authorization_code') || grantTypes.some((g) => !['authorization_code', 'refresh_token'].includes(g))) {
		return { ok: false, error: 'invalid_client_metadata', description: 'Only the authorization_code and refresh_token grants are supported.' };
	}
	const responseTypes = Array.isArray(meta.response_types) ? meta.response_types.map(String) : ['code'];
	if (responseTypes.some((r) => r !== 'code')) {
		return { ok: false, error: 'invalid_client_metadata', description: 'Only the code response type is supported.' };
	}
	if (meta.scope !== undefined && parseScope(meta.scope) === null) {
		return { ok: false, error: 'invalid_client_metadata', description: `Unknown scope. Supported: ${SUPPORTED_SCOPES.join(' ')}.` };
	}

	const id = `hfy_client_${base64url(crypto.getRandomValues(new Uint8Array(16)))}`;
	const name = cleanClientName(meta.client_name);
	const secret = method === 'none' ? null : randomSecret('hfy_cs_');
	const clientUri = typeof meta.client_uri === 'string' && /^https:\/\//.test(meta.client_uri) ? meta.client_uri.slice(0, 300) : null;
	const redirectUris = [...new Set(uris as string[])];
	await dbRun(db,
		'INSERT INTO mcp_clients (id, name, redirect_uris, auth_method, secret_hash, client_uri) VALUES (?, ?, ?, ?, ?, ?)',
		id, name, JSON.stringify(redirectUris), method, secret ? await sha256Hex(secret) : null, clientUri);

	return {
		ok: true,
		body: {
			client_id: id,
			client_id_issued_at: Math.floor(Date.now() / 1000),
			client_name: name,
			redirect_uris: redirectUris,
			grant_types: ['authorization_code', 'refresh_token'],
			response_types: ['code'],
			token_endpoint_auth_method: method,
			scope: SUPPORTED_SCOPES.join(' '),
			...(clientUri ? { client_uri: clientUri } : {}),
			...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {})
		}
	};
}

/** Client authentication at the token and revocation endpoints. A public client
 *  proves nothing here (PKCE does that); a confidential one must present its secret
 *  the way it registered. */
export async function authenticateClient(
	db: Db,
	params: { clientId: unknown; clientSecret: unknown; authorization: string | null }
): Promise<McpClient | null> {
	let id = params.clientId;
	let secret = params.clientSecret;
	let viaBasic = false;
	const auth = params.authorization;
	if (auth?.toLowerCase().startsWith('basic ')) {
		try {
			const [u, p] = atob(auth.slice(6).trim()).split(':');
			id = decodeURIComponent(u ?? '');
			secret = decodeURIComponent(p ?? '');
			viaBasic = true;
		} catch {
			return null;
		}
	}
	const client = await getClient(db, id);
	if (!client) return null;
	if (client.authMethod === 'none') return client;
	if (typeof secret !== 'string' || !secret || !client.secretHash) return null;
	if (client.authMethod === 'client_secret_basic' && !viaBasic) return null;
	return safeEqual(await sha256Hex(secret), client.secretHash) ? client : null;
}

// ── Authorization codes ──────────────────────────────────────────────────────

export async function createAuthCode(
	db: Db,
	a: { clientId: string; userId: string; redirectUri: string; codeChallenge: string; scope: string; resource: string }
): Promise<string> {
	const code = randomSecret('hfy_code_');
	await dbRun(db,
		`INSERT INTO mcp_auth_codes (code_hash, client_id, user_id, redirect_uri, code_challenge, scope, resource, expires_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', ?))`,
		await sha256Hex(code), a.clientId, a.userId, a.redirectUri, a.codeChallenge, a.scope, a.resource, `+${CODE_TTL_SECONDS} seconds`);
	return code;
}

// ── Tokens ───────────────────────────────────────────────────────────────────

export interface TokenResponse {
	access_token: string;
	token_type: 'Bearer';
	expires_in: number;
	refresh_token: string;
	scope: string;
}

export type TokenError = { error: 'invalid_grant' | 'invalid_request' | 'invalid_scope' | 'invalid_target'; error_description: string };

async function issuePair(db: Db, grantId: string, scope: string): Promise<TokenResponse> {
	const access = randomSecret('hfy_at_');
	const refresh = randomSecret('hfy_rt_');
	await dbRun(db,
		`INSERT INTO mcp_tokens (token_hash, grant_id, kind, expires_at) VALUES (?, ?, 'access', datetime('now', ?))`,
		await sha256Hex(access), grantId, `+${ACCESS_TTL_SECONDS} seconds`);
	await dbRun(db,
		`INSERT INTO mcp_tokens (token_hash, grant_id, kind, expires_at) VALUES (?, ?, 'refresh', datetime('now', ?))`,
		await sha256Hex(refresh), grantId, `+${REFRESH_TTL_SECONDS} seconds`);
	return { access_token: access, token_type: 'Bearer', expires_in: ACCESS_TTL_SECONDS, refresh_token: refresh, scope };
}

/** authorization_code → tokens. The code is consumed before anything is checked, so
 *  it works once; presenting it again revokes whatever it was exchanged for
 *  (RFC 6749 §10.5 — a replayed code means it leaked). */
export async function exchangeCode(
	db: Db,
	a: { client: McpClient; code: unknown; redirectUri: unknown; codeVerifier: unknown; resource: unknown }
): Promise<TokenResponse | TokenError> {
	if (typeof a.code !== 'string' || !a.code) return { error: 'invalid_request', error_description: 'code is required.' };
	const hash = await sha256Hex(a.code);
	const row = await dbFirst<{
		client_id: string; user_id: string; redirect_uri: string; code_challenge: string; scope: string; resource: string;
		grant_id: string | null; used_at: string | null; live: number;
	}>(db,
		`SELECT client_id, user_id, redirect_uri, code_challenge, scope, resource, grant_id, used_at,
		        expires_at > datetime('now') AS live
		   FROM mcp_auth_codes WHERE code_hash = ?`, hash);
	if (!row) return { error: 'invalid_grant', error_description: 'Unknown authorization code.' };

	const claim = await dbRun(db, "UPDATE mcp_auth_codes SET used_at = datetime('now') WHERE code_hash = ? AND used_at IS NULL", hash);
	if (!wroteRow(claim)) {
		if (row.grant_id) await revokeGrant(db, row.grant_id, 'code_replayed');
		return { error: 'invalid_grant', error_description: 'This authorization code was already used.' };
	}
	if (!row.live) return { error: 'invalid_grant', error_description: 'The authorization code has expired.' };
	if (row.client_id !== a.client.id) return { error: 'invalid_grant', error_description: 'The code was issued to another client.' };
	if (a.redirectUri !== row.redirect_uri) return { error: 'invalid_grant', error_description: 'redirect_uri does not match the authorization request.' };
	if (a.resource !== undefined && a.resource !== null && a.resource !== '' && a.resource !== row.resource) {
		return { error: 'invalid_target', error_description: 'The resource does not match the authorization request.' };
	}
	if (!(await pkceMatches(a.codeVerifier, row.code_challenge))) {
		return { error: 'invalid_grant', error_description: 'PKCE verification failed.' };
	}
	const user = await dbFirst<{ ok: number }>(db, 'SELECT 1 AS ok FROM users WHERE id = ? AND deleted_at IS NULL', row.user_id);
	if (!user) return { error: 'invalid_grant', error_description: 'The account no longer exists.' };

	const grantId = crypto.randomUUID();
	await dbRun(db,
		'INSERT INTO mcp_grants (id, user_id, client_id, scope, resource) VALUES (?, ?, ?, ?, ?)',
		grantId, row.user_id, row.client_id, row.scope, row.resource);
	await dbRun(db, 'UPDATE mcp_auth_codes SET grant_id = ? WHERE code_hash = ?', grantId, hash);
	return issuePair(db, grantId, row.scope);
}

/** refresh_token → a new pair; the old refresh token stops working. Presenting a
 *  refresh token that was already rotated means two parties hold it: the whole
 *  grant is revoked (OAuth 2.1 §4.3.1). */
export async function refreshTokens(
	db: Db,
	a: { client: McpClient; refreshToken: unknown; scope: unknown; resource: unknown }
): Promise<TokenResponse | TokenError> {
	if (typeof a.refreshToken !== 'string' || !a.refreshToken) return { error: 'invalid_request', error_description: 'refresh_token is required.' };
	const hash = await sha256Hex(a.refreshToken);
	const row = await dbFirst<{ grant_id: string; used_at: string | null; live: number; client_id: string; scope: string; resource: string; revoked_at: string | null; deleted: number }>(db,
		`SELECT t.grant_id, t.used_at, t.expires_at > datetime('now') AS live, g.client_id, g.scope, g.resource, g.revoked_at,
		        (u.id IS NULL OR u.deleted_at IS NOT NULL) AS deleted
		   FROM mcp_tokens t JOIN mcp_grants g ON g.id = t.grant_id LEFT JOIN users u ON u.id = g.user_id
		  WHERE t.token_hash = ? AND t.kind = 'refresh'`, hash);
	if (!row || row.client_id !== a.client.id) return { error: 'invalid_grant', error_description: 'Unknown refresh token.' };
	if (row.revoked_at || row.deleted) return { error: 'invalid_grant', error_description: 'This connection was revoked.' };
	if (a.resource !== undefined && a.resource !== null && a.resource !== '' && a.resource !== row.resource) {
		return { error: 'invalid_target', error_description: 'The resource does not match this grant.' };
	}

	const claim = await dbRun(db, "UPDATE mcp_tokens SET used_at = datetime('now') WHERE token_hash = ? AND used_at IS NULL", hash);
	if (!wroteRow(claim)) {
		await revokeGrant(db, row.grant_id, 'refresh_reused');
		return { error: 'invalid_grant', error_description: 'This refresh token was already used; the connection has been revoked.' };
	}
	if (!row.live) return { error: 'invalid_grant', error_description: 'The refresh token has expired.' };

	// A refresh may narrow the scope, never widen it.
	let scope = row.scope;
	if (typeof a.scope === 'string' && a.scope.trim()) {
		const asked = parseScope(a.scope);
		const held = row.scope.split(' ');
		if (!asked || asked.some((s) => !held.includes(s))) return { error: 'invalid_scope', error_description: 'A refresh cannot add scopes.' };
		scope = asked.join(' ');
		if (scope !== row.scope) await dbRun(db, 'UPDATE mcp_grants SET scope = ? WHERE id = ?', scope, row.grant_id);
	}
	// Access tokens from before the refresh are retired with it.
	await dbRun(db, "DELETE FROM mcp_tokens WHERE grant_id = ? AND kind = 'access'", row.grant_id);
	return issuePair(db, row.grant_id, scope);
}

/** RFC 7009. Either kind of token ends its whole grant. Unknown tokens, and tokens
 *  of another client, are ignored silently, as the RFC asks. */
export async function revokeToken(db: Db, client: McpClient, token: unknown): Promise<void> {
	if (typeof token !== 'string' || !token) return;
	const row = await dbFirst<{ grant_id: string; client_id: string }>(db,
		'SELECT t.grant_id, g.client_id FROM mcp_tokens t JOIN mcp_grants g ON g.id = t.grant_id WHERE t.token_hash = ?',
		await sha256Hex(token));
	if (row && row.client_id === client.id) await revokeGrant(db, row.grant_id, 'client_revoked');
}

export async function revokeGrant(db: Db, grantId: string, reason: string): Promise<void> {
	await dbRun(db, "UPDATE mcp_grants SET revoked_at = COALESCE(revoked_at, datetime('now')), revoked_reason = COALESCE(revoked_reason, ?) WHERE id = ?", reason, grantId);
	await dbRun(db, 'DELETE FROM mcp_tokens WHERE grant_id = ?', grantId);
}

/** Every connection of one person (account deletion, a security reset). Never throws
 *  on a database without the MCP tables. */
export async function revokeUserGrants(db: Db, userId: string, reason: string): Promise<void> {
	try {
		const grants = await dbAll<{ id: string }>(db, 'SELECT id FROM mcp_grants WHERE user_id = ? AND revoked_at IS NULL', userId);
		for (const g of grants) await revokeGrant(db, g.id, reason);
		await dbRun(db, 'DELETE FROM mcp_auth_codes WHERE user_id = ?', userId);
	} catch {
		/* before migration 0038 */
	}
}

// ── Resource server side ─────────────────────────────────────────────────────

export interface AccessGrant {
	grantId: string;
	userId: string;
	clientId: string;
	clientName: string;
	scope: string;
}

/** The grant behind a bearer token, or null when it is unknown, expired, revoked,
 *  bound to another resource, or its person is gone. */
export async function authenticateAccess(db: Db, token: string | null, resource: string): Promise<AccessGrant | null> {
	if (!token) return null;
	const row = await dbFirst<{ grant_id: string; user_id: string; client_id: string; client_name: string; scope: string; resource: string }>(db,
		`SELECT g.id AS grant_id, g.user_id, g.client_id, c.name AS client_name, g.scope, g.resource
		   FROM mcp_tokens t
		   JOIN mcp_grants g ON g.id = t.grant_id
		   JOIN mcp_clients c ON c.id = g.client_id
		   JOIN users u ON u.id = g.user_id
		  WHERE t.token_hash = ? AND t.kind = 'access' AND t.expires_at > datetime('now')
		    AND g.revoked_at IS NULL AND u.deleted_at IS NULL`,
		await sha256Hex(token));
	if (!row || row.resource !== resource) return null;
	return { grantId: row.grant_id, userId: row.user_id, clientId: row.client_id, clientName: row.client_name, scope: row.scope };
}

/** Stamped at most once a minute, so a busy agent does not write on every call. */
export async function touchGrant(db: Db, grantId: string): Promise<void> {
	await dbRun(db,
		"UPDATE mcp_grants SET last_used_at = datetime('now') WHERE id = ? AND (last_used_at IS NULL OR last_used_at < datetime('now', '-60 seconds'))",
		grantId).catch(() => {});
}

export function bearerToken(authorization: string | null): string | null {
	const m = /^Bearer\s+([A-Za-z0-9\-._~+/]+=*)\s*$/i.exec(authorization ?? '');
	return m ? m[1] : null;
}
