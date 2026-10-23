// Team chat channels: names and @mentions.

import { slugify } from '$lib/slug';

/** Longest channel name (the slug shown after '#'). */
export const CHANNEL_NAME_MAX = 40;
/** Longest description. */
export const CHANNEL_DESC_MAX = 200;

/**
 * The name a channel is stored under: Slovak letters transliterated, spaces to
 * hyphens ('Všeobecné Novinky' → 'vseobecne-novinky'). The old rule dropped every
 * letter with a diacritic ('veobecn-novinky') and turned '!!! ###' into '-'.
 * Returns '' when nothing usable is left.
 */
export function channelName(raw: string): string {
	return slugify(raw, CHANNEL_NAME_MAX);
}

export type ChannelNameProblem = 'empty' | 'too_long' | null;

/** Checks the typed name before it is turned into a slug. */
export function channelNameProblem(raw: string): ChannelNameProblem {
	const trimmed = raw.trim();
	if (trimmed.length > CHANNEL_NAME_MAX * 2) return 'too_long';
	if (!channelName(trimmed)) return 'empty';
	return null;
}

export type Segment = { text: string; mention: boolean };

/**
 * Split a message into plain text and @mentions of known members, so the page can
 * highlight them. A mention is '@' followed by a member's full name or first name
 * (case-insensitive), at the start or after whitespace. Longest names win.
 */
export function splitMentions(body: string, names: string[]): Segment[] {
	const sorted = [...new Set(names.map((n) => n.trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
	if (!sorted.length || !body.includes('@')) return [{ text: body, mention: false }];
	const out: Segment[] = [];
	let plain = '';
	let i = 0;
	while (i < body.length) {
		if (body[i] === '@' && (i === 0 || /\s/.test(body[i - 1]))) {
			const rest = body.slice(i + 1).toLocaleLowerCase();
			const hit = sorted.find((n) => {
				if (!rest.startsWith(n.toLocaleLowerCase())) return false;
				const after = rest.charAt(n.length);
				return after === '' || !/[\p{L}\p{N}]/u.test(after);
			});
			if (hit) {
				if (plain) out.push({ text: plain, mention: false });
				plain = '';
				out.push({ text: body.slice(i, i + 1 + hit.length), mention: true });
				i += 1 + hit.length;
				continue;
			}
		}
		plain += body[i];
		i++;
	}
	if (plain) out.push({ text: plain, mention: false });
	return out;
}
