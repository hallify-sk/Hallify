/**
 * AI credits as people read them — the one formatter for every place a balance or a
 * charge is shown (the assistant's header, the widget, the AI settings page), so the
 * same balance never reads 14,3 in one place and 14,4 in another.
 *
 * Balances are kept in milli-credits (1 credit = 1000 mc). Shown rounded half up to
 * hundredths of a credit, with no trailing zeros, in the locale's own decimal
 * separator: 14352 mc → "14,35" (sk) · "14.35" (en).
 */
const MC_PER_CREDIT = 1000;

export function creditAmount(mc: number, locale: string): string {
	const hundredths = Math.sign(mc) * Math.round(Math.abs(mc) / (MC_PER_CREDIT / 100));
	return new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'sk-SK', { maximumFractionDigits: 2 }).format(hundredths / 100 || 0);
}
