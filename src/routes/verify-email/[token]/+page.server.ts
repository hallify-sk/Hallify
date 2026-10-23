import { verifyEmailToken } from '$lib/server/email-verification';
import { venueIdentity } from '$lib/site/brand.server';
import type { PageServerLoad } from './$types';

/** The link from the verification email. Opening it is the proof that the person
 *  reads that mailbox, so it verifies on arrival (and, for a Hallify account, joins
 *  the address's old venue accounts to it). Opening it twice is harmless. */
export const load: PageServerLoad = async ({ params, locals }) => {
	const result = await verifyEmailToken(locals.db, params.token);
	const onVenue = !!locals.domainOrg;
	return {
		result,
		next: locals.user ? (onVenue ? '/halls' : '/app/') : onVenue ? '/login' : '/app/login',
		resendUrl: locals.user ? '/verify-email' : onVenue ? '/login?redirect=%2Fverify-email' : '/app/login?redirect=%2Fverify-email',
		domainOrg: locals.domainOrg ? await venueIdentity(locals.db, locals.domainOrg) : null
	};
};
