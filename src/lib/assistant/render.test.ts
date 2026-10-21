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
});
