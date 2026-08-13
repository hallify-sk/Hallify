import type { PageServerLoad } from './$types';

/** Locale is already resolved by hooks (?lang > cookie > org default > sk). Canonical
 *  + hreflang mirror the landing page so both language variants index correctly. */
export const load: PageServerLoad = ({ url }) => ({
  canonicalSk: `${url.origin}/terms`,
  canonicalEn: `${url.origin}/terms?lang=en`,
});
