import { dbAll } from '$lib/db/index';
import { getPlan, type PlanId } from '$lib/plans';
import { isReservedSubdomain } from '$lib/reserved-subdomains';
import { DOW_KEYS, earliestBookableISO, isDateBlocked, isoLocal, parseDow, parseISO, type BlockRow } from '$lib/availability';

/**
 * What the public directory, the apex venue pages and the sitemap agree a "listed"
 * hall is. Expects the hall aliased `h` and its organisation `o`.
 *
 * Public is not enough. A hall is created public, so without the rest of this a
 * freshly created "Nová sála" with no slug, address or photo appeared in the
 * directory at once, with a card that led nowhere. A listed hall must also:
 *  - be live: not locked by a plan downgrade, not archived, its organisation not
 *    suspended (the directory hid these, but the apex venue page still showed the
 *    contact details of a suspended venue);
 *  - have a slug, because the venue page and the venue's own site address it by one;
 *  - say where it is: an address or a map position, or a visitor cannot judge it.
 */
export const LISTED_HALL_SQL = `h.is_public = 1 AND h.plan_locked = 0 AND h.archived_at IS NULL
  AND o.suspended_at IS NULL
  AND h.slug IS NOT NULL AND TRIM(h.slug) != ''
  AND (TRIM(COALESCE(h.address, '')) != '' OR (h.latitude IS NOT NULL AND h.longitude IS NOT NULL))`;

/** The same rule for a database that does not have the coordinate columns yet. */
export const LISTED_HALL_SQL_WITHOUT_COORDINATES = `h.is_public = 1 AND h.plan_locked = 0 AND h.archived_at IS NULL
  AND o.suspended_at IS NULL
  AND h.slug IS NOT NULL AND TRIM(h.slug) != ''
  AND TRIM(COALESCE(h.address, '')) != ''`;

/**
 * Whether the hall's organisation is a Hallify partner: anyone on a paid plan, plus
 * anyone the platform has flagged by hand. Deriving it from the subscription means
 * partner status follows payment without an admin having to remember; keeping the
 * flag means a partnership that is not a straightforward paid plan can still be
 * granted. 'trialing' counts -- they are on a paid tier -- while past_due/cancelled/
 * paused do not. A directory-only venue (listing_only, not on Hallify) never is, even
 * if someone ticked the flag. Expects `o` and its subscription `s` (LEFT JOINed).
 */
export const PARTNER_SQL =
  `CASE WHEN o.listing_only = 0 AND (o.is_hallify_partner = 1
        OR (s.plan IS NOT NULL AND s.plan != 'free' AND s.status IN ('active','trialing')))
   THEN 1 ELSE 0 END`;

/**
 * The organisation's custom domain, when it has one that actually routes: verified
 * (Cloudflare reported it active), the only state hooks.server.ts serves. Mirrors
 * orgPublicBaseUrl in $lib/orgUrl, as a column so a whole listing needs one query.
 * Expects the organisation aliased `o`.
 */
export const CUSTOM_DOMAIN_SQL = `(SELECT cd.domain FROM custom_domains cd
    WHERE cd.org_id = o.id AND cd.verified_at IS NOT NULL
    ORDER BY cd.created_at DESC LIMIT 1)`;

export interface ListedHallRef {
  slug: string;
  org_slug: string;
  allow_reservations: number;
  booking_mode: string;
  listing_only: number;
  plan: string | null;
  custom_domain: string | null;
}

/**
 * Find a listed hall by the identifier the old /app/halls/<id-or-slug> links used,
 * so they can be redirected. A hall slug is only unique within its organisation, so
 * a slug that more than one organisation uses resolves to nothing rather than to a
 * guess; the UUID form, which the directory itself linked to, is always unique.
 */
export async function findListedHall(db: App.Locals['db'], idOrSlug: string): Promise<ListedHallRef | null> {
  const rows = await dbAll<ListedHallRef>(db,
    `SELECT h.slug, o.slug AS org_slug, h.allow_reservations, h.booking_mode, o.listing_only, s.plan AS plan, ${CUSTOM_DOMAIN_SQL} AS custom_domain
       FROM halls h JOIN organizations o ON o.id = h.org_id
       LEFT JOIN subscriptions s ON s.org_id = o.id
      WHERE (h.id = ? OR h.slug = ?) AND ${LISTED_HALL_SQL}
      LIMIT 2`,
    idOrSlug, idOrSlug);
  return rows.length === 1 ? rows[0] : null;
}

function isLocalHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.localhost') || hostname.endsWith('.local');
}

/**
 * The origin of a venue's own site, where its clients sign up and book: the custom
 * domain when the plan includes one (hooks only serve it then), otherwise the free
 * `<org-slug>.<HALLIFY_DOMAIN>` subdomain. No trailing slash.
 *
 * Bookings live there and only there: a client account belongs to one venue, and
 * an apex session is always an organisation account, so a directory visitor who
 * wants to book has to be sent to the venue's site rather than kept on the apex.
 *
 * In development (HALLIFY_DOMAIN=localhost) the subdomain is built on the request's
 * own scheme and port, so `<slug>.localhost:5173` works the way hooks expect. Returns null when
 * there is no address that would route (a reserved label and no custom domain), and
 * for a directory-only venue, which has no site.
 */
export function venueSiteOrigin(
  org: { slug: string | null; custom_domain?: string | null; plan?: string | null; listing_only?: number | boolean | null },
  requestUrl: URL,
  appDomain: string,
): string | null {
  // A directory-only venue is not on Hallify: it has no site of its own (hooks send
  // its subdomain to the apex), and its directory page is the only page it has.
  if (org.listing_only) return null;
  if (org.custom_domain && getPlan((org.plan ?? 'free') as PlanId).limits.customDomains) {
    return `https://${org.custom_domain}`;
  }
  const slug = org.slug?.trim().toLowerCase();
  if (!slug || isReservedSubdomain(slug) || !/^[a-z0-9-]+$/.test(slug)) return null;
  if (isLocalHost(requestUrl.hostname) && isLocalHost(appDomain)) {
    const port = requestUrl.port ? `:${requestUrl.port}` : '';
    return `${requestUrl.protocol}//${slug}.${appDomain}${port}`;
  }
  return `https://${slug}.${appDomain}`;
}

// ── Availability on a date, for the directory's date filter ──

/** How far ahead the directory answers availability questions. */
const AVAILABILITY_HORIZON_DAYS = 2 * 366;

/**
 * A YYYY-MM-DD the directory can be asked about: a real calendar date, not in the
 * past and not absurdly far ahead. Anything else is null and the filter is ignored.
 */
export function parseSearchDate(raw: string | null | undefined, today = isoLocal(new Date())): string | null {
  const value = raw?.trim() ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  if (isoLocal(parseISO(value)) !== value) return null; // 2026-02-31 rolls over: not a date
  if (value < today) return null;
  const limit = parseISO(today);
  limit.setDate(limit.getDate() + AVAILABILITY_HORIZON_DAYS);
  return value > isoLocal(limit) ? null : value;
}

export interface AvailabilityFacts {
  min_days_advance: number | null;
  opening_hours: string | null;
  /** Reservations already in the date's month (non-cancelled). */
  month_count: number;
  /** The plan's monthly cap per hall, -1 for none. */
  month_limit: number;
  taken: boolean;
  blocks: BlockRow[];
}

/**
 * Whether a hall could be booked on `date`, by the rules the booking form enforces
 * (assertCanBook): notice period, the plan's monthly cap, days marked closed,
 * blocked dates and an existing booking. A short hold by someone in the middle of
 * booking does not count; it expires within minutes.
 */
export function isBookableOn(facts: AvailabilityFacts, date: string): boolean {
  if (date < earliestBookableISO(facts.min_days_advance)) return false;
  if (facts.month_limit !== -1 && facts.month_count >= facts.month_limit) return false;
  if (facts.opening_hours) {
    try {
      const hours = JSON.parse(facts.opening_hours) as Record<string, { open?: boolean }>;
      const dow = parseISO(date).getDay();
      const day = hours[DOW_KEYS[dow]] ?? hours[String(dow)];
      if (day && day.open === false) return false;
    } catch { /* malformed: the booking form does not block on it either */ }
  }
  if (isDateBlocked(facts.blocks, date)) return false;
  return !facts.taken;
}

/** Ids of listed halls that take bookings through Hallify and are free on `date`.
 *  An external hall has no calendar here, so it is never "free" on a date. */
export async function availableHallIds(db: App.Locals['db'], date: string): Promise<string[]> {
  const listed = `FROM halls h JOIN organizations o ON o.id = h.org_id
    LEFT JOIN subscriptions s ON s.org_id = o.id
    WHERE ${LISTED_HALL_SQL} AND h.allow_reservations = 1 AND h.booking_mode = 'hallify'`;
  const [halls, taken, months, blocks] = await Promise.all([
    dbAll<{ id: string; min_days_advance: number | null; opening_hours: string | null; plan: string | null }>(db,
      `SELECT h.id, h.min_days_advance, h.opening_hours, s.plan AS plan ${listed}`),
    dbAll<{ hall_id: string }>(db,
      `SELECT DISTINCT r.hall_id FROM reservations r
        WHERE substr(r.event_date, 1, 10) = ? AND r.status != 'cancelled'`, date),
    dbAll<{ hall_id: string; n: number }>(db,
      `SELECT r.hall_id, COUNT(*) AS n FROM reservations r
        WHERE substr(r.event_date, 1, 7) = ? AND r.status != 'cancelled'
        GROUP BY r.hall_id`, date.slice(0, 7)),
    dbAll<{ hall_id: string; block_type: string; date_from: string | null; date_to: string | null; days_of_week: unknown }>(db,
      `SELECT b.hall_id, b.block_type, b.date_from, b.date_to, b.days_of_week FROM hall_blocks b
        WHERE b.hall_id IN (SELECT h.id ${listed})`),
  ]);
  const takenIds = new Set(taken.map(row => row.hall_id));
  const monthCounts = new Map(months.map(row => [row.hall_id, row.n]));
  const blocksByHall = new Map<string, BlockRow[]>();
  for (const block of blocks) {
    const list = blocksByHall.get(block.hall_id) ?? [];
    list.push({ block_type: block.block_type, date_from: block.date_from, date_to: block.date_to, days_of_week: parseDow(block.days_of_week) });
    blocksByHall.set(block.hall_id, list);
  }
  return halls.filter(hall => isBookableOn({
    min_days_advance: hall.min_days_advance,
    opening_hours: hall.opening_hours,
    month_count: monthCounts.get(hall.id) ?? 0,
    month_limit: getPlan((hall.plan ?? 'free') as PlanId).limits.maxReservationsPerHallMonth,
    taken: takenIds.has(hall.id),
    blocks: blocksByHall.get(hall.id) ?? [],
  }, date)).map(hall => hall.id);
}
