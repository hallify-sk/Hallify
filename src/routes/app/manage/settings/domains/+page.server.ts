import { fail } from '@sveltejs/kit';
import { dbAll, dbFirst, dbRun } from '$lib/db/index';
import { isCFEnabled, cnameTarget } from '$lib/cloudflare-saas';
import { getPlan } from '$lib/plans';
import { st } from '$lib/i18n-server';
import { env } from '$env/dynamic/private';
import type { PageServerLoad, Actions } from './$types';
import { requireOrgPermission } from '$lib/server/access';
import { tidyDomain, isValidCustomDomain, claimExpired, parseDnsRecords, domainState } from '$lib/custom-domain';
import {
  checkCustomDomain, refreshPendingDomains, registerCustomDomain, releaseCustomDomain,
  type DomainCheckRow,
} from '$lib/server/custom-domains';

interface DomainRow extends DomainCheckRow {
  cf_status: string | null;
  ssl_status: string | null;
  dns_records: string | null;
  check_error: string | null;
  checked_at: string | null;
}

const ROW_COLUMNS = 'id, org_id, domain, cf_hostname_id, verified_at, created_at';

export const load: PageServerLoad = async ({ locals }) => {
  const org = await requireOrgPermission(locals, 'settings.manage');
  const cfEnabled = isCFEnabled();

  // Pending domains are re-checked while the page is open (the page reloads its data
  // every half minute), so a domain turns verified without anyone pressing a button.
  // A Cloudflare hiccup must not take the settings page down with it.
  try { await refreshPendingDomains(locals.db, org.id); } catch { /* shown on the next check */ }

  const rows = await dbAll<DomainRow>(locals.db,
    `SELECT ${ROW_COLUMNS}, cf_status, ssl_status, dns_records, check_error, checked_at
    FROM custom_domains
    WHERE org_id = ?
    ORDER BY created_at DESC`,
    org.id
  );

  const appDomain = env.HALLIFY_DOMAIN ?? 'hallify.app';
  const subdomain = `${org.slug}.${appDomain}`;
  const customDomainsAllowed = getPlan(org.subscription.plan).limits.customDomains;

  return {
    domains: rows.map((d) => ({
      id: d.id,
      domain: d.domain,
      verified_at: d.verified_at,
      created_at: d.created_at,
      cf_status: d.cf_status,
      ssl_status: d.ssl_status,
      check_error: d.check_error,
      checked_at: d.checked_at,
      state: domainState(d, cfEnabled),
      records: parseDnsRecords(d.dns_records),
    })),
    cfEnabled,
    cnameTarget: cnameTarget(),
    subdomain,
    customDomainsAllowed,
    plan: org.subscription.plan,
  };
};

export const actions: Actions = {
  add: async ({ request, locals }) => {
    await requireOrgPermission(locals, 'settings.manage');
    const orgId = locals.currentOrg!.id;

    // Custom domains are a paid feature. Free orgs use their <slug>.hallify.sk subdomain.
    if (!getPlan(locals.currentOrg!.subscription.plan).limits.customDomains) {
      return fail(403, { error: st(locals.locale).serverErrors.customDomainsPaidPlan });
    }

    const data = await request.formData();
    const domain = tidyDomain(data.get('domain'));

    if (!isValidCustomDomain(domain)) {
      return fail(400, { error: st(locals.locale).serverErrors.enterValidDomain, domain });
    }

    // Don't allow claiming a hallify subdomain as a "custom" domain.
    const appDomain = env.HALLIFY_DOMAIN ?? 'hallify.app';
    if (domain === appDomain || domain.endsWith(`.${appDomain}`)) {
      return fail(400, { error: st(locals.locale).serverErrors.useFreeSubdomainInstead });
    }

    // Taken? A claim nobody verified does not hold a domain forever: after a week
    // without DNS pointing at us another organisation may add it (the hourly sweep
    // releases it too), so whoever typed someone else's domain first cannot lock the
    // real owner out.
    const existing = await dbFirst<DomainCheckRow>(locals.db,
      `SELECT ${ROW_COLUMNS} FROM custom_domains WHERE domain = ?`,
      domain
    );
    if (existing) {
      if (existing.org_id === orgId) return fail(400, { error: st(locals.locale).settingsPages.domainAlreadyYours, domain });
      if (existing.verified_at || !claimExpired(existing.created_at)) {
        return fail(400, { error: st(locals.locale).settingsPages.domainClaimedElsewhere, domain });
      }
      // Its Cloudflare hostname stays: the new claim adopts it when registering.
      await dbRun(locals.db, 'DELETE FROM custom_domains WHERE id = ?', existing.id);
    }

    const row: DomainCheckRow = {
      id: crypto.randomUUID(), org_id: orgId, domain,
      cf_hostname_id: null, verified_at: null, created_at: '',
    };
    await dbRun(locals.db,
      'INSERT INTO custom_domains (id, org_id, domain) VALUES (?, ?, ?)',
      row.id, orgId, domain
    );
    try {
      // Creates the Cloudflare custom hostname and stores the DNS records to show.
      await registerCustomDomain(locals.db, row);
    } catch (e: unknown) {
      // Cloudflare refused the hostname: do not keep a claim that can never verify.
      await dbRun(locals.db, 'DELETE FROM custom_domains WHERE id = ?', row.id);
      const msg = e instanceof Error ? e.message : String(e);
      return fail(502, { error: st(locals.locale).serverErrors.cloudflareError(msg), domain });
    }

    return { success: true };
  },

  refresh: async ({ request, locals }) => {
    await requireOrgPermission(locals, 'settings.manage');
    const orgId = locals.currentOrg!.id;
    const data = await request.formData();
    const id = String(data.get('id') ?? '');

    const row = await dbFirst<DomainCheckRow>(locals.db,
      `SELECT ${ROW_COLUMNS} FROM custom_domains WHERE id = ? AND org_id = ?`,
      id, orgId
    );
    if (!row) return fail(404, { error: st(locals.locale).serverErrors.domainNotFound });
    if (!isCFEnabled()) return fail(400, { error: st(locals.locale).serverErrors.noCloudflareRecordToRefresh });

    // Report the outcome: a check that finds the domain still pending changes little
    // on screen, so without this the button looks broken.
    const result = await checkCustomDomain(locals.db, row);
    if (!result.ok) {
      return fail(502, { error: st(locals.locale).serverErrors.cloudflareError(result.error ?? '') });
    }
    return { success: true, refreshed: true, verified: result.verified };
  },

  delete: async ({ request, locals }) => {
    await requireOrgPermission(locals, 'settings.manage');
    const orgId = locals.currentOrg!.id;
    const data = await request.formData();
    const id = String(data.get('id') ?? '');

    const row = await dbFirst<DomainCheckRow>(locals.db,
      `SELECT ${ROW_COLUMNS} FROM custom_domains WHERE id = ? AND org_id = ?`,
      id, orgId
    );
    if (!row) return fail(404, { error: st(locals.locale).serverErrors.domainNotFound });

    // Removes the Cloudflare hostname too (best-effort), then the row.
    await releaseCustomDomain(locals.db, row);
    return { success: true };
  }
};
