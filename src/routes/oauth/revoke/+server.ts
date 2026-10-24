import { json } from '@sveltejs/kit';
import { corsHeaders } from '$lib/server/mcp/http';
import { authenticateClient, revokeToken } from '$lib/server/mcp/oauth';
import { readOAuthParams } from '$lib/server/mcp/params';
import type { RequestHandler } from './$types';

// RFC 7009. Answers 200 whether or not the token was known, so it cannot be used to
// probe for valid tokens. Works while MCP is turned off: ending access is always allowed.
export const POST: RequestHandler = async ({ request, locals }) => {
	const headers = { ...corsHeaders(request.headers.get('origin')), 'Cache-Control': 'no-store' };
	const p = await readOAuthParams(request);
	if (!p) return json({ error: 'invalid_request' }, { status: 400, headers });
	const client = await authenticateClient(locals.db, {
		clientId: p.client_id, clientSecret: p.client_secret, authorization: request.headers.get('authorization')
	});
	if (!client) return json({ error: 'invalid_client' }, { status: 401, headers });
	await revokeToken(locals.db, client, p.token);
	return new Response(null, { status: 200, headers });
};

export const OPTIONS: RequestHandler = ({ request }) =>
	new Response(null, { status: 204, headers: corsHeaders(request.headers.get('origin')) });
