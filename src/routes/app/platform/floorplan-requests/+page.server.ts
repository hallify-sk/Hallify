import { fail } from '@sveltejs/kit';
import { dbAll, dbFirst, dbRun } from '$lib/db/index';
import { requirePlatformAdmin } from '$lib/guards';
import { st } from '$lib/i18n-server';
import { SETUP_OPEN_STATUSES, SETUP_SERVICE_STATUSES, type SetupStatus } from '$lib/setup-service';
import {
  MAPPING_STATUSES, MAX_DELIVERY_FILE, MAX_REPLY_NOTE, announceMappingStatus, canDeliver, deliveryFileKey,
  isMappingStatus, sniffDeliveryType, type MappingStatus
} from '$lib/server/floorplan-mapping';
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

const STATUSES = MAPPING_STATUSES;
type Status = MappingStatus;

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
    reply_note: string | null;
    delivery_file_name: string | null;
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
    `SELECT fr.id, fr.status, fr.note, fr.reply_note, fr.delivery_file_name, fr.created_at, fr.updated_at,
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
  /**
   * Move a request on. The venue is told every time (M25): an email with the
   * optional message, and a notification. Delivering needs something to deliver:
   * the plan drawn in the hall's editor, or a file attached here.
   */
  setStatus: async ({ request, locals, platform, url }) => {
    requirePlatformAdmin(locals);
    const e = st(locals.locale).serverErrors;
    const data = await request.formData();
    const id = String(data.get('id') ?? '');
    const status = String(data.get('status') ?? '');
    const reply = String(data.get('reply') ?? '').trim().slice(0, MAX_REPLY_NOTE) || null;
    const file = data.get('file');

    if (!isMappingStatus(status)) return fail(400, { error: e.invalidStatus });

    const row = await dbFirst<{ status: string; has_floorplan: number; delivery_file_key: string | null }>(locals.db,
      `SELECT fr.status, CASE WHEN h.floorplan_json IS NOT NULL THEN 1 ELSE 0 END AS has_floorplan, fr.delivery_file_key
         FROM floorplan_requests fr JOIN halls h ON h.id = fr.hall_id WHERE fr.id = ? LIMIT 1`, id);
    if (!row) return fail(404, { error: e.notFound });

    // The file the plan is handed over in, kept in private storage.
    let upload: { key: string; name: string; type: string } | null = null;
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_DELIVERY_FILE) return fail(400, { error: e.mappingFileInvalid, id });
      const bytes = await file.arrayBuffer();
      const type = sniffDeliveryType(new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 16)));
      if (!type) return fail(400, { error: e.mappingFileInvalid, id });
      const r2 = platform?.env?.R2;
      if (!r2) return fail(503, { error: e.mappingFileUnavailable, id });
      const name = file.name.trim().slice(0, 120) || 'podorys';
      const key = deliveryFileKey(id, name);
      try {
        await r2.put(key, bytes, { httpMetadata: { contentType: type } });
      } catch {
        return fail(502, { error: e.mappingFileUnavailable, id });
      }
      upload = { key, name, type };
    }

    if (status === 'delivered' && !canDeliver(!!row.has_floorplan, !!(upload || row.delivery_file_key))) {
      return fail(400, { error: e.mappingNothingToDeliver, id });
    }
    // Nothing changes and nothing new to say: no email for a repeated click.
    if (status === row.status && !reply && !upload) return { saved: true };

    await dbRun(locals.db,
      `UPDATE floorplan_requests
          SET status = ?, reply_note = ?,
              delivery_file_key = COALESCE(?, delivery_file_key),
              delivery_file_name = COALESCE(?, delivery_file_name),
              delivery_file_type = COALESCE(?, delivery_file_type),
              updated_at = datetime('now')
        WHERE id = ?`,
      status, reply, upload?.key ?? null, upload?.name ?? null, upload?.type ?? null, id);
    // A replaced file goes; nobody can download it any more.
    if (upload && row.delivery_file_key) await platform?.env?.R2?.delete(row.delivery_file_key).catch(() => {});

    const notified = await announceMappingStatus(locals.db, id, url.origin, locals.user?.id ?? null);
    return { saved: true, notified };
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
