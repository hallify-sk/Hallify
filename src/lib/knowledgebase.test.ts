import { describe, it, expect } from 'vitest';
import { articlesFor, getArticle, searchArticles, searchable, CATEGORIES } from './knowledgebase';

describe('knowledgebase', () => {
	it('has every article in Slovak and English', () => {
		const sk = articlesFor('sk');
		const en = articlesFor('en');
		expect(sk.map((a) => a.slug)).toEqual(en.map((a) => a.slug));
		for (let i = 0; i < sk.length; i++) {
			expect(sk[i].title).not.toBe(en[i].title);
			expect(sk[i].body.trim().length).toBeGreaterThan(50);
			expect(en[i].body.trim().length).toBeGreaterThan(50);
		}
	});

	it('covers the features the help centre was missing', () => {
		for (const slug of ['public-site', 'webhooks', 'ai-assistant', 'messages', 'calendar']) {
			expect(getArticle(slug, 'sk')).toBeTruthy();
		}
	});

	it('localises the category', () => {
		expect(getArticle('webhooks', 'sk')!.category).toBe(CATEGORIES.site.sk);
		expect(getArticle('webhooks', 'en')!.category).toBe(CATEGORIES.site.en);
	});

	it('searches without diacritics and ranks title matches first', () => {
		const sk = articlesFor('sk');
		const hits = searchArticles(sk, 'kalendar');
		expect(hits[0].slug).toBe('calendar');
		expect(searchArticles(sk, 'webhook podpis').map((a) => a.slug)).toContain('webhooks');
		expect(searchArticles(sk, 'neexistujucevyraz')).toEqual([]);
		expect(searchArticles(sk, ' ')).toHaveLength(sk.length);
	});

	it('strips tags and accents for matching', () => {
		expect(searchable('Kaštieľ <b>Sála</b>')).toBe('kastiel sala');
	});
});
