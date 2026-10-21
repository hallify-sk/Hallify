/**
 * Guests from a spreadsheet export.
 *
 * Coordinators keep guest lists in Excel or Google Sheets. Whatever they export
 * is accepted here: comma, semicolon (what Excel writes on a Slovak locale) or
 * tab separated, with or without a header row, quoted fields, Windows line ends,
 * a BOM. Columns are recognised by their header in Slovak or English; without a
 * header the columns are taken as first name, last name, group, note. A single
 * "name" column is split on its last space.
 */

export interface ImportedGuest {
	firstName: string;
	lastName: string;
	group?: string;
	note?: string;
}

const HEADERS: Record<'first' | 'last' | 'name' | 'group' | 'note', string[]> = {
	first: ['first name', 'firstname', 'first', 'given name', 'meno', 'krstné meno', 'krstne meno'],
	last: ['last name', 'lastname', 'last', 'surname', 'family name', 'priezvisko'],
	name: ['name', 'guest', 'full name', 'meno a priezvisko', 'hosť', 'host', 'celé meno', 'cele meno'],
	group: ['group', 'family', 'group / family', 'table group', 'skupina', 'rodina', 'skupina / rodina'],
	note: ['note', 'notes', 'comment', 'dietary', 'poznámka', 'poznamka', 'poznámky', 'poznamky']
};

function detectDelimiter(firstLine: string): string {
	const counts: [string, number][] = [[',', 0], [';', 0], ['\t', 0]];
	let inQuotes = false;
	for (const ch of firstLine) {
		if (ch === '"') inQuotes = !inQuotes;
		else if (!inQuotes) for (const c of counts) if (c[0] === ch) c[1]++;
	}
	counts.sort((a, b) => b[1] - a[1]);
	return counts[0][1] > 0 ? counts[0][0] : ',';
}

/** Split one CSV record; handles quotes and doubled quotes inside quotes. */
function splitRecord(line: string, delim: string): string[] {
	const out: string[] = [];
	let cur = '';
	let inQuotes = false;
	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (inQuotes) {
			if (ch === '"') {
				if (line[i + 1] === '"') { cur += '"'; i++; }
				else inQuotes = false;
			} else cur += ch;
		} else if (ch === '"') inQuotes = true;
		else if (ch === delim) { out.push(cur); cur = ''; }
		else cur += ch;
	}
	out.push(cur);
	return out.map((s) => s.trim());
}

function norm(s: string): string {
	return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function matchHeader(cell: string): keyof typeof HEADERS | null {
	const c = norm(cell);
	for (const [key, names] of Object.entries(HEADERS) as [keyof typeof HEADERS, string[]][]) {
		if (names.includes(c)) return key;
	}
	return null;
}

function splitName(full: string): { firstName: string; lastName: string } {
	const parts = full.trim().split(/\s+/);
	if (parts.length === 1) return { firstName: parts[0], lastName: '' };
	// "Nováková, Anna" → last, first
	if (full.includes(',')) {
		const [last, first] = full.split(',').map((s) => s.trim());
		return { firstName: first ?? '', lastName: last ?? '' };
	}
	return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
}

export function parseGuestCsv(text: string): ImportedGuest[] {
	const lines = text.replace(/^﻿/, '').split(/\r\n|\r|\n/).filter((l) => l.trim() !== '');
	if (!lines.length) return [];
	const delim = detectDelimiter(lines[0]);
	const rows = lines.map((l) => splitRecord(l, delim));

	// Header row: any cell that names a known column.
	const headerCols = rows[0].map(matchHeader);
	const hasHeader = headerCols.some((h) => h !== null);
	const col = (key: keyof typeof HEADERS) => headerCols.indexOf(key);
	const body = hasHeader ? rows.slice(1) : rows;

	const out: ImportedGuest[] = [];
	for (const r of body) {
		let firstName = '', lastName = '', group: string | undefined, note: string | undefined;
		if (hasHeader) {
			const iFirst = col('first'), iLast = col('last'), iName = col('name'), iGroup = col('group'), iNote = col('note');
			if (iFirst >= 0 || iLast >= 0) {
				firstName = r[iFirst] ?? '';
				lastName = r[iLast] ?? '';
				if (!lastName && !firstName && iName >= 0) ({ firstName, lastName } = splitName(r[iName] ?? ''));
			} else if (iName >= 0) {
				({ firstName, lastName } = splitName(r[iName] ?? ''));
			} else {
				// A header we recognised only partly (say, just "group"): fall back to
				// positional names in the first two columns.
				firstName = r[0] ?? ''; lastName = r[1] ?? '';
			}
			if (iGroup >= 0) group = r[iGroup] || undefined;
			if (iNote >= 0) note = r[iNote] || undefined;
		} else {
			// Positional: first, last, group, note — or one "Full Name" column.
			if (r.length === 1 || (r.length >= 2 && !r[1] && r[0].includes(' '))) ({ firstName, lastName } = splitName(r[0]));
			else { firstName = r[0] ?? ''; lastName = r[1] ?? ''; }
			group = r[2] || undefined;
			note = r[3] || undefined;
		}
		firstName = firstName.trim(); lastName = lastName.trim();
		if (!firstName && !lastName) continue;
		// A one-word name is still a guest; keep the word as the surname so the
		// list, which sorts by surname, has something to sort on.
		if (!lastName) { lastName = firstName; firstName = ''; }
		out.push({ firstName, lastName, group, note });
	}
	return out;
}
