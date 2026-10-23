// URL slugs and subdomain labels. Slovak letters are transliterated (Kaštieľ -> kastiel)
// instead of dropped (the old org slug turned 'Kaštieľ Ťahanovce' into 'ka-tie-ahanovce').

const EXTRA: Record<string, string> = { ß: 'ss', æ: 'ae', œ: 'oe', ø: 'o', đ: 'd', ł: 'l', þ: 'th' };

/** Lowercase a-z, 0-9 and single hyphens, at most `max` characters (a DNS label allows 63). */
export function slugify(input: string, max = 48): string {
	return String(input ?? '')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[ßæœøđłþ]/g, (c) => EXTRA[c] ?? '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, max)
		.replace(/-+$/g, '');
}
