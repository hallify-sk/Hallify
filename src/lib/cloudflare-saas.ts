/**
 * Cloudflare for SaaS — custom hostname management.
 *
 * Required env vars (optional — feature degrades gracefully if absent):
 *   CF_ZONE_ID    Cloudflare zone ID for the Hallify domain
 *   CF_API_TOKEN  API token with Zone > Custom Hostnames: Edit permission
 *
 * Setup: enable "Cloudflare for SaaS" on your zone in the CF dashboard,
 * then set a fallback origin (e.g. custom.hallify.app → your origin server).
 * Customers point their DNS CNAME → custom.hallify.app.
 */

import { env } from '$env/dynamic/private';

const BASE = 'https://api.cloudflare.com/client/v4';

export function isCFEnabled(): boolean {
  return !!(env.CF_ZONE_ID && env.CF_API_TOKEN);
}

function headers() {
  return {
    'Authorization': `Bearer ${env.CF_API_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

export interface CFHostname {
  id: string;
  hostname: string;
  ssl: {
    status: 'pending_validation' | 'pending_issuance' | 'pending_deployment' | 'active' | 'deleted' | string;
    validation_errors?: { message: string }[];
  };
  status: 'active' | 'pending' | string;
  created_at: string;
}

/** Register a custom hostname with Cloudflare for SaaS. Returns the hostname record. */
export async function addCustomHostname(domain: string): Promise<CFHostname> {
  if (!isCFEnabled()) throw new Error('Cloudflare for SaaS is not configured.');

  const res = await fetch(`${BASE}/zones/${env.CF_ZONE_ID}/custom_hostnames`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      hostname: domain,
      ssl: {
        method: 'http',
        type: 'dv',
        settings: { min_tls_version: '1.2', ciphers: ['ECDHE-RSA-AES128-GCM-SHA256', 'AES128-SHA'] },
        bundle_method: 'ubiquitous',
        wildcard: false,
      },
    }),
  });

  const body = await res.json() as { success: boolean; result: CFHostname; errors: { message: string }[] };
  if (!body.success) throw new Error(body.errors?.[0]?.message ?? 'Cloudflare API error');
  return body.result;
}

/** Fetch current status of a custom hostname. Use for polling until ssl.status === 'active'. */
export async function getHostnameStatus(cfHostnameId: string): Promise<CFHostname> {
  if (!isCFEnabled()) throw new Error('Cloudflare for SaaS is not configured.');

  const res = await fetch(`${BASE}/zones/${env.CF_ZONE_ID}/custom_hostnames/${cfHostnameId}`, {
    headers: headers(),
  });

  const body = await res.json() as { success: boolean; result: CFHostname; errors: { message: string }[] };
  if (!body.success) throw new Error(body.errors?.[0]?.message ?? 'Cloudflare API error');
  return body.result;
}

/** Remove a custom hostname from Cloudflare. */
export async function deleteCustomHostname(cfHostnameId: string): Promise<void> {
  if (!isCFEnabled()) throw new Error('Cloudflare for SaaS is not configured.');

  const res = await fetch(`${BASE}/zones/${env.CF_ZONE_ID}/custom_hostnames/${cfHostnameId}`, {
    method: 'DELETE',
    headers: headers(),
  });

  const body = await res.json() as { success: boolean; errors: { message: string }[] };
  if (!body.success) throw new Error(body.errors?.[0]?.message ?? 'Cloudflare API error');
}
