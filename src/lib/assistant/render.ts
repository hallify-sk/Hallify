/**
 * Assistant replies to HTML.
 *
 * The model writes Markdown. Everything is escaped FIRST, and only then are bold,
 * inline code and bullet lists turned back on — so nothing it writes (or anything
 * it quotes from an uploaded file) can become markup on the page.
 */
export function renderReply(s: string): string {
	const esc = s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
	// Links arrive with web search citations: [label](https://…). The text is already
	// escaped, so the URL cannot carry a quote out of the attribute; only http(s) is
	// linked, so a javascript: URL stays plain text.
	const inline = (l: string) => l
		.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
		.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
		.replace(/`([^`]+)`/g, '<code>$1</code>');
	const out: string[] = [];
	let list = false;
	for (const line of esc.split('\n')) {
		const item = /^\s*[-*•]\s+(.*)$/.exec(line);
		if (item) {
			if (!list) { out.push('<ul>'); list = true; }
			out.push(`<li>${inline(item[1])}</li>`);
			continue;
		}
		if (list) { out.push('</ul>'); list = false; }
		out.push(line.trim() ? `<p>${inline(line)}</p>` : '');
	}
	if (list) out.push('</ul>');
	return out.join('');
}

/** An error code from the assistant's endpoints, as a sentence. */
export function errorKey<T extends Record<string, string>>(errors: T, code: unknown): string {
	return typeof code === 'string' && code in errors ? errors[code as keyof T] : (errors as Record<string, string>).generic;
}
