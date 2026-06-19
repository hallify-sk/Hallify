// Runtime SK/EN locale. `t` is a reactive Proxy over the active dictionary, so every
// `t.foo.bar` read inside a component re-renders when the locale changes — call sites
// stay identical to the old compile-time `t`. The raw dictionaries live in `./i18n`.
import { sk, en, type Locale } from './i18n';

export type { Locale };

const DICTS: Record<Locale, typeof sk> = { sk, en };

// Module-level reactive locale. Set synchronously by the root layout during render
// (SSR-safe: component rendering is synchronous, so concurrent requests never
// interleave between the set and the child render).
let _locale = $state<Locale>('sk');

export function getLocale(): Locale {
	return _locale;
}

/** Set the active locale with no persistence — used for SSR/init sync from server data. */
export function setLocale(l: Locale): void {
	if (l === 'sk' || l === 'en') _locale = l;
}

/** Reactive translation dictionary. Reading any property tracks `_locale`, so the
 *  whole UI re-renders on locale change. Typed as the dictionary for full call-site types. */
export const t: typeof sk = new Proxy({} as typeof sk, {
	get(_t, prop) {
		return DICTS[_locale][prop as keyof typeof sk];
	},
	has(_t, prop) {
		return prop in DICTS[_locale];
	},
	ownKeys() {
		return Reflect.ownKeys(DICTS[_locale]);
	},
	getOwnPropertyDescriptor(_t, prop) {
		return Reflect.getOwnPropertyDescriptor(DICTS[_locale], prop);
	},
});

/** Switch locale AND persist it: cookie (authoritative for SSR) + localStorage mirror,
 *  and reflect it in the URL (`?lang=en`, or removed for the `sk` default). Client-only. */
export function chooseLocale(l: Locale): void {
	setLocale(l);
	if (typeof document === 'undefined') return;
	document.cookie = `hallify-lang=${l}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
	try { localStorage.setItem('hallify-lang', l); } catch { /* private mode */ }
	try {
		const u = new URL(location.href);
		if (l === 'sk') u.searchParams.delete('lang');
		else u.searchParams.set('lang', l);
		history.replaceState(history.state, '', u);
	} catch { /* ignore */ }
}
