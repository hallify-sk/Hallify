import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { rateLimit, rateLimitKey, RATE_LIMITS } from '$lib/rateLimit';
import { loadPlatformMcp } from '$lib/server/platform-settings';
import { corsHeaders, mcpOrigin, mcpOriginAllowed, mcpResource, protectedResourceMetadataUrl } from '$lib/server/mcp/http';
import { authenticateAccess, bearerToken, touchGrant, SUPPORTED_SCOPES } from '$lib/server/mcp/oauth';
import { handleMcpBody, SUPPORTED_PROTOCOLS } from '$lib/server/mcp/jsonrpc';
import { callTool, describe, loadCaller, memberships, toolsForCaller, SERVER_INSTRUCTIONS } from '$lib/server/mcp/tools';
import type { RequestHandler } from './$types';

/**
 * The MCP endpoint (Streamable HTTP, stateless): one JSON-RPC message per POST, one
 * JSON answer. Authenticated by a bearer token from /oauth/token, bound to this
 * resource. See src/lib/server/mcp for the protocol, the OAuth server and the tools.
 */

const MAX_BODY = 1_000_000;

const rpcError = (status: number, code: number, message: string, headers: Record<string, string>, extra: Record<string, string> = {}) =>
	json({ jsonrpc: '2.0', id: null, error: { code, message } }, { status, headers: { ...headers, ...extra } });

export const POST: RequestHandler = async ({ request, url, locals }) => {
	const db = locals.db;
	const origin = mcpOrigin(url, env.APP_URL);
	const requestOrigin = request.headers.get('origin');
	const cors = corsHeaders(requestOrigin, 'echo');

	// DNS rebinding and cross-site pages: a browser Origin must be one we expect.
	if (!mcpOriginAllowed(requestOrigin, url.origin, env.MCP_ALLOWED_ORIGINS ?? '')) {
		return rpcError(403, -32000, 'Origin not allowed.', {});
	}
	if (!(await loadPlatformMcp(db)).enabled) {
		return rpcError(503, -32000, 'Hallify\'s MCP server is turned off at the moment.', cors);
	}
	const version = request.headers.get('mcp-protocol-version');
	if (version && !SUPPORTED_PROTOCOLS.includes(version)) {
		return rpcError(400, -32600, `Unsupported MCP-Protocol-Version ${version}. Supported: ${SUPPORTED_PROTOCOLS.join(', ')}.`, cors);
	}

	const token = bearerToken(request.headers.get('authorization'));
	const grant = await authenticateAccess(db, token, mcpResource(origin));
	const caller = grant ? await loadCaller(db, grant) : null;
	if (!grant || !caller) {
		const challenge = [
			`Bearer resource_metadata="${protectedResourceMetadataUrl(origin)}"`,
			`scope="${SUPPORTED_SCOPES.join(' ')}"`,
			...(token ? ['error="invalid_token"', 'error_description="The access token is invalid, expired or revoked."'] : [])
		].join(', ');
		return rpcError(401, -32001, 'Authentication required.', cors, { 'WWW-Authenticate': challenge });
	}

	const limited = await rateLimit(db, rateLimitKey('mcp', grant.grantId), RATE_LIMITS.mcp);
	if (!limited.ok) {
		return rpcError(429, -32000, `Too many requests: at most ${RATE_LIMITS.mcp.limit} a minute. Try again in ${limited.retryAfter} s.`, cors,
			{ 'Retry-After': String(limited.retryAfter) });
	}
	await touchGrant(db, grant.grantId);

	const raw = await request.text();
	if (raw.length > MAX_BODY) return rpcError(413, -32600, 'Request too large.', cors);

	// Memberships are read once per request and shared by tools/list.
	const reply = await handleMcpBody(raw, {
		instructions: SERVER_INSTRUCTIONS,
		listTools: async () => (await toolsForCaller(caller, await memberships(caller))).map(describe),
		callTool: (name, args) => callTool(caller, name, args)
	});
	if (!reply.body) return new Response(null, { status: reply.status, headers: cors });
	return json(reply.body, { status: reply.status, headers: { ...cors, 'Cache-Control': 'no-store' } });
};

// Stateless: no server-sent event stream to open and no session to end.
const notAllowed: RequestHandler = ({ request }) =>
	new Response(null, { status: 405, headers: { ...corsHeaders(request.headers.get('origin'), 'echo'), Allow: 'POST, OPTIONS' } });
export const GET = notAllowed;
export const DELETE = notAllowed;

export const OPTIONS: RequestHandler = ({ request }) =>
	new Response(null, { status: 204, headers: corsHeaders(request.headers.get('origin'), 'echo') });
