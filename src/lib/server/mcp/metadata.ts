import { SUPPORTED_SCOPES } from './oauth';
import { mcpResource } from './http';

/** RFC 9728: what /mcp is and who issues its tokens (this same app). */
export function protectedResourceMetadata(origin: string) {
	return {
		resource: mcpResource(origin),
		authorization_servers: [origin],
		scopes_supported: [...SUPPORTED_SCOPES],
		bearer_methods_supported: ['header'],
		resource_name: 'Hallify',
		resource_documentation: `${origin}/app/manage/help/connect-ai-assistant`
	};
}

/** RFC 8414: the authorization server's endpoints and what it supports. */
export function authorizationServerMetadata(origin: string) {
	return {
		issuer: origin,
		authorization_endpoint: `${origin}/oauth/authorize`,
		token_endpoint: `${origin}/oauth/token`,
		registration_endpoint: `${origin}/oauth/register`,
		revocation_endpoint: `${origin}/oauth/revoke`,
		response_types_supported: ['code'],
		response_modes_supported: ['query'],
		grant_types_supported: ['authorization_code', 'refresh_token'],
		code_challenge_methods_supported: ['S256'],
		token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
		revocation_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
		scopes_supported: [...SUPPORTED_SCOPES],
		service_documentation: `${origin}/app/manage/help/connect-ai-assistant`
	};
}
