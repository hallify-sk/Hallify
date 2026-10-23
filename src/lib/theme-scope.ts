/**
 * Where the personal colour theme (Slate / Dark / Warm, chosen in the console's
 * sidebar and kept in localStorage) applies.
 *
 * Only the console. The theme is a staff member's preference for the tool they
 * work in; a venue's public site, the marketing pages and the legal pages are
 * designed light and are not that person's to restyle. It used to be applied on
 * every host, so a venue owner who chose Dark saw their own client-facing site
 * with dark-theme tokens on light surfaces (2.4:1 text, a dark-brown Pending badge).
 *
 * app.html repeats this test inline, because it runs before any module loads (to
 * avoid a flash of the wrong theme). Keep the two in step.
 */
export function usesPersonalTheme(pathname: string): boolean {
	// The site builder's preview is the public site inside an iframe.
	if (pathname === '/app/manage/settings/site/preview') return false;
	return pathname === '/app' || pathname.startsWith('/app/');
}
