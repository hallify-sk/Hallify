// Client helpers for the reservation hold (anti-race) API.
/** `message` is the server's own explanation, in the viewer's language, when it has one. */
export async function postHold(hallId: string, date: string): Promise<{ ok: boolean; reason?: string; ttl?: number; message?: string }> {
	try {
		const res = await fetch('/api/holds', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ hallId, date }),
		});
		const body = await res.json().catch(() => ({}));
		return { ok: !!body.ok && res.ok, reason: body.reason, ttl: body.ttl, message: typeof body.message === 'string' ? body.message : undefined };
	} catch {
		return { ok: false, reason: 'network' };
	}
}

/** Best-effort release on unload / navigation (sendBeacon survives page close). */
export function releaseHoldBeacon(hallId: string, date: string): void {
	try {
		const blob = new Blob([JSON.stringify({ hallId, date, action: 'release' })], { type: 'application/json' });
		if (!navigator.sendBeacon?.('/api/holds', blob)) {
			fetch('/api/holds', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hallId, date, action: 'release' }), keepalive: true }).catch(() => {});
		}
	} catch { /* best effort */ }
}
