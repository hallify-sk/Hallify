import { serializeNonPOJOs } from '$lib/lib';

export const ssr = true;

/** @type {import('./$types').LayoutServerLoad} */
export async function load({ locals }) {
    return {
        user: locals.user ? serializeNonPOJOs(locals.user) : null,
        authExpired: locals.authExpired
    };
  }