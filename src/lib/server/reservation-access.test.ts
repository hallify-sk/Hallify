import { describe, expect, it } from 'vitest';
import type { Permission } from '$lib/permissions';
import { canActOnReservation, canOpenReservation, resolveReservationAccess } from './reservation-access';

const access = (...held: Permission[]) => resolveReservationAccess(new Set(held));

describe('booking access (D3)', () => {
	it('reservations.view opens a colleague\'s booking but may not change it', () => {
		const viewer = access('reservations.view');
		expect(canOpenReservation(viewer, 'colleague', 'me')).toBe(true);
		expect(canActOnReservation(viewer, 'colleague', 'me')).toBe(false);
	});

	it('anyone may change their own booking', () => {
		expect(canActOnReservation(access(), 'me', 'me')).toBe(true);
		expect(canActOnReservation(access('reservations.view'), 'me', 'me')).toBe(true);
	});

	it('reservations.manage may change any booking in the org', () => {
		expect(canActOnReservation(access('reservations.manage'), 'colleague', 'me')).toBe(true);
	});

	it('without a signed-in user nothing is anyone\'s own', () => {
		expect(canActOnReservation(access(), '', undefined)).toBe(false);
		expect(canOpenReservation(access(), '', undefined)).toBe(false);
	});

	it('without reservations.view a colleague\'s booking stays closed', () => {
		expect(canOpenReservation(access(), 'colleague', 'me')).toBe(false);
	});
});
