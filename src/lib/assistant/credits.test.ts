import { describe, expect, it } from 'vitest';
import { creditAmount } from './credits';

describe('creditAmount', () => {
	it('rounds half up to hundredths, in the locale\'s separator', () => {
		expect(creditAmount(14352, 'sk')).toBe('14,35');
		expect(creditAmount(14355, 'sk')).toBe('14,36');
		expect(creditAmount(14352, 'en')).toBe('14.35');
	});
	it('drops trailing zeros and never shows minus zero', () => {
		expect(creditAmount(20000, 'sk')).toBe('20');
		expect(creditAmount(1, 'sk')).toBe('0');
		expect(creditAmount(-1, 'sk')).toBe('0');
	});
	it('rounds a charge the same way as a balance', () => {
		expect(creditAmount(-5276, 'en')).toBe('-5.28');
	});
});
