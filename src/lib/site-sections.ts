/**
 * The organisation's public landing page, as an ordered list of sections.
 *
 * A template decides how the page LOOKS; this decides what is ON it and in what
 * order. Separating the two is what stops every venue's site reading the same:
 * recolouring a fixed "search box, then a grid of halls" layout still produces the
 * same page for everyone.
 *
 * Stored as `{ type, enabled }[]` rather than a free-form document. A venue site is
 * a handful of known blocks over data Hallify already holds, so a page builder
 * would be a lot of surface area for very little that an operator actually wants —
 * and every block here stays correct on its own when a hall is added or renamed.
 */

export type SectionType =
	| 'featured'
	| 'hall-list'
	| 'hall-grid'
	| 'search'
	| 'about'
	| 'amenities'
	| 'contact'
	| 'cta';

export interface SiteSection {
	type: SectionType;
	enabled: boolean;
}

export interface SectionDefinition {
	type: SectionType;
	/** Shown in the section picker, per locale. */
	label: { sk: string; en: string };
	description: { sk: string; en: string };
	/** Only one of these may appear on a page — two heroes is never what is meant. */
	unique: boolean;
	/** Hidden rather than shown empty when the org has nothing to put in it. */
	needsHalls?: boolean;
	needsContact?: boolean;
	needsIntro?: boolean;
}

export const SECTION_DEFINITIONS: SectionDefinition[] = [
	{
		type: 'featured',
		label: { sk: 'Hlavný priestor', en: 'Featured venue' },
		description: {
			sk: 'Veľká úvodná ukážka jedného priestoru s fotografiou cez celú šírku.',
			en: 'A large opening panel for one venue, with a full-width photograph.'
		},
		unique: true,
		needsHalls: true
	},
	{
		type: 'hall-list',
		label: { sk: 'Zoznam priestorov', en: 'Venue list' },
		description: {
			sk: 'Ostatné priestory ako široké karty s fotografiou, kapacitou a vybavením.',
			en: 'The remaining venues as wide cards with a photo, capacity and amenities.'
		},
		unique: true,
		needsHalls: true
	},
	{
		type: 'hall-grid',
		label: { sk: 'Mriežka priestorov', en: 'Venue grid' },
		description: {
			sk: 'Všetky priestory vedľa seba v mriežke. Vhodné, ak ich máte viac.',
			en: 'Every venue side by side in a grid. Suits a larger portfolio.'
		},
		unique: true,
		needsHalls: true
	},
	{
		type: 'search',
		label: { sk: 'Vyhľadávanie', en: 'Search' },
		description: {
			sk: 'Pole na hľadanie a filter podľa počtu hostí.',
			en: 'A search field and a guest-count filter.'
		},
		unique: true,
		needsHalls: true
	},
	{
		type: 'about',
		label: { sk: 'O nás', en: 'About' },
		description: {
			sk: 'Text, ktorý napíšete v nastaveniach verejnej stránky.',
			en: 'The text you write under public site settings.'
		},
		unique: true,
		needsIntro: true
	},
	{
		type: 'amenities',
		label: { sk: 'Vybavenie', en: 'Amenities' },
		description: {
			sk: 'Prehľad vybavenia naprieč všetkými vašimi priestormi.',
			en: 'A summary of what is on offer across all your venues.'
		},
		unique: true,
		needsHalls: true
	},
	{
		type: 'contact',
		label: { sk: 'Kontakt', en: 'Contact' },
		description: {
			sk: 'Telefón, e-mail a adresa z profilov vašich priestorov.',
			en: 'Phone, email and address taken from your venue profiles.'
		},
		unique: true,
		needsContact: true
	},
	{
		type: 'cta',
		label: { sk: 'Výzva na rezerváciu', en: 'Booking call to action' },
		description: {
			sk: 'Krátky blok na konci stránky s odkazom na rezerváciu.',
			en: 'A short block at the foot of the page linking to booking.'
		},
		unique: true
	}
];

const BY_TYPE = new Map(SECTION_DEFINITIONS.map((d) => [d.type, d]));

/**
 * The out-of-the-box page: the first venue shown large, the rest listed under it,
 * then the operator's own words and how to reach them.
 *
 * Search is deliberately OFF by default. It was the first thing on the page and it
 * is the single element that made every site look like a directory rather than a
 * business; a venue with three halls does not need a search box above them.
 */
export const DEFAULT_SECTIONS: SiteSection[] = [
	{ type: 'featured', enabled: true },
	{ type: 'hall-list', enabled: true },
	{ type: 'about', enabled: true },
	{ type: 'contact', enabled: true },
	{ type: 'search', enabled: false },
	{ type: 'hall-grid', enabled: false },
	{ type: 'amenities', enabled: false },
	{ type: 'cta', enabled: false }
];

/**
 * Reconcile a stored list with the catalogue this build knows.
 *
 * Unknown types are dropped (a section removed in a later release must not keep
 * rendering), duplicates collapse, and any section the org has never seen is
 * appended disabled — so adding a section type here never silently turns it on for
 * every existing site, and never hides one they had.
 */
export function resolveSections(stored: unknown): SiteSection[] {
	const out: SiteSection[] = [];
	const seen = new Set<SectionType>();

	if (Array.isArray(stored)) {
		for (const raw of stored) {
			const type = (raw as SiteSection)?.type;
			if (!BY_TYPE.has(type) || seen.has(type)) continue;
			seen.add(type);
			out.push({ type, enabled: (raw as SiteSection)?.enabled !== false });
		}
	}

	if (out.length === 0) return DEFAULT_SECTIONS.map((s) => ({ ...s }));

	for (const def of SECTION_DEFINITIONS) {
		if (!seen.has(def.type)) out.push({ type: def.type, enabled: false });
	}
	return out;
}

/** Context used to hide a section that would render empty. */
export interface SectionContext {
	hallCount: number;
	hasContact: boolean;
	hasIntro: boolean;
}

/**
 * The sections actually worth rendering.
 *
 * An enabled section with nothing to show is worse than no section: it publishes a
 * heading over a blank space on a page the operator may never look at.
 */
export function visibleSections(sections: SiteSection[], ctx: SectionContext): SectionType[] {
	return sections
		.filter((s) => {
			if (!s.enabled) return false;
			const def = BY_TYPE.get(s.type);
			if (!def) return false;
			if (def.needsHalls && ctx.hallCount === 0) return false;
			if (def.needsContact && !ctx.hasContact) return false;
			if (def.needsIntro && !ctx.hasIntro) return false;
			return true;
		})
		.map((s) => s.type);
}

export function sectionDefinition(type: SectionType): SectionDefinition | undefined {
	return BY_TYPE.get(type);
}
