// Organisation data export (Settings → Advanced). Before this, an owner had no way
// to take their bookings, clients or settings with them before closing, and the
// archive kept on closing is visible to platform admins only.
//
// Pure helpers here; the database reads live in the route.

/** One CSV cell: quoted when needed, and with spreadsheet formulas defused
 *  (a client named "=HYPERLINK(...)" must not run when the owner opens the file). */
export function csvCell(v: unknown): string {
	if (v == null) return '';
	let s = String(v);
	if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
	return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Rows as CSV with a header line. Semicolons, because Slovak Excel reads a comma
 *  as the decimal separator and puts a comma-separated file into one column. The
 *  BOM makes Excel read the file as UTF-8 (diacritics). */
export function toCsv<T extends Record<string, unknown>>(rows: T[], columns: Array<{ key: keyof T; label: string }>): string {
	const head = columns.map((c) => csvCell(c.label)).join(';');
	const body = rows.map((r) => columns.map((c) => csvCell(r[c.key])).join(';'));
	return '﻿' + [head, ...body].join('\r\n') + '\r\n';
}

/** A file name from the organisation's slug and today's date. */
export function exportFileName(slug: string, ext: 'json' | 'csv', today = new Date()): string {
	const safe = String(slug || 'organizacia').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'organizacia';
	return `hallify-${safe}-${today.toISOString().slice(0, 10)}.${ext}`;
}
