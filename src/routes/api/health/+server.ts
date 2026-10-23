import { json } from '@sveltejs/kit';
import { dbFirst } from '$lib/db/index';
import { emailServiceDown } from '$lib/email';
import type { RequestHandler } from './$types';

/** Uptime-monitor endpoint. Public and unauthenticated by design, so it must not leak
 *  anything: no version, no counts, no configuration — just whether the Worker is up
 *  and whether it can actually reach D1 (a Worker that is "up" but cannot query the
 *  database is down as far as users are concerned).
 *
 *  Returns 200 when healthy, 503 otherwise, so a monitor can alert on status alone.
 *
 *  `email` is false while no email can go out at all (no Brevo key, or Brevo refusing
 *  it and nothing delivered since). That outage once went unnoticed for a week: every
 *  password reset and booking email failed while the site looked healthy. */
export const GET: RequestHandler = async ({ locals }) => {
  let dbOk = false;
  try {
    const row = await dbFirst<{ ok: number }>(locals.db, 'SELECT 1 AS ok');
    dbOk = row?.ok === 1;
  } catch {
    dbOk = false;
  }

  const emailOk = dbOk ? !(await emailServiceDown(locals.db)) : false;
  const healthy = dbOk && emailOk;

  return json(
    { status: healthy ? 'ok' : 'degraded', db: dbOk, email: emailOk },
    {
      status: healthy ? 200 : 503,
      headers: { 'cache-control': 'no-store' },
    }
  );
};
