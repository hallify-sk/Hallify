import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { writeFile, mkdir } from 'fs/promises';
import { randomUUID } from 'crypto';
import path from 'path';

const UPLOAD_DIR = 'static/uploads';
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = [
	'image/jpeg', 'image/png', 'image/gif', 'image/webp',
	'application/pdf',
	'application/msword',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'application/vnd.ms-excel',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	'text/plain'
];

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');

	const formData = await request.formData();
	const file = formData.get('file') as File | null;
	if (!file || !(file instanceof File)) error(400, 'No file provided');
	if (file.size > MAX_SIZE) error(400, 'File too large (max 10 MB)');
	if (!ALLOWED_TYPES.includes(file.type)) error(400, 'File type not allowed');

	await mkdir(UPLOAD_DIR, { recursive: true });

	const ext = path.extname(file.name) || '';
	const safeName = `${randomUUID()}${ext}`;
	const filePath = path.join(UPLOAD_DIR, safeName);

	const buffer = Buffer.from(await file.arrayBuffer());
	await writeFile(filePath, buffer);

	return json({
		url: `/uploads/${safeName}`,
		name: file.name,
		type: file.type
	});
};
