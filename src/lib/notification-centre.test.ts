import { describe, expect, it } from 'vitest';
import { sk, en } from './i18n';
import { AREA_OPENERS, DEFAULT_ROLE_PERMISSIONS, PERMISSIONS } from './permissions';
import {
	NOTIFICATION_KINDS,
	excerpt,
	isNotificationKind,
	notificationAreas,
	notificationText,
	safeNotificationLink
} from './notification-centre';

describe('notification areas (D12)', () => {
	it('follows the same openers as the console pages', () => {
		expect(notificationAreas([])).toEqual([]);
		expect(notificationAreas(['reservations.view'])).toEqual(['reservations']);
		expect(notificationAreas(['reservations.manage'])).toEqual(['reservations']);
		expect(notificationAreas(['messages.send'])).toEqual([]);
		expect(notificationAreas(['templates.manage'])).toEqual(['halls']);
		expect(notificationAreas(['members.manage'])).toEqual(['members']);
		expect(notificationAreas(PERMISSIONS)).toEqual(['reservations', 'messages', 'members', 'halls']);
	});

	it('lets the default Member role see bookings, messages, members and halls', () => {
		expect(notificationAreas(DEFAULT_ROLE_PERMISSIONS).sort()).toEqual(['halls', 'members', 'messages', 'reservations']);
	});

	it('only names areas that exist', () => {
		for (const area of Object.values(NOTIFICATION_KINDS)) {
			if (area !== null) expect(Object.keys(AREA_OPENERS)).toContain(area);
		}
	});

	it('recognises its kinds', () => {
		expect(isNotificationKind('booking.requested')).toBe(true);
		expect(isNotificationKind('toString')).toBe(false);
		expect(isNotificationKind(42)).toBe(false);
	});
});

describe('notification links and excerpts', () => {
	it('keeps app paths and nothing else', () => {
		expect(safeNotificationLink('/app/reservation/r1')).toBe('/app/reservation/r1');
		expect(safeNotificationLink('https://evil.example')).toBeNull();
		expect(safeNotificationLink('//evil.example')).toBeNull();
		expect(safeNotificationLink('/\\evil.example')).toBeNull();
		expect(safeNotificationLink('javascript:alert(1)')).toBeNull();
		expect(safeNotificationLink(null)).toBeNull();
	});

	it('flattens and shortens a message', () => {
		expect(excerpt('  Dobrý\n\n deň ')).toBe('Dobrý deň');
		const long = excerpt('a'.repeat(500));
		expect(long.length).toBe(140);
		expect(long.endsWith('…')).toBe(true);
	});
});

describe('notification text', () => {
	const params = { title: 'Svadba', hall: 'Veľká sála', date: '2027-05-22', client: 'Jana K' };

	it('has a headline for every kind, in both languages', () => {
		for (const kind of Object.keys(NOTIFICATION_KINDS)) {
			for (const [dict, locale] of [[sk, 'sk'], [en, 'en']] as const) {
				const text = notificationText({ kind, params: { ...params, channel: 'oznamy', templates: 1, events: 0 } }, dict, locale);
				expect(text.title, `${kind} ${locale}`).toBeTruthy();
				expect(text.title).not.toBe(dict.notifCentre.title);
			}
		}
	});

	it('says what was booked, where, when and by whom', () => {
		const sk1 = notificationText({ kind: 'booking.requested', params }, sk, 'sk');
		expect(sk1.title).toBe('Nová žiadosť o rezerváciu');
		expect(sk1.detail).toContain('Svadba');
		expect(sk1.detail).toContain('Veľká sála');
		expect(sk1.detail).toContain('2027');
		expect(sk1.detail).toContain('Jana K');
		expect(notificationText({ kind: 'booking.cancelled', params }, en, 'en').title).toBe('Client cancelled a booking');
	});

	it('quotes the client message', () => {
		const t = notificationText({ kind: 'message.received', params: { client: 'Jana K', excerpt: 'Dobrý deň' } }, sk, 'sk');
		expect(t.detail).toBe('Jana K: Dobrý deň');
	});

	it('names the payment state', () => {
		expect(notificationText({ kind: 'payment.updated', params: { status: 'deposit_received' } }, sk, 'sk').title).toBe('Záloha prijatá');
		expect(notificationText({ kind: 'payment.updated', params: { status: 'paid' } }, en, 'en').title).toBe('Booking paid');
		expect(notificationText({ kind: 'payment.updated', params: { status: 'overdue' } }, en, 'en').title).toBe('Deposit overdue');
		expect(notificationText({ kind: 'payment.updated', params: {} }, en, 'en').title).toBe('Payment updated');
	});

	it('shows the rating as stars, clamped to 1-5', () => {
		expect(notificationText({ kind: 'feedback.received', params: { rating: 4, title: 'Svadba' } }, en, 'en').detail)
			.toBe('★★★★☆ (4 of 5) · Svadba');
		expect(notificationText({ kind: 'feedback.received', params: { rating: 9 } }, sk, 'sk').detail).toBe('★★★★★ (5 z 5)');
	});

	it('counts layout problems with the right Slovak forms', () => {
		expect(notificationText({ kind: 'layout.problems', params: { hall: 'Sála', templates: 2, events: 5 } }, sk, 'sk').detail)
			.toBe('Sála: 2 šablóny a 5 udalostí majú stoly v stene, mimo miestnosti alebo na odstránenom poschodí');
		expect(notificationText({ kind: 'layout.problems', params: { hall: 'Hall', templates: 1, events: 0 } }, en, 'en').detail)
			.toBe('Hall: 1 template has tables in a wall, outside the room or on a removed floor');
	});

	it('renders a kind it does not know, and missing params, without failing', () => {
		expect(notificationText({ kind: 'something.new', params: {} }, sk, 'sk')).toEqual({ title: 'Upozornenia', detail: '' });
		expect(notificationText({ kind: 'booking.changed', params: {} }, sk, 'sk')).toEqual({ title: 'Klient upravil rezerváciu', detail: '' });
		expect(notificationText({ kind: 'member.joined', params: { name: 'Eva' } }, en, 'en').detail).toBe('Eva joined the organization');
	});
});
