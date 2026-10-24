import { describe, expect, it } from 'vitest';
import { imageSrcset, imageVariantKey, imageVariantKeys, isImageVariantWidth, variantSize } from './image-variants';

describe('image variants (I2)', () => {
	it('offers a srcset for our own still photos only', () => {
		expect(imageSrcset('/uploads/halls/u1/1-a.jpg')).toBe(
			'/uploads/halls/u1/1-a.jpg?w=480 480w, /uploads/halls/u1/1-a.jpg?w=1200 1200w, /uploads/halls/u1/1-a.jpg 2000w'
		);
		expect(imageSrcset('/uploads/halls/u1/1-a.gif')).toBeUndefined();
		expect(imageSrcset('https://elsewhere.example/a.jpg')).toBeUndefined();
		expect(imageSrcset('/marketing/venue-example.jpg')).toBeUndefined();
		expect(imageSrcset(null)).toBeUndefined();
	});

	it('keeps the copies beside the photo', () => {
		expect(imageVariantKey('halls/u1/1-a.jpg', 480)).toBe('halls/u1/1-a.jpg@w480');
		expect(imageVariantKeys('halls/u1/1-a.jpg')).toEqual(['halls/u1/1-a.jpg@w480', 'halls/u1/1-a.jpg@w1200']);
		expect(isImageVariantWidth(480)).toBe(true);
		expect(isImageVariantWidth(Number('1200'))).toBe(true);
		expect(isImageVariantWidth(700)).toBe(false);
		expect(isImageVariantWidth(Number(null))).toBe(false);
	});

	it('makes a copy only of a picture wider than it', () => {
		expect(variantSize(2000, 1500, 480)).toEqual({ width: 480, height: 360 });
		expect(variantSize(1000, 2000, 480)).toEqual({ width: 480, height: 960 });
		expect(variantSize(480, 300, 480)).toBeNull();
		expect(variantSize(0, 0, 480)).toBeNull();
	});
});
