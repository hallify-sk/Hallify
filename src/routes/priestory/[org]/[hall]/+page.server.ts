import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { dbAll, dbFirst, fromJson, fromJsonArr } from '$lib/db/index';
import type { HallDayHours, HallRow } from '$lib/db/index';
import { getPlan, type PlanId } from '$lib/plans';
import { st } from '$lib/i18n-server';
import { CUSTOM_DOMAIN_SQL, LISTED_HALL_SQL, venueSiteOrigin } from '$lib/server/discovery';
import { venuePagePath } from '$lib/marketing/types';
import type { PageServerLoad } from './$types';
import { MARKETING_THEME_COOKIE, readMarketingTheme } from '$lib/marketing/theme.svelte';

type Row = HallRow & {
  latitude: number | null; longitude: number | null; price_band: 1 | 2 | 3 | null;
  org_slug: string; org_name: string; plan: string | null; custom_domain: string | null; is_partner: number;
};

/**
 * A venue's public page in the Hallify directory.
 *
 * It used to live at /app/halls/<id>: behind robots.txt's Disallow: /app/, so no
 * venue could be found by a search engine, and with a booking button that only a
 * client account could use -- which can never hold a session on the apex. This page
 * is indexable, and booking sends the visitor to the venue's own site, where they
 * sign in or register as that venue's client.
 */
export const load: PageServerLoad = async ({ params, locals, url, cookies }) => {
  const hall = await dbFirst<Row>(locals.db,
    `SELECT h.*, o.slug AS org_slug, o.name AS org_name, s.plan AS plan, ${CUSTOM_DOMAIN_SQL} AS custom_domain,
        CASE WHEN o.is_hallify_partner = 1
          OR (s.plan IS NOT NULL AND s.plan != 'free' AND s.status IN ('active','trialing')) THEN 1 ELSE 0 END AS is_partner
       FROM halls h JOIN organizations o ON o.id = h.org_id
       LEFT JOIN subscriptions s ON s.org_id = o.id
      WHERE o.slug = ? AND h.slug = ? AND ${LISTED_HALL_SQL}
      LIMIT 1`,
    params.org, params.hall);
  if (!hall) error(404, st(locals.locale).serverErrors.hallNotFound);

  // The gallery follows the plan, exactly as on the venue's own site: a downgrade
  // hides the extra photos without deleting them.
  const galleryLimit = getPlan((hall.plan ?? 'free') as PlanId).limits.maxGalleryImages;
  let gallery = fromJsonArr(hall.gallery_images as string | null).filter((item): item is string => typeof item === 'string');
  if (galleryLimit !== -1 && gallery.length > galleryLimit) gallery = gallery.slice(0, galleryLimit);

  // Custom amenities are the organisation's own rows; the page shows their labels,
  // never the stored key ("custom-virivka").
  let customAmenities: { slug: string; label_sk: string | null; label_en: string | null }[] = [];
  try {
    customAmenities = await dbAll(locals.db, 'SELECT slug, label_sk, label_en FROM org_amenities WHERE org_id = ?', hall.org_id);
  } catch { /* table arrives with 0006; without it only built-in amenities exist */ }

  const site = venueSiteOrigin({ slug: hall.org_slug, custom_domain: hall.custom_domain, plan: hall.plan }, url, env.HALLIFY_DOMAIN ?? 'hallify.app');
  const hallPath = `/halls/${encodeURIComponent(hall.slug!)}`;
  const canonical = `${url.origin}${venuePagePath(hall.org_slug, hall.slug!)}`;

  return {
    hall: {
      id: hall.id,
      name: hall.name,
      slug: hall.slug!,
      description: hall.description,
      address: hall.address,
      max_people: hall.max_people,
      latitude: hall.latitude,
      longitude: hall.longitude,
      cover_image_url: hall.cover_image_url,
      gallery_images: gallery,
      amenities: fromJsonArr(hall.amenities as string | null).filter((item): item is string => typeof item === 'string'),
      opening_hours: fromJson<Record<string, HallDayHours>>(hall.opening_hours as string | null),
      pricing_info: hall.pricing_info,
      price_band: hall.price_band,
      contact_phone: hall.contact_phone,
      contact_email: hall.contact_email,
      contact_website: hall.contact_website,
      allow_reservations: !!hall.allow_reservations,
      has_floorplan: !!(hall.floorplan_json && hall.floorplan_json !== ''),
      is_partner: hall.is_partner === 1,
      color: hall.color,
    },
    org: { name: hall.org_name, slug: hall.org_slug },
    customAmenities,
    siteHref: site ? `${site}${hallPath}` : null,
    bookHref: site && hall.allow_reservations ? `${site}${hallPath}/book` : null,
    canonicalSk: canonical,
    canonicalEn: `${canonical}?lang=en`,
    origin: url.origin,
    marketingTheme: readMarketingTheme(cookies.get(MARKETING_THEME_COOKIE)),
  };
};
