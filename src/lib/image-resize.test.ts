import { describe, expect, it } from 'vitest';
import { fitWithin, needsResize, outputType } from './image-resize';

describe('image resize', () => {
	it('caps the longest side and keeps the proportions', () => {
		expect(fitWithin(4000, 3000)).toEqual({ width: 2000, height: 1500 });
		expect(fitWithin(3000, 6000)).toEqual({ width: 1000, height: 2000 });
		expect(fitWithin(1200, 800)).toEqual({ width: 1200, height: 800 });
	});

	it('re-encodes photos but leaves GIFs alone', () => {
		expect(outputType('image/jpeg')).toBe('image/jpeg');
		expect(outputType('image/png')).toBe('image/webp');
		expect(outputType('image/gif')).toBeNull();
	});

	it('skips pictures that are already small', () => {
		expect(needsResize(1600, 1200, 300 * 1024)).toBe(false);
		expect(needsResize(1600, 1200, 900 * 1024)).toBe(true);
		expect(needsResize(4032, 3024, 300 * 1024)).toBe(true);
	});
});
