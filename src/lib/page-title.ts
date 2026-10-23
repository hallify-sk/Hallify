// Every page's <title>, built one way (I30): the most specific part first, then its
// context, then whose site it is, joined with an en dash —
//   "Svadba Novákovci – Rozloženie stolov – Hallify"
//   "Moje rezervácie – Kaštieľ Teplička"
// Titles used to mix "–", "—", "·" and "|", and some named neither the page nor
// the site. Empty parts are skipped, so an optional part needs no extra branch.

type Part = string | number | null | undefined | false;

const SEPARATOR = ' – ';
export const BRAND = 'Hallify';

function join(parts: Part[]): string {
	const out: string[] = [];
	for (const p of parts) {
		const s = p === false || p == null ? '' : String(p).trim();
		// "Hallify – Hallify" when a part already is the site's name.
		if (s && s !== out[out.length - 1]) out.push(s);
	}
	return out.join(SEPARATOR);
}

/** A page of Hallify itself (the console, the platform, sign-in, legal pages). */
export function pageTitle(...parts: Part[]): string {
	return join([...parts, BRAND]);
}

/** A page of a venue's own site: the venue, not Hallify, names the site. */
export function venueTitle(venue: string | null | undefined, ...parts: Part[]): string {
	return join([...parts, venue || BRAND]);
}
