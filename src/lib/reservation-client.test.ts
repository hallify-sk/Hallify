import { describe, expect, it } from 'vitest';
import { CLIENT_RESERVATION_COLUMNS, STAFF_ONLY_RESERVATION_COLUMNS, clientReservationColumns } from './reservation-client';

describe('client reservation columns', () => {
	// B60: the client's booking page selected r.* and sent the phone booking's
	// customer name, contact and internal note to the browser.
	it('never include the staff-only phone-booking fields', () => {
		for (const col of STAFF_ONLY_RESERVATION_COLUMNS) {
			expect(CLIENT_RESERVATION_COLUMNS as readonly string[]).not.toContain(col);
			expect(clientReservationColumns()).not.toContain(col);
		}
		expect(clientReservationColumns()).not.toContain('*');
	});

	it('qualify every column with the alias', () => {
		expect(clientReservationColumns('x').split(', ').every((c) => c.startsWith('x.'))).toBe(true);
	});
});
