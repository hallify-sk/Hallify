import { describe, expect, it } from 'vitest';
import { completeOpeningHours, invalidOpeningDay, normaliseTime, DAY_KEYS } from './opening-hours';

describe('opening hours', () => {
	it('fills every day the console shows with its default', () => {
		const h = completeOpeningHours('{"mon":{"open":false,"from":"10:00","to":"18:00"}}');
		expect(Object.keys(h)).toEqual([...DAY_KEYS]);
		expect(h.mon).toEqual({ open: false, from: '10:00', to: '18:00' });
		expect(h.tue).toEqual({ open: true, from: '09:00', to: '22:00' });
	});

	it('survives junk', () => {
		expect(completeOpeningHours('not json').sun.open).toBe(true);
		expect(completeOpeningHours(null).wed.from).toBe('09:00');
		expect(completeOpeningHours({ fri: { open: true, from: '25:00', to: '7:30' } }).fri).toEqual({ open: true, from: '09:00', to: '07:30' });
	});

	it('normalises times', () => {
		expect(normaliseTime('9:05')).toBe('09:05');
		expect(normaliseTime('18:30:00')).toBe('18:30');
		expect(normaliseTime('24:00')).toBeNull();
	});

	it('names the first open day with a bad time', () => {
		expect(invalidOpeningDay({ mon: { open: false, from: 'x' }, tue: { open: true, from: '9', to: '10:00' } })).toBe('tue');
		expect(invalidOpeningDay({ mon: { open: true, from: '09:00', to: '10:00' } })).toBeNull();
	});
});
