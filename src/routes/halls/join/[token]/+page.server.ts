// Accepting an invitation to a shared event (0038), on the venue's own site.
//
// Signed out: sign in or create an account (the venue's /login does both) and come
// back here. Signed in as this venue's client with the invited address: one button
// accepts. Signed in with another address: say so, and offer to sign out. Accepting
// is a POST, so a link preview or a prefetch never accepts on somebody's behalf.

import { fail, redirect } from '@sveltejs/kit';
import { st } from '$lib/i18n-server';
import { logReservationActivity } from '$lib/server/reservation-activity';
import { acceptMemberInvite, findMemberInvite, inviteState, type AcceptRefusal } from '$lib/server/reservation-members';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const invite = await findMemberInvite(locals.db, params.token);
	// Another venue's invitation does not exist here (its branding around somebody
	// else's event is what must not happen).
	const here = invite && invite.org_id === locals.domainOrg?.id ? invite : null;
	const dead = inviteState(here);
	if (dead || !here) return { unavailable: (dead ?? 'notFound') as AcceptRefusal, invite: null, signedIn: !!locals.user, matches: false, currentEmail: null, loginHref: '' };

	const user = locals.user;
	const matches = !!user && user.account_type === 'client' && user.org_id === here.org_id
		&& user.email.trim().toLowerCase() === here.email.trim().toLowerCase();
	return {
		unavailable: null as AcceptRefusal | null,
		invite: { email: here.email, eventTitle: here.res_title, hallName: here.hall_name, eventDate: here.event_date, orgName: here.org_name },
		signedIn: !!user,
		matches,
		currentEmail: user?.email ?? null,
		loginHref: `/login?redirect=${encodeURIComponent(`/halls/join/${params.token}`)}`,
	};
};

export const actions: Actions = {
	accept: async ({ params, locals }) => {
		if (!locals.user) redirect(303, `/login?redirect=${encodeURIComponent(`/halls/join/${params.token}`)}`);
		const s = st(locals.locale).sharedEvent;
		const res = await acceptMemberInvite(locals.db, params.token, locals.user, locals.domainOrg!.id);
		if (!res.ok) {
			const msg: Record<AcceptRefusal, string> = {
				notFound: s.joinNotFound, expired: s.joinExpired, cancelled: s.joinCancelled,
				emailMismatch: s.joinWrongVenue, wrongVenue: s.joinWrongVenue,
			};
			return fail(res.reason === 'emailMismatch' || res.reason === 'wrongVenue' ? 403 : 410, { error: msg[res.reason] });
		}
		if (res.memberId) {
			await logReservationActivity(locals.db, {
				reservationId: res.reservationId, orgId: locals.domainOrg!.id, actorId: locals.user.id,
				actorName: `${locals.user.first_name} ${locals.user.last_name}`.trim(), kind: 'shared', status: 'joined', note: null,
			});
		}
		redirect(303, `/halls/my-reservations/${res.reservationId}`);
	},
};
