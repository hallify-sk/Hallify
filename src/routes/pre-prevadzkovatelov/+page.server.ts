import type { PageServerLoad } from './$types';
import { MARKETING_THEME_COOKIE, readMarketingTheme } from '$lib/marketing/theme.svelte';

export const load: PageServerLoad = ({ url, cookies }) => ({
  canonicalSk: `${url.origin}/pre-prevadzkovatelov`,
  canonicalEn: `${url.origin}/pre-prevadzkovatelov?lang=en`,
  ogImage: `${url.origin}/marketing/venue-conference.jpg`,
  marketingTheme: readMarketingTheme(cookies.get(MARKETING_THEME_COOKIE)),
});
