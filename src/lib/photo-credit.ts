/**
 * The caption on a hall's cover photo: where the photo comes from.
 *
 * A directory-only venue is listed with the venue's own photo, which has to be
 * credited ("Foto: www.example.sk") and removed when the venue asks. The credit is
 * stored as typed. A web address is shown as its hostname and linked (nofollow);
 * anything else is shown as plain text, so nothing typed there can become a script
 * or a link to somewhere unexpected.
 */

export interface PhotoCredit {
	/** What the caption shows after "Foto:". */
	label: string;
	/** Where the caption links to, or null for plain text. */
	href: string | null;
}

const MAX_LABEL = 80;

export function photoCredit(raw: unknown): PhotoCredit | null {
	const text = String(raw ?? '').replace(/\s+/g, ' ').trim();
	if (!text) return null;
	if (/^https?:\/\//i.test(text)) {
		try {
			const u = new URL(text);
			if (!u.username && !u.password && u.hostname.includes('.')) return { label: u.hostname, href: u.toString() };
		} catch {
			/* not a usable address: shown as text below */
		}
	}
	return { label: text.length > MAX_LABEL ? `${text.slice(0, MAX_LABEL - 1)}…` : text, href: null };
}

/** The whole caption as one string ("Foto: www.example.sk"), for a title attribute. */
export function photoCreditText(raw: unknown, prefix: string): string | null {
	const c = photoCredit(raw);
	return c ? `${prefix}: ${c.label}` : null;
}
