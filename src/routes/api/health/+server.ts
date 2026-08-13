import { json } from '@sveltejs/kit';
import { dbFirst } from '$lib/db/index';
import type { RequestHandler } from './$types';

/** Uptime-monitor endpoint. Public and unauthenticated by design, so it must not leak
 *  anything: no version, no counts, no configuration — just whether the Worker is up
 *  and whether it can actually reach D1 (a Worker that is "up" but cannot query the
 *  database is down as far as users are concerned).
 *
 *  Returns 200 when healthy, 503 otherwise, so a monitor can alert on status alone. */
export const GET: RequestHandler = async ({ locals }) => {
  let dbOk = false;
  try {
    const row = await dbFirst<{ ok: number }>(locals.db, 'SELECT 1 AS ok');
    dbOk = row?.ok === 1;
  } catch {
    dbOk = false;
  }

  return json(
    { status: dbOk ? 'ok' : 'degraded', db: dbOk },
    {
      status: dbOk ? 200 : 503,
      headers: { 'cache-control': 'no-store' },
    }
  );
};
