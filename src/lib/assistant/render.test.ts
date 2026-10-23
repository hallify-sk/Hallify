import { describe, expect, it } from 'vitest';
import { renderReply } from './render';

describe('renderReply', () => {
	it('escapes markup before formatting anything', () => {
		expect(renderReply('<img src=x onerror=alert(1)> **bold**')).toBe('<p>&lt;img src=x onerror=alert(1)&gt; <strong>bold</strong></p>');
	});
	it('links http(s) citations and nothing else', () => {
		expect(renderReply('[Reduta](https://www.reduta-snv.sk/o-nas)')).toBe(
			'<p><a href="https://www.reduta-snv.sk/o-nas" target="_blank" rel="noopener noreferrer">Reduta</a></p>');
		expect(renderReply('[x](javascript:alert(1))')).toBe('<p>[x](javascript:alert(1))</p>');
	});
	it('cannot break out of the link attribute', () => {
		expect(renderReply('[x](https://a.sk/"onmouseover="alert(1))')).not.toContain('"onmouseover');
	});
	it('makes bullet lists', () => {
		expect(renderReply('- a\n- b')).toBe('<ul><li>a</li><li>b</li></ul>');
	});
	it('turns headings into bold lines, not literal hashes', () => {
		expect(renderReply('### Sály\nText')).toBe('<p class="reply-heading"><strong>Sály</strong></p><p>Text</p>');
	});
	it('renders pipe tables with escaped, formatted cells', () => {
		const html = renderReply('| Dátum | Udalosť |\n|---|:---:|\n| 12. 11. | **Svadba** <b> |\n| 20. 11. |');
		expect(html).toBe(
			'<div class="reply-table"><table><thead><tr><th>Dátum</th><th>Udalosť</th></tr></thead><tbody>' +
			'<tr><td>12. 11.</td><td><strong>Svadba</strong> &lt;b&gt;</td></tr>' +
			'<tr><td>20. 11.</td><td></td></tr></tbody></table></div>');
	});
	it('leaves a lone pipe in a sentence alone', () => {
		expect(renderReply('a | b')).toBe('<p>a | b</p>');
	});
	it('makes numbered lists, and keeps a list together across blank lines', () => {
		expect(renderReply('1. a\n\n2. b')).toBe('<ol><li>a</li><li>b</li></ol>');
		expect(renderReply('- a\n\nafter')).toBe('<ul><li>a</li></ul><p>after</p>');
	});
});
