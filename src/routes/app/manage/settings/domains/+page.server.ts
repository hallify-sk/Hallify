import { fail } from '@sveltejs/kit';
import { dbAll, dbFirst, dbRun } from '$lib/db/index';
import { addCustomHostname, deleteCustomHostname, getHostnameStatus, isCFEnabled } from '$lib/cloudflare-saas';
import { getPlan } from '$lib/plans';
import { st } from '$lib/i18n-server';
import { env } from '$env/dynamic/private';
import type { PageServerLoad, Actions } from './$types';
import { requireOrgStaff } from '$lib/guards';

interface DomainRow {
  id: string;
  domain: string;
  cf_hostname_id: string | null;
  verified_at: string | null;
  created_at: string;
}

export const load: PageServerLoad = async ({ locals }) => {
  const org = locals.currentOrg!;

  const domains = await dbAll<DomainRow>(locals.db,
    `SELECT id, domain, cf_hostname_id, verified_at, created_at
    FROM custom_domains
    WHERE org_id = ?
    ORDER BY created_at DESC`,
    org.id
  );

  const appDomain = env.HALLIFY_DOMAIN ?? 'hallify.app';
  const subdomain = `${org.slug}.${appDomain}`;
  const customDomainsAllowed = getPlan(org.subscription.plan).limits.customDomains;

  return {
    domains,
    cfEnabled: isCFEnabled(),
    subdomain,
    customDomainsAllowed,
    plan: org.subscription.plan,
  };
};

export const actions: Actions = {
  add: async ({ request, locals }) => {
    requireOrgStaff(locals);
    const orgId = locals.currentOrg!.id;

    // Custom domains are a paid feature. Free orgs use their <slug>.hallify.sk subdomain.
    if (!getPlan(locals.currentOrg!.subscription.plan).limits.customDomains) {
      return fail(403, { error: st(locals.locale).serverErrors.customDomainsPaidPlan });
    }

    const data = await request.formData();
    const domain = String(data.get('domain') ?? '').toLowerCase().trim();

    if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
      return fail(400, { error: st(locals.locale).serverErrors.enterValidDomain });
    }

    // Don't allow claiming a hallify subdomain as a "custom" domain.
    const appDomain = env.HALLIFY_DOMAIN ?? 'hallify.app';
    if (domain === appDomain || domain.endsWith(`.${appDomain}`)) {
      return fail(400, { error: st(locals.locale).serverErrors.useFreeSubdomainInstead });
    }

    // Check not already taken
    const existing = await dbFirst<{ id: string }>(locals.db,
      'SELECT id FROM custom_domains WHERE domain = ?',
      domain
    );
    if (existing) return fail(400, { error: st(locals.locale).serverErrors.domainAlreadyRegistered });

    let cfHostnameId: string | null = null;
    if (isCFEnabled()) {
      try {
        const cf = await addCustomHostname(domain);
        cfHostnameId = cf.id;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return fail(502, { error: st(locals.locale).serverErrors.cloudflareError(msg) });
      }
    }

    await dbRun(locals.db,
      'INSERT INTO custom_domains (id, org_id, domain, cf_hostname_id) VALUES (?, ?, ?, ?)',
      crypto.randomUUID(), orgId, domain, cfHostnameId
    );

    return { success: true };
  },

  refresh: async ({ request, locals }) => {
    requireOrgStaff(locals);
    const orgId = locals.currentOrg!.id;
    const data = await request.formData();
    const id = String(data.get('id') ?? '');

    const row = await dbFirst<DomainRow>(locals.db,
      'SELECT * FROM custom_domains WHERE id = ? AND org_id = ?',
      id, orgId
    );
    if (!row) return fail(404, { error: st(locals.locale).serverErrors.domainNotFound });
    if (!row.cf_hostname_id) return fail(400, { error: st(locals.locale).serverErrors.noCloudflareRecordToRefresh });

    // Report the outcome: a refresh that finds the domain still pending changes nothing
    // on screen, so without this the button looks broken.
    let verified = !!row.verified_at;
    try {
      const cf = await getHostnameStatus(row.cf_hostname_id);
      if (cf.ssl?.status === 'active' && cf.status === 'active') {
        await dbRun(locals.db,
          `UPDATE custom_domains SET verified_at = datetime('now') WHERE id = ? AND org_id = ?`,
          id, orgId
        );
        verified = true;
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return fail(502, { error: st(locals.locale).serverErrors.cloudflareError(msg) });
    }

    return { success: true, refreshed: true, verified };
  },

  delete: async ({ request, locals }) => {
    requireOrgStaff(locals);
    const orgId = locals.currentOrg!.id;
    const data = await request.formData();
    const id = String(data.get('id') ?? '');

    const row = await dbFirst<DomainRow>(locals.db,
      'SELECT * FROM custom_domains WHERE id = ? AND org_id = ?',
      id, orgId
    );
    if (!row) return fail(404, { error: st(locals.locale).serverErrors.domainNotFound });

    if (row.cf_hostname_id && isCFEnabled()) {
      try {
        await deleteCustomHostname(row.cf_hostname_id);
      } catch { /* log but continue — still delete from DB */ }
    }

    await dbRun(locals.db, 'DELETE FROM custom_domains WHERE id = ? AND org_id = ?', id, orgId);
    return { success: true };
  }
};
