import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { requireOrgPermission } from '$lib/server/access';
import { st } from '$lib/i18n-server';
import { loadClientCard, saveClientNotes } from '$lib/server/clients';
import { parseClientNotes, parseClientUrlId } from '$lib/clients';
import { summariseRatings } from '$lib/feedback';
import { todayUtcISO } from '$lib/server/reservation-rules';

/** One client's card (D10): contact, every event with the venue, the conversations,
 *  their feedback and the team's private notes. */
export const load: PageServerLoad = async ({ locals, params }) => {
	const org = await requireOrgPermission(locals, 'reservations.manage');
	const key = parseClientUrlId(params.id);
	const card = key ? await loadClientCard(locals.db, org.id, key, todayUtcISO()) : null;
	if (!card) error(404, st(locals.locale).clients.noMatches);
	// The conversations themselves stay with whoever runs the client inbox (owner and
	// admins, see /app/manage/messages); everyone else sees that they exist.
	const canReadMessages = org.role === 'owner' || org.role === 'admin';
	return {
		...card,
		ratings: summariseRatings(card.feedback.map((f) => f.rating)),
		canReadMessages,
		today: todayUtcISO(),
	};
};

export const actions: Actions = {
	saveNotes: async ({ locals, params, request }) => {
		const org = await requireOrgPermission(locals, 'reservations.manage');
		const key = parseClientUrlId(params.id);
		const card = key ? await loadClientCard(locals.db, org.id, key, todayUtcISO()) : null;
		if (!key || !card) return fail(404, { notesError: st(locals.locale).clients.noMatches });
		const data = await request.formData();
		const parsed = parseClientNotes({ phone: String(data.get('phone') ?? ''), notes: String(data.get('notes') ?? '') });
		const c = st(locals.locale).clients;
		if (!parsed.ok) return fail(400, { notesError: parsed.field === 'phone' ? c.errPhone : c.errNotes });
		try {
			await saveClientNotes(locals.db, org.id, key, parsed.values, locals.user!.id);
		} catch {
			return fail(503, { notesError: c.notesUnavailable });
		}
		return { notesSaved: true };
	},
};
