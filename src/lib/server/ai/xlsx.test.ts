import { describe, expect, it } from 'vitest';
import { xlsxToCsv, excelDate, XlsxError } from './xlsx';
import { parseCsv } from './csv';

/** A minimal ZIP writer: enough to build a workbook the way Excel lays it out. */
async function zip(files: Record<string, string>, deflate: boolean): Promise<ArrayBuffer> {
	const enc = new TextEncoder();
	const locals: Uint8Array[] = [];
	const central: Uint8Array[] = [];
	let offset = 0;
	for (const [name, text] of Object.entries(files)) {
		const raw = enc.encode(text);
		const data = deflate
			? new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer())
			: raw;
		const nameBytes = enc.encode(name);
		const local = new Uint8Array(30 + nameBytes.length + data.length);
		const lv = new DataView(local.buffer);
		lv.setUint32(0, 0x04034b50, true);
		lv.setUint16(8, deflate ? 8 : 0, true);
		lv.setUint32(18, data.length, true);
		lv.setUint32(22, raw.length, true);
		lv.setUint16(26, nameBytes.length, true);
		local.set(nameBytes, 30);
		local.set(data, 30 + nameBytes.length);
		const cd = new Uint8Array(46 + nameBytes.length);
		const cv = new DataView(cd.buffer);
		cv.setUint32(0, 0x02014b50, true);
		cv.setUint16(10, deflate ? 8 : 0, true);
		cv.setUint32(20, data.length, true);
		cv.setUint32(24, raw.length, true);
		cv.setUint16(28, nameBytes.length, true);
		cv.setUint32(42, offset, true);
		cd.set(nameBytes, 46);
		locals.push(local);
		central.push(cd);
		offset += local.length;
	}
	const cdSize = central.reduce((n, c) => n + c.length, 0);
	const end = new Uint8Array(22);
	const ev = new DataView(end.buffer);
	ev.setUint32(0, 0x06054b50, true);
	ev.setUint16(8, central.length, true);
	ev.setUint16(10, central.length, true);
	ev.setUint32(12, cdSize, true);
	ev.setUint32(16, offset, true);
	return new Blob([...locals, ...central, end].map((b) => b as BlobPart)).arrayBuffer();
}

const workbook = {
	'xl/workbook.xml': '<workbook><sheets><sheet name="Udalosti" sheetId="1" r:id="rId1"/><sheet name="Iné" sheetId="2" r:id="rId2"/></sheets></workbook>',
	'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId2" Target="worksheets/sheet2.xml"/><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
	'xl/sharedStrings.xml': '<sst><si><t>Názov</t></si><si><t>Dátum</t></si><si><t>Čas</t></si><si><r><t>Svadba </t></r><r><t xml:space="preserve">Nováková, Kováč</t></r></si><si><t>Hostia</t></si></sst>',
	'xl/styles.xml': '<styleSheet><numFmts count="1"><numFmt numFmtId="164" formatCode="d\\.m\\.yyyy"/></numFmts><cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="164"/><xf numFmtId="20"/></cellXfs></styleSheet>',
	'xl/worksheets/sheet1.xml':
		'<worksheet><sheetData>' +
		'<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>4</v></c></row>' +
		'<row r="2"/>' +
		'<row r="3"><c r="A3" t="s"><v>3</v></c><c r="B3" s="1"><v>46340</v></c><c r="C3" s="2"><v>0.75</v></c><c r="D3"><v>120</v></c></row>' +
		'<row r="4"><c r="A4" t="inlineStr"><is><t>Stužková &amp; ples</t></is></c><c r="D4"><v>80</v></c></row>' +
		'</sheetData></worksheet>',
	'xl/worksheets/sheet2.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>wrong sheet</t></is></c></row></sheetData></worksheet>'
};

describe('xlsxToCsv', () => {
	for (const deflate of [false, true]) {
		it(`reads the first sheet as CSV (${deflate ? 'deflated' : 'stored'})`, async () => {
			const csv = await xlsxToCsv(await zip(workbook, deflate));
			expect(parseCsv(csv).rows).toEqual([
				['Názov', 'Dátum', 'Čas', 'Hostia'],
				['Svadba Nováková, Kováč', '2026-11-14', '18:00', '120'],
				['Stužková & ples', '', '', '80']
			]);
		});
	}

	it('refuses something that is not a workbook', async () => {
		await expect(xlsxToCsv(new TextEncoder().encode('Názov;Dátum').buffer as ArrayBuffer)).rejects.toBeInstanceOf(XlsxError);
	});

	it('converts Excel serial dates and times', () => {
		expect(excelDate(46340)).toBe('2026-11-14');
		expect(excelDate(46340.5)).toBe('2026-11-14 12:00');
		expect(excelDate(0.25)).toBe('06:00');
	});
});
