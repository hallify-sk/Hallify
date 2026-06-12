import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$env/static/private', () => ({
	R2_ACCOUNT_ID: 'real_account_id',
	R2_ENDPOINT: 'https://real_account_id.eu.r2.cloudflarestorage.com',
	R2_ACCESS_KEY_ID: 'real_access_key',
	R2_SECRET_ACCESS_KEY: 'real_secret',
	R2_BUCKET_NAME: 'hallify',
	R2_PUBLIC_URL: 'https://pub-test.r2.dev',
}));

const mockSend = vi.fn();

vi.mock('@aws-sdk/client-s3', () => ({
	S3Client: vi.fn(function () {
		(this as { send: typeof mockSend }).send = mockSend;
	}),
	PutObjectCommand: vi.fn(function (params: unknown) {
		Object.assign(this as object, params);
	}),
}));

// Helper to build a fake Request with a multipart form file
function makeRequest(overrides: {
	type?: string;
	size?: number;
	userId?: string | null;
} = {}) {
	const { type = 'image/jpeg', size = 1024, userId = 'user_1' } = overrides;

	const file = new File([new Uint8Array(size).fill(0)], 'photo.jpg', { type });
	const formData = new FormData();
	formData.append('file', file);

	const request = new Request('http://localhost/api/upload/image', {
		method: 'POST',
		body: formData,
	});

	const locals = { user: userId ? { id: userId } : null } as App.Locals;
	return { request, locals };
}

const { POST } = await import('../routes/api/upload/image/+server.js');
const { PutObjectCommand } = await import('@aws-sdk/client-s3');

describe('R2 upload – authentication', () => {
	it('returns 401 when user is not logged in', async () => {
		const { request, locals } = makeRequest({ userId: null });
		await expect(POST({ request, locals } as never)).rejects.toMatchObject({ status: 401 });
	});
});

describe('R2 upload – file validation', () => {
	beforeEach(() => {
		mockSend.mockReset();
		mockSend.mockResolvedValue({});
	});

	it('rejects unsupported file types', async () => {
		const { request, locals } = makeRequest({ type: 'application/pdf' });
		await expect(POST({ request, locals } as never)).rejects.toMatchObject({ status: 400 });
	});

	it('accepts JPEG files', async () => {
		const { request, locals } = makeRequest({ type: 'image/jpeg', size: 100 });
		const res = await POST({ request, locals } as never);
		expect(res.status).toBe(200);
	});

	it('accepts PNG files', async () => {
		const { request, locals } = makeRequest({ type: 'image/png', size: 100 });
		const res = await POST({ request, locals } as never);
		expect(res.status).toBe(200);
	});

	it('accepts WebP files', async () => {
		const { request, locals } = makeRequest({ type: 'image/webp', size: 100 });
		const res = await POST({ request, locals } as never);
		expect(res.status).toBe(200);
	});

	it('accepts GIF files', async () => {
		const { request, locals } = makeRequest({ type: 'image/gif', size: 100 });
		const res = await POST({ request, locals } as never);
		expect(res.status).toBe(200);
	});

	it('rejects files over 8 MB', async () => {
		const { request, locals } = makeRequest({ size: 9 * 1024 * 1024 });
		await expect(POST({ request, locals } as never)).rejects.toMatchObject({ status: 400 });
	});

	it('accepts files exactly at the 8 MB limit', async () => {
		const { request, locals } = makeRequest({ size: 8 * 1024 * 1024 });
		const res = await POST({ request, locals } as never);
		expect(res.status).toBe(200);
	});

	it('returns 400 when no file field is included', async () => {
		const formData = new FormData();
		const request = new Request('http://localhost/api/upload/image', {
			method: 'POST',
			body: formData,
		});
		const locals = { user: { id: 'user_1' } } as App.Locals;
		await expect(POST({ request, locals } as never)).rejects.toMatchObject({ status: 400 });
	});
});

describe('R2 upload – successful upload', () => {
	beforeEach(() => {
		mockSend.mockReset();
		mockSend.mockResolvedValue({});
		vi.mocked(PutObjectCommand).mockClear();
	});

	it('passes the correct bucket name to S3', async () => {
		const { request, locals } = makeRequest({ type: 'image/jpeg', size: 512 });
		await POST({ request, locals } as never);
		expect(PutObjectCommand).toHaveBeenCalledWith(expect.objectContaining({ Bucket: 'hallify' }));
	});

	it('returns a public URL under R2_PUBLIC_URL', async () => {
		const { request, locals } = makeRequest({ type: 'image/jpeg', size: 512 });
		const res = await POST({ request, locals } as never);
		const body = await res.json();
		expect(body.url).toMatch(/^https:\/\/pub-test\.r2\.dev\/halls\/user_1\//);
	});

	it('generates a unique object key per upload', async () => {
		const r1 = makeRequest({ type: 'image/jpeg', size: 100 });
		const r2 = makeRequest({ type: 'image/jpeg', size: 100 });
		await POST({ request: r1.request, locals: r1.locals } as never);
		await POST({ request: r2.request, locals: r2.locals } as never);
		const key1 = vi.mocked(PutObjectCommand).mock.calls[0][0].Key;
		const key2 = vi.mocked(PutObjectCommand).mock.calls[1][0].Key;
		expect(key1).not.toBe(key2);
	});

	it('sets ContentType matching the uploaded file', async () => {
		const { request, locals } = makeRequest({ type: 'image/webp', size: 256 });
		await POST({ request, locals } as never);
		expect(PutObjectCommand).toHaveBeenCalledWith(
			expect.objectContaining({ ContentType: 'image/webp' })
		);
	});

	it('sets long-lived cache control header', async () => {
		const { request, locals } = makeRequest({ type: 'image/png', size: 256 });
		await POST({ request, locals } as never);
		expect(PutObjectCommand).toHaveBeenCalledWith(
			expect.objectContaining({ CacheControl: 'public, max-age=31536000' })
		);
	});

	it('returns 502 with message when S3 send throws', async () => {
		mockSend.mockRejectedValueOnce(new Error('Network error'));
		const { request, locals } = makeRequest({ type: 'image/jpeg', size: 100 });
		await expect(POST({ request, locals } as never)).rejects.toMatchObject({ status: 502 });
	});
});
