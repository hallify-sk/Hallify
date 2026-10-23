/**
 * The first sheet of an Excel workbook (.xlsx) as CSV text, so a venue's event list
 * kept in Excel goes through the same import as a CSV.
 *
 * No library: an .xlsx is a ZIP of XML files. The ZIP's central directory says where
 * each file is, entries are stored or deflated (DecompressionStream('deflate-raw'),
 * built into Workers and Node), and only four small XML files matter: the workbook
 * (which sheet is first), its relationships (where that sheet is), the shared strings
 * and the sheet itself. Styles are read only to tell a date from a plain number.
 *
 * Everything is bounded — entry count, unpacked size — so a crafted file cannot make
 * the Worker unpack gigabytes.
 */

const MAX_ENTRIES = 2000;
const MAX_UNPACKED = 24 * 1024 * 1024;
const MAX_ROWS = 5000;
const MAX_COLS = 100;

export class XlsxError extends Error {}

interface Entry { name: string; method: number; compressedSize: number; localOffset: number }

function readEntries(buf: Uint8Array): Map<string, Entry> {
	const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
	// End of central directory: the last 22 bytes, or up to 64 KB earlier with a comment.
	let eocd = -1;
	for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
		if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
	}
	if (eocd < 0) throw new XlsxError('not a zip');
	const count = view.getUint16(eocd + 10, true);
	let p = view.getUint32(eocd + 16, true);
	if (count > MAX_ENTRIES) throw new XlsxError('too many entries');
	const out = new Map<string, Entry>();
	const dec = new TextDecoder();
	for (let n = 0; n < count; n++) {
		if (p + 46 > buf.length || view.getUint32(p, true) !== 0x02014b50) throw new XlsxError('bad directory');
		const method = view.getUint16(p + 10, true);
		const compressedSize = view.getUint32(p + 20, true);
		const nameLen = view.getUint16(p + 28, true);
		const extraLen = view.getUint16(p + 30, true);
		const commentLen = view.getUint16(p + 32, true);
		const localOffset = view.getUint32(p + 42, true);
		const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
		out.set(name, { name, method, compressedSize, localOffset });
		p += 46 + nameLen + extraLen + commentLen;
	}
	return out;
}

async function inflateRaw(data: Uint8Array, budget: { left: number }): Promise<Uint8Array> {
	const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
	const reader = stream.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.length;
		budget.left -= value.length;
		if (budget.left < 0) {
			await reader.cancel().catch(() => {});
			throw new XlsxError('too large unpacked');
		}
		chunks.push(value);
	}
	const out = new Uint8Array(size);
	let o = 0;
	for (const c of chunks) { out.set(c, o); o += c.length; }
	return out;
}

async function readFile(buf: Uint8Array, entries: Map<string, Entry>, name: string, budget: { left: number }): Promise<string | null> {
	const e = entries.get(name);
	if (!e) return null;
	const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
	if (e.localOffset + 30 > buf.length || view.getUint32(e.localOffset, true) !== 0x04034b50) throw new XlsxError('bad entry');
	const start = e.localOffset + 30 + view.getUint16(e.localOffset + 26, true) + view.getUint16(e.localOffset + 28, true);
	const data = buf.subarray(start, start + e.compressedSize);
	let bytes: Uint8Array;
	if (e.method === 0) {
		budget.left -= data.length;
		if (budget.left < 0) throw new XlsxError('too large unpacked');
		bytes = data;
	} else if (e.method === 8) {
		bytes = await inflateRaw(data, budget);
	} else {
		throw new XlsxError('unsupported compression');
	}
	return new TextDecoder().decode(bytes);
}

const unescapeXml = (s: string) => s
	.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
	.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
	.replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
	.replace(/&amp;/g, '&');

/** The visible text of a string item: its <t> runs, without phonetic guides. */
function textOf(xml: string): string {
	const clean = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
	let out = '';
	for (const m of clean.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)) out += unescapeXml(m[1] ?? '');
	return out;
}

const attr = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? null;

/** Built-in number formats that are dates or times (ECMA-376 18.8.30). */
const DATE_FORMAT_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

function dateStyles(stylesXml: string | null): Set<number> {
	const out = new Set<number>();
	if (!stylesXml) return out;
	const custom = new Map<number, string>();
	for (const m of stylesXml.matchAll(/<numFmt\b[^>]*>/g)) {
		const id = Number(attr(m[0], 'numFmtId'));
		const code = unescapeXml(attr(m[0], 'formatCode') ?? '');
		custom.set(id, code);
	}
	const isDateCode = (code: string) => /[dmyhs]/i.test(code.replace(/"[^"]*"|\[[^\]]*\]|\\./g, '')) && !/^[#0.,%\s]*$/.test(code);
	const xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(stylesXml)?.[1] ?? '';
	let i = 0;
	for (const m of xfs.matchAll(/<xf\b[^>]*\/?>/g)) {
		const id = Number(attr(m[0], 'numFmtId') ?? 0);
		if (DATE_FORMAT_IDS.has(id) || (custom.has(id) && isDateCode(custom.get(id)!))) out.add(i);
		i++;
	}
	return out;
}

/** An Excel serial number (days since 1899-12-30) as YYYY-MM-DD, HH:MM, or both. */
export function excelDate(serial: number): string {
	const days = Math.floor(serial);
	const minutes = Math.round((serial - days) * 24 * 60);
	const pad = (n: number) => String(n).padStart(2, '0');
	const time = `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`;
	if (days === 0) return time;
	const d = new Date(Date.UTC(1899, 11, 30) + days * 86_400_000);
	const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
	return minutes ? `${date} ${time}` : date;
}

const colIndex = (ref: string) => {
	let n = 0;
	for (const ch of ref.replace(/\d+$/, '').toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
	return n - 1;
};

const csvCell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export async function xlsxToCsv(bytes: ArrayBuffer): Promise<string> {
	const buf = new Uint8Array(bytes);
	const entries = readEntries(buf);
	const budget = { left: MAX_UNPACKED };

	// The first sheet in the workbook's own order, wherever its relationship puts it.
	let sheetPath = 'xl/worksheets/sheet1.xml';
	const workbook = await readFile(buf, entries, 'xl/workbook.xml', budget);
	const rels = await readFile(buf, entries, 'xl/_rels/workbook.xml.rels', budget);
	const firstSheet = workbook ? /<sheet\b[^>]*>/.exec(workbook)?.[0] : null;
	const rid = firstSheet ? attr(firstSheet, 'r:id') : null;
	if (rid && rels) {
		for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
			if (attr(m[0], 'Id') !== rid) continue;
			const target = attr(m[0], 'Target');
			if (target) sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
		}
	}
	const sheet = await readFile(buf, entries, sheetPath, budget);
	if (!sheet) throw new XlsxError('no sheet');

	const sharedXml = await readFile(buf, entries, 'xl/sharedStrings.xml', budget);
	const shared = sharedXml ? [...sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1])) : [];
	const dates = dateStyles(await readFile(buf, entries, 'xl/styles.xml', budget));

	const rows: string[][] = [];
	for (const rm of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
		if (rows.length >= MAX_ROWS) break;
		const row: string[] = [];
		for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
			const tag = ` ${cm[1]}`;
			const ref = attr(tag, 'r');
			const col = ref ? colIndex(ref) : row.length;
			if (col < 0 || col >= MAX_COLS) continue;
			const inner = cm[2] ?? '';
			const type = attr(tag, 't');
			const raw = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
			let value = '';
			if (type === 's') value = shared[Number(raw)] ?? '';
			else if (type === 'inlineStr') value = textOf(inner);
			else if (type === 'str' || type === 'e' || type === 'd') value = unescapeXml(raw ?? '');
			else if (type === 'b') value = raw === '1' ? 'TRUE' : 'FALSE';
			else if (raw !== undefined) {
				const n = Number(raw);
				value = dates.has(Number(attr(tag, 's') ?? -1)) && Number.isFinite(n) ? excelDate(n) : raw;
			}
			while (row.length < col) row.push('');
			row[col] = value;
		}
		// Empty rows (spacing, formatting only) say nothing to an import.
		if (row.some((v) => v.trim())) rows.push(row);
	}
	return rows.map((r) => r.map(csvCell).join(',')).join('\n');
}
