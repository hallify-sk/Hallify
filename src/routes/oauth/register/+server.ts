import { json } from '@sveltejs/kit';
import { rateLimit, rateLimitKey, RATE_LIMITS } from '$lib/rateLimit';
import { loadPlatformMcp } from '$lib/server/platform-settings';
import { corsHeaders } from '$lib/server/mcp/http';
import { registerClient } from '$lib/server/mcp/oauth';
import type { RequestHandler } from './$types';

// Dynamic client registration (RFC 7591), open as MCP expects: registering grants
// nothing by itself. Every client still needs a signed-in person's consent, which
// shows its name and where it sends the person back.
export const POST: RequestHandler = async ({ request, locals, getClientAddress }) => {
	const headers = { ...corsHeaders(request.headers.get('origin')), 'Cache-Control': 'no-store' };
	const fail = (status: number, error: string, error_description: string) => json({ error, error_description }, { status, headers });

	if (!(await loadPlatformMcp(locals.db)).enabled) return fail(503, 'temporarily_unavailable', 'Hallify\'s MCP server is turned off.');
	let ip: string | null = null;
	try { ip = getClientAddress(); } catch { /* not behind Cloudflare */ }
	const limited = await rateLimit(locals.db, rateLimitKey('mcp_register', ip), RATE_LIMITS.mcpRegister);
	if (!limited.ok) return fail(429, 'invalid_request', 'Too many registrations from this address.');

	let meta: unknown;
	try {
		const text = await request.text();
		if (text.length > 20_000) return fail(400, 'invalid_client_metadata', 'Metadata too large.');
		meta = JSON.parse(text);
	} catch {
		return fail(400, 'invalid_client_metadata', 'The body must be a JSON object.');
	}
	if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return fail(400, 'invalid_client_metadata', 'The body must be a JSON object.');

	const res = await registerClient(locals.db, meta as Record<string, unknown>);
	if (!res.ok) return fail(400, res.error, res.description);
	return json(res.body, { status: 201, headers });
};

export const OPTIONS: RequestHandler = ({ request }) =>
	new Response(null, { status: 204, headers: corsHeaders(request.headers.get('origin')) });
