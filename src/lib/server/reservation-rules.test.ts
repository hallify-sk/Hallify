import { describe, expect, it } from 'vitest';
import { checkStatusTransition, normalizeTime, todayUtcISO } from './reservation-rules';

describe('checkStatusTransition', () => {
	const today = '2026-10-23';
	it('refuses Completed for a future event, allows it today and after', () => {
		expect(checkStatusTransition('approved', 'completed', '2026-11-01', today)).toBe('completed_in_future');
		expect(checkStatusTransition('approved', 'completed', '2026-10-23', today)).toBe('ok');
		expect(checkStatusTransition('approved', 'completed', '2026-10-01', today)).toBe('ok');
	});
	it('refuses approving a request whose date has passed', () => {
		expect(checkStatusTransition('pending', 'approved', '2026-10-02', today)).toBe('date_passed');
		expect(checkStatusTransition('cancelled', 'pending', '2026-10-02', today)).toBe('date_passed');
		expect(checkStatusTransition('pending', 'approved', '2026-10-23', today)).toBe('ok');
	});
	it('always allows cancelling', () => {
		expect(checkStatusTransition('pending', 'cancelled', '2026-10-02', today)).toBe('ok');
	});
});

describe('normalizeTime', () => {
	it('pads hours and rejects junk', () => {
		expect(normalizeTime('9:05')).toBe('09:05');
		expect(normalizeTime('18:00:00')).toBe('18:00');
		expect(normalizeTime('24:00')).toBeNull();
		expect(normalizeTime('abc')).toBeNull();
		expect(normalizeTime('')).toBeNull();
	});
});

describe('todayUtcISO', () => {
	it('uses the UTC date', () => {
		expect(todayUtcISO(new Date('2026-10-23T23:30:00Z'))).toBe('2026-10-23');
	});
});
