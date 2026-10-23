import { describe, it, expect } from 'vitest';
import { parseCreditAdjustment } from './platform-credits';

describe('parseCreditAdjustment', () => {
	it('accepts whole numbers in range, either sign', () => {
		expect(parseCreditAdjustment('100')).toBe(100);
		expect(parseCreditAdjustment('-25')).toBe(-25);
		expect(parseCreditAdjustment(' 1 000 ')).toBe(1000);
	});

	it('refuses zero, fractions, text and huge amounts', () => {
		expect(parseCreditAdjustment('0')).toBeNull();
		expect(parseCreditAdjustment('1.5')).toBeNull();
		expect(parseCreditAdjustment('abc')).toBeNull();
		expect(parseCreditAdjustment('')).toBeNull();
		expect(parseCreditAdjustment('1000001')).toBeNull();
	});
});
