import { getClient, isValidChallenge, parseScope, redirectUriMatches, type McpClient } from './oauth';

/**
 * Checking an authorization request (/oauth/authorize), the same way on the consent
 * page and again when it is approved: nothing the browser sends back is trusted.
 *
 * Errors about the client or the redirect URI are shown here and NEVER sent to the
 * redirect URI (RFC 6749 §4.1.2.1) — it is not known to belong to the client. Every
 * other error goes back to the client by redirect, with its `state`.
 */

export interface AuthorizeRequest {
	client: McpClient;
	redirectUri: string;
	codeChallenge: string;
	scopes: string[];
	state: string | null;
	resource: string;
}

export type AuthorizeCheck =
	| { kind: 'ok'; request: AuthorizeRequest }
	| { kind: 'fatal'; reason: string }
	| { kind: 'redirect'; location: string };

type Params = { get(name: string): string | null };

/** The client's redirect URI with the response appended (RFC 6749 §4.1.2, RFC 9207 `iss`). */
export function redirectWith(redirectUri: string, params: Record<string, string | null | undefined>): string {
	const u = new URL(redirectUri);
	for (const [k, v] of Object.entries(params)) if (v != null && v !== '') u.searchParams.set(k, v);
	return u.toString();
}

export async function checkAuthorizeRequest(db: App.Locals['db'], p: Params, resource: string, issuer: string): Promise<AuthorizeCheck> {
	const client = await getClient(db, p.get('client_id'));
	if (!client) return { kind: 'fatal', reason: 'Unknown client_id. The app has to register again.' };
	const redirectUri = p.get('redirect_uri') ?? (client.redirectUris.length === 1 ? client.redirectUris[0] : null);
	if (!redirectUri || !redirectUriMatches(client.redirectUris, redirectUri)) {
		return { kind: 'fatal', reason: 'The redirect_uri is not one this app registered.' };
	}

	const state = p.get('state');
	const back = (error: string, description: string): AuthorizeCheck =>
		({ kind: 'redirect', location: redirectWith(redirectUri, { error, error_description: description, state, iss: issuer }) });

	if (p.get('response_type') !== 'code') return back('unsupported_response_type', 'Only response_type=code is supported.');
	const challenge = p.get('code_challenge');
	if (p.get('code_challenge_method') !== 'S256' || !isValidChallenge(challenge)) {
		return back('invalid_request', 'PKCE is required: code_challenge with code_challenge_method=S256.');
	}
	const scopes = parseScope(p.get('scope'));
	if (!scopes) return back('invalid_scope', 'Unknown scope. Supported: mcp:read mcp:write.');
	// RFC 8707: the one resource this server issues tokens for. Absent means it.
	const asked = p.get('resource');
	if (asked && asked.replace(/\/$/, '') !== resource) return back('invalid_target', `Tokens here are for ${resource} only.`);

	return { kind: 'ok', request: { client, redirectUri, codeChallenge: challenge, scopes, state, resource } };
}
