import { describe, expect, it } from 'vitest';
import { instructions, turnContext, contextItem, todayInSlovakia, typicalQuestionMc } from './agent';
import { DEFAULT_AI } from './pricing';

describe('the cacheable prefix', () => {
	it('instructions name no organisation, page or date, so every conversation shares them', () => {
		const sk = instructions('sk');
		expect(sk).toBe(instructions('sk'));
		expect(sk).not.toMatch(/\d{4}-\d{2}-\d{2}/);
		expect(sk).toContain('vykanie');
		expect(instructions('en')).not.toContain('vykanie');
	});

	it('points to the pages members use themselves, in their UI language', () => {
		expect(instructions('sk')).toContain('"Fakturácia a plán" (/app/billing)');
		expect(instructions('en')).toContain('"Billing & Plan" (/app/billing)');
	});
});

describe('turn context', () => {
	const ctx = turnContext({ name: 'Kaštieľ' }, '2026-10-23', 'The user has this page of the app open: "Kalendár" (/app/manage/calendar).');

	it('goes into the conversation as a developer note', () => {
		expect(contextItem([], ctx)).toEqual({ role: 'developer', content: ctx });
	});

	it('is not repeated while the page and day stay the same', () => {
		const prior = [{ role: 'developer', content: ctx }, { role: 'user', content: 'Ahoj' }, { type: 'message', role: 'assistant', content: [] }];
		expect(contextItem(prior, ctx)).toBeNull();
		const elsewhere = turnContext({ name: 'Kaštieľ' }, '2026-10-23', null);
		expect(contextItem(prior, elsewhere)).toEqual({ role: 'developer', content: elsewhere });
	});

	it('uses the date in Slovakia, not UTC', () => {
		expect(todayInSlovakia(new Date('2026-10-22T22:30:00Z'))).toBe('2026-10-23');
	});
});

describe('typicalQuestionMc', () => {
	it('prices two calls on a cached prefix', () => {
		// per call: 8000 cached × 0.1 + 300 × 2 + 120 × 10 = 2600 µUSD; × 2 calls = 5200 µUSD
		// → 5200 × 0.92 × 3 × 10 / 1000 = 143.52 → 144 mc
		expect(typicalQuestionMc(DEFAULT_AI, 8000)).toBe(144);
	});
});
