// Subdomain labels that must never resolve to an org bubble and must never be
// taken as an organization slug (they'd shadow infra/marketing hostnames).
// Used by hooks.server.ts (bubble detection), org creation (slug generation),
// the platform admin's slug change and discovery.
//
// A name here only keeps organisations off it. To have a hostname served by its own
// DNS record instead of the Worker, it also needs a Workers route with no Worker
// (Cloudflare → Workers Routes), as media.hallify.sk and company.hallify.sk have:
// the zone-wide `*/*` route otherwise sends it to the app.
// Not listed although they would belong here: 'hallify' and 'test' are existing
// organisations' slugs on production, and listing them would take their sites down.
export const RESERVED_SUBDOMAINS = new Set<string>([
  // Hallify's own hosts and infrastructure
  'www', 'app', 'api', 'dev', 'fallback', 'origin', 'admin', 'static', 'assets', 'cdn',
  'staging', 'stage', 'testing', 'beta', 'alpha', 'preview', 'demo', 'sandbox',
  'qa', 'uat', 'prod', 'production', 'internal', 'intranet', 'vpn', 'gateway', 'proxy',
  'edge', 'lb', 'ns', 'ns1', 'ns2', 'ns3', 'ns4', 'dns', 'git', 'ci', 'build', 'deploy',
  'monitor', 'monitoring', 'metrics', 'grafana', 'logs', 'sentry', 'health', 'ping',
  'media', 'files', 'file', 'img', 'images', 'image', 'upload', 'uploads', 'download',
  'downloads', 'storage', 'backup', 'company', 'corp', 'team', 'office', 'hq',
  // Mail (Zoho MX, Brevo sending) and the usual client autoconfig names
  'mail', 'mail2', 'email', 'e-mail', 'mx', 'mx1', 'mx2', 'mx3', 'smtp', 'imap', 'pop',
  'pop3', 'webmail', 'autodiscover', 'autoconfig', 'zoho', 'zmail', 'brevo', 'sendinblue',
  'em', 'bounce', 'bounces', 'newsletter', 'news', 'lists', 'list', 'postmaster',
  'abuse', 'noreply', 'no-reply', 'dmarc', 'dkim', 'spf', 'mta-sts', 'bimi',
  // Product, marketing and support
  'auth', 'login', 'signin', 'signup', 'register', 'account', 'accounts', 'id', 'sso',
  'oauth', 'mcp', 'billing', 'pay', 'payment', 'payments', 'checkout', 'invoice',
  'invoices', 'support', 'help', 'helpdesk', 'docs', 'doc', 'developer', 'developers',
  'dev-docs', 'status', 'blog', 'web', 'site', 'sites', 'home', 'about', 'contact',
  'careers', 'jobs', 'press', 'partners', 'partner', 'affiliate', 'affiliates', 'legal',
  'privacy', 'terms', 'security', 'trust', 'shop', 'store', 'market', 'marketplace',
  'go', 'link', 'links', 'click', 'track', 'tracking', 'analytics', 'gtm', 'sgtm',
  'tag', 'tags', 'events', 'event', 'venues', 'venue', 'halls', 'hall', 'priestory',
  'console', 'dashboard', 'manage', 'platform', 'portal', 'official',
  'webhook', 'webhooks', 'hooks', 'ws', 'wss', 'socket', 'realtime', 'push', 'sms',
  'calendar', 'cal', 'ical', 'feed', 'feeds', 'rss', 'sitemap', 'robots',
  'ftp', 'sftp', 'ssh', 'cpanel', 'webdisk', 'whm', 'server', 'host', 'localhost',
]);

export function isReservedSubdomain(label: string): boolean {
  return RESERVED_SUBDOMAINS.has(label.toLowerCase());
}
