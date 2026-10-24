import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { corsHeaders, mcpOrigin } from '$lib/server/mcp/http';
import { authorizationServerMetadata } from '$lib/server/mcp/metadata';
import type { RequestHandler } from './$types';

// RFC 8414. The issuer is the apex itself; the suffixed form (/mcp) is answered too
// for clients that insert the resource path.
export const GET: RequestHandler = ({ url, request }) =>
	json(authorizationServerMetadata(mcpOrigin(url, env.APP_URL)), {
		headers: { ...corsHeaders(request.headers.get('origin')), 'Cache-Control': 'public, max-age=3600' }
	});

export const OPTIONS: RequestHandler = ({ request }) =>
	new Response(null, { status: 204, headers: corsHeaders(request.headers.get('origin')) });
