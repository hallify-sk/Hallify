import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
  // On a bubble (org subdomain / custom domain) hooks already redirect "/" → /halls,
  // so this only runs on the main app. A logged-in user here is an organization user —
  // send them straight to their dashboard instead of the marketing landing page.
  if (locals.user) redirect(303, '/app');

  const raw = url.searchParams.get('lang');
  const lang: 'sk' | 'en' | null = raw === 'en' ? 'en' : raw === 'sk' ? 'sk' : null;
  const origin = url.origin;

  return {
    lang,
    canonicalSk: `${origin}/`,
    canonicalEn: `${origin}/?lang=en`,
  };
};
