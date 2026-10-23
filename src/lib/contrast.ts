/**
 * Readable-text helpers for colours the app does not control.
 *
 * Most of the UI takes its colours from the token layer in `src/app.css`, where the
 * pairing of a fill and the text on it is decided once, by hand. These helpers are for
 * the places where that is impossible: an organiser picks a brand colour from an
 * `<input type="color">`, and the app has to put a label on top of it. A fixed text
 * colour cannot work there — `--accent-contrast` is near-black, which vanishes on a
 * dark brand colour — so the ink has to be derived from the chosen fill at runtime.
 */

/** Parse #rgb or #rrggbb into 0–255 channels. Returns null for anything else. */
function channels(color: string): [number, number, number] | null {
	const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
	if (!m) return null;
	let h = m[1];
	if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
	return [
		parseInt(h.substring(0, 2), 16),
		parseInt(h.substring(2, 4), 16),
		parseInt(h.substring(4, 6), 16)
	];
}

/** WCAG relative luminance, 0 (black) – 1 (white). */
export function luminance(color: string): number | null {
	const rgb = channels(color);
	if (!rgb) return null;
	const [r, g, b] = rgb.map((v) => {
		const c = v / 255;
		return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The two inks a fill can carry. The dark one is the near-black the app writes with. */
const DARK_INK = '#1a1416';
const LIGHT_INK = '#ffffff';

/**
 * The text colour to place ON `background`: whichever of near-black and white has the
 * higher WCAG contrast against it.
 *
 * This used to switch at a luminance of 0.42, which is not where the two inks cross
 * over: the crossover is near 0.2. Every fill between the two (Hallify's own pink
 * #f05ca1 among them, luminance 0.30) got white text at about 3.1:1, failing AA, when
 * near-black on the same fill reads at over 6:1. Comparing the two ratios directly puts
 * the switch exactly at the crossover, so the pick is always the better of the two.
 *
 * `background` may be a CSS value this cannot parse (a `var(--…)` reference, a gradient,
 * a named colour). In that case there is nothing to measure, so it returns
 * `var(--accent-contrast)` — correct whenever the fill is the themed accent, which is
 * what the unparseable cases in this app actually are.
 */
export function readableInkOn(background: string | null | undefined): string {
	if (!background) return 'var(--accent-contrast)';
	const l = luminance(background);
	if (l === null) return 'var(--accent-contrast)';
	const dark = (l + 0.05) / ((luminance(DARK_INK) ?? 0) + 0.05);
	const light = (1.05) / (l + 0.05);
	return dark >= light ? DARK_INK : LIGHT_INK;
}

/** WCAG contrast ratio between two hex colours, 1–21. Returns null if unparseable. */
export function contrastRatio(a: string, b: string): number | null {
	const la = luminance(a), lb = luminance(b);
	if (la === null || lb === null) return null;
	const hi = Math.max(la, lb), lo = Math.min(la, lb);
	return (hi + 0.05) / (lo + 0.05);
}

/** Scale a colour's channels toward black by `factor` (0–1). */
export function darken(hex: string, factor: number): string {
	const c = channelsOrBlack(hex).map((v) => Math.round(v * factor));
	return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** Scale a colour's channels toward white by `factor` (0–1). */
export function lighten(hex: string, factor: number): string {
	const c = channelsOrBlack(hex).map((v) => Math.round(v + (255 - v) * factor));
	return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}

function channelsOrBlack(hex: string): [number, number, number] {
	return channels(hex) ?? [0, 0, 0];
}

/**
 * Step a brand colour until it reads as text on `surface`, and give up gracefully.
 *
 * Banded thresholds were not enough: an amber or a hot pink can sit in a band and
 * still miss 4.5:1. Converging on the target handles any colour an organiser picks.
 */
function resolveInk(hex: string, surface: string, step: (c: string) => string): string {
	let c = hex;
	for (let i = 0; i < 24; i++) {
		const ratio = contrastRatio(c, surface);
		if (ratio === null) return hex;
		if (ratio >= 4.6) return c;
		c = step(c);
	}
	return c;
}

/** The brand colour as readable TEXT on a light (paper) surface. */
export function inkOnLight(hex: string): string {
	return resolveInk(hex, '#fefefd', (c) => darken(c, 0.86));
}

/** The brand colour as readable TEXT on a dark (charcoal) surface. */
export function inkOnDark(hex: string): string {
	return resolveInk(hex, '#222723', (c) => lighten(c, 0.16));
}
