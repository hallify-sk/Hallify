/** The parameters of an OAuth request: form-encoded as the RFCs say, or JSON, which
 *  some clients send. Only string values are kept. Null when the body is unreadable. */
export async function readOAuthParams(request: Request): Promise<Record<string, string> | null> {
	const type = (request.headers.get('content-type') ?? '').split(';', 1)[0].trim().toLowerCase();
	try {
		if (type === 'application/json') {
			const body = (await request.json()) as unknown;
			if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
			return Object.fromEntries(Object.entries(body).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
		}
		const text = await request.text();
		if (text.length > 20_000) return null;
		return Object.fromEntries(new URLSearchParams(text));
	} catch {
		return null;
	}
}
