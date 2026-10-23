import { describe, expect, it } from 'vitest';
import { loginUrl, returnPath } from './login-redirect';

describe('returnPath', () => {
	it('keeps the path and its query', () => {
		expect(returnPath(new URL('https://hallify.sk/app/manage/reservations?status=pending'))).toBe(
			'/app/manage/reservations?status=pending'
		);
	});

	it('drops form-action keys', () => {
		expect(returnPath(new URL('https://hallify.sk/app/profile?/save'))).toBe('/app/profile');
		expect(returnPath(new URL('https://hallify.sk/app/x?tab=a&/save'))).toBe('/app/x?tab=a');
	});
});

describe('loginUrl', () => {
	it('carries a deep link to the console login', () => {
		expect(loginUrl(new URL('https://hallify.sk/app/manage/reservations'))).toBe(
			'/app/login?redirect=%2Fapp%2Fmanage%2Freservations'
		);
	});

	it('needs no parameter for the console home', () => {
		expect(loginUrl(new URL('https://hallify.sk/app'))).toBe('/app/login');
		expect(loginUrl(new URL('https://hallify.sk/app/'))).toBe('/app/login');
	});

	it('builds the venue-site login', () => {
		expect(loginUrl(new URL('https://reduta.hallify.sk/halls/sala/book?date=2026-12-01'), '/login')).toBe(
			'/login?redirect=%2Fhalls%2Fsala%2Fbook%3Fdate%3D2026-12-01'
		);
	});
});
