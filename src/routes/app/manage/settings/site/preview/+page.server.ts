import { dbAll, fromJsonArr } from '$lib/db/index';
import { requireOrgPermission } from '$lib/server/access';
import { PLANS, type PlanId } from '$lib/plans';
import type { PageServerLoad } from './$types';

/**
 * Data for the builder's live preview.
 *
 * The preview renders the org's REAL venues, not placeholder copy: the arrangement
 * an operator is choosing between only makes sense against their own photographs
 * and their own capacities. A page of lorem ipsum would make the Featured section
 * look identical for everyone, which is the exact problem the builder exists to fix.
 *
 * Its own guard, and its own query. It is a route, so it is reachable directly and
 * must not rely on the settings page having checked anything.
 */
export const load: PageServerLoad = async ({ locals }) => {
  const org = await requireOrgPermission(locals, 'settings.manage');

  // Same selection as the live site (src/routes/halls/+page.server.ts) so the
  // preview cannot show a venue the public page hides, or vice versa.
  const halls = await dbAll<{
    id: string;
    name: string;
    description: string | null;
    max_people: number;
    slug: string;
    cover_image_url: string | null;
    amenities: unknown;
    address: string | null;
    contact_phone: string | null;
    contact_email: string | null;
    contact_website: string | null;
  }>(
    locals.db,
    `SELECT id, name, description, max_people, slug, cover_image_url, amenities, address,
            contact_phone, contact_email, contact_website
       FROM halls
      WHERE is_public = 1 AND slug IS NOT NULL AND org_id = ?
      ORDER BY name`,
    org.id
  );

  const paid = PLANS[org.subscription.plan as PlanId]?.limits.customBranding ?? false;
  const allowPremium =
    paid && (org.subscription.status === 'active' || org.subscription.status === 'trialing');

  return {
    org: { name: org.name, logoUrl: org.logoUrl },
    allowPremium,
    halls: halls.map((h) => ({
      ...h,
      // Stored as a JSON array of keys; anything else in the column is ignored
      // rather than allowed to reach the renderer as a non-string.
      amenities: fromJsonArr(h.amenities as string | null).filter(
        (a): a is string => typeof a === 'string'
      )
    }))
  };
};
