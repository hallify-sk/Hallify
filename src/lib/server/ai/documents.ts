import { PDFDocument } from 'pdf-lib';
import { dbFirst, dbRun } from '$lib/db/index';

/**
 * Drawings the assistant can look at: images and PDFs, uploaded or found on the web.
 *
 * Bytes live in R2 under ai-documents/ (never served publicly — /uploads only serves
 * halls/). The conversation stores a reference, and the bytes are read and handed to
 * the model as inline data when a call needs them. A PDF is only ever passed as the
 * few pages that matter: a 120-page annual report would cost more than the plan on
 * page 74 is worth, on every step of the turn.
 */

export type DocMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';

export interface R2Like {
	put(key: string, value: ArrayBuffer | Uint8Array, opts?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
	get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
}

/** Whole PDFs up to this many pages go to the model as they are; longer ones only
 *  as the pages the assistant asks for. */
export const MAX_INLINE_PDF_PAGES = 8;
/** Pages one look may take out of a longer PDF. */
export const MAX_VIEW_PAGES = 4;

/** By content, not by name or by what a server claims. */
export function sniffDocument(head: Uint8Array): DocMime | null {
	if (head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46) return 'application/pdf'; // %PDF
	if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
	if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return 'image/png';
	if (head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46 &&
		head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50) return 'image/webp';
	return null;
}

export function toBase64(bytes: ArrayBuffer | Uint8Array): string {
	const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	let bin = '';
	// Chunked: String.fromCharCode over a whole multi-megabyte buffer overflows the stack.
	for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
	return btoa(bin);
}

async function loadPdf(bytes: ArrayBuffer | Uint8Array) {
	return PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
}

export async function pdfPageCount(bytes: ArrayBuffer | Uint8Array): Promise<number> {
	return (await loadPdf(bytes)).getPageCount();
}

/** A new, small PDF holding only the given pages (1-based, as people number them). */
export async function extractPdfPages(bytes: ArrayBuffer | Uint8Array, pages: number[]): Promise<{ bytes: Uint8Array; pages: number[] }> {
	const src = await loadPdf(bytes);
	const count = src.getPageCount();
	const wanted = [...new Set(pages.map((p) => Math.trunc(p)))].filter((p) => p >= 1 && p <= count).slice(0, MAX_VIEW_PAGES);
	if (!wanted.length) throw new Error(`No such pages; the document has ${count}.`);
	const out = await PDFDocument.create();
	const copied = await out.copyPages(src, wanted.map((p) => p - 1));
	copied.forEach((p) => out.addPage(p));
	return { bytes: await out.save(), pages: wanted };
}

export async function storeDocument(
	db: App.Locals['db'],
	r2: R2Like,
	doc: { orgId: string; userId: string; threadId: string | null; name: string; mime: DocMime; bytes: ArrayBuffer | Uint8Array; pageCount: number | null }
): Promise<string> {
	const id = crypto.randomUUID();
	const key = `ai-documents/${doc.orgId}/${id}`;
	await r2.put(key, doc.bytes, { httpMetadata: { contentType: doc.mime } });
	await dbRun(db,
		`INSERT INTO ai_attachments (id, org_id, user_id, thread_id, name, content, size, mime, r2_key, page_count)
		 VALUES (?, ?, ?, ?, ?, '', ?, ?, ?, ?)`,
		id, doc.orgId, doc.userId, doc.threadId, doc.name.slice(0, 200), doc.bytes.byteLength, doc.mime, key, doc.pageCount);
	return id;
}

export interface DocRow { id: string; name: string; mime: string | null; r2_key: string | null; page_count: number | null }

export async function loadDocumentRow(db: App.Locals['db'], orgId: string, id: string): Promise<DocRow | null> {
	return dbFirst<DocRow>(db, 'SELECT id, name, mime, r2_key, page_count FROM ai_attachments WHERE id = ? AND org_id = ?', id, orgId);
}

/** The model-facing content part for a stored document, read from storage now. */
export async function documentPart(db: App.Locals['db'], r2: R2Like | undefined, orgId: string, id: string): Promise<Record<string, unknown> | null> {
	if (!r2) return null;
	const row = await loadDocumentRow(db, orgId, id);
	if (!row?.r2_key || !row.mime) return null;
	const obj = await r2.get(row.r2_key);
	if (!obj) return null;
	const data = `data:${row.mime};base64,${toBase64(await obj.arrayBuffer())}`;
	return row.mime === 'application/pdf'
		? { type: 'input_file', filename: row.name.endsWith('.pdf') ? row.name : `${row.name}.pdf`, file_data: data }
		: { type: 'input_image', image_url: data, detail: 'high' };
}

/** Raw bytes of a stored document, for cutting pages out of an uploaded PDF. */
export async function documentBytes(r2: R2Like | undefined, row: DocRow): Promise<ArrayBuffer | null> {
	if (!r2 || !row.r2_key) return null;
	const obj = await r2.get(row.r2_key);
	return obj ? obj.arrayBuffer() : null;
}
