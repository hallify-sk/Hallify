import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { corsHeaders, mcpOrigin } from '$lib/server/mcp/http';
import { protectedResourceMetadata } from '$lib/server/mcp/metadata';
import type { RequestHandler } from './$types';

// RFC 9728. Served at the root and at /mcp (the resource's own path), since clients
// look in either place.
export const GET: RequestHandler = ({ url, request }) =>
	json(protectedResourceMetadata(mcpOrigin(url, env.APP_URL)), {
		headers: { ...corsHeaders(request.headers.get('origin')), 'Cache-Control': 'public, max-age=3600' }
	});

export const OPTIONS: RequestHandler = ({ request }) =>
	new Response(null, { status: 204, headers: corsHeaders(request.headers.get('origin')) });
