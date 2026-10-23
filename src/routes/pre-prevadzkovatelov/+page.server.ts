import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => ({
  canonicalSk: `${url.origin}/pre-prevadzkovatelov`,
  canonicalEn: `${url.origin}/pre-prevadzkovatelov?lang=en`,
  ogImage: `${url.origin}/marketing/venue-conference.jpg`,
});
