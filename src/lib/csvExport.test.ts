import { describe, expect, it } from 'vitest';
import { csvCell, seatingManifestCsv, type ManifestFloor } from './csvExport';

describe('csvCell', () => {
	it('defuses values a spreadsheet would run as a formula', () => {
		expect(csvCell('=cmd|calc')).toBe("'=cmd|calc");
		expect(csvCell('@SUM(1+1)')).toBe("'@SUM(1+1)");
		expect(csvCell('+421 900')).toBe("'+421 900");
		expect(csvCell('-2')).toBe("'-2");
		expect(csvCell('\t=1')).toBe("'\t=1");
	});

	it('quotes the delimiter, quotes and line breaks', () => {
		expect(csvCell('Novák, Peter')).toBe('"Novák, Peter"');
		expect(csvCell('Novák, Peter', ';')).toBe('Novák, Peter');
		expect(csvCell('a;b', ';')).toBe('"a;b"');
		expect(csvCell('say "hi"')).toBe('"say ""hi"""');
		expect(csvCell('two\nlines')).toBe('"two\nlines"');
		expect(csvCell('=A1,B1')).toBe('"\'=A1,B1"');
	});

	it('leaves ordinary text alone', () => {
		expect(csvCell('Anna Nováková')).toBe('Anna Nováková');
		expect(csvCell(undefined)).toBe('');
	});
});

describe('seatingManifestCsv', () => {
	const floors: ManifestFloor[] = [{
		name: 'Prízemie',
		tables: [{ tag: 'T1', label: 'Hlavný stôl', seats: [{ idx: 0, guest: { firstName: 'Eva', lastName: '=HYPERLINK("x")', group: '@SUM(1+1)' } }] }],
		standalone: [{ idx: 2, guest: { firstName: 'Ján', lastName: 'Kováč' } }]
	}];

	it('writes localised headers and semicolons for a Slovak reader', () => {
		const csv = seatingManifestCsv(floors, {
			delimiter: ';',
			labels: { floor: 'Poschodie', table: 'Stôl', seat: 'Miesto', guest: 'Hosť', group: 'Skupina', notes: 'Poznámky', standalone: 'Samostatné stoličky' }
		});
		const lines = csv.replace(/^﻿/, '').split('\r\n');
		expect(lines[0]).toBe('Poschodie;Stôl;Miesto;Hosť;Skupina;Poznámky');
		expect(lines[1]).toBe(';T1 - Hlavný stôl;T1-1;"\'=HYPERLINK(""x""), Eva";\'@SUM(1+1);');
		expect(lines[2]).toBe(';Samostatné stoličky;C3;Kováč, Ján;;');
	});

	it('defaults to English headers and commas', () => {
		const csv = seatingManifestCsv(floors);
		expect(csv.startsWith('﻿Floor,Table,Seat,Guest,Group,Notes\r\n')).toBe(true);
	});
});
