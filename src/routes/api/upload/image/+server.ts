import { json, error } from '@sveltejs/kit';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import {
	R2_ACCOUNT_ID,
	R2_ENDPOINT,
	R2_ACCESS_KEY_ID,
	R2_SECRET_ACCESS_KEY,
	R2_BUCKET_NAME,
	R2_PUBLIC_URL
} from '$env/static/private';
import type { RequestHandler } from './$types';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SIZE = 8 * 1024 * 1024; // 8 MB

function getClient() {
	if (!R2_ACCOUNT_ID || R2_ACCOUNT_ID === 'your_account_id') {
		return null;
	}
	return new S3Client({
		region: 'auto',
		endpoint: R2_ENDPOINT || `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
		credentials: {
			accessKeyId: R2_ACCESS_KEY_ID,
			secretAccessKey: R2_SECRET_ACCESS_KEY,
		},
	});
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');

	const client = getClient();
	if (!client) {
		error(503, 'Image upload is not configured. Set R2 credentials in your .env file.');
	}

	const formData = await request.formData();
	const file = formData.get('file');

	if (!(file instanceof File)) error(400, 'No file provided.');
	if (!ALLOWED_TYPES.includes(file.type)) error(400, 'Only JPEG, PNG, WebP, and GIF images are allowed.');
	if (file.size > MAX_SIZE) error(400, 'File exceeds 8 MB limit.');

	const ext = file.type.split('/')[1].replace('jpeg', 'jpg');
	const key = `halls/${locals.user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

	const buffer = Buffer.from(await file.arrayBuffer());

	try {
		await client.send(new PutObjectCommand({
			Bucket: R2_BUCKET_NAME,
			Key: key,
			Body: buffer,
			ContentType: file.type,
			CacheControl: 'public, max-age=31536000',
		}));
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		error(502, `Storage error: ${msg}`);
	}

	const url = `${R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`;
	return json({ url });
};
