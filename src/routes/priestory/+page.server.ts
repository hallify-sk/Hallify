import { publicVenues } from '$lib/server/public-venues';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url, setHeaders }) => ({
  halls: await publicVenues(locals.db, ready => setHeaders({ 'x-hallify-directory-ready': ready ? '1' : '0' })),
  q: (url.searchParams.get('q') ?? '').trim().slice(0, 150),
  guests: Math.max(0, Math.min(10000, Number(url.searchParams.get('guests')) || 0)),
  floorplan: url.searchParams.get('floorplan') === '1',
  demo: url.searchParams.has('demo') ? url.searchParams.get('demo') === '1' : undefined,
  canonicalSk: `${url.origin}/priestory`,
  canonicalEn: `${url.origin}/priestory?lang=en`,
});
