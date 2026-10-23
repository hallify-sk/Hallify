// The venue's own branding (Nastavenia > Prispôsobenie) applied to its public site.
//
// The customize page saves a display name, a logo and an accent colour, and promises
// guests will see them. The venue site never used any of it: the template's tokens are
// written on the site's root element and won over the accent the root layout set, the
// header printed the organisation's name, and the logo came from organizations.logo_url,
// which nothing writes. These helpers turn the saved branding into what the site shows.

import { contrastRatio, darken, lighten, luminance, readableInkOn } from '$lib/contrast';
import { isHttpUrl } from '$lib/safe-url';

export interface SavedBranding {
	appName?: string;
	logoUrl?: string;
	primaryColor?: string;
}

const HEX = /^#[0-9a-f]{6}$/i;
/** The values the customize form posts when the field was left alone. */
const PLATFORM_NAME = 'Hallify';
const PLATFORM_LOGO = '/Hallify.svg';

/** The name guests see: the saved display name, unless it is empty or Hallify's own. */
export function brandName(branding: SavedBranding | null | undefined, orgName: string): string {
	const n = String(branding?.appName ?? '').replace(/\s+/g, ' ').trim();
	return n && n !== PLATFORM_NAME ? n.slice(0, 80) : orgName;
}

/** The logo guests see: an uploaded logo (a same-site path or an http(s) URL), else the org's. */
export function brandLogo(branding: SavedBranding | null | undefined, orgLogo: string | null): string | null {
	const raw = String(branding?.logoUrl ?? '').trim();
	if (!raw || raw === PLATFORM_LOGO) return orgLogo;
	const sameSite = raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/\\');
	return sameSite || isHttpUrl(raw) ? raw : orgLogo;
}

function rgba(hex: string, alpha: number): string {
	const n = parseInt(hex.slice(1), 16);
	return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Step `hex` toward black (light page) or white (dark page) until it reads as text on `bg`. */
function inkOn(hex: string, bg: string): string {
	const dark = (luminance(bg) ?? 1) < 0.2;
	let c = hex;
	for (let i = 0; i < 24; i++) {
		const r = contrastRatio(c, bg);
		if (r === null || r >= 4.6) return c;
		c = dark ? lighten(c, 0.16) : darken(c, 0.86);
	}
	return c;
}

/**
 * Inline custom properties that put the saved accent over the template's own.
 * Empty when no valid colour was saved, so the template's accent stays.
 * `templateBg` is the template's page colour: the accent's text form is tuned to it.
 */
export function brandAccentStyle(branding: SavedBranding | null | undefined, templateBg: string): string {
	const c = String(branding?.primaryColor ?? '').trim();
	if (!HEX.test(c)) return '';
	return [
		`--accent:${c}`,
		`--accent-action:${c}`,
		`--accent-hover:${c}cc`,
		`--accent-ink:${inkOn(c, templateBg)}`,
		`--accent-contrast:${readableInkOn(c)}`,
		`--accent-dim:${rgba(c, 0.12)}`,
		`--accent-action-dim:${rgba(c, 0.12)}`
	].join(';');
}
