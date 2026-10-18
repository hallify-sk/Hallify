/**
 * What each analytics event means, and what makes it fire.
 *
 * Documentation that lives in the codebase next to `$lib/analytics`, rather than
 * in a wiki nobody updates: a venue setting up Google Tag Manager has to know
 * the event names to build a single trigger, and until now the only way to find
 * them was to read the source.
 *
 * Every entry here is an event that ACTUALLY FIRES. That is the point of the
 * list, so it is worth saying plainly: when an event is defined but never sent,
 * it does not belong here, because a documented event that never arrives sends
 * someone hunting through their container for a fault that is ours.
 */

export type EventSurface = 'site' | 'booking';

export interface AnalyticsEvent {
	/** The `event` value pushed to the dataLayer — what a GTM trigger matches on. */
	name: string;
	surface: EventSurface;
	/** What the visitor did. */
	trigger: { sk: string; en: string };
	/** Which part of the public site it comes from, in builder vocabulary. */
	where: { sk: string; en: string };
	/** Parameters sent alongside, for building variables in GTM. */
	params: string[];
}

/**
 * The venue's own funnel, in the order a visitor walks it.
 *
 * These are the only events that reach an ORGANISATION's container. Hallify's
 * own SaaS events (sign-ups, plan upgrades) fire on hallify.sk and never on a
 * venue's domain — on their own domain the venue is the controller, so mixing
 * the two would put our measurement inside their consent scope.
 */
export const ANALYTICS_EVENTS: AnalyticsEvent[] = [
	{
		name: 'view_item_list',
		surface: 'site',
		trigger: {
			sk: 'Návštevník otvoril vašu verejnú stránku.',
			en: 'A visitor opened your public site.'
		},
		where: {
			sk: 'Úvodná stránka — ľubovoľné usporiadanie sekcií v nastaveniach verejnej stránky.',
			en: 'The landing page — whatever arrangement of sections you have built.'
		},
		params: ['item_list_name', 'items_count']
	},
	{
		name: 'view_item',
		surface: 'site',
		trigger: {
			sk: 'Návštevník otvoril detail konkrétneho priestoru.',
			en: 'A visitor opened one venue.'
		},
		where: {
			sk: 'Prekliknutie zo sekcie Hlavný priestor, Zoznam priestorov, Mriežka priestorov alebo Vyhľadávanie.',
			en: 'A click through from the Featured venue, Venue list, Venue grid or Search section.'
		},
		params: ['items[].item_id', 'items[].item_name']
	},
	{
		name: 'begin_checkout',
		surface: 'booking',
		trigger: {
			sk: 'Otvoril sa rezervačný formulár.',
			en: 'The booking form was opened.'
		},
		where: {
			sk: 'Tlačidlo rezervácie na detaile priestoru, alebo sekcia Výzva na rezerváciu.',
			en: 'The booking button on a venue page, or the Booking call to action section.'
		},
		params: ['items[].item_id', 'items[].item_name']
	},
	{
		name: 'booking_step',
		surface: 'booking',
		trigger: {
			sk: 'Vyplnil sa jeden krok formulára. Parameter step hovorí ktorý — tu uvidíte, kde ľudia odchádzajú.',
			en: 'One step of the form was completed. The step parameter says which — this is where you see people drop out.'
		},
		where: {
			sk: 'date_selected, guests_entered, extras_selected, details_entered.',
			en: 'date_selected, guests_entered, extras_selected, details_entered.'
		},
		params: ['item_id', 'step']
	},
	{
		name: 'purchase',
		surface: 'booking',
		trigger: {
			sk: 'Rezervácia bola odoslaná a prijatá. Toto je vaša konverzia.',
			en: 'A booking was submitted and accepted. This is your conversion.'
		},
		where: {
			sk: 'Odoslanie rezervačného formulára.',
			en: 'Submitting the booking form.'
		},
		params: ['transaction_id', 'items[].item_id', 'booking_status', 'guests']
	},
	{
		name: 'booking_rejected',
		surface: 'booking',
		trigger: {
			sk: 'Rezerváciu odmietlo niektoré z vašich pravidiel — napríklad minimálny počet dní vopred alebo obsadený termín.',
			en: 'A booking was refused by one of your rules — a minimum notice period, or a date already taken.'
		},
		where: {
			sk: 'Odoslanie rezervačného formulára, ktoré neprešlo.',
			en: 'A booking form submission that did not go through.'
		},
		params: ['item_id', 'reason']
	}
];

/**
 * Pushed once per page as `user_data`, before any event above, and mirrored into
 * `user_properties`. Every event can therefore be sliced by these in GA4 without
 * being sent them individually. Names copied from `UserContext` in $lib/analytics.
 */
export const USER_DIMENSIONS = [
	'logged_in',
	'user_type',
	'user_id',
	'org_id',
	'org_role',
	'plan',
	'subscription_status',
	'surface',
	'locale'
] as const;
