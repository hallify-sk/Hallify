/**
 * Assistant replies to HTML.
 *
 * The model writes Markdown. Everything is escaped FIRST, and only then are the
 * pieces it actually uses turned back on — headings, bold, inline code, links,
 * bullet and numbered lists, and pipe tables — so nothing it writes (or anything
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

	const lines = esc.split('\n');
	const out: string[] = [];
	let list: 'ul' | 'ol' | null = null;
	const closeList = () => {
		if (list) out.push(`</${list}>`);
		list = null;
	};

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		// A pipe table: a row of cells, then a separator row of dashes.
		if (line.includes('|') && i + 1 < lines.length && TABLE_RULE.test(lines[i + 1])) {
			closeList();
			const head = cells(line);
			const rows: string[][] = [];
			i += 2;
			while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]));
			i--;
			const width = head.length;
			const row = (r: string[], tag: 'th' | 'td') =>
				`<tr>${Array.from({ length: width }, (_, k) => `<${tag}>${inline(r[k] ?? '')}</${tag}>`).join('')}</tr>`;
			out.push(`<div class="reply-table"><table><thead>${row(head, 'th')}</thead><tbody>${rows.map((r) => row(r, 'td')).join('')}</tbody></table></div>`);
			continue;
		}

		const heading = /^\s*#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
		if (heading) {
			closeList();
			out.push(`<p class="reply-heading"><strong>${inline(heading[1])}</strong></p>`);
			continue;
		}

		const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
		const numbered = bullet ? null : /^\s*\d{1,3}[.)]\s+(.*)$/.exec(line);
		if (bullet || numbered) {
			const kind = bullet ? 'ul' : 'ol';
			if (list !== kind) {
				closeList();
				out.push(`<${kind}>`);
				list = kind;
			}
			out.push(`<li>${inline((bullet ?? numbered)![1])}</li>`);
			continue;
		}

		if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
			closeList();
			out.push('<hr />');
			continue;
		}

		// A blank line inside a list does not end it: models often space their items out.
		if (list && !line.trim() && nextIsItem(lines, i)) continue;
		closeList();
		out.push(line.trim() ? `<p>${inline(line)}</p>` : '');
	}
	closeList();
	return out.join('');
}

const TABLE_RULE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function cells(line: string): string[] {
	return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

function nextIsItem(lines: string[], i: number): boolean {
	for (let k = i + 1; k < lines.length; k++) {
		if (!lines[k].trim()) continue;
		return /^\s*([-*•]|\d{1,3}[.)])\s+/.test(lines[k]);
	}
	return false;
}

/** An error code from the assistant's endpoints, as a sentence. */
export function errorKey<T extends Record<string, string>>(errors: T, code: unknown): string {
	return typeof code === 'string' && code in errors ? errors[code as keyof T] : (errors as Record<string, string>).generic;
}
