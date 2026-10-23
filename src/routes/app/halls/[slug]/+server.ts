import { redirect } from '@sveltejs/kit';
import { findListedHall } from '$lib/server/discovery';
import { venuePagePath } from '$lib/marketing/types';
import type { RequestHandler } from './$types';

/**
 * Old venue page address (/app/halls/<id or slug>). The venue page now lives at
 * /priestory/<org>/<hall>, where it can be indexed; links already shared keep
 * working. A hall that is no longer listed sends the visitor to the directory.
 */
export const GET: RequestHandler = async ({ params, locals, url }) => {
  const hall = await findListedHall(locals.db, params.slug);
  const lang = url.searchParams.get('lang') === 'en' ? '?lang=en' : '';
  if (!hall) redirect(302, `/priestory${lang}`);
  redirect(301, `${venuePagePath(hall.org_slug, hall.slug)}${lang}`);
};
