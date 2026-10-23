import { describe, it, expect } from 'vitest';
import { csvCell, toCsv, exportFileName } from './org-export';

describe('csvCell', () => {
	it('quotes separators, quotes and line breaks', () => {
		expect(csvCell('a;b')).toBe('"a;b"');
		expect(csvCell('say "hi"')).toBe('"say ""hi"""');
		expect(csvCell('line\nbreak')).toBe('"line\nbreak"');
		expect(csvCell(null)).toBe('');
		expect(csvCell(12)).toBe('12');
	});

	it('defuses spreadsheet formulas', () => {
		expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
		expect(csvCell('+421 900')).toBe("'+421 900");
		expect(csvCell('@cmd')).toBe("'@cmd");
	});
});

describe('toCsv', () => {
	it('writes a BOM, a header and one line per row', () => {
		const csv = toCsv([{ a: 1, b: 'Kaštieľ' }], [{ key: 'a', label: 'A' }, { key: 'b', label: 'Sála' }]);
		expect(csv.startsWith('﻿')).toBe(true);
		expect(csv.slice(1).split('\r\n')).toEqual(['A;Sála', '1;Kaštieľ', '']);
	});
});

describe('exportFileName', () => {
	it('uses a safe slug and the date', () => {
		expect(exportFileName('kastiel', 'json', new Date('2026-10-23T10:00:00Z'))).toBe('hallify-kastiel-2026-10-23.json');
		expect(exportFileName('../evil"', 'csv', new Date('2026-10-23T10:00:00Z'))).toBe('hallify-evil-2026-10-23.csv');
	});
});
