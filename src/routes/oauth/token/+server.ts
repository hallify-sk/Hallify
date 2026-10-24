import { json } from '@sveltejs/kit';
import { rateLimit, rateLimitKey, RATE_LIMITS } from '$lib/rateLimit';
import { loadPlatformMcp } from '$lib/server/platform-settings';
import { corsHeaders } from '$lib/server/mcp/http';
import { authenticateClient, exchangeCode, refreshTokens } from '$lib/server/mcp/oauth';
import { readOAuthParams } from '$lib/server/mcp/params';
import type { RequestHandler } from './$types';

// The token endpoint (RFC 6749 §3.2, OAuth 2.1): authorization_code with PKCE, and
// refresh_token with rotation. Called by the agent's server, so no cookie and no
// Origin; exempt from the form-CSRF rule in hooks for that reason.

const NO_STORE = { 'Cache-Control': 'no-store', Pragma: 'no-cache' };

export const POST: RequestHandler = async ({ request, locals }) => {
	const headers = { ...corsHeaders(request.headers.get('origin')), ...NO_STORE };
	const fail = (status: number, error: string, error_description: string, extra: Record<string, string> = {}) =>
		json({ error, error_description }, { status, headers: { ...headers, ...extra } });

	if (!(await loadPlatformMcp(locals.db)).enabled) return fail(503, 'temporarily_unavailable', 'Hallify\'s MCP server is turned off.');
	const p = await readOAuthParams(request);
	if (!p) return fail(400, 'invalid_request', 'Send the parameters as application/x-www-form-urlencoded.');

	const client = await authenticateClient(locals.db, {
		clientId: p.client_id, clientSecret: p.client_secret, authorization: request.headers.get('authorization')
	});
	if (!client) {
		return fail(401, 'invalid_client', 'Unknown client, or its authentication failed.', { 'WWW-Authenticate': 'Basic realm="hallify"' });
	}
	const limited = await rateLimit(locals.db, rateLimitKey('mcp_token', client.id), RATE_LIMITS.mcpToken);
	if (!limited.ok) return fail(429, 'slow_down', 'Too many token requests.', { 'Retry-After': String(limited.retryAfter) });

	let result;
	if (p.grant_type === 'authorization_code') {
		result = await exchangeCode(locals.db, { client, code: p.code, redirectUri: p.redirect_uri, codeVerifier: p.code_verifier, resource: p.resource });
	} else if (p.grant_type === 'refresh_token') {
		result = await refreshTokens(locals.db, { client, refreshToken: p.refresh_token, scope: p.scope, resource: p.resource });
	} else {
		return fail(400, 'unsupported_grant_type', 'Use authorization_code or refresh_token.');
	}
	if ('error' in result) return fail(400, result.error, result.error_description);
	return json(result, { headers });
};

export const OPTIONS: RequestHandler = ({ request }) =>
	new Response(null, { status: 204, headers: corsHeaders(request.headers.get('origin')) });
