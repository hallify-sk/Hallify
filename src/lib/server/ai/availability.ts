import { error, redirect } from '@sveltejs/kit';
import { dbFirst } from '$lib/db/index';
import { aiVisibility, AI_HIDDEN, type AiVisibility } from '$lib/ai-visibility';
import type { Permission } from '$lib/permissions';
import { orgPermissions } from '$lib/server/access';
import { loadAiPlatform } from './pricing';
import { aiConfigured } from './openai';

/**
 * The AI switches, read once per request: the root layout, a page and an endpoint
 * all ask, and the answer is kept on the request's `locals` object (a WeakMap, so it
 * goes with the request). Never throws: a database without the platform settings
 * table means the assistant is on (the default), one without migration 0012 means the
 * organisation's switch is off.
 */
const platformCache = new WeakMap<App.Locals, Promise<boolean>>();
const visibilityCache = new WeakMap<App.Locals, Promise<AiVisibility>>();

export function aiPlatformEnabled(locals: App.Locals): Promise<boolean> {
	let p = platformCache.get(locals);
	if (!p) {
		p = loadAiPlatform(locals.db).then((s) => s.enabled, () => true);
		platformCache.set(locals, p);
	}
	return p;
}

async function orgAiEnabled(locals: App.Locals): Promise<boolean> {
	const org = locals.currentOrg;
	if (!org) return false;
	try {
		const acc = await dbFirst<{ enabled: number }>(locals.db, 'SELECT enabled FROM ai_accounts WHERE org_id = ?', org.id);
		return !!acc?.enabled;
	} catch {
		return false;
	}
}

/** What of the assistant this request may see. `permissions` saves a lookup when
 *  the caller already holds the member's effective permissions. */
export function aiVisibilityFor(locals: App.Locals, permissions?: Iterable<Permission>): Promise<AiVisibility> {
	let p = visibilityCache.get(locals);
	if (!p) {
		p = compute(locals, permissions).catch(() => AI_HIDDEN);
		visibilityCache.set(locals, p);
	}
	return p;
}

async function compute(locals: App.Locals, permissions?: Iterable<Permission>): Promise<AiVisibility> {
	const platformEnabled = await aiPlatformEnabled(locals);
	if (!platformEnabled) return AI_HIDDEN;
	const org = locals.currentOrg;
	const member = !!locals.user && !!org && !locals.domainOrg && locals.user.account_type !== 'client';
	const held = member ? new Set(permissions ?? (await orgPermissions(locals))) : new Set<Permission>();
	return aiVisibility({
		platformEnabled,
		orgEnabled: member ? await orgAiEnabled(locals) : false,
		configured: aiConfigured(),
		member,
		impersonated: !!org?.impersonated,
		canUse: held.has('ai.use'),
		canManageSettings: held.has('settings.manage')
	});
}

/** For the assistant's endpoints: 404 unless the assistant is on for this member. */
export async function requireAssistant(locals: App.Locals): Promise<void> {
	if (!(await aiVisibilityFor(locals)).page) error(404, 'Not found');
}

/** For the assistant page: away to where the member can act, unless it is on for them.
 *  Someone who can switch it on is taken to Settings → AI; everyone else to the console. */
export async function requireAssistantPage(locals: App.Locals): Promise<AiVisibility> {
	const v = await aiVisibilityFor(locals);
	if (!v.page) redirect(303, v.settings ? '/app/manage/settings/ai' : '/app/manage');
	return v;
}

/** For Settings → AI: away to the other settings while the platform has the assistant off. */
export async function requireAiSettings(locals: App.Locals): Promise<void> {
	if (!(await aiPlatformEnabled(locals))) redirect(303, '/app/manage/settings');
}
