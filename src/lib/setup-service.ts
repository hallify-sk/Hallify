/**
 * The "we set Hallify up for you" add-on.
 *
 * One off, fixed price, and explicitly NOT the floorplan — drawing a venue needs
 * someone on site with a tape measure, which is the separate mapping add-on and
 * is quoted after a visit. This one is work we can do from the data an operator
 * already has.
 *
 * The price lives here rather than in the markup so the request form, the
 * confirmation and the platform queue cannot disagree about what was promised;
 * the amount actually agreed is still copied onto each row when it is created,
 * so raising the list price never rewrites an outstanding request.
 */

export const SETUP_SERVICE_PRICE_CENTS = 10_000;

export const SETUP_SERVICE_STATUSES = [
	'requested',
	'contacted',
	'in_progress',
	'delivered',
	'cancelled'
] as const;

export type SetupStatus = (typeof SETUP_SERVICE_STATUSES)[number];

/** Still ours to act on. Drives the open count and the queue ordering. */
export const SETUP_OPEN_STATUSES: SetupStatus[] = ['requested', 'contacted', 'in_progress'];

/** What the price covers, shown to the operator before they ask for it. */
export const SETUP_SERVICE_INCLUDES: { sk: string; en: string }[] = [
	{
		sk: 'Verejná stránka — výber šablóny, usporiadanie sekcií, úvodné texty.',
		en: 'Your public site — template, section arrangement and opening copy.'
	},
	{
		sk: 'Profily priestorov — kapacity, vybavenie, fotografie, cenová úroveň.',
		en: 'Venue profiles — capacities, amenities, photographs, price range.'
	},
	{
		sk: 'Rezervačné pravidlá — dostupnosť, minimálne lehoty, príplatky.',
		en: 'Booking rules — availability, notice periods, extras.'
	},
	{
		sk: 'Tím a role — pozvánky a oprávnenia pre vašich ľudí.',
		en: 'Team and roles — invitations and permissions for your people.'
	},
	{
		sk: 'Doména a e-maily — nasmerovanie vlastnej domény a odosielanie správ.',
		en: 'Domain and email — pointing your own domain and getting messages sending.'
	}
];

/** Said plainly, because it is the one thing people will assume is included. */
export const SETUP_SERVICE_EXCLUDES: { sk: string; en: string } = {
	sk: 'Nezahŕňa zameranie a nakreslenie pôdorysu — to je samostatná služba, ktorú oceňujeme až po obhliadke.',
	en: 'It does not include measuring and drawing your floor plan — that is a separate service, priced after a site visit.'
};

/** How long the included revisions run for, from delivery. */
export const SETUP_REVISION_MONTHS = 2;

/**
 * The promise that makes the price safe to say yes to.
 *
 * Set out separately from the inclusions because it is not a deliverable — it
 * is what happens after delivery, and it is the part that answers "what if they
 * get it wrong". Stated in both the offer and the prompt a new organisation
 * sees, from here, so the two cannot promise different things.
 */
export const SETUP_SERVICE_GUARANTEE: { sk: string; en: string } = {
	sk: `Neobmedzené úpravy zadarmo počas ${SETUP_REVISION_MONTHS} mesiacov od odovzdania.`,
	en: `Free unlimited revisions for ${SETUP_REVISION_MONTHS} months after delivery.`
};
