import { fail } from '@sveltejs/kit';
import sql from '$lib/db';
import { addCustomHostname, deleteCustomHostname, getHostnameStatus, isCFEnabled } from '$lib/cloudflare-saas';
import type { PageServerLoad, Actions } from './$types';

interface DomainRow {
  id: string;
  domain: string;
  cf_hostname_id: string | null;
  verified_at: Date | null;
  created_at: Date;
}

export const load: PageServerLoad = async ({ locals }) => {
  const orgId = locals.currentOrg!.id;

  const domains = await sql<DomainRow[]>`
    SELECT id, domain, cf_hostname_id, verified_at, created_at
    FROM custom_domains
    WHERE org_id = ${orgId}
    ORDER BY created_at DESC
  `;

  return { domains, cfEnabled: isCFEnabled() };
};

export const actions: Actions = {
  add: async ({ request, locals }) => {
    const orgId = locals.currentOrg!.id;
    const data = await request.formData();
    const domain = String(data.get('domain') ?? '').toLowerCase().trim();

    if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
      return fail(400, { error: 'Enter a valid domain (e.g. bookings.myvenue.com).' });
    }

    // Check not already taken
    const [existing] = await sql<{ id: string }[]>`
      SELECT id FROM custom_domains WHERE domain = ${domain}
    `;
    if (existing) return fail(400, { error: 'This domain is already registered.' });

    let cfHostnameId: string | null = null;
    if (isCFEnabled()) {
      try {
        const cf = await addCustomHostname(domain);
        cfHostnameId = cf.id;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return fail(502, { error: `Cloudflare error: ${msg}` });
      }
    }

    await sql`
      INSERT INTO custom_domains (org_id, domain, cf_hostname_id)
      VALUES (${orgId}, ${domain}, ${cfHostnameId})
    `;

    return { success: true };
  },

  refresh: async ({ request, locals }) => {
    const orgId = locals.currentOrg!.id;
    const data = await request.formData();
    const id = String(data.get('id') ?? '');

    const [row] = await sql<DomainRow[]>`
      SELECT * FROM custom_domains WHERE id = ${id} AND org_id = ${orgId}
    `;
    if (!row) return fail(404, { error: 'Domain not found.' });
    if (!row.cf_hostname_id) return fail(400, { error: 'No Cloudflare record to refresh.' });

    try {
      const cf = await getHostnameStatus(row.cf_hostname_id);
      if (cf.ssl?.status === 'active' && cf.status === 'active') {
        await sql`UPDATE custom_domains SET verified_at = NOW() WHERE id = ${id}`;
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return fail(502, { error: `Cloudflare error: ${msg}` });
    }

    return { success: true };
  },

  delete: async ({ request, locals }) => {
    const orgId = locals.currentOrg!.id;
    const data = await request.formData();
    const id = String(data.get('id') ?? '');

    const [row] = await sql<DomainRow[]>`
      SELECT * FROM custom_domains WHERE id = ${id} AND org_id = ${orgId}
    `;
    if (!row) return fail(404, { error: 'Domain not found.' });

    if (row.cf_hostname_id && isCFEnabled()) {
      try {
        await deleteCustomHostname(row.cf_hostname_id);
      } catch { /* log but continue — still delete from DB */ }
    }

    await sql`DELETE FROM custom_domains WHERE id = ${id} AND org_id = ${orgId}`;
    return { success: true };
  }
};
