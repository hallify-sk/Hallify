/**
 * Cloudflare for SaaS — custom hostname management.
 *
 * Required env vars (the feature switches off cleanly when they are absent):
 *   CF_ZONE_ID    Cloudflare zone ID for the Hallify domain
 *   CF_API_TOKEN  API token with Zone > Custom Hostnames: Edit permission
 * Optional:
 *   CF_CNAME_TARGET  the hostname customers point their CNAME at
 *                    (default fallback.hallify.sk, the zone's fallback origin)
 *
 * Setup: enable "Cloudflare for SaaS" on your zone in the CF dashboard,
 * then set a fallback origin (e.g. fallback.hallify.sk → the Worker).
 * Customers point their DNS CNAME → that hostname and add the ownership TXT record.
 * Status checks and verification live in $lib/server/custom-domains.
 */

import { env } from '$env/dynamic/private';

const BASE = 'https://api.cloudflare.com/client/v4';

export function isCFEnabled(): boolean {
  return !!(env.CF_ZONE_ID && env.CF_API_TOKEN);
}

/** Where customers point their CNAME. */
export function cnameTarget(): string {
  return (env.CF_CNAME_TARGET || 'fallback.hallify.sk').trim().toLowerCase();
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
    method?: string;
    validation_records?: { txt_name?: string; txt_value?: string; http_url?: string; http_body?: string }[];
    validation_errors?: { message: string }[];
  };
  status: 'active' | 'pending' | string;
  /** Why Cloudflare cannot activate the hostname yet ("no CNAME found", ...). */
  verification_errors?: string[];
  /** The TXT record that proves the customer controls the hostname. */
  ownership_verification?: { type?: string; name?: string; value?: string };
  created_at: string;
}

/** A Cloudflare API failure, with the HTTP status so callers can tell "gone" (404)
 *  from "try again later". */
export class CFApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: number) {
    super(message);
    this.name = 'CFApiError';
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!isCFEnabled()) throw new Error('Cloudflare for SaaS is not configured.');
  const res = await fetch(`${BASE}/zones/${env.CF_ZONE_ID}${path}`, { ...init, headers: headers() });
  const body = await res.json().catch(() => null) as { success?: boolean; result?: T; errors?: { code?: number; message: string }[] } | null;
  if (!body?.success) {
    const err = body?.errors?.[0];
    throw new CFApiError(err?.message ?? `Cloudflare API error (HTTP ${res.status})`, res.status, err?.code);
  }
  return body.result as T;
}

/** Register a custom hostname with Cloudflare for SaaS. Returns the hostname record. */
export async function addCustomHostname(domain: string): Promise<CFHostname> {
  return call<CFHostname>('/custom_hostnames', {
    method: 'POST',
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
}

/** The hostname record Cloudflare already holds for `domain`, if any (e.g. one left
 *  behind when the database row went away first). */
export async function findCustomHostname(domain: string): Promise<CFHostname | null> {
  const list = await call<CFHostname[]>(`/custom_hostnames?hostname=${encodeURIComponent(domain)}`);
  return list.find((h) => h.hostname === domain) ?? null;
}

/** Fetch current status of a custom hostname. Throws CFApiError with status 404 when
 *  Cloudflare no longer has it. */
export async function getHostnameStatus(cfHostnameId: string): Promise<CFHostname> {
  return call<CFHostname>(`/custom_hostnames/${encodeURIComponent(cfHostnameId)}`);
}

/** Remove a custom hostname from Cloudflare. */
export async function deleteCustomHostname(cfHostnameId: string): Promise<void> {
  await call<unknown>(`/custom_hostnames/${encodeURIComponent(cfHostnameId)}`, { method: 'DELETE' });
}
