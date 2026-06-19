// Subdomain labels that must never resolve to an org bubble and must never be
// taken as an organization slug (they'd shadow infra/marketing hostnames).
// Used by hooks.server.ts (bubble detection) and org creation (slug generation).
export const RESERVED_SUBDOMAINS = new Set<string>([
  'www', 'app', 'api', 'dev', 'fallback', 'origin', 'mail', 'admin',
  'static', 'assets', 'cdn', 'staging', 'support', 'status', 'blog',
  'help', 'docs', 'billing', 'auth', 'login',
]);

export function isReservedSubdomain(label: string): boolean {
  return RESERVED_SUBDOMAINS.has(label.toLowerCase());
}
