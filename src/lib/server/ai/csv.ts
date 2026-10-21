/**
 * CSV reading for imports.
 *
 * The model never reads a whole file. It sees the header and a few sample rows,
 * says which column means what, and this code applies that mapping to every row.
 * That keeps a 400-row import as cheap as a 4-row one, and means a row is never
 * silently "summarised" away by the model.
 */

/** Delimiter by count in the first line, outside quotes. Slovak and Czech Excel
 *  export with semicolons, most other tools with commas. */
function detectDelimiter(text: string): string {
	const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
	let best = ',';
	let bestCount = 0;
	for (const d of [',', ';', '\t', '|']) {
		let n = 0;
		let quoted = false;
		for (const ch of firstLine) {
			if (ch === '"') quoted = !quoted;
			else if (ch === d && !quoted) n++;
		}
		if (n > bestCount) { best = d; bestCount = n; }
	}
	return best;
}

/** RFC 4180: quoted fields, doubled quotes, newlines inside quotes. */
export function parseCsv(input: string): { delimiter: string; rows: string[][] } {
	const text = input.replace(/^﻿/, '');
	const delimiter = detectDelimiter(text);
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let quoted = false;

	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (quoted) {
			if (ch === '"') {
				if (text[i + 1] === '"') { field += '"'; i++; }
				else quoted = false;
			} else field += ch;
			continue;
		}
		if (ch === '"' && field === '') quoted = true;
		else if (ch === delimiter) { row.push(field); field = ''; }
		else if (ch === '\n' || ch === '\r') {
			if (ch === '\r' && text[i + 1] === '\n') i++;
			row.push(field); field = '';
			if (row.some((f) => f.trim() !== '')) rows.push(row.map((f) => f.trim()));
			row = [];
		} else field += ch;
	}
	row.push(field);
	if (row.some((f) => f.trim() !== '')) rows.push(row.map((f) => f.trim()));
	return { delimiter, rows };
}

export type DateOrder = 'ymd' | 'dmy' | 'mdy';

/** A calendar date in any common written form → YYYY-MM-DD, or null. The order of
 *  day and month is the caller's to state (the model reads it off the samples);
 *  a four-digit first number is always read as a year. */
export function parseDate(raw: string, order: DateOrder): string | null {
	const tokens = raw.trim().split(/[^0-9]+/).filter(Boolean).slice(0, 3);
	if (tokens.length !== 3) return null;
	const parts = tokens.map(Number);
	let y: number, m: number, d: number;
	if (tokens[0].length === 4 || order === 'ymd') [y, m, d] = parts;
	else if (order === 'dmy') [d, m, y] = parts;
	else [m, d, y] = parts;
	if (y < 100) y += 2000;
	const date = new Date(Date.UTC(y, m - 1, d));
	if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
	return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** "18:00", "18.00", "18h", "6:30 PM" → "HH:MM", or null. */
export function parseTime(raw: string): string | null {
	const v = raw.trim().toLowerCase();
	if (!v) return null;
	const m = /^(\d{1,2})(?:[:.h](\d{2}))?\s*(am|pm|h)?$/.exec(v);
	if (!m) return null;
	let h = Number(m[1]);
	const min = Number(m[2] ?? 0);
	if (m[3] === 'pm' && h < 12) h += 12;
	if (m[3] === 'am' && h === 12) h = 0;
	if (h > 23 || min > 59) return null;
	return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** A guest count, tolerating "120", "120 hostí", "~120". */
export function parseCount(raw: string): number | null {
	const m = /(\d{1,5})/.exec(raw);
	if (!m) return null;
	const n = Number(m[1]);
	return n > 0 ? n : null;
}
