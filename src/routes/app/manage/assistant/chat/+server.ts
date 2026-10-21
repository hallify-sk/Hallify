import { json } from '@sveltejs/kit';
import { requireOrgPermission } from '$lib/server/access';
import { runTurn } from '$lib/server/ai/agent';
import type { RequestHandler } from './$types';

/** One assistant turn. JSON in, JSON out; the page reloads the thread afterwards. */
export const POST: RequestHandler = async ({ request, locals, platform }) => {
	const org = await requireOrgPermission(locals, 'ai.use');
	// A platform admin "viewing as" an organisation must not spend its credits.
	if (org.impersonated) return json({ ok: false, error: 'impersonated' }, { status: 403 });

	const body = (await request.json().catch(() => null)) as
		| { threadId?: unknown; text?: unknown; attachmentIds?: unknown; page?: { path?: unknown; title?: unknown } }
		| null;
	const text = typeof body?.text === 'string' ? body.text : '';
	const attachmentIds = Array.isArray(body?.attachmentIds)
		? body.attachmentIds.filter((x): x is string => typeof x === 'string').slice(0, 5)
		: [];
	if (!text.trim() && attachmentIds.length === 0) return json({ ok: false, error: 'empty' }, { status: 400 });

	const res = await runTurn(locals, org, {
		threadId: typeof body?.threadId === 'string' ? body.threadId : null,
		text,
		attachmentIds,
		page: typeof body?.page?.path === 'string' && body.page.path.startsWith('/app/')
			? { path: body.page.path.slice(0, 200), title: typeof body.page.title === 'string' ? body.page.title : '' }
			: null,
		r2: platform?.env?.R2
	});
	const status = res.ok ? 200 : res.error === 'insufficient_credits' ? 402 : res.error === 'not_found' ? 404 : res.error === 'failed' ? 502 : 403;
	return json(res, { status });
};
