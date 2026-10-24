import { afterEach, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { migratedDatabase, d1 } from '../sqlite-d1.testutil';
import { handleMcpBody, handleMcpMessage, type McpHandlers } from './jsonrpc';
import {
	authenticateAccess, authenticateClient, createAuthCode, exchangeCode, grantScope, isAllowedRedirectUri, parseScope,
	pkceMatches, redirectUriMatches, refreshTokens, registerClient, revokeToken, revokeUserGrants, type McpClient, type TokenResponse
} from './oauth';
import { checkAuthorizeRequest } from './authorize';
import { formCsrfRefused, isApexHost, isMcpPath, mcpOrigin, mcpOriginAllowed } from './http';
import { callTool, loadCaller, toolsForCaller, mcpSchema } from './tools';
import { listOrgConnections, listUserConnections, revokeMcpForClosingOrg, revokeOrgConnection, revokeUserConnection } from './connections';
import { rateLimit, RATE_LIMITS } from '$lib/rateLimit';

const RESOURCE = 'https://hallify.sk/mcp';
const ISSUER = 'https://hallify.sk';
// A verifier and its S256 challenge, computed independently (node:crypto, base64url).
const VERIFIER = 'dBjftJeZ4CVP-mJ92K9XUmMVvxzbdGTxLtqF3ZR0yq0';
const CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url');

const open: DatabaseSync[] = [];
afterEach(() => { for (const s of open.splice(0)) s.close(); });

function database(plan = 'professional') {
	const s = migratedDatabase();
	open.push(s);
	s.exec(`INSERT INTO users (id, email, password_hash, first_name, last_name) VALUES
		('owner', 'owner@example.com', 'x', 'Olga', 'Owner'),
		('member', 'member@example.com', 'x', 'Milan', 'Member'),
		('admin', 'admin@hallify.sk', 'x', 'Ada', 'Admin'),
		('client', 'client@example.com', 'x', 'Ján', 'Klient')`);
	s.exec(`UPDATE users SET is_platform_admin = 1 WHERE id = 'admin'`);
	s.exec(`INSERT INTO organizations (id, name, slug) VALUES ('org', 'Kaštieľ', 'kastiel'), ('free', 'Stodola', 'stodola')`);
	s.exec(`INSERT INTO subscriptions (id, org_id, plan) VALUES ('s1', 'org', '${plan}'), ('s2', 'free', 'free')`);
	s.exec(`INSERT INTO organization_members (id, org_id, user_id, role) VALUES
		('m1', 'org', 'owner', 'owner'), ('m2', 'org', 'member', 'member'), ('m3', 'free', 'owner', 'owner')`);
	s.exec(`INSERT INTO halls (id, org_id, name, description) VALUES ('h1', 'org', 'Veľká sála', 'Old text'), ('h2', 'free', 'Stodola', NULL)`);
	s.exec(`INSERT INTO reservations (id, org_id, hall_id, user_id, title, event_date, invite_code, status)
	        VALUES ('r1', 'org', 'h1', 'client', 'Svadba', '2030-06-01', 'ABCD1234', 'pending')`);
	s.exec(`INSERT INTO tickets (id, org_id, user_id, reservation_id, subject) VALUES ('t1', 'org', 'client', 'r1', 'Svadba – 1. 6.')`);
	return { s, db: d1(s) };
}

async function client(db: App.Locals['db'], meta: Record<string, unknown> = {}): Promise<McpClient> {
	const res = await registerClient(db, { client_name: 'Claude', redirect_uris: ['https://claude.ai/api/mcp/auth_callback'], ...meta });
	if (!res.ok) throw new Error(res.description);
	const c = await authenticateClient(db, { clientId: res.body.client_id, clientSecret: res.body.client_secret, authorization: null });
	return c!;
}

async function connect(db: App.Locals['db'], userId: string, scope = grantScope(false)) {
	const c = await client(db);
	const code = await createAuthCode(db, {
		clientId: c.id, userId, redirectUri: c.redirectUris[0], codeChallenge: CHALLENGE, scope, resource: RESOURCE
	});
	const tokens = await exchangeCode(db, { client: c, code, redirectUri: c.redirectUris[0], codeVerifier: VERIFIER, resource: RESOURCE });
	if ('error' in tokens) throw new Error(tokens.error_description);
	return { client: c, tokens, code };
}

async function callerFor(db: App.Locals['db'], token: string) {
	const grant = await authenticateAccess(db, token, RESOURCE);
	return grant ? loadCaller(db, grant) : null;
}

// ── JSON-RPC ─────────────────────────────────────────────────────────────────

const handlers: McpHandlers = {
	listTools: async () => [{ name: 'echo', title: 'Echo', description: 'd', inputSchema: { type: 'object' }, annotations: { title: 'Echo', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } }],
	callTool: async (name, args) => (name === 'echo' ? (args.fail ? { ok: false, error: 'nope' } : { ok: true, data: { got: args } }) : null)
};

describe('JSON-RPC handling', () => {
	it('initializes with the protocol version the client asked for, when supported', async () => {
		const r = await handleMcpMessage({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } }, handlers);
		expect(r.status).toBe(200);
		expect(r.body).toMatchObject({ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'hallify' } } });
		const old = await handleMcpMessage({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } }, handlers);
		expect((old.body as { result: { protocolVersion: string } }).result.protocolVersion).toBe('2025-06-18');
	});

	it('accepts notifications and responses with 202 and no body', async () => {
		expect(await handleMcpMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }, handlers)).toEqual({ status: 202, body: null });
		expect(await handleMcpMessage({ jsonrpc: '2.0', id: 9, result: {} }, handlers)).toEqual({ status: 202, body: null });
	});

	it('answers ping, lists tools and calls them', async () => {
		expect((await handleMcpMessage({ jsonrpc: '2.0', id: 'a', method: 'ping' }, handlers)).body).toEqual({ jsonrpc: '2.0', id: 'a', result: {} });
		const list = await handleMcpMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, handlers);
		expect((list.body as { result: { tools: unknown[] } }).result.tools).toHaveLength(1);
		const ok = await handleMcpMessage({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'echo', arguments: { x: 1 } } }, handlers);
		expect(ok.body).toMatchObject({ result: { isError: false, structuredContent: { got: { x: 1 } } } });
	});

	it('reports tool failures as results, protocol mistakes as errors', async () => {
		const failed = await handleMcpMessage({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'echo', arguments: { fail: true } } }, handlers);
		expect(failed.body).toMatchObject({ result: { isError: true, content: [{ type: 'text', text: 'nope' }] } });
		const unknown = await handleMcpMessage({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'rm_rf' } }, handlers);
		expect(unknown.body).toMatchObject({ error: { code: -32602 } });
		const method = await handleMcpMessage({ jsonrpc: '2.0', id: 6, method: 'resources/list' }, handlers);
		expect(method.body).toMatchObject({ error: { code: -32601 } });
		const badArgs = await handleMcpMessage({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'echo', arguments: [1] } }, handlers);
		expect(badArgs.body).toMatchObject({ error: { code: -32602 } });
	});

	it('refuses batches, bad JSON and malformed messages', async () => {
		expect((await handleMcpBody('{nope', handlers)).body).toMatchObject({ id: null, error: { code: -32700 } });
		expect((await handleMcpMessage([{ jsonrpc: '2.0', id: 1, method: 'ping' }], handlers)).body).toMatchObject({ error: { code: -32600 } });
		expect((await handleMcpMessage({ id: 1, method: 'ping' }, handlers)).body).toMatchObject({ error: { code: -32600 } });
		expect((await handleMcpMessage({ jsonrpc: '2.0', id: { x: 1 }, method: 'ping' }, handlers)).body).toMatchObject({ error: { code: -32600 } });
	});
});

// ── PKCE, scopes, redirect URIs ─────────────────────────────────────────────

describe('PKCE and request checks', () => {
	it('verifies S256 and nothing else', async () => {
		expect(await pkceMatches(VERIFIER, CHALLENGE)).toBe(true);
		expect(await pkceMatches(VERIFIER.slice(0, -1) + 'x', CHALLENGE)).toBe(false);
		expect(await pkceMatches(CHALLENGE, CHALLENGE)).toBe(false); // "plain" is not accepted
		expect(await pkceMatches('short', CHALLENGE)).toBe(false);
		expect(await pkceMatches(undefined, CHALLENGE)).toBe(false);
	});

	it('knows its scopes', () => {
		expect(parseScope(undefined)).toEqual(['mcp:read', 'mcp:write']);
		expect(parseScope('mcp:write mcp:read')).toEqual(['mcp:read', 'mcp:write']);
		expect(parseScope('mcp:read admin')).toBeNull();
	});

	it('allows https and loopback http redirect URIs only', () => {
		expect(isAllowedRedirectUri('https://claude.ai/api/mcp/auth_callback')).toBe(true);
		expect(isAllowedRedirectUri('http://127.0.0.1:33418/callback')).toBe(true);
		expect(isAllowedRedirectUri('http://localhost/cb')).toBe(true);
		expect(isAllowedRedirectUri('http://evil.example/cb')).toBe(false);
		expect(isAllowedRedirectUri('cursor://anysphere/cb')).toBe(false);
		expect(isAllowedRedirectUri('https://a.example/cb#frag')).toBe(false);
		expect(isAllowedRedirectUri('https://user:pw@a.example/cb')).toBe(false);
		expect(redirectUriMatches(['http://127.0.0.1:1000/cb'], 'http://127.0.0.1:5555/cb')).toBe(true);
		expect(redirectUriMatches(['https://a.example/cb'], 'https://a.example/cb2')).toBe(false);
	});

	it('shows client and redirect errors, and sends the rest back to the client', async () => {
		const { db } = database();
		const c = await client(db);
		const params = (o: Record<string, string>) => new URLSearchParams({
			response_type: 'code', client_id: c.id, redirect_uri: c.redirectUris[0], code_challenge: CHALLENGE,
			code_challenge_method: 'S256', state: 'xyz', ...o
		});
		expect((await checkAuthorizeRequest(db, params({}), RESOURCE, ISSUER)).kind).toBe('ok');
		expect(await checkAuthorizeRequest(db, params({ client_id: 'nope' }), RESOURCE, ISSUER)).toMatchObject({ kind: 'fatal' });
		expect(await checkAuthorizeRequest(db, params({ redirect_uri: 'https://evil.example/cb' }), RESOURCE, ISSUER)).toMatchObject({ kind: 'fatal' });
		const plain = await checkAuthorizeRequest(db, params({ code_challenge_method: 'plain' }), RESOURCE, ISSUER);
		expect(plain.kind).toBe('redirect');
		expect(plain.kind === 'redirect' && new URL(plain.location).searchParams.get('error')).toBe('invalid_request');
		expect(plain.kind === 'redirect' && new URL(plain.location).searchParams.get('state')).toBe('xyz');
		const target = await checkAuthorizeRequest(db, params({ resource: 'https://other.example/mcp' }), RESOURCE, ISSUER);
		expect(target.kind === 'redirect' && new URL(target.location).searchParams.get('error')).toBe('invalid_target');
	});

	it('registers public and confidential clients, and checks secrets', async () => {
		const { db } = database();
		const bad = await registerClient(db, { redirect_uris: ['http://evil.example/cb'] });
		expect(bad).toMatchObject({ ok: false, error: 'invalid_redirect_uri' });
		const conf = await registerClient(db, { client_name: 'Server\u0000app', redirect_uris: ['https://x.example/cb'], token_endpoint_auth_method: 'client_secret_post' });
		if (!conf.ok) throw new Error('registration failed');
		expect(conf.body.client_name).toBe('Serverapp');
		expect(await authenticateClient(db, { clientId: conf.body.client_id, clientSecret: 'wrong', authorization: null })).toBeNull();
		expect(await authenticateClient(db, { clientId: conf.body.client_id, clientSecret: conf.body.client_secret, authorization: null })).not.toBeNull();
	});
});

// ── Tokens ───────────────────────────────────────────────────────────────────

describe('tokens', () => {
	it('issues a pair for a code, once, bound to the resource', async () => {
		const { db } = database();
		const { client: c, tokens, code } = await connect(db, 'owner');
		expect(tokens).toMatchObject({ token_type: 'Bearer', expires_in: 3600, scope: 'mcp:read' });
		expect(await authenticateAccess(db, tokens.access_token, RESOURCE)).toMatchObject({ userId: 'owner', clientName: 'Claude' });
		expect(await authenticateAccess(db, tokens.access_token, 'https://evil.example/mcp')).toBeNull();
		expect(await authenticateAccess(db, tokens.refresh_token, RESOURCE)).toBeNull();

		// The same code again: refused, and what it was exchanged for is revoked.
		const replay = await exchangeCode(db, { client: c, code, redirectUri: c.redirectUris[0], codeVerifier: VERIFIER, resource: RESOURCE });
		expect(replay).toMatchObject({ error: 'invalid_grant' });
		expect(await authenticateAccess(db, tokens.access_token, RESOURCE)).toBeNull();
	});

	it('refuses a wrong verifier, redirect URI or client', async () => {
		const { db } = database();
		const c = await client(db);
		const other = await client(db, { client_name: 'Other' });
		const mk = () => createAuthCode(db, { clientId: c.id, userId: 'owner', redirectUri: c.redirectUris[0], codeChallenge: CHALLENGE, scope: 'mcp:read', resource: RESOURCE });
		expect(await exchangeCode(db, { client: c, code: await mk(), redirectUri: c.redirectUris[0], codeVerifier: 'x'.repeat(43), resource: undefined }))
			.toMatchObject({ error: 'invalid_grant' });
		expect(await exchangeCode(db, { client: c, code: await mk(), redirectUri: 'https://claude.ai/other', codeVerifier: VERIFIER, resource: undefined }))
			.toMatchObject({ error: 'invalid_grant' });
		expect(await exchangeCode(db, { client: other, code: await mk(), redirectUri: c.redirectUris[0], codeVerifier: VERIFIER, resource: undefined }))
			.toMatchObject({ error: 'invalid_grant' });
	});

	it('refuses an expired code', async () => {
		const { s, db } = database();
		const c = await client(db);
		const code = await createAuthCode(db, { clientId: c.id, userId: 'owner', redirectUri: c.redirectUris[0], codeChallenge: CHALLENGE, scope: 'mcp:read', resource: RESOURCE });
		s.exec(`UPDATE mcp_auth_codes SET expires_at = datetime('now', '-1 second')`);
		expect(await exchangeCode(db, { client: c, code, redirectUri: c.redirectUris[0], codeVerifier: VERIFIER, resource: RESOURCE }))
			.toMatchObject({ error: 'invalid_grant', error_description: expect.stringContaining('expired') });
	});

	it('rotates refresh tokens and revokes the grant when an old one comes back', async () => {
		const { db } = database();
		const { client: c, tokens } = await connect(db, 'owner', grantScope(true));
		const next = (await refreshTokens(db, { client: c, refreshToken: tokens.refresh_token, scope: undefined, resource: RESOURCE })) as TokenResponse;
		expect(next.refresh_token).not.toBe(tokens.refresh_token);
		expect(next.scope).toBe('mcp:read mcp:write');
		expect(await authenticateAccess(db, tokens.access_token, RESOURCE)).toBeNull(); // retired with the refresh
		expect(await authenticateAccess(db, next.access_token, RESOURCE)).not.toBeNull();

		// A refresh may narrow, never widen.
		const narrowed = (await refreshTokens(db, { client: c, refreshToken: next.refresh_token, scope: 'mcp:read', resource: undefined })) as TokenResponse;
		expect(narrowed.scope).toBe('mcp:read');
		expect(await refreshTokens(db, { client: c, refreshToken: narrowed.refresh_token, scope: 'mcp:read mcp:write', resource: undefined }))
			.toMatchObject({ error: 'invalid_scope' });

		// Reuse of a rotated token: the whole grant is gone.
		expect(await refreshTokens(db, { client: c, refreshToken: tokens.refresh_token, scope: undefined, resource: undefined })).toMatchObject({ error: 'invalid_grant' });
		const latest = await refreshTokens(db, { client: c, refreshToken: narrowed.refresh_token, scope: undefined, resource: undefined });
		expect(latest).toMatchObject({ error: 'invalid_grant' });
	});

	it('revokes on request, and ignores other clients\' tokens', async () => {
		const { db } = database();
		const { client: c, tokens } = await connect(db, 'owner');
		const other = await client(db, { client_name: 'Other' });
		await revokeToken(db, other, tokens.access_token);
		expect(await authenticateAccess(db, tokens.access_token, RESOURCE)).not.toBeNull();
		await revokeToken(db, c, tokens.refresh_token);
		expect(await authenticateAccess(db, tokens.access_token, RESOURCE)).toBeNull();
		expect(await refreshTokens(db, { client: c, refreshToken: tokens.refresh_token, scope: undefined, resource: undefined })).toMatchObject({ error: 'invalid_grant' });
	});

	it('stops working for a deleted account and after account deletion revokes', async () => {
		const { s, db } = database();
		const { tokens } = await connect(db, 'owner');
		await revokeUserGrants(db, 'owner', 'account_deleted');
		expect(await authenticateAccess(db, tokens.access_token, RESOURCE)).toBeNull();
		const again = await connect(db, 'member');
		s.exec(`UPDATE users SET deleted_at = datetime('now') WHERE id = 'member'`);
		expect(await authenticateAccess(db, again.tokens.access_token, RESOURCE)).toBeNull();
	});
});

// ── Tools: permissions, plan, scope ──────────────────────────────────────────

describe('tools', () => {
	const names = async (db: App.Locals['db'], token: string) => (await toolsForCaller((await callerFor(db, token))!)).map((t) => t.name);

	it('offers organisation tools for an eligible plan, writes only with "allow changes", platform tools to admins', async () => {
		const { db } = database();
		const read = await connect(db, 'owner');
		const list = await names(db, read.tokens.access_token);
		expect(list).toContain('list_reservations');
		expect(list).not.toContain('set_reservation_status');
		expect(list).not.toContain('platform_stats');
		const write = await connect(db, 'owner', grantScope(true));
		expect(await names(db, write.tokens.access_token)).toEqual(expect.arrayContaining(['set_reservation_status', 'reply_to_message_thread', 'update_hall_description']));
		const admin = await connect(db, 'admin');
		const adminList = await names(db, admin.tokens.access_token);
		expect(adminList).toEqual(expect.arrayContaining(['platform_stats', 'platform_search_users', 'platform_audit_log', 'list_organisations']));
		expect(adminList).not.toContain('list_halls'); // a member of no organisation
	});

	it('gates organisation data on the plan', async () => {
		const { db } = database('starter');
		const { tokens } = await connect(db, 'owner');
		const caller = (await callerFor(db, tokens.access_token))!;
		expect((await toolsForCaller(caller)).map((t) => t.name)).toEqual(['list_organisations']);
		expect(await callTool(caller, 'list_halls', { organization_id: 'org' })).toBeNull();
		const orgs = await callTool(caller, 'list_organisations', {});
		expect(orgs).toMatchObject({ ok: true, data: { organisations: [{ id: 'org', available: false }, { id: 'free', available: false }] } });
	});

	it('reads through the assistant\'s tools, scoped to the organisation', async () => {
		const { db } = database();
		const { tokens } = await connect(db, 'owner');
		const caller = (await callerFor(db, tokens.access_token))!;
		// Two organisations, one usable: it is chosen without asking.
		const halls = await callTool(caller, 'list_halls', {});
		expect(halls).toMatchObject({ ok: true, data: { organization: { id: 'org' }, halls: [{ id: 'h1' }] } });
		const free = await callTool(caller, 'list_halls', { organization_id: 'free' });
		expect(free).toMatchObject({ ok: false, error: expect.stringContaining('Professional') });
		const stranger = await callTool(caller, 'get_hall', { organization_id: 'nope', hall_id: 'h1' });
		expect(stranger).toMatchObject({ ok: false });
		const otherOrgsHall = await callTool(caller, 'get_hall', { organization_id: 'org', hall_id: 'h2' });
		expect(otherOrgsHall).toMatchObject({ ok: false, error: expect.stringContaining('No such hall') });
	});

	it('applies the member\'s own permissions', async () => {
		const { db } = database();
		const { tokens } = await connect(db, 'member', grantScope(true));
		const caller = (await callerFor(db, tokens.access_token))!;
		// No roles in this organisation: a plain member holds nothing.
		expect(await callTool(caller, 'list_reservations', {})).toMatchObject({ ok: false, error: expect.stringContaining('reservations.view') });
		expect(await callTool(caller, 'set_reservation_status', { reservation_id: 'r1', status: 'approved' }))
			.toMatchObject({ ok: false, error: expect.stringContaining('reservations.manage') });
	});

	it('writes through the console\'s own functions, logged as via MCP', async () => {
		const { s, db } = database();
		const { tokens } = await connect(db, 'owner', grantScope(true));
		const caller = (await callerFor(db, tokens.access_token))!;

		const changed = await callTool(caller, 'set_reservation_status', { organization_id: 'org', reservation_id: 'r1', status: 'approved', expected_current_status: 'pending' });
		expect(changed).toMatchObject({ ok: true, data: { from: 'pending', status: 'approved' } });
		expect(s.prepare(`SELECT status FROM reservations WHERE id = 'r1'`).get()).toMatchObject({ status: 'approved' });
		expect(s.prepare(`SELECT actor_name FROM reservation_activity WHERE reservation_id = 'r1'`).get())
			.toMatchObject({ actor_name: 'Olga Owner · via MCP (Claude)' });
		const stale = await callTool(caller, 'set_reservation_status', { organization_id: 'org', reservation_id: 'r1', status: 'cancelled', expected_current_status: 'pending' });
		expect(stale).toMatchObject({ ok: false });

		expect(await callTool(caller, 'reply_to_message_thread', { organization_id: 'org', thread_id: 't1', text: 'Dobrý deň!' })).toMatchObject({ ok: true });
		expect(s.prepare(`SELECT body, sender_id FROM messages WHERE ticket_id = 't1'`).get()).toMatchObject({ body: 'Dobrý deň!', sender_id: 'owner' });

		expect(await callTool(caller, 'update_hall_description', { organization_id: 'org', hall_id: 'h1', description: 'New text' })).toMatchObject({ ok: true });
		expect(s.prepare(`SELECT description FROM halls WHERE id = 'h1'`).get()).toMatchObject({ description: 'New text' });
		expect(await callTool(caller, 'update_hall_description', { organization_id: 'free', hall_id: 'h2', description: 'x' })).toMatchObject({ ok: false });

		const log = s.prepare(`SELECT tool, summary, client_name, actor_name FROM mcp_activity WHERE org_id = 'org' ORDER BY rowid`).all() as { tool: string; summary: string; client_name: string; actor_name: string }[];
		expect(log.map((l) => l.tool)).toEqual(['set_reservation_status', 'reply_to_message_thread', 'update_hall_description']);
		expect(log.every((l) => l.client_name === 'Claude' && l.actor_name === 'Olga Owner')).toBe(true);
		expect(JSON.parse(log[0].summary)).toEqual({ label: 'Svadba', from: 'pending', to: 'approved' });
		expect(JSON.parse(log[2].summary)).toEqual({ label: 'Veľká sála' });
	});

	it('refuses writes to a read-only connection', async () => {
		const { db } = database();
		const { tokens } = await connect(db, 'owner');
		const caller = (await callerFor(db, tokens.access_token))!;
		expect(await callTool(caller, 'set_reservation_status', { reservation_id: 'r1', status: 'approved' })).toBeNull();
	});

	it('keeps platform tools to platform administrators', async () => {
		const { db } = database();
		const owner = (await callerFor(db, (await connect(db, 'owner')).tokens.access_token))!;
		expect(await callTool(owner, 'platform_stats', {})).toBeNull();
		const admin = (await callerFor(db, (await connect(db, 'admin')).tokens.access_token))!;
		expect(await callTool(admin, 'platform_stats', {})).toMatchObject({ ok: true, data: { organisations: { total: 2 } } });
		expect(await callTool(admin, 'platform_search_users', { query: 'owner@' })).toMatchObject({ ok: true, data: { count: 1 } });
		expect(await callTool(admin, 'platform_search_organisations', { query: 'kast' })).toMatchObject({ ok: true, data: { count: 1 } });
	});

	it('makes optional parameters optional and adds the organisation', () => {
		const schema = mcpSchema({ type: 'object', properties: { a: { type: 'string' }, b: { type: ['string', 'null'] } }, required: ['a', 'b'] });
		expect(schema.required).toEqual(['a']);
		expect(Object.keys(schema.properties as object)).toEqual(['organization_id', 'a', 'b']);
	});
});

// ── Management ───────────────────────────────────────────────────────────────

describe('connections', () => {
	it('lets a person revoke their own connection only', async () => {
		const { db } = database();
		const { tokens } = await connect(db, 'owner');
		const [conn] = await listUserConnections(db, 'owner');
		expect(conn).toMatchObject({ client_name: 'Claude', writes: false, redirect_host: 'claude.ai' });
		expect(await revokeUserConnection(db, 'member', conn.id)).toBe(false);
		expect(await revokeUserConnection(db, 'owner', conn.id)).toBe(true);
		expect(await authenticateAccess(db, tokens.access_token, RESOURCE)).toBeNull();
		expect(await listUserConnections(db, 'owner')).toEqual([]);
	});

	it('lets an owner cut a member\'s connection off from the organisation alone', async () => {
		const { db } = database();
		const { tokens } = await connect(db, 'owner');
		const [conn] = await listOrgConnections(db, 'org');
		expect(conn).toMatchObject({ member_email: 'owner@example.com', cut_off: false });
		expect(await revokeOrgConnection(db, 'org', conn.id, 'owner')).toBe(true);
		const caller = (await callerFor(db, tokens.access_token))!;
		expect(await callTool(caller, 'list_halls', { organization_id: 'org' })).toMatchObject({ ok: false, error: expect.stringContaining('turned off') });
		expect((await listOrgConnections(db, 'org'))[0].cut_off).toBe(true);
		// Only connections of the organisation's own members: 'member' is not in 'free'.
		await connect(db, 'member');
		const memberConn = (await listUserConnections(db, 'member'))[0];
		expect(await revokeOrgConnection(db, 'free', memberConn.id, 'owner')).toBe(false);
	});

	it('revokes the connections of members a closing organisation leaves with nothing', async () => {
		const { db } = database();
		const member = await connect(db, 'member');   // only in 'org'
		const owner = await connect(db, 'owner');     // also in 'free'
		await revokeMcpForClosingOrg(db, 'org');
		expect(await authenticateAccess(db, member.tokens.access_token, RESOURCE)).toBeNull();
		expect(await authenticateAccess(db, owner.tokens.access_token, RESOURCE)).not.toBeNull();
	});
});

// ── Rate limit and request rules ─────────────────────────────────────────────

describe('rate limit', () => {
	it('allows 60 calls a minute per connection', async () => {
		const { db } = database();
		for (let i = 0; i < RATE_LIMITS.mcp.limit; i++) expect((await rateLimit(db, 'mcp:g1', RATE_LIMITS.mcp)).ok).toBe(true);
		const over = await rateLimit(db, 'mcp:g1', RATE_LIMITS.mcp);
		expect(over.ok).toBe(false);
		expect(over.retryAfter).toBeGreaterThan(0);
		expect((await rateLimit(db, 'mcp:g2', RATE_LIMITS.mcp)).ok).toBe(true);
	});
});

describe('request rules', () => {
	const h = (o: Record<string, string>) => new Headers(o);

	it('serves MCP on the apex only', () => {
		expect(isMcpPath('/mcp')).toBe(true);
		expect(isMcpPath('/oauth/token')).toBe(true);
		expect(isMcpPath('/.well-known/oauth-protected-resource/mcp')).toBe(true);
		expect(isMcpPath('/app/manage')).toBe(false);
		expect(isApexHost('hallify.sk', 'hallify.sk')).toBe(true);
		expect(isApexHost('127.0.0.1:5188', 'hallify.sk')).toBe(true);
		expect(isApexHost('kastiel.hallify.sk', 'hallify.sk')).toBe(false);
		expect(isApexHost('kastiel.localhost', 'hallify.sk')).toBe(false);
		expect(isApexHost('www.svadby.sk', 'hallify.sk')).toBe(false);
	});

	it('binds to the APP_URL host in production and the request origin elsewhere', () => {
		expect(mcpOrigin(new URL('https://hallify.sk/mcp'), 'https://hallify.sk')).toBe('https://hallify.sk');
		expect(mcpOrigin(new URL('http://127.0.0.1:5188/mcp'), 'https://hallify.sk')).toBe('http://127.0.0.1:5188');
	});

	it('accepts only expected browser origins on /mcp', () => {
		expect(mcpOriginAllowed(null, 'https://hallify.sk')).toBe(true);
		expect(mcpOriginAllowed('https://hallify.sk', 'https://hallify.sk')).toBe(true);
		expect(mcpOriginAllowed('https://claude.ai', 'https://hallify.sk')).toBe(true);
		expect(mcpOriginAllowed('http://localhost:6274', 'https://hallify.sk')).toBe(true);
		expect(mcpOriginAllowed('https://evil.example', 'https://hallify.sk')).toBe(false);
		expect(mcpOriginAllowed('https://evil.example', 'https://hallify.sk', 'https://evil.example')).toBe(true);
		expect(mcpOriginAllowed('null', 'https://hallify.sk')).toBe(false);
	});

	it('keeps the form-CSRF rule everywhere except the OAuth endpoints agents post to', () => {
		const url = (p: string) => new URL(`https://hallify.sk${p}`);
		const form = { 'content-type': 'application/x-www-form-urlencoded' };
		expect(formCsrfRefused('POST', '/app/profile', h(form), url('/app/profile'))).toBe(true);
		expect(formCsrfRefused('POST', '/app/profile', h({ ...form, origin: 'https://evil.example' }), url('/app/profile'))).toBe(true);
		expect(formCsrfRefused('POST', '/app/profile', h({ ...form, origin: 'https://hallify.sk' }), url('/app/profile'))).toBe(false);
		expect(formCsrfRefused('POST', '/oauth/authorize', h({ ...form, origin: 'https://evil.example' }), url('/oauth/authorize'))).toBe(true);
		expect(formCsrfRefused('POST', '/oauth/token', h(form), url('/oauth/token'))).toBe(false);
		expect(formCsrfRefused('POST', '/oauth/revoke', h(form), url('/oauth/revoke'))).toBe(false);
		expect(formCsrfRefused('POST', '/api/x', h({ 'content-type': 'application/json' }), url('/api/x'))).toBe(false);
		expect(formCsrfRefused('GET', '/app/profile', h(form), url('/app/profile'))).toBe(false);
	});
});
