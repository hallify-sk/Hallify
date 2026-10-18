import { fail } from '@sveltejs/kit';
import { dbAll, dbFirst, dbRun } from '$lib/db/index';
import { requirePlatformAdmin } from '$lib/guards';
import { st } from '$lib/i18n-server';
import { SETUP_OPEN_STATUSES, SETUP_SERVICE_STATUSES, type SetupStatus } from '$lib/setup-service';
import type { PageServerLoad, Actions } from './$types';

/**
 * The queue behind "we map your venue for you".
 *
 * Operators could already ask for the add-on from their hall page, but nothing
 * read the requests — they went into floorplan_requests and stopped there, so
 * the half of the feature that earns the money did not exist.
 *
 * Platform-wide on purpose: this is a conversation with Hallify, not with the
 * operator's own organisation, which is why it is not a ticket.
 */

const STATUSES = ['requested', 'contacted', 'scheduled', 'delivered', 'cancelled'] as const;
type Status = (typeof STATUSES)[number];

/** Still needing work from us. Drives the "open" count and the default sort. */
const OPEN: Status[] = ['requested', 'contacted', 'scheduled'];

interface SetupRow {
  id: string;
  status: SetupStatus;
  note: string | null;
  price_cents: number;
  created_at: string;
  updated_at: string;
  org_id: string;
  org_name: string;
  plan: string | null;
  requester_email: string | null;
  requester_first_name: string | null;
  requester_last_name: string | null;
  hall_count: number;
}

export const load: PageServerLoad = async ({ locals }) => {
  // Its own guard. The platform layout only protects navigation, and the actions
  // below are reachable by direct POST without it ever running.
  requirePlatformAdmin(locals);

  const requests = await dbAll<{
    id: string;
    status: Status;
    note: string | null;
    created_at: string;
    updated_at: string;
    hall_id: string;
    hall_name: string;
    hall_address: string | null;
    max_people: number;
    has_floorplan: number;
    org_id: string;
    org_name: string;
    org_slug: string | null;
    plan: string | null;
    requester_email: string | null;
    requester_first_name: string | null;
    requester_last_name: string | null;
  }>(
    locals.db,
    // Open requests first and oldest first within each group: the queue should
    // read as a worklist, not as a reverse-chronological log.
    `SELECT fr.id, fr.status, fr.note, fr.created_at, fr.updated_at,
            h.id AS hall_id, h.name AS hall_name, h.address AS hall_address,
            h.max_people,
            CASE WHEN h.floorplan_json IS NOT NULL THEN 1 ELSE 0 END AS has_floorplan,
            o.id AS org_id, o.name AS org_name, o.slug AS org_slug,
            s.plan,
            u.email AS requester_email,
            u.first_name AS requester_first_name,
            u.last_name AS requester_last_name
       FROM floorplan_requests fr
       JOIN halls h ON h.id = fr.hall_id
       JOIN organizations o ON o.id = fr.org_id
       LEFT JOIN subscriptions s ON s.org_id = fr.org_id
       LEFT JOIN users u ON u.id = fr.requested_by
      ORDER BY CASE WHEN fr.status IN ('requested','contacted','scheduled') THEN 0 ELSE 1 END,
               fr.created_at`,
  );

  // The fixed-price setup service shares this screen: both are jobs Hallify owes
  // somebody, and splitting them across two pages means two places to forget to
  // look. They stay separate queues because they are separate products — one is
  // quoted after a site visit, the other has a price on it.
  let setupRequests: SetupRow[] = [];
  try {
    setupRequests = await dbAll<SetupRow>(
      locals.db,
      `SELECT sr.id, sr.status, sr.note, sr.price_cents, sr.created_at, sr.updated_at,
              o.id AS org_id, o.name AS org_name,
              s.plan,
              u.email AS requester_email,
              u.first_name AS requester_first_name,
              u.last_name AS requester_last_name,
              (SELECT COUNT(*) FROM halls h WHERE h.org_id = o.id) AS hall_count
         FROM setup_requests sr
         JOIN organizations o ON o.id = sr.org_id
         LEFT JOIN subscriptions s ON s.org_id = sr.org_id
         LEFT JOIN users u ON u.id = sr.requested_by
        ORDER BY CASE WHEN sr.status IN ('requested','contacted','in_progress') THEN 0 ELSE 1 END,
                 sr.created_at`
    );
  } catch {
    // Table arrives with migration 0010; absent is simply an empty queue.
  }

  return {
    requests,
    openCount: requests.filter((r) => OPEN.includes(r.status)).length,
    statuses: STATUSES,
    setupRequests,
    setupOpenCount: setupRequests.filter((r) => SETUP_OPEN_STATUSES.includes(r.status)).length,
    setupStatuses: SETUP_SERVICE_STATUSES
  };
};

export const actions: Actions = {
  setStatus: async ({ request, locals }) => {
    requirePlatformAdmin(locals);
    const data = await request.formData();
    const id = String(data.get('id') ?? '');
    const status = String(data.get('status') ?? '');

    if (!STATUSES.includes(status as Status)) {
      return fail(400, { error: st(locals.locale).serverErrors.invalidStatus });
    }

    const row = await dbFirst<{ ok: number }>(locals.db,
      'SELECT 1 AS ok FROM floorplan_requests WHERE id = ? LIMIT 1', id);
    if (!row) return fail(404, { error: st(locals.locale).serverErrors.notFound });

    await dbRun(locals.db,
      `UPDATE floorplan_requests SET status = ?, updated_at = datetime('now') WHERE id = ?`,
      status, id);

    return { saved: true };
  },

  setSetupStatus: async ({ request, locals }) => {
    requirePlatformAdmin(locals);
    const data = await request.formData();
    const id = String(data.get('id') ?? '');
    const status = String(data.get('status') ?? '');

    if (!SETUP_SERVICE_STATUSES.includes(status as SetupStatus)) {
      return fail(400, { error: st(locals.locale).serverErrors.invalidStatus });
    }

    const row = await dbFirst<{ ok: number }>(locals.db,
      'SELECT 1 AS ok FROM setup_requests WHERE id = ? LIMIT 1', id);
    if (!row) return fail(404, { error: st(locals.locale).serverErrors.notFound });

    await dbRun(locals.db,
      `UPDATE setup_requests SET status = ?, updated_at = datetime('now') WHERE id = ?`,
      status, id);

    return { saved: true };
  }
};
