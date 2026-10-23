import { describe, expect, it } from 'vitest';
import { decodeCsvBytes, parseGuestCsv, splitDuplicateGuests } from './guest-csv';

describe('decodeCsvBytes', () => {
	it('reads a Windows-1250 export from Slovak Excel, notes column included', () => {
		// "Meno;Priezvisko;Poznámka\r\nJana;Kováčová;bez lepku" as cp1250 bytes.
		const text = 'Meno;Priezvisko;Poznámka\r\nJana;Kováčová;bez lepku';
		const cp1250: Record<string, number> = { 'á': 0xe1, 'č': 0xe8, 'ľ': 0xbe, 'š': 0x9a, 'ž': 0x9e, 'ý': 0xfd };
		const bytes = Uint8Array.from([...text].map((ch) => cp1250[ch] ?? ch.charCodeAt(0)));
		const decoded = decodeCsvBytes(bytes);
		expect(decoded).toBe(text);
		expect(parseGuestCsv(decoded)).toEqual([{ firstName: 'Jana', lastName: 'Kováčová', group: undefined, note: 'bez lepku' }]);
	});

	it('keeps UTF-8 (with a BOM) as UTF-8', () => {
		const bytes = new TextEncoder().encode('﻿Meno;Priezvisko\nĽubica;Šťastná');
		expect(parseGuestCsv(decodeCsvBytes(bytes))).toEqual([{ firstName: 'Ľubica', lastName: 'Šťastná', group: undefined, note: undefined }]);
	});

	it('reads Excel "Unicode text" (UTF-16 LE with a BOM)', () => {
		const text = 'Meno\tPriezvisko\nŽofia\tHrušková';
		const bytes = new Uint8Array(2 + text.length * 2);
		bytes[0] = 0xff; bytes[1] = 0xfe;
		[...text].forEach((ch, i) => { const c = ch.charCodeAt(0); bytes[2 + i * 2] = c & 0xff; bytes[3 + i * 2] = c >> 8; });
		expect(parseGuestCsv(decodeCsvBytes(bytes))[0]).toEqual({ firstName: 'Žofia', lastName: 'Hrušková', group: undefined, note: undefined });
	});
});

describe('splitDuplicateGuests', () => {
	it('skips people already on the list, ignoring case and spacing', () => {
		const existing = [{ firstName: 'Anna', lastName: 'Nováková', group: 'Rodina Nováková' }];
		const { fresh, duplicates } = splitDuplicateGuests(existing, [
			{ firstName: 'anna', lastName: ' Nováková', group: 'Rodina  Nováková' },
			{ firstName: 'Peter', lastName: 'Novák', group: 'Rodina Nováková' },
		]);
		expect(duplicates.map((g) => g.firstName)).toEqual(['anna']);
		expect(fresh.map((g) => g.firstName)).toEqual(['Peter']);
	});

	it('treats the same name in another group as a different guest', () => {
		const { fresh } = splitDuplicateGuests([{ firstName: 'Guest', lastName: '1', group: 'Kováč' }], [{ firstName: 'Guest', lastName: '1', group: 'Horváth' }]);
		expect(fresh).toHaveLength(1);
	});
});

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
