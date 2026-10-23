import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { findListedHall, venueSiteOrigin } from '$lib/server/discovery';
import { venuePagePath } from '$lib/marketing/types';
import type { RequestHandler } from './$types';

/**
 * Old apex booking address. Booking here only ever accepted client accounts, and a
 * client account can never hold a session on the apex, so nobody could book from
 * the directory. Bookings belong to the venue's own site, where the visitor signs in
 * or registers as that venue's client; this sends them there.
 */
export const GET: RequestHandler = async ({ params, locals, url }) => {
  const hall = await findListedHall(locals.db, params.slug);
  if (!hall) redirect(302, '/priestory');
  const site = venueSiteOrigin({ slug: hall.org_slug, custom_domain: hall.custom_domain, plan: hall.plan }, url, env.HALLIFY_DOMAIN ?? 'hallify.app');
  if (!site || !hall.allow_reservations) redirect(302, venuePagePath(hall.org_slug, hall.slug));
  redirect(303, `${site}/halls/${encodeURIComponent(hall.slug)}/book`);
};
