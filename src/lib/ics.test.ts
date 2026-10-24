import { describe, expect, it } from 'vitest';
import { buildIcs, icsEscape, icsFold } from './ics';

const now = new Date('2026-10-24T10:00:00Z');

describe('buildIcs', () => {
	it('writes a timed event in local wall-clock time', () => {
		const ics = buildIcs({ uid: 'r1@hallify', title: 'Svadba', date: '2026-11-14', start: '15:00', end: '23:30', now });
		expect(ics).toContain('DTSTART:20261114T150000\r\n');
		expect(ics).toContain('DTEND:20261114T233000\r\n');
		expect(ics).toContain('DTSTAMP:20261024T100000Z');
		expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
		expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
	});

	it('runs an end before the start into the next day', () => {
		const ics = buildIcs({ uid: 'r', title: 'Stužková', date: '2026-12-31', start: '18:00', end: '02:00', now });
		expect(ics).toContain('DTEND:20270101T020000');
	});

	it('makes a booking without times a whole-day event', () => {
		const ics = buildIcs({ uid: 'r', title: 'Školenie', date: '2026-12-12', now });
		expect(ics).toContain('DTSTART;VALUE=DATE:20261212');
		expect(ics).toContain('DTEND;VALUE=DATE:20261213');
	});

	it('escapes text and folds long lines', () => {
		expect(icsEscape('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
		const long = 'DESCRIPTION:' + 'ž'.repeat(80);
		const folded = icsFold(long);
		for (const line of folded.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
		expect(folded.replace(/\r\n /g, '')).toBe(long);
	});
});
