import { serializeNonPOJOs } from '$lib/lib';
import type { AuthModel } from 'pocketbase';

export const ssr = true;

/** @type {import('./$types').LayoutServerLoad} */
export async function load({ locals }) {
    return {
        user: locals.user ? serializeNonPOJOs(locals.user) as AuthModel : null,
        authExpired: locals.authExpired
    };
}
