// The notification centre (D12): what each kind of event is, who may see it, and
// how it reads. Shared by the server (which stores and filters) and the bell panel
// (which renders the text in the reader's language). Not to be confused with
// $lib/notifications, which delivers the organisation's outgoing webhooks.
//
// A notification is addressed to the organisation, and an AREA decides who sees it:
// the same area openers that open the console pages (see AREA_OPENERS), so a member
// is told about a booking exactly when they may open it. `null` is for everyone in
// the organisation (announcements).

import { AREA_OPENERS, type ConsoleArea } from '$lib/permissions';
import { formatDate } from '$lib/format';
import type { sk } from '$lib/i18n';

export type NotificationArea = Extract<ConsoleArea, 'reservations' | 'messages' | 'members' | 'halls'>;

/** Every kind, with the area that may see it. */
export const NOTIFICATION_KINDS = {
	/** A client asked for a booking (status pending). */
	'booking.requested': 'reservations',
	/** A client booked, and the hall confirmed it on its own. */
	'booking.created': 'reservations',
	/** A client changed their booking (date, guests, extras, details, layout). */
	'booking.changed': 'reservations',
	/** A client cancelled their booking. */
	'booking.cancelled': 'reservations',
	/** A client wrote to the venue. */
	'message.received': 'messages',
	/** A client left feedback on a completed event (D5). */
	'feedback.received': 'reservations',
	/** A booking's payment status changed: deposit received, paid, overdue (D6). */
	'payment.updated': 'reservations',
	/** Somebody joined the organisation. */
	'member.joined': 'members',
	/** Saving a hall plan left templates or events with tables in walls (D2). */
	'layout.problems': 'halls',
	/** A new post in an announcement channel: for the whole organisation. */
	'announcement.posted': null
} as const satisfies Record<string, NotificationArea | null>;

export type NotificationKind = keyof typeof NOTIFICATION_KINDS;

export function isNotificationKind(k: unknown): k is NotificationKind {
	return typeof k === 'string' && Object.prototype.hasOwnProperty.call(NOTIFICATION_KINDS, k);
}

/** The areas a member with these permissions sees notifications from. */
export function notificationAreas(permissions: Iterable<string>): NotificationArea[] {
	const held = new Set(permissions);
	const areas: NotificationArea[] = ['reservations', 'messages', 'members', 'halls'];
	return areas.filter((a) => AREA_OPENERS[a].some((p) => held.has(p)));
}

/** What the text of each kind is built from. Every field is optional: a row written
 *  by an older build, or one whose booking was since deleted, still renders. */
export interface NotificationParams {
	title?: string;
	hall?: string;
	/** YYYY-MM-DD */
	date?: string;
	client?: string;
	name?: string;
	excerpt?: string;
	subject?: string;
	channel?: string;
	rating?: number;
	/** 'deposit_received' | 'paid' | 'overdue' | anything else */
	status?: string;
	templates?: number;
	events?: number;
}

export interface NotificationItem {
	id: string;
	kind: string;
	params: NotificationParams;
	link: string | null;
	created_at: string;
	read: boolean;
}

/** Only app paths are followed: a stored link never leaves the site. */
export function safeNotificationLink(link: string | null | undefined): string | null {
	if (!link || typeof link !== 'string') return null;
	if (!link.startsWith('/') || link.startsWith('//') || link.startsWith('/\\')) return null;
	return link;
}

/** The longest excerpt of a message kept with its notification. */
export const EXCERPT_MAX = 140;

export function excerpt(text: string | null | undefined, max = EXCERPT_MAX): string {
	const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
	return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

type Dict = typeof sk;

/** The headline and the detail line of a notification, in the dictionary's language. */
export function notificationText(
	n: { kind: string; params: NotificationParams },
	t: Dict,
	locale: string
): { title: string; detail: string } {
	const p = n.params ?? {};
	const c = t.notifCentre;
	const join = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(' · ');
	const booking = () => join(p.title, p.hall, p.date ? formatDate(p.date, locale) : null, p.client);

	switch (n.kind) {
		case 'booking.requested':
			return { title: c.bookingRequested, detail: booking() };
		case 'booking.created':
			return { title: c.bookingCreated, detail: booking() };
		case 'booking.changed':
			return { title: c.bookingChanged, detail: booking() };
		case 'booking.cancelled':
			return { title: c.bookingCancelled, detail: booking() };
		case 'message.received':
			return {
				title: c.messageReceived,
				detail: p.client && p.excerpt ? `${p.client}: ${p.excerpt}` : join(p.client, p.excerpt ?? p.subject)
			};
		case 'feedback.received': {
			const r = Math.max(0, Math.min(5, Math.round(Number(p.rating ?? 0))));
			return {
				title: c.feedbackReceived,
				detail: join(r ? `${'★'.repeat(r)}${'☆'.repeat(5 - r)} (${c.stars(r)})` : null, p.title, p.client)
			};
		}
		case 'payment.updated': {
			const title =
				p.status === 'deposit_received' ? c.paymentDepositReceived
				: p.status === 'paid' ? c.paymentPaid
				: p.status === 'overdue' ? c.paymentOverdue
				: c.paymentUpdated;
			return { title, detail: booking() };
		}
		case 'member.joined':
			return { title: c.memberJoined, detail: p.name ? c.memberJoinedDetail(p.name) : '' };
		case 'layout.problems':
			return {
				title: c.layoutProblems,
				detail: c.layoutProblemsDetail(p.hall ?? '', Number(p.templates ?? 0), Number(p.events ?? 0))
			};
		case 'announcement.posted':
			return { title: c.announcementPosted(p.channel ?? ''), detail: p.excerpt ?? '' };
		default:
			return { title: c.title, detail: '' };
	}
}
