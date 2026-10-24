// The organisation's brand colour (Nastavenia > Prispôsobenie) as the custom
// properties the root layout puts on the app shell. The shell is marked
// [data-brand] whenever this is non-empty, and app.css picks --accent-ink there
// from --brand-ink-light / --brand-ink-dark for the theme in force (B77).

import { inkOnDark, inkOnLight, readableInkOn } from '$lib/contrast';

/** Hallify's own pink: every theme in app.css already has hand-tuned tokens for it. */
export const HALLIFY_ACCENT = '#f05ca1';
const HEX = /^#[0-9a-f]{6}$/i;

function rgba(hex: string, alpha: number): string {
	const n = parseInt(hex.slice(1), 16);
	return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * Inline style for the branded shell, or '' when there is nothing to override:
 * no colour, an unusable one, or Hallify's own pink (every org without branding
 * gets that from the platform default, and the theme's tuned inks and dims read
 * better than ones derived from it).
 */
export function brandShellStyle(primaryColor: string | null | undefined): string {
	const c = String(primaryColor ?? '').trim();
	if (!HEX.test(c) || c.toLowerCase() === HALLIFY_ACCENT) return '';
	return (
		`--accent: ${c};` +
		` --brand-ink-light: ${inkOnLight(c)};` +
		` --brand-ink-dark: ${inkOnDark(c)};` +
		` --accent-contrast: ${readableInkOn(c)};` +
		` --accent-dim: ${rgba(c, 0.1)};` +
		` --accent-hover: ${c}cc;` +
		` --accent-action: ${c};` +
		` --accent-action-dim: ${rgba(c, 0.1)};`
	);
}
