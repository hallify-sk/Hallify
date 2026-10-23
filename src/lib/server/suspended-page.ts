// The page shown instead of a suspended organisation's site or console.
//
// Suspension used to be silent: the venue's subdomain bounced to the apex and the
// owner's console fell through to "create an organisation", with no word about why.
// Rendered straight from hooks.server.ts (the request never reaches a route), so it
// is a self-contained document with inline styles and no scripts.

import { st } from '$lib/i18n-server';
import { OPERATOR } from '$lib/legal';
import { escapeHtml as esc } from './email-layout';

export type SuspendedAudience = 'venue' | 'console';

export function suspendedPageHtml(audience: SuspendedAudience, orgName: string, locale: 'sk' | 'en', apexOrigin: string): string {
	const t = st(locale);
	const e = t.errorPage;
	const title = audience === 'venue' ? e.suspendedVenueTitle(orgName) : e.suspendedOrgTitle(orgName);
	const mail = OPERATOR.contactEmail;
	const body = audience === 'venue'
		? `<p>${esc(e.suspendedVenueBody)}</p>
<p class="actions"><a class="btn" href="${esc(apexOrigin)}/priestory">${esc(e.suspendedVenueCta)}</a></p>`
		: `<p>${esc(e.suspendedOrgBody)}</p>
<p>${esc(e.suspendedOrgContact)} <a href="mailto:${esc(mail)}">${esc(mail)}</a>.</p>
<form class="actions" method="POST" action="/app/logout">
<button type="submit" class="btn btn-ghost">${esc(t.nav.signOut)}</button>
</form>`;

	return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)}</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>
:root { --bg: #f6f5f2; --card: #ffffff; --ink: #202322; --muted: #5d635d; --line: #e6e4df; --accent: #f05ca1; --accent-ink: #27131c; }
@media (prefers-color-scheme: dark) { :root { --bg: #141615; --card: #1d201f; --ink: #eceeec; --muted: #a9b0a9; --line: #2e3230; --accent-ink: #27131c; } }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px 16px; background: var(--bg); color: var(--ink);
  font: 16px/1.6 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
main { width: 100%; max-width: 520px; background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 32px 28px; }
.mark { display: inline-block; width: 12px; height: 12px; border-radius: 4px; background: var(--accent); margin-bottom: 18px; }
h1 { font-size: 22px; line-height: 1.3; margin: 0 0 12px; overflow-wrap: anywhere; }
p { margin: 0 0 14px; color: var(--muted); }
a { color: inherit; }
.actions { display: flex; flex-wrap: wrap; gap: 10px; margin: 22px 0 0; }
.btn { display: inline-block; font: inherit; font-weight: 700; font-size: 15px; padding: 10px 18px; border-radius: 12px; border: 1px solid var(--accent);
  background: var(--accent); color: var(--accent-ink); text-decoration: none; cursor: pointer; overflow-wrap: anywhere; }
.btn-ghost { background: transparent; color: var(--ink); border-color: var(--line); }
.btn:focus-visible { outline: 3px solid var(--ink); outline-offset: 2px; }
</style>
</head>
<body>
<main>
<span class="mark" aria-hidden="true"></span>
<h1>${esc(title)}</h1>
${body}
</main>
</body>
</html>`;
}

export function suspendedResponse(audience: SuspendedAudience, orgName: string, locale: 'sk' | 'en', apexOrigin: string): Response {
	return new Response(suspendedPageHtml(audience, orgName, locale, apexOrigin), {
		// 503 tells crawlers the venue's pages are away for now rather than gone.
		status: audience === 'venue' ? 503 : 403,
		headers: {
			'content-type': 'text/html; charset=utf-8',
			'cache-control': 'no-store',
			...(audience === 'venue' ? { 'retry-after': '86400' } : {}),
		},
	});
}
