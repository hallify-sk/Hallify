// Names for the amenity keys stored on a hall, as the venue's public pages print them.
//
// Built-in keys have translations; an operator's own amenities live in org_amenities
// with a Slovak and an English label. The public pages only knew the built-ins, so a
// custom one was published as its raw key ('custom-virivka').

export interface CustomAmenity {
	slug: string;
	label_sk: string | null;
	label_en: string | null;
}

/** 'custom-virivka' -> 'Virivka'. Last resort, so a key never reaches the page raw. */
export function humanizeAmenityKey(key: string): string {
	const words = key.replace(/^custom[-_]/, '').replace(/[-_]+/g, ' ').trim();
	return words ? words[0].toUpperCase() + words.slice(1) : key;
}

/**
 * key -> label for the current locale. `builtIn` holds the translated built-ins;
 * custom labels fall back to the other language, as in the console.
 */
export function amenityLabelMap(
	builtIn: Record<string, string>,
	custom: CustomAmenity[] | null | undefined,
	locale: string
): Record<string, string> {
	const out: Record<string, string> = { ...builtIn };
	for (const c of custom ?? []) {
		const label = (locale === 'en' ? c.label_en || c.label_sk : c.label_sk || c.label_en) || '';
		if (label.trim()) out[c.slug] = label.trim();
	}
	return out;
}

export function amenityLabel(key: string, labels: Record<string, string>): string {
	return labels[key] ?? humanizeAmenityKey(key);
}
