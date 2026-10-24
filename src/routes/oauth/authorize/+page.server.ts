import { fail, redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { dbAll } from '$lib/db/index';
import { getPlan, type PlanId } from '$lib/plans';
import { loginUrl } from '$lib/login-redirect';
import { st } from '$lib/i18n-server';
import { verificationRequired } from '$lib/server/email-verification';
import { loadPlatformMcp } from '$lib/server/platform-settings';
import { mcpOrigin, mcpResource } from '$lib/server/mcp/http';
import { checkAuthorizeRequest, redirectWith } from '$lib/server/mcp/authorize';
import { createAuthCode, grantScope, SCOPE_WRITE } from '$lib/server/mcp/oauth';
import type { Actions, PageServerLoad } from './$types';

/**
 * The consent page: a signed-in Hallify account approves (or refuses) an AI agent.
 *
 * Read-only unless the person ticks "allow changes". On approval a one-time code goes
 * back to the agent's redirect URI; the agent exchanges it at /oauth/token with its
 * PKCE verifier. The page is apex-only (hooks) and cannot be framed (CSP).
 */

const PARAMS = ['response_type', 'client_id', 'redirect_uri', 'code_challenge', 'code_challenge_method', 'scope', 'state', 'resource'] as const;

function originOf(url: URL) {
	const origin = mcpOrigin(url, env.APP_URL);
	return { origin, resource: mcpResource(origin) };
}

export const load: PageServerLoad = async ({ url, locals }) => {
	if (!(await loadPlatformMcp(locals.db)).enabled) return { state: 'off' as const };

	const { origin, resource } = originOf(url);
	const check = await checkAuthorizeRequest(locals.db, url.searchParams, resource, origin);
	if (check.kind === 'fatal') return { state: 'invalid' as const, reason: check.reason };
	if (check.kind === 'redirect') redirect(303, check.location);

	const user = locals.user;
	if (!user) redirect(303, loginUrl(url));
	if (user.account_type === 'client') return { state: 'client' as const };
	// Operators confirm their e-mail before they run a venue (D11); the same applies
	// before they hand its data to an agent.
	if (!user.email_verified_at && !user.is_platform_admin && verificationRequired()) {
		redirect(303, `/verify-email?redirect=${encodeURIComponent(url.pathname + url.search)}`);
	}

	const { request } = check;
	// The approve form's 303 goes to the agent; the page's CSP form-action must allow it.
	locals.formActionOrigins = [new URL(request.redirectUri).origin];

	const orgs = await dbAll<{ id: string; name: string; plan: string | null }>(locals.db,
		`SELECT o.id, o.name, s.plan FROM organization_members m JOIN organizations o ON o.id = m.org_id
		   LEFT JOIN subscriptions s ON s.org_id = o.id
		  WHERE m.user_id = ? AND o.suspended_at IS NULL ORDER BY o.name`, user.id);

	return {
		state: 'consent' as const,
		client: { name: request.client.name, host: new URL(request.redirectUri).host },
		offerWrites: request.scopes.includes(SCOPE_WRITE),
		user: { name: `${user.first_name} ${user.last_name}`.trim(), email: user.email, platformAdmin: !!user.is_platform_admin },
		orgs: orgs.map((o) => ({ name: o.name, available: getPlan((o.plan ?? 'free') as PlanId).limits.mcp })),
		params: Object.fromEntries(PARAMS.map((k) => [k, url.searchParams.get(k) ?? '']))
	};
};

async function recheck(request: Request, url: URL, locals: App.Locals) {
	const form = await request.formData();
	const params = new URLSearchParams();
	for (const k of PARAMS) {
		const v = form.get(k);
		if (typeof v === 'string' && v) params.set(k, v);
	}
	const { origin, resource } = originOf(url);
	return { form, check: await checkAuthorizeRequest(locals.db, params, resource, origin), origin };
}

export const actions: Actions = {
	approve: async ({ request, url, locals }) => {
		const user = locals.user;
		if (!user || user.account_type === 'client') return fail(401, { error: st(locals.locale).mcp.signInFirst });
		if (!(await loadPlatformMcp(locals.db)).enabled) return fail(503, { error: st(locals.locale).mcp.consentOff });
		if (!user.email_verified_at && !user.is_platform_admin && verificationRequired()) return fail(403, { error: st(locals.locale).mcp.signInFirst });

		const { form, check, origin } = await recheck(request, url, locals);
		if (check.kind === 'fatal') return fail(400, { error: check.reason });
		if (check.kind === 'redirect') redirect(303, check.location);

		const r = check.request;
		const allowWrites = r.scopes.includes(SCOPE_WRITE) && form.get('allow_writes') === 'on';
		const code = await createAuthCode(locals.db, {
			clientId: r.client.id, userId: user.id, redirectUri: r.redirectUri,
			codeChallenge: r.codeChallenge, scope: grantScope(allowWrites), resource: r.resource
		});
		redirect(303, redirectWith(r.redirectUri, { code, state: r.state, iss: origin }));
	},

	deny: async ({ request, url, locals }) => {
		const { check, origin } = await recheck(request, url, locals);
		if (check.kind === 'fatal') return fail(400, { error: check.reason });
		if (check.kind === 'redirect') redirect(303, check.location);
		redirect(303, redirectWith(check.request.redirectUri, {
			error: 'access_denied', error_description: 'The user declined.', state: check.request.state, iss: origin
		}));
	}
};
