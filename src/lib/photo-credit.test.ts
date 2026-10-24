import { describe, expect, it } from 'vitest';
import { photoCredit, photoCreditText } from './photo-credit';

describe('photo credit', () => {
	it('shows a web address as its hostname, linked', () => {
		expect(photoCredit('https://www.example.sk')).toEqual({ label: 'www.example.sk', href: 'https://www.example.sk/' });
		expect(photoCredit('  http://mlyn.sk/galeria?x=1 ')).toEqual({ label: 'mlyn.sk', href: 'http://mlyn.sk/galeria?x=1' });
	});

	it('shows anything else as plain text, never as a link', () => {
		expect(photoCredit('Ján Novák')).toEqual({ label: 'Ján Novák', href: null });
		expect(photoCredit('www.example.sk')).toEqual({ label: 'www.example.sk', href: null });
		expect(photoCredit('javascript:alert(1)')).toEqual({ label: 'javascript:alert(1)', href: null });
		expect(photoCredit('https://user:pw@example.sk')?.href).toBeNull();
		expect(photoCredit('https://')?.href).toBeNull();
	});

	it('is nothing when empty, and keeps a long text short', () => {
		expect(photoCredit(null)).toBeNull();
		expect(photoCredit('   ')).toBeNull();
		expect(photoCredit('x'.repeat(200))!.label).toHaveLength(80);
	});

	it('reads as one caption for a title attribute', () => {
		expect(photoCreditText('https://www.example.sk/', 'Foto')).toBe('Foto: www.example.sk');
		expect(photoCreditText('', 'Foto')).toBeNull();
	});
});
