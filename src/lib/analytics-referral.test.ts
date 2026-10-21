import { describe, expect, it } from 'vitest';
import { isHallifyReferral } from './analytics-referral';

describe('isHallifyReferral', () => {
	const venue = 'reduta.hallify.app';
	it('credits visits from Hallify and tagged links', () => {
		expect(isHallifyReferral('https://hallify.app/halls/reduta', '', venue, 'hallify.app')).toBe(true);
		expect(isHallifyReferral('https://www.hallify.app/', '', 'reduta.sk', 'hallify.app')).toBe(true);
		expect(isHallifyReferral('', '?utm_source=Hallify&utm_medium=listing', 'reduta.sk', 'hallify.app')).toBe(true);
	});
	it('does not credit the venue itself, other sites or lookalikes', () => {
		expect(isHallifyReferral(`https://${venue}/sal`, '', venue, 'hallify.app')).toBe(false);
		expect(isHallifyReferral('https://google.com/', '', 'reduta.sk', 'hallify.app')).toBe(false);
		expect(isHallifyReferral('https://nothallify.app/', '', 'reduta.sk', 'hallify.app')).toBe(false);
		expect(isHallifyReferral('', '', 'reduta.sk', 'hallify.app')).toBe(false);
	});
});
