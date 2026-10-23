import { getPlan, type PlanId } from '$lib/plans';
import { isReservedSubdomain } from '$lib/reserved-subdomains';

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
 * The organisation's custom domain, when it has one that actually routes: a
 * Cloudflare hostname provisioned for it, a verified one preferred. Mirrors
 * orgPublicBaseUrl in $lib/orgUrl, as a column so a whole listing needs one query.
 * Expects the organisation aliased `o`.
 */
export const CUSTOM_DOMAIN_SQL = `(SELECT cd.domain FROM custom_domains cd
    WHERE cd.org_id = o.id AND cd.cf_hostname_id IS NOT NULL
    ORDER BY (cd.verified_at IS NOT NULL) DESC, cd.created_at DESC LIMIT 1)`;

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
 * there is no address that would route (a reserved label and no custom domain).
 */
export function venueSiteOrigin(
  org: { slug: string | null; custom_domain?: string | null; plan?: string | null },
  requestUrl: URL,
  appDomain: string,
): string | null {
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
