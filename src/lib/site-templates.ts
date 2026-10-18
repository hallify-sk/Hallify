/**
 * Visual templates for an organisation's own public site (its subdomain or custom
 * domain — the `/halls` bubble).
 *
 * Why templates vary by palette, shape, density and weight but NOT by typeface:
 * the Content-Security-Policy blocks third-party font CDNs, and self-hosting eight
 * extra families would add megabytes to a page whose whole job is to load fast on
 * a phone. Where a template wants a different voice it uses a SYSTEM serif stack,
 * which costs nothing to download and is on every device. Inter stays the UI face
 * throughout.
 *
 * Every template is a complete token set. The bubble layout writes them as inline
 * custom properties, so a template cannot half-apply and leave a page reading one
 * palette with another's contrast.
 */

export type TemplateId =
	| 'hallify'
	| 'noir'
	| 'linen'
	| 'slate'
	| 'botanical'
	| 'terracotta'
	| 'mono'
	| 'riviera';

export interface SiteTemplate {
	id: TemplateId;
	/** Shown in the picker. Not translated — these are proper names. */
	name: string;
	/** One line on who it suits, per locale. Co-located with the template rather
	 *  than in i18n.ts so adding a template stays a single-file change. */
	description: { sk: string; en: string };
	/** Free plans get the default; everything else needs a paid plan. */
	premium: boolean;
	tokens: {
		bg: string;
		surface: string;
		ink: string;
		muted: string;
		line: string;
		subtle: string;
		accent: string;
		/** Accent as TEXT — must clear 4.5:1 on `bg`. */
		accentInk: string;
		/** Text placed ON an accent fill — must clear 4.5:1 on `accent`. */
		accentContrast: string;
		radius: string;
		/** Heading stack. A system serif where the template wants a different voice. */
		headingFont: string;
		headingWeight: string;
		/** Letter-spacing for display headings. */
		headingTracking: string;
	};
}

const INTER = "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif";
/** On every device, costs nothing to download, and survives a strict CSP. */
const SERIF = "Georgia, 'Iowan Old Style', 'Times New Roman', serif";

export const SITE_TEMPLATES: SiteTemplate[] = [
	{
		id: 'hallify',
		name: 'Hallify',
		description: { sk: 'Predvolený vzhľad Hallify — svetlý, pokojný, vhodný pre akýkoľvek priestor.', en: 'The default Hallify look — light, calm and at home with any kind of venue.' },
		premium: false,
		tokens: {
			bg: '#f9f9f7', surface: '#fefefd', ink: '#202322', muted: '#686d68',
			line: '#dfe2dd', subtle: '#eef0eb',
			accent: '#f05ca1', accentInk: '#a6225e', accentContrast: '#27131c',
			radius: '3px', headingFont: INTER, headingWeight: '550', headingTracking: '-.055em'
		}
	},
	{
		id: 'noir',
		name: 'Noir',
		description: { sk: 'Tmavý a slávnostný. Sedí večerným podujatiam, baru a klubu.', en: 'Dark and formal. Suits evening events, bars and clubs.' },
		premium: true,
		tokens: {
			bg: '#121212', surface: '#1b1b1b', ink: '#f2f0ec', muted: '#a8a49c',
			line: '#2f2f2f', subtle: '#232323',
			accent: '#c9a227', accentInk: '#e0bc4a', accentContrast: '#1a1505',
			radius: '2px', headingFont: SERIF, headingWeight: '400', headingTracking: '-.02em'
		}
	},
	{
		id: 'linen',
		name: 'Linen',
		description: { sk: 'Teplý papier a pätkové nadpisy. Svadby a rodinné oslavy.', en: 'Warm paper and serif headings. Weddings and family celebrations.' },
		premium: true,
		tokens: {
			bg: '#faf6f0', surface: '#fffdfa', ink: '#2e2823', muted: '#6f655b',
			line: '#e5dcd0', subtle: '#f2ebe1',
			accent: '#c2847a', accentInk: '#8a4a40', accentContrast: '#2a1310',
			radius: '4px', headingFont: SERIF, headingWeight: '400', headingTracking: '-.015em'
		}
	},
	{
		id: 'slate',
		name: 'Slate',
		description: { sk: 'Striezlivý a firemný. Konferencie, školenia, biznis podujatia.', en: 'Sober and corporate. Conferences, training rooms, business events.' },
		premium: true,
		tokens: {
			bg: '#f5f7f9', surface: '#ffffff', ink: '#1b2430', muted: '#5d6b7a',
			line: '#dde3e9', subtle: '#eaeff4',
			accent: '#2f6fa8', accentInk: '#235880', accentContrast: '#ffffff',
			radius: '3px', headingFont: INTER, headingWeight: '600', headingTracking: '-.035em'
		}
	},
	{
		id: 'botanical',
		name: 'Botanical',
		description: { sk: 'Zelená a vzdušná. Záhrady, dvory a priestory v prírode.', en: 'Green and airy. Gardens, courtyards and venues in nature.' },
		premium: true,
		tokens: {
			bg: '#f4f7f1', surface: '#fdfefb', ink: '#1e2b1c', muted: '#5c6b57',
			line: '#dbe4d5', subtle: '#e9f0e4',
			accent: '#4a7c3f', accentInk: '#38602f', accentContrast: '#ffffff',
			radius: '6px', headingFont: INTER, headingWeight: '550', headingTracking: '-.04em'
		}
	},
	{
		id: 'terracotta',
		name: 'Terracotta',
		description: { sk: 'Zemité odtiene. Stodoly, vinárstva a rustikálne priestory.', en: 'Earthy tones. Barns, wineries and rustic spaces.' },
		premium: true,
		tokens: {
			bg: '#fbf5ef', surface: '#fffcf8', ink: '#33231a', muted: '#75604f',
			line: '#e8d9c9', subtle: '#f4e9dc',
			accent: '#b85c38', accentInk: '#8f4325', accentContrast: '#ffffff',
			radius: '5px', headingFont: SERIF, headingWeight: '400', headingTracking: '-.02em'
		}
	},
	{
		id: 'mono',
		name: 'Monochrome',
		description: { sk: 'Čistá čierna a biela, bez ozdôb. Galérie a ateliéry.', en: 'Plain black and white, nothing decorative. Galleries and studios.' },
		premium: true,
		tokens: {
			bg: '#ffffff', surface: '#ffffff', ink: '#0a0a0a', muted: '#5e5e5e',
			line: '#e2e2e2', subtle: '#f4f4f4',
			accent: '#0a0a0a', accentInk: '#0a0a0a', accentContrast: '#ffffff',
			radius: '0px', headingFont: INTER, headingWeight: '650', headingTracking: '-.06em'
		}
	},
	{
		id: 'riviera',
		name: 'Riviera',
		description: { sk: 'Modrá a piesok. Pri vode, terasy a letné podujatia.', en: 'Blue and sand. Waterside, terraces and summer events.' },
		premium: true,
		tokens: {
			bg: '#f6f8fa', surface: '#ffffff', ink: '#13303f', muted: '#56707f',
			line: '#d9e4ea', subtle: '#e8f0f4',
			accent: '#1f7a8c', accentInk: '#165a68', accentContrast: '#ffffff',
			radius: '8px', headingFont: INTER, headingWeight: '550', headingTracking: '-.04em'
		}
	}
];

export const DEFAULT_TEMPLATE: TemplateId = 'hallify';

const BY_ID = new Map(SITE_TEMPLATES.map((t) => [t.id, t]));

/**
 * Resolve a stored template id to a template the caller is entitled to.
 *
 * A downgrade must not break a live public site: if an org drops to a plan that no
 * longer includes templates, their page quietly returns to the Hallify default
 * rather than 500ing or rendering half-themed.
 */
export function resolveTemplate(id: string | null | undefined, allowPremium: boolean): SiteTemplate {
	const found = id ? BY_ID.get(id as TemplateId) : undefined;
	if (!found) return BY_ID.get(DEFAULT_TEMPLATE)!;
	if (found.premium && !allowPremium) return BY_ID.get(DEFAULT_TEMPLATE)!;
	return found;
}

/**
 * The template as inline custom properties for the bubble's root element.
 *
 * Deliberately emitted under the APP's token names (--bg-base, --bg-panel,
 * --text-base, --accent, --radius...) rather than the template's own vocabulary.
 * Every rule in the /halls subtree is already written against those names, so
 * overriding them at the root re-themes the entire public site without touching a
 * single component — and a template added later needs no markup changes at all.
 */
export function templateStyle(template: SiteTemplate): string {
	const t = template.tokens;
	return [
		`--bg-base:${t.bg}`,
		`--bg-panel:${t.surface}`,
		`--bg-panel2:${t.subtle}`,
		`--bg-hover:${t.subtle}`,
		`--border:${t.line}`,
		`--border-subtle:${t.subtle}`,
		`--text-base:${t.ink}`,
		`--text-muted:${t.muted}`,
		`--accent:${t.accent}`,
		`--accent-ink:${t.accentInk}`,
		`--accent-contrast:${t.accentContrast}`,
		`--accent-dim:${t.subtle}`,
		`--accent-action:${t.accent}`,
		`--accent-action-dim:${t.subtle}`,
		`--radius-sm:${t.radius}`,
		`--radius:${t.radius}`,
		// Larger shapes scale with the template so a square template stays square
		// and a rounded one does not end up with square cards.
		`--radius-lg:${t.radius === '0px' ? '0px' : `calc(${t.radius} + 2px)`}`,
		`--radius-xl:${t.radius === '0px' ? '0px' : `calc(${t.radius} + 4px)`}`,
		`--heading-font:${t.headingFont}`,
		`--heading-weight:${t.headingWeight}`,
		`--heading-tracking:${t.headingTracking}`
	].join(';');
}
