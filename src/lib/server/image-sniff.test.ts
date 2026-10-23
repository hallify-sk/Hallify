import { describe, expect, it } from 'vitest';
import { sniffImageType } from './image-sniff';

const bytes = (...v: number[]) => new Uint8Array(v);
const text = (s: string) => new TextEncoder().encode(s);

describe('sniffImageType', () => {
	it('recognises the four allowed formats by their signatures', () => {
		expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
		expect(sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe('image/png');
		expect(sniffImageType(text('GIF89a....'))).toBe('image/gif');
		expect(sniffImageType(text('RIFF\u0000\u0000\u0000\u0000WEBPVP8 '))).toBe('image/webp');
	});

	// B151: HTML declared as image/png was stored and served.
	it('refuses anything else, whatever it was declared as', () => {
		expect(sniffImageType(text('<!doctype html><script>alert(1)</script>'))).toBeNull();
		expect(sniffImageType(text('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
		expect(sniffImageType(text('RIFF\u0000\u0000\u0000\u0000WAVE'))).toBeNull();
		expect(sniffImageType(bytes())).toBeNull();
	});
});
