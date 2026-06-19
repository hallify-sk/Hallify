// Client-side CSV export for the seating manifest. CSV opens directly in Excel and
// Google Sheets and needs no dependencies (none of which would run on Workers anyway).

interface ManifestGuest { firstName: string; lastName: string; group?: string; note?: string }
interface ManifestSeat { idx: number; guest: ManifestGuest | null }
interface ManifestTable { tag: string; label: string; seats: ManifestSeat[] }
export interface ManifestFloor { name: string; tables: ManifestTable[]; standalone: ManifestSeat[] }

/** RFC-4180 quoting: wrap in quotes and double any embedded quotes when the value
 *  contains a comma, quote, or newline. */
function cell(value: string): string {
	const s = value ?? '';
	return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function guestName(g: ManifestGuest): string {
	return `${g.lastName}, ${g.firstName}`.replace(/^,\s*/, '').replace(/,\s*$/, '').trim();
}

/** Build a seating roster CSV from the manifest's derived floor structure.
 *  One row per seated guest: Floor, Table, Seat, Guest, Group, Notes. */
export function seatingManifestCsv(floors: ManifestFloor[]): string {
	const rows: string[][] = [['Floor', 'Table', 'Seat', 'Guest', 'Group', 'Notes']];
	const multiFloor = floors.length > 1;

	for (const fl of floors) {
		const floorName = multiFloor ? fl.name : '';
		for (const tbl of fl.tables) {
			for (const s of tbl.seats) {
				if (!s.guest) continue;
				const table = tbl.label && tbl.label !== tbl.tag ? `${tbl.tag} - ${tbl.label}` : tbl.tag;
				rows.push([floorName, table, `${tbl.tag}-${s.idx + 1}`, guestName(s.guest), s.guest.group ?? '', s.guest.note ?? '']);
			}
		}
		for (const s of fl.standalone) {
			if (!s.guest) continue;
			rows.push([floorName, 'Standalone chairs', `C${s.idx + 1}`, guestName(s.guest), s.guest.group ?? '', s.guest.note ?? '']);
		}
	}

	// Leading BOM so Excel reads UTF-8 (Slovak diacritics) correctly. CRLF line endings.
	return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
}

/** Trigger a browser download of `content` as `filename`. */
export function downloadCsv(filename: string, content: string): void {
	const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

/** Filesystem-safe slug for filenames (e.g. a reservation title). */
export function fileSlug(s: string): string {
	return (s || 'seating')
		.normalize('NFKD').replace(/[̀-ͯ]/g, '')
		.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
		|| 'seating';
}
