import { json } from '@sveltejs/kit';
import { availableHallIds, parseSearchDate } from '$lib/server/discovery';
import type { RequestHandler } from './$types';

/**
 * Which directory venues are free on a date: GET ?date=YYYY-MM-DD.
 *
 * Public on purpose and answers only "free or not" per listed hall that takes
 * bookings, never who booked what. The directory filters its own list with it,
 * so changing the date does not reload the page or lose the other filters.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
  const date = parseSearchDate(url.searchParams.get('date'));
  if (!date) return json({ error: 'invalid date' }, { status: 400 });
  const available = await availableHallIds(locals.db, date);
  return json({ date, available }, { headers: { 'cache-control': 'public, max-age=120' } });
};
