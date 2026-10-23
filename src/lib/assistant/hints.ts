/**
 * What the widget suggests when its conversation is empty, by the page that is open:
 * on the seating editor it offers seating, on a hall it offers the hall's profile —
 * and on a page with no event it does not talk about "this event".
 */
export type HintKey = 'layout' | 'event' | 'floorplan' | 'hall' | 'halls' | 'bookings' | 'messages' | 'general';

export function hintFor(pathname: string): HintKey {
	if (/^\/app\/reservation\/[^/]+\/layout\/?$/.test(pathname)) return 'layout';
	if (/^\/app\/reservation\/(?!new\b)[^/]+(\/|$)/.test(pathname)) return 'event';
	if (/^\/app\/manage\/halls\/[^/]+\/(editor|templates)(\/|$)/.test(pathname)) return 'floorplan';
	if (/^\/app\/manage\/halls\/(?!new\/?$)[^/]+\/?$/.test(pathname)) return 'hall';
	if (/^\/app\/manage\/halls\/?$/.test(pathname)) return 'halls';
	if (/^\/app\/manage(\/(reservations|calendar)(\/.*)?)?\/?$/.test(pathname) || pathname.startsWith('/app/reservation/new')) return 'bookings';
	if (/^\/app\/manage\/messages(\/|$)/.test(pathname)) return 'messages';
	return 'general';
}
