import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * The old in-app venue list. It duplicated the directory under /app/, where robots.txt
 * keeps search engines out, and showed halls the directory had already hidden
 * (plan-locked halls, suspended organisations). Old links now land in the directory,
 * search included.
 */
export const GET: RequestHandler = ({ url }) => {
  const params = new URLSearchParams();
  const q = url.searchParams.get('q')?.trim();
  if (q) params.set('q', q.slice(0, 150));
  const lang = url.searchParams.get('lang');
  if (lang === 'en') params.set('lang', lang);
  const query = params.toString();
  redirect(308, query ? `/priestory?${query}` : '/priestory');
};
