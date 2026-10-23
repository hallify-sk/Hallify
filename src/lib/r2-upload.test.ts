import { describe, it, expect, vi, beforeEach } from 'vitest';

// The endpoint writes through the Cloudflare R2 binding (platform.env.R2) and
// returns a same-origin /uploads/<key> URL served by /uploads/[...key].

interface PutCall {
	key: string;
	value: unknown;
	options?: { httpMetadata?: { contentType?: string } };
}

function makeR2() {
	const calls: PutCall[] = [];
	return {
		calls,
		put: vi.fn(async (key: string, value: unknown, options?: PutCall['options']) => {
			calls.push({ key, value, options });
			return {};
		}),
	};
}

const SIGNATURES: Record<string, number[]> = {
	'image/jpeg': [0xff, 0xd8, 0xff, 0xe0],
	'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
	'image/gif': [0x47, 0x49, 0x46, 0x38, 0x39, 0x61],
	'image/webp': [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50],
};

function makeEvent(overrides: {
	type?: string;
	size?: number;
	userId?: string | null;
	withR2?: boolean;
	noFile?: boolean;
	r2?: ReturnType<typeof makeR2>;
} = {}) {
	const {
		type = 'image/jpeg',
		size = 1024,
		userId = 'user_1',
		withR2 = true,
		noFile = false,
		r2 = makeR2(),
	} = overrides;

	const formData = new FormData();
	if (!noFile) {
		// Real signatures: the endpoint checks the bytes, not just the declared type.
		const bytes = new Uint8Array(size).fill(0);
		bytes.set(SIGNATURES[type] ?? [], 0);
		const file = new File([bytes], 'photo.jpg', { type });
		formData.append('file', file);
	}

	const request = new Request('http://localhost/api/upload/image', { method: 'POST', body: formData });
	const locals = { user: userId ? { id: userId } : null } as App.Locals;
	const platform = { env: withR2 ? { R2: r2 } : {} } as unknown as App.Platform;
	return { request, locals, platform, r2 };
}

const { POST } = await import('../routes/api/upload/image/+server.js');

describe('R2 upload – authentication', () => {
	it('returns 401 when user is not logged in', async () => {
		const ev = makeEvent({ userId: null });
		await expect(POST(ev as never)).rejects.toMatchObject({ status: 401 });
	});
});

describe('R2 upload – configuration', () => {
	it('returns 503 when the R2 binding is missing', async () => {
		const ev = makeEvent({ withR2: false });
		await expect(POST(ev as never)).rejects.toMatchObject({ status: 503 });
	});
});

describe('R2 upload – file validation', () => {
	it('rejects unsupported file types', async () => {
		const ev = makeEvent({ type: 'application/pdf' });
		await expect(POST(ev as never)).rejects.toMatchObject({ status: 400 });
	});

	it('accepts JPEG, PNG, WebP and GIF', async () => {
		for (const type of ['image/jpeg', 'image/png', 'image/webp', 'image/gif']) {
			const ev = makeEvent({ type, size: 100 });
			const res = await POST(ev as never);
			expect(res.status).toBe(200);
		}
	});

	// B151: anything declared as an image used to be stored as one.
	it('rejects bytes that are not an image, whatever the declared type', async () => {
		const formData = new FormData();
		formData.append('file', new File(['<!doctype html><script>alert(1)</script>'], 'x.png', { type: 'image/png' }));
		const ev = { ...makeEvent(), request: new Request('http://localhost/api/upload/image', { method: 'POST', body: formData }) };
		await expect(POST(ev as never)).rejects.toMatchObject({ status: 400 });
		expect(ev.r2.calls).toHaveLength(0);
	});

	it('stores the type the bytes show, not the declared one', async () => {
		const r2 = makeR2();
		const formData = new FormData();
		const png = new Uint8Array(64);
		png.set(SIGNATURES['image/png']);
		formData.append('file', new File([png], 'x.jpg', { type: 'image/jpeg' }));
		const ev = { ...makeEvent({ r2 }), request: new Request('http://localhost/api/upload/image', { method: 'POST', body: formData }) };
		await POST(ev as never);
		expect(r2.calls[0].options?.httpMetadata?.contentType).toBe('image/png');
		expect(r2.calls[0].key).toMatch(/\.png$/);
	});

	it('rejects files over 8 MB', async () => {
		const ev = makeEvent({ size: 9 * 1024 * 1024 });
		await expect(POST(ev as never)).rejects.toMatchObject({ status: 400 });
	});

	it('accepts files exactly at the 8 MB limit', async () => {
		const ev = makeEvent({ size: 8 * 1024 * 1024 });
		const res = await POST(ev as never);
		expect(res.status).toBe(200);
	});

	it('returns 400 when no file field is included', async () => {
		const ev = makeEvent({ noFile: true });
		await expect(POST(ev as never)).rejects.toMatchObject({ status: 400 });
	});
});

describe('R2 upload – successful upload', () => {
	let r2: ReturnType<typeof makeR2>;
	beforeEach(() => { r2 = makeR2(); });

	it('stores the object under a halls/<userId>/ key', async () => {
		const ev = makeEvent({ type: 'image/jpeg', size: 512, r2 });
		await POST(ev as never);
		expect(r2.calls[0].key).toMatch(/^halls\/user_1\/.*\.jpg$/);
	});

	it('returns a same-origin /uploads/ URL pointing at the stored key', async () => {
		const ev = makeEvent({ type: 'image/jpeg', size: 512, r2 });
		const res = await POST(ev as never);
		const body = await res.json();
		expect(body.url).toBe(`/uploads/${r2.calls[0].key}`);
		expect(body.url).toMatch(/^\/uploads\/halls\/user_1\//);
	});

	it('passes the content type through to R2', async () => {
		const ev = makeEvent({ type: 'image/webp', size: 256, r2 });
		await POST(ev as never);
		expect(r2.calls[0].options?.httpMetadata?.contentType).toBe('image/webp');
	});

	it('generates a unique object key per upload', async () => {
		await POST(makeEvent({ type: 'image/jpeg', size: 100, r2 }) as never);
		await POST(makeEvent({ type: 'image/jpeg', size: 100, r2 }) as never);
		expect(r2.calls[0].key).not.toBe(r2.calls[1].key);
	});

	it('returns 502 when the R2 put throws', async () => {
		const failing = makeR2();
		failing.put.mockRejectedValueOnce(new Error('Network error'));
		const ev = makeEvent({ type: 'image/jpeg', size: 100, r2: failing });
		await expect(POST(ev as never)).rejects.toMatchObject({ status: 502 });
	});
});
