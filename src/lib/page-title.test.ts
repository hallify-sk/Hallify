import { describe, expect, it } from 'vitest';
import { pageTitle, venueTitle } from './page-title';

describe('page titles (I30)', () => {
	it('puts the page first and Hallify last, joined with an en dash', () => {
		expect(pageTitle('Svadba', 'Rozloženie stolov')).toBe('Svadba – Rozloženie stolov – Hallify');
		expect(pageTitle()).toBe('Hallify');
	});

	it('skips empty parts and never repeats the brand', () => {
		expect(pageTitle(null, '', undefined, 'Rezervácie', false)).toBe('Rezervácie – Hallify');
		expect(pageTitle('Hallify')).toBe('Hallify');
		expect(pageTitle(404)).toBe('404 – Hallify');
	});

	it('names the venue, not Hallify, on a venue site', () => {
		expect(venueTitle('Kaštieľ', 'Moje rezervácie')).toBe('Moje rezervácie – Kaštieľ');
		expect(venueTitle(undefined, 'Prihlásenie')).toBe('Prihlásenie – Hallify');
	});
});
