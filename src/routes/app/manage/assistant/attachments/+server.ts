import { json } from '@sveltejs/kit';
import { dbRun } from '$lib/db/index';
import { requireOrgPermission } from '$lib/server/access';
import { sniffDocument, pdfPageCount, storeDocument } from '$lib/server/ai/documents';
import type { RequestHandler } from './$types';

const MAX_TEXT_BYTES = 512 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const TEXT = /\.(csv|tsv|txt)$/i;
const DOC = /\.(pdf|jpe?g|png|webp)$/i;

/**
 * Text as the file was meant to be read. Excel's "CSV (oddelený bodkočiarkou)"
 * saves in Windows-1250 on Slovak systems, not UTF-8; read as UTF-8 every
 * diacritic in it turns to replacement characters.
 */
function decode(bytes: ArrayBuffer): string {
	try {
		return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	} catch {
		try {
			return new TextDecoder('windows-1250').decode(bytes);
		} catch {
			return new TextDecoder('utf-8').decode(bytes);
		}
	}
}

/** Hand a file to the assistant, visible only to the member who uploaded it.
 *  Spreadsheets and text are kept inline; drawings (images, PDFs) go to private
 *  storage and are shown to the model when a turn needs them. */
export const POST: RequestHandler = async ({ request, locals, platform }) => {
	const org = await requireOrgPermission(locals, 'ai.use');
	if (org.impersonated) return json({ ok: false, error: 'impersonated' }, { status: 403 });

	const form = await request.formData().catch(() => null);
	const file = form?.get('file');
	if (!(file instanceof File)) return json({ ok: false, error: 'no_file' }, { status: 400 });

	if (TEXT.test(file.name)) {
		if (file.size > MAX_TEXT_BYTES) return json({ ok: false, error: 'upload_too_large' }, { status: 400 });
		const id = crypto.randomUUID();
		await dbRun(locals.db,
			'INSERT INTO ai_attachments (id, org_id, user_id, name, content, size) VALUES (?, ?, ?, ?, ?, ?)',
			id, org.id, locals.user!.id, file.name.slice(0, 200), decode(await file.arrayBuffer()), file.size);
		return json({ ok: true, id, name: file.name });
	}

	if (!DOC.test(file.name)) return json({ ok: false, error: 'upload_type' }, { status: 400 });
	const r2 = platform?.env?.R2;
	if (!r2) return json({ ok: false, error: 'generic' }, { status: 503 });

	const bytes = await file.arrayBuffer();
	const mime = sniffDocument(new Uint8Array(bytes.slice(0, 12)));
	if (!mime) return json({ ok: false, error: 'upload_type' }, { status: 400 });
	if (file.size > (mime === 'application/pdf' ? MAX_PDF_BYTES : MAX_IMAGE_BYTES)) {
		return json({ ok: false, error: 'upload_too_large' }, { status: 400 });
	}
	let pageCount: number | null = null;
	if (mime === 'application/pdf') {
		try {
			pageCount = await pdfPageCount(bytes);
		} catch {
			return json({ ok: false, error: 'upload_type' }, { status: 400 });
		}
	}
	const id = await storeDocument(locals.db, r2 as never, {
		orgId: org.id, userId: locals.user!.id, threadId: null, name: file.name, mime, bytes, pageCount
	});
	return json({ ok: true, id, name: file.name });
};
