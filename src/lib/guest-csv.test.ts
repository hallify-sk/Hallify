import { describe, expect, it } from 'vitest';
import { parseGuestCsv } from './guest-csv';

describe('parseGuestCsv', () => {
	it('reads an English header with commas', () => {
		const out = parseGuestCsv('First name,Last name,Group,Note\nAnna,Nováková,Novák family,vegetarian\nPeter,Novák,Novák family,\n');
		expect(out).toEqual([
			{ firstName: 'Anna', lastName: 'Nováková', group: 'Novák family', note: 'vegetarian' },
			{ firstName: 'Peter', lastName: 'Novák', group: 'Novák family', note: undefined }
		]);
	});

	it('reads a Slovak Excel export: semicolons, BOM, CRLF', () => {
		const out = parseGuestCsv('﻿Meno;Priezvisko;Skupina;Poznámka\r\nEva;Kováčová;Rodina Kováčová;bez lepku\r\n');
		expect(out).toEqual([{ firstName: 'Eva', lastName: 'Kováčová', group: 'Rodina Kováčová', note: 'bez lepku' }]);
	});

	it('splits a single name column on the last space, or on a comma', () => {
		const out = parseGuestCsv('Name\nAnna Mária Nováková\n"Novák, Peter"\n');
		expect(out).toEqual([
			{ firstName: 'Anna Mária', lastName: 'Nováková', group: undefined, note: undefined },
			{ firstName: 'Peter', lastName: 'Novák', group: undefined, note: undefined }
		]);
	});

	it('takes columns positionally when there is no header', () => {
		const out = parseGuestCsv('Martin\tHorváth\t\tneeds a chair near the exit');
		expect(out).toEqual([{ firstName: 'Martin', lastName: 'Horváth', group: undefined, note: 'needs a chair near the exit' }]);
	});

	it('handles quoted fields with delimiters and doubled quotes inside', () => {
		const out = parseGuestCsv('first,last,note\n"Jana","Nováková","vegetarian, no nuts; says ""hi"""');
		expect(out[0].note).toBe('vegetarian, no nuts; says "hi"');
	});

	it('skips blank lines and rows without a name, keeps one-word names', () => {
		const out = parseGuestCsv('first,last\n\n,\nMadonna,\n');
		expect(out).toEqual([{ firstName: '', lastName: 'Madonna', group: undefined, note: undefined }]);
	});

	it('returns nothing for an empty file', () => {
		expect(parseGuestCsv('')).toEqual([]);
		expect(parseGuestCsv('\n\n')).toEqual([]);
	});
});
