import { describe, expect, it } from 'vitest';
import {
	buildClientList, clientUrlId, guestKey, matchesClient, parseClientFilters, parseClientNotes, parseClientUrlId,
	phoneDigits, queryClients, sortClients, splitContact,
	type ClientBookingRow,
} from './clients';

const booking = (o: Partial<ClientBookingRow>): ClientBookingRow => ({
	id: 'r', user_id: 'staff', owner_is_client: 0, customer_name: null, customer_contact: null,
	invite_email: null, invite_name: null, title: 'Event', event_date: '2026-11-01', status: 'approved',
	hall_id: 'h1', hall_name: 'Sála', created_at: '2026-01-01 10:00:00', ...o,
});

describe('client keys (D10)', () => {
	it('reads a contact as an email or a phone number', () => {
		expect(splitContact('Jana@Example.com')).toEqual({ email: 'jana@example.com', phone: null });
		expect(splitContact('+421 905 123 456')).toEqual({ email: null, phone: '+421 905 123 456' });
		expect(splitContact('0905/123 456, jana@x.sk')).toEqual({ email: 'jana@x.sk', phone: '0905/123 456' });
		expect(splitContact('zavolá sama')).toEqual({ email: null, phone: null });
		expect(phoneDigits('00421 905 123 456')).toBe('421905123456');
		expect(phoneDigits('123')).toBeNull();
	});

	it('keys a guest by email, then phone, then name', () => {
		expect(guestKey('Jana', 'JANA@x.sk')).toBe('e:jana@x.sk');
		expect(guestKey('Jana', '+421 905 123 456')).toBe('p:421905123456');
		expect(guestKey('  Ján  Nový ', null)).toBe('n:jan novy');
		expect(guestKey('', '')).toBeNull();
	});

	it('round-trips URL ids, and refuses anything else', () => {
		expect(clientUrlId('u:abc-123')).toBe('abc-123');
		expect(parseClientUrlId('abc-123')).toBe('u:abc-123');
		for (const key of ['e:jana@x.sk', 'p:421905123456', 'n:ján nový']) {
			const id = clientUrlId(key);
			expect(id).toMatch(/^g\.[A-Za-z0-9_-]+$/);
			expect(parseClientUrlId(id)).toBe(key);
		}
		expect(parseClientUrlId('g.!!!')).toBeNull();
		expect(parseClientUrlId(`g.${btoa('x:nope')}`)).toBeNull();
		expect(parseClientUrlId('../etc')).toBeNull();
	});
});

describe('the client list', () => {
	const today = '2026-10-23';
	const list = buildClientList({
		todayISO: today,
		accounts: [
			{ id: 'u1', first_name: 'Jana', last_name: 'Nová', email: 'Jana@x.sk', created_at: '2026-03-01 10:00:00' },
			{ id: 'u2', first_name: 'Peter', last_name: 'Malý', email: 'peter@x.sk', created_at: '2026-05-01 10:00:00' },
		],
		bookings: [
			booking({ id: 'a', user_id: 'u1', owner_is_client: 1, event_date: '2026-06-01', status: 'completed' }),
			booking({ id: 'b', user_id: 'u1', owner_is_client: 1, event_date: '2026-12-24', status: 'approved' }),
			booking({ id: 'c', user_id: 'u1', owner_is_client: 1, event_date: '2026-11-01', status: 'cancelled' }),
			// A phone booking whose email is Jana's account: it is hers.
			booking({ id: 'd', customer_name: 'Jana N.', customer_contact: 'jana@x.sk', event_date: '2027-02-01', status: 'pending' }),
			// Two phone bookings of one guest, the number written two ways.
			booking({ id: 'e', customer_name: 'Ján Horváth', customer_contact: '0905 123 456', event_date: '2026-09-01', status: 'completed', created_at: '2026-02-01 09:00:00' }),
			booking({ id: 'f', customer_name: 'J. Horváth', customer_contact: '0905123456', event_date: '2027-01-10', status: 'approved', created_at: '2026-08-01 09:00:00' }),
			// An event handed to an invitee who has not accepted yet.
			booking({ id: 'g', invite_email: 'Eva@x.sk', invite_name: 'Eva Kráľová', event_date: '2027-03-03' }),
			// A team member's own event: not a client.
			booking({ id: 'h' }),
		],
		ratings: [{ user_id: 'u1', rating: 5 }, { user_id: 'u1', rating: 4 }, { user_id: null, rating: 1 }],
		notes: [{ client_key: 'u2', phone: '+1', notes: null }, { client_key: 'u:u2', phone: ' +421 911 000 111 ', notes: 'VIP' }],
	});
	const by = (name: string) => list.find((c) => c.name === name)!;

	it('lists every account and every guest, and no team member', () => {
		expect(list.map((c) => c.name).sort()).toEqual(['Eva Kráľová', 'Jana Nová', 'Ján Horváth', 'Peter Malý']);
	});

	it('counts bookings and finds the next and the last event', () => {
		const jana = by('Jana Nová');
		expect(jana.kind).toBe('account');
		expect(jana.bookings).toBe(3); // the cancelled one does not count
		expect(jana.nextEvent).toBe('2026-12-24');
		expect(jana.lastEvent).toBe('2026-06-01');
		expect(jana.ratingAverage).toBe(4.5);
		expect(jana.ratingCount).toBe(2);
		const jan = by('Ján Horváth');
		expect(jan.kind).toBe('guest');
		expect(jan.bookings).toBe(2);
		expect(jan.phone).toBe('0905 123 456');
		expect(jan.since).toBe('2026-02-01 09:00:00');
		expect(by('Eva Kráľová').email).toBe('eva@x.sk');
		expect(by('Peter Malý').bookings).toBe(0);
	});

	it('takes the phone the team wrote down', () => {
		expect(by('Peter Malý').phone).toBe('+421 911 000 111');
	});

	it('searches name, email and phone, ignoring case and diacritics', () => {
		expect(matchesClient(by('Eva Kráľová'), 'kralova')).toBe(true);
		expect(matchesClient(by('Jana Nová'), 'JANA@X')).toBe(true);
		expect(matchesClient(by('Ján Horváth'), '905 12')).toBe(true);
		expect(matchesClient(by('Peter Malý'), '0911')).toBe(false);
		expect(matchesClient(by('Peter Malý'), '911 000')).toBe(true);
	});

	it('sorts, with clients missing the value last', () => {
		expect(sortClients(list, 'name').map((c) => c.name)).toEqual(['Eva Kráľová', 'Ján Horváth', 'Jana Nová', 'Peter Malý']);
		expect(sortClients(list, 'next').map((c) => c.name)).toEqual(['Jana Nová', 'Ján Horváth', 'Eva Kráľová', 'Peter Malý']);
		expect(sortClients(list, 'last')[0].name).toBe('Ján Horváth');
		expect(sortClients(list, 'rating')[0].name).toBe('Jana Nová');
		expect(sortClients(list, 'bookings')[0].bookings).toBe(3);
	});

	it('pages a search', () => {
		const f = parseClientFilters(new URLSearchParams('q=x.sk&sort=bogus&page=9'));
		expect(f).toEqual({ q: 'x.sk', sort: 'name', page: 9 });
		const r = queryClients(list, f);
		expect(r.total).toBe(3);
		expect(r.page).toBe(1);
		expect(r.rows.map((c) => c.name)).toEqual(['Eva Kráľová', 'Jana Nová', 'Peter Malý']);
	});
});

describe('client notes', () => {
	it('bounds the phone and the notes', () => {
		expect(parseClientNotes({ phone: ' +421  900 ', notes: ' VIP \r\n ' })).toEqual({ ok: true, values: { phone: '+421 900', notes: 'VIP' } });
		expect(parseClientNotes({ phone: '', notes: '' })).toEqual({ ok: true, values: { phone: null, notes: null } });
		expect(parseClientNotes({ phone: '1'.repeat(41) })).toEqual({ ok: false, field: 'phone' });
		expect(parseClientNotes({ notes: 'a'.repeat(5001) })).toEqual({ ok: false, field: 'notes' });
	});
});
