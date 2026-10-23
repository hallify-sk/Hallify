import { redirect } from '@sveltejs/kit';
import { CLOSED_COOKIE } from '$lib/org-closure-email';
import type { PageServerLoad } from './$types';

/** Confirmation after an owner closes their organisation. The summary arrives in a
 *  short-lived cookie set by the close action and is shown once. */
export const load: PageServerLoad = ({ cookies, locals }) => {
	if (!locals.user) redirect(303, '/app/login');
	const raw = cookies.get(CLOSED_COOKIE);
	if (!raw) redirect(303, '/app/');
	cookies.delete(CLOSED_COOKIE, { path: '/app/org-closed' });

	let summary: { name?: unknown; subscriptionCancelled?: unknown; clientsNotified?: unknown; clientsNotNotified?: unknown } = {};
	try { summary = JSON.parse(raw); } catch { redirect(303, '/app/'); }

	return {
		name: String(summary.name ?? ''),
		subscriptionCancelled: summary.subscriptionCancelled === true,
		clientsNotified: Number(summary.clientsNotified) || 0,
		clientsNotNotified: Number(summary.clientsNotNotified) || 0,
		hasOtherOrg: !!locals.currentOrg,
	};
};
