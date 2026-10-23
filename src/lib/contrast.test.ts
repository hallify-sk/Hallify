import { describe, it, expect } from 'vitest';
import { readableInkOn, contrastRatio } from './contrast';

describe('readableInkOn', () => {
	it('puts dark ink on the default Hallify pink (white fails AA there)', () => {
		expect(readableInkOn('#f05ca1')).toBe('#1a1416');
		expect(contrastRatio('#f05ca1', '#1a1416')!).toBeGreaterThan(4.5);
	});

	it('keeps white on dark fills and dark ink on pale ones', () => {
		expect(readableInkOn('#1f3a5f')).toBe('#ffffff');
		expect(readableInkOn('#000000')).toBe('#ffffff');
		expect(readableInkOn('#ffffff')).toBe('#1a1416');
		expect(readableInkOn('#fce5ef')).toBe('#1a1416');
	});

	it('always picks the ink with the higher contrast', () => {
		for (const fill of ['#f05ca1', '#e11d48', '#2563eb', '#16a34a', '#f59e0b', '#7c3aed', '#808080', '#0ea5e9', '#a6225e']) {
			const ink = readableInkOn(fill);
			const other = ink === '#ffffff' ? '#1a1416' : '#ffffff';
			expect(contrastRatio(fill, ink)!).toBeGreaterThanOrEqual(contrastRatio(fill, other)!);
		}
	});

	it('falls back to the themed token when the fill cannot be measured', () => {
		expect(readableInkOn(undefined)).toBe('var(--accent-contrast)');
		expect(readableInkOn('var(--accent)')).toBe('var(--accent-contrast)');
	});
});
