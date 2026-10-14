import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { publicVenues } from '$lib/server/public-venues';

export const load: PageServerLoad = async ({ locals, url, setHeaders }) => {
  // On a bubble (org subdomain / custom domain) hooks already redirect "/" → /halls,
  // so this only runs on the main app. Staff keep their dashboard shortcut;
  // client accounts can discover public venues here.
  if (locals.user && locals.user.account_type !== 'client') redirect(303, '/app');

  const raw = url.searchParams.get('lang');
  const lang: 'sk' | 'en' | null = raw === 'en' ? 'en' : raw === 'sk' ? 'sk' : null;
  const origin = url.origin;
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 150);
  const requestedGuests = Number(url.searchParams.get('guests') ?? 0);
  const guests = Number.isInteger(requestedGuests) && requestedGuests >= 0 && requestedGuests <= 10000 ? requestedGuests : 0;
  const halls = await publicVenues(locals.db, ready => setHeaders({ 'x-hallify-directory-ready': ready ? '1' : '0' }));

  return {
    lang,
    canonicalSk: `${origin}/`,
    canonicalEn: `${origin}/?lang=en`,
    q,
    guests,
    halls,
    demo: url.searchParams.has('demo') ? url.searchParams.get('demo') === '1' : undefined,
  };
};
