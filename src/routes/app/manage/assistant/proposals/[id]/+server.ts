import { json } from '@sveltejs/kit';
import { requireOrgPermission } from '$lib/server/access';
import { applyProposal, discardProposal } from '$lib/server/ai/proposals';
import type { RequestHandler } from './$types';

/** Apply or discard something the assistant proposed. Applying needs the
 *  permission of what is being applied as well; proposals.ts checks that. */
export const POST: RequestHandler = async ({ request, params, locals }) => {
	const org = await requireOrgPermission(locals, 'ai.use');
	if (org.impersonated) return json({ ok: false, error: 'impersonated' }, { status: 403 });
	const body = (await request.json().catch(() => null)) as { action?: unknown } | null;

	if (body?.action === 'discard') {
		const ok = await discardProposal(locals, org, params.id);
		return json({ ok }, { status: ok ? 200 : 409 });
	}
	if (body?.action === 'apply') {
		const res = await applyProposal(locals, org, params.id);
		return json(res, { status: res.ok ? 200 : res.status });
	}
	return json({ ok: false, error: 'bad_action' }, { status: 400 });
};
