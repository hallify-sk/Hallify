import { json } from '@sveltejs/kit';
import { requireOrgPermission } from '$lib/server/access';
import { requireAssistant } from '$lib/server/ai/availability';
import { applyProposal, discardProposal } from '$lib/server/ai/proposals';
import type { RequestHandler } from './$types';

/** Apply or discard something the assistant proposed. Applying needs the
 *  permission of what is being applied as well; proposals.ts checks that. */
export const POST: RequestHandler = async ({ request, params, locals }) => {
	const org = await requireOrgPermission(locals, 'ai.use');
	// Off on the platform or for the organisation: no assistant to talk to.
	await requireAssistant(locals);
	if (org.impersonated) return json({ ok: false, error: 'impersonated' }, { status: 403 });
	const body = (await request.json().catch(() => null)) as { action?: unknown; skip?: unknown } | null;

	if (body?.action === 'discard') {
		const ok = await discardProposal(locals, org, params.id);
		return json({ ok }, { status: ok ? 200 : 409 });
	}
	if (body?.action === 'apply') {
		const skip = Array.isArray(body.skip) ? body.skip.filter((i): i is number => Number.isInteger(i)).slice(0, 50) : [];
		const res = await applyProposal(locals, org, params.id, { skip });
		return json(res, { status: res.ok ? 200 : res.status });
	}
	return json({ ok: false, error: 'bad_action' }, { status: 400 });
};
