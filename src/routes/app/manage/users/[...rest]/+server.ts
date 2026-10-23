import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * The legacy Users page used to live here. It let anyone holding members.manage
 * reset the owner's password, change the owner's e-mail or delete the owner, with
 * no rank check at all, and everything useful it did now lives in the People area.
 * It is gone; an old bookmark lands on the Members tab instead of a 404.
 *
 * GET only, on purpose: a POST to one of the old form actions must not be turned
 * into anything, so it falls through to SvelteKit's 405.
 */
export const GET: RequestHandler = () => {
	redirect(308, '/app/manage/members');
};
