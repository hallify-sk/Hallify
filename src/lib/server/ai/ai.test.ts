import { describe, expect, it } from 'vitest';
import { parseCsv, parseDate, parseTime, parseCount } from './csv';
import { costUsdMicro, toMilliCredits, DEFAULT_AI } from './pricing';
import { monthlyWindow } from './credits';

describe('parseCsv', () => {
	it('detects semicolons (Slovak Excel) and handles quotes, doubled quotes and newlines in quotes', () => {
		const { delimiter, rows } = parseCsv('﻿Názov;Dátum;Poznámka\r\n"Svadba; Novák";12.6.2027;"riadok 1\nriadok 2"\r\n"Oslava ""50""";1.7.2027;\r\n\r\n');
		expect(delimiter).toBe(';');
		expect(rows).toEqual([
			['Názov', 'Dátum', 'Poznámka'],
			['Svadba; Novák', '12.6.2027', 'riadok 1\nriadok 2'],
			['Oslava "50"', '1.7.2027', '']
		]);
	});

	it('reads commas and a final line without a newline', () => {
		expect(parseCsv('a,b\n1,2').rows).toEqual([['a', 'b'], ['1', '2']]);
	});
});

describe('parseDate', () => {
	it('reads the stated order, and a leading four-digit year whatever the order', () => {
		expect(parseDate('12.6.2027', 'dmy')).toBe('2027-06-12');
		expect(parseDate('6/12/2027', 'mdy')).toBe('2027-06-12');
		expect(parseDate('2027-06-12', 'dmy')).toBe('2027-06-12');
		expect(parseDate('12.6.27', 'dmy')).toBe('2027-06-12');
	});
	it('rejects impossible dates instead of rolling them over', () => {
		expect(parseDate('31.2.2027', 'dmy')).toBeNull();
		expect(parseDate('zajtra', 'dmy')).toBeNull();
	});
});

describe('parseTime / parseCount', () => {
	it('normalises common time spellings', () => {
		expect(parseTime('18:00')).toBe('18:00');
		expect(parseTime('9.30')).toBe('09:30');
		expect(parseTime('18h')).toBe('18:00');
		expect(parseTime('6:30 pm')).toBe('18:30');
		expect(parseTime('25:00')).toBeNull();
		expect(parseTime('')).toBeNull();
	});
	it('pulls a guest count out of text', () => {
		expect(parseCount('120 hostí')).toBe(120);
		expect(parseCount('~80')).toBe(80);
		expect(parseCount('neviem')).toBeNull();
	});
});

describe('pricing', () => {
	it('prices tokens in micro-dollars, cached input at the cached rate', () => {
		// gpt-6.1-sol: $2 in, $0.10 cached, $10 out per 1M
		expect(costUsdMicro('gpt-6.1-sol', { input_tokens: 1000, cached_tokens: 0, output_tokens: 100 })).toBe(3000);
		expect(costUsdMicro('gpt-6.1-sol', { input_tokens: 1000, cached_tokens: 1000, output_tokens: 0 })).toBe(100);
	});
	it('converts to milli-credits: 1 EUR = 100 credits = 100,000 mc, marked up and rounded up', () => {
		// $1 = 1e6 µUSD → 0.92 EUR × 3 = 2.76 EUR = 276 credits = 276,000 mc
		expect(toMilliCredits(1_000_000, DEFAULT_AI)).toBe(276_000);
		expect(toMilliCredits(1, DEFAULT_AI)).toBe(1); // never rounds a real cost to free
	});
});

describe('monthlyWindow', () => {
	it('finds the month containing now, counted from the anchor day', () => {
		const w = monthlyWindow(new Date('2026-01-15T10:00:00Z'), new Date('2026-10-18T12:00:00Z'));
		expect(w.start.toISOString()).toBe('2026-10-15T10:00:00.000Z');
		expect(w.end.toISOString()).toBe('2026-11-15T10:00:00.000Z');
	});
	it('clamps an anchor on the 31st to the end of shorter months', () => {
		const w = monthlyWindow(new Date('2026-01-31T00:00:00Z'), new Date('2026-02-20T00:00:00Z'));
		expect(w.start.toISOString()).toBe('2026-01-31T00:00:00.000Z');
		expect(w.end.toISOString()).toBe('2026-02-28T00:00:00.000Z');
	});
	it('starts at the anchor for a brand-new organisation', () => {
		const anchor = new Date('2026-10-18T09:00:00Z');
		expect(monthlyWindow(anchor, new Date('2026-10-18T09:00:01Z')).start.toISOString()).toBe(anchor.toISOString());
	});
});
