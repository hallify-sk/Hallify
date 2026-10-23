/**
 * What this browser tab remembers about the assistant: which conversation the
 * floating widget is in, and whether its panel is open. Per tab (sessionStorage),
 * so two tabs never share a conversation by accident.
 *
 * The full assistant page writes here too: when the assistant opens another page
 * for the member, the conversation carries on in the widget over there.
 */
export const threadKey = (orgId: string) => `hallify:assistant:thread:${orgId}`;
export const OPEN_KEY = 'hallify:assistant:open';

export const tabStore = {
	get(k: string): string | null {
		try { return sessionStorage.getItem(k); } catch { return null; }
	},
	set(k: string, v: string | null) {
		try {
			if (v === null) sessionStorage.removeItem(k);
			else sessionStorage.setItem(k, v);
		} catch { /* private mode */ }
	}
};

/** The page the assistant asked the browser to open (the last one, if it asked
 *  twice): only ever inside the console. */
export function navigationTarget(actions: unknown): string | null {
	if (!Array.isArray(actions)) return null;
	let path: string | null = null;
	for (const a of actions as { type?: unknown; path?: unknown }[]) {
		if (a?.type === 'navigate' && typeof a.path === 'string' && a.path.startsWith('/app/')) path = a.path;
	}
	return path;
}
