import { describe, expect, it } from 'vitest';
import { labelBox, placeLabels } from './label-layout';

describe('placeLabels', () => {
	it('drops a label that would cover one placed before it', () => {
		const out = placeLabels([
			{ x: 100, y: 100, text: '4.00 m', size: 11 },
			{ x: 104, y: 102, text: '3.50', size: 11 },
			{ x: 100, y: 140, text: '2.00', size: 11 }
		]);
		expect(out.map((l) => l.text)).toEqual(['4.00 m', '2.00']);
	});

	it('keeps clear of reserved areas', () => {
		const reserved = [labelBox({ x: 50, y: 20, text: '12.00 m', size: 12 })];
		expect(placeLabels([{ x: 52, y: 22, text: '1.00', size: 11 }], reserved)).toEqual([]);
		expect(placeLabels([{ x: 52, y: 60, text: '1.00', size: 11 }], reserved)).toHaveLength(1);
	});

	it('sizes a box by its text', () => {
		const short = labelBox({ x: 0, y: 0, text: '1', size: 10 });
		const long = labelBox({ x: 0, y: 0, text: '10.25 m² · 3.0 × 4.0 m', size: 10 });
		expect(long.x1 - long.x0).toBeGreaterThan(short.x1 - short.x0);
	});
});
