// Locale-aware formatting shared by the console, the venue sites and emails.
//
// Database timestamps come from SQLite's datetime('now'): 'YYYY-MM-DD HH:MM:SS' in UTC
// with no zone marker. `new Date(thatString)` reads it as LOCAL time, which put every
// console timestamp 1-2 hours off in Slovakia. Always go through parseDbTime().

export type Locale = 'sk' | 'en';

export const localeTag = (l: Locale | string | null | undefined): string => (l === 'en' ? 'en-GB' : 'sk-SK');

/** A stored timestamp as a Date. Zone-less values are UTC; ISO values with a zone keep it. */
export function parseDbTime(v: string | number | Date | null | undefined): Date | null {
	if (v == null || v === '') return null;
	if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
	if (typeof v === 'number') return new Date(v);
	const s = String(v).trim();
	const naive = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)$/.exec(s);
	const d = naive ? new Date(`${naive[1]}T${naive[2]}Z`) : new Date(s);
	return isNaN(d.getTime()) ? null : d;
}

/** 23. 10. 2026 (sk) · 23 Oct 2026 (en). Accepts timestamps and plain YYYY-MM-DD dates. */
export function formatDate(v: string | number | Date | null | undefined, locale: Locale | string = 'sk', opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }): string {
	const d = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00`) : parseDbTime(v);
	return d ? d.toLocaleDateString(localeTag(locale), opts) : '';
}

/** Date and time in the viewer's zone. */
export function formatDateTime(v: string | number | Date | null | undefined, locale: Locale | string = 'sk', opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }): string {
	const d = parseDbTime(v);
	return d ? d.toLocaleString(localeTag(locale), opts) : '';
}

/** "pred 5 min" / "5 min ago". Falls back to the date after a week. */
export function timeAgo(v: string | number | Date | null | undefined, locale: Locale | string = 'sk', now: number = Date.now()): string {
	const d = parseDbTime(v);
	if (!d) return '';
	const secs = Math.round((d.getTime() - now) / 1000);
	const abs = Math.abs(secs);
	const rtf = new Intl.RelativeTimeFormat(localeTag(locale), { numeric: 'auto' });
	if (abs < 60) return rtf.format(Math.round(secs), 'second');
	if (abs < 3600) return rtf.format(Math.round(secs / 60), 'minute');
	if (abs < 86400) return rtf.format(Math.round(secs / 3600), 'hour');
	if (abs < 7 * 86400) return rtf.format(Math.round(secs / 86400), 'day');
	return formatDate(d, locale);
}

/** 11,50 € (sk) · €11.50 (en). Amounts are cents. */
export function formatMoney(cents: number | null | undefined, locale: Locale | string = 'sk', currency = 'EUR'): string {
	const n = Number(cents ?? 0) / 100;
	return new Intl.NumberFormat(localeTag(locale), { style: 'currency', currency }).format(n);
}

/**
 * Slovak nouns change with the number: 1 sála, 2-4 sály, 5+ sál (decimals take the
 * genitive singular: 1,5 sály). English has one/other. Pass the forms for the locale.
 */
export function plural(locale: Locale | string, n: number, forms: { one: string; few?: string; many: string; fraction?: string }): string {
	if (locale === 'en') return n === 1 ? forms.one : forms.many;
	if (!Number.isInteger(n)) return forms.fraction ?? forms.few ?? forms.many;
	if (n === 1) return forms.one;
	if (n >= 2 && n <= 4) return forms.few ?? forms.many;
	return forms.many;
}
