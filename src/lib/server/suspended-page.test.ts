import { describe, expect, it } from 'vitest';
import { suspendedPageHtml, suspendedResponse } from './suspended-page';
import { OPERATOR } from '$lib/legal';

describe('suspended page', () => {
	it('tells visitors the venue is unavailable, in Slovak by default, and escapes the name', () => {
		const html = suspendedPageHtml('venue', 'Kaštieľ <b>X</b>', 'sk', 'https://hallify.sk');
		expect(html).toContain('<html lang="sk">');
		expect(html).toContain('Stránka prevádzky Kaštieľ &lt;b&gt;X&lt;/b&gt; je dočasne nedostupná');
		expect(html).toContain('href="https://hallify.sk/priestory"');
		expect(html).not.toContain('<script');
	});

	it('tells the owner their organisation is suspended, with a contact and sign-out', () => {
		const html = suspendedPageHtml('console', 'Kaštieľ', 'en', 'https://hallify.sk');
		expect(html).toContain('Kaštieľ is suspended');
		expect(html).toContain(`mailto:${OPERATOR.contactEmail}`);
		expect(html).toContain('action="/app/logout"');
	});

	it('answers 503 to visitors and 403 in the console', () => {
		expect(suspendedResponse('venue', 'A', 'sk', 'https://hallify.sk').status).toBe(503);
		expect(suspendedResponse('console', 'A', 'sk', 'https://hallify.sk').status).toBe(403);
	});
});
