import { describe, it, expect } from 'vitest';
import { closureEmail, groupByClient } from './org-closure-email';

describe('groupByClient', () => {
	it('sends one email per person, whatever the address case', () => {
		const out = groupByClient([
			{ email: 'Jana@example.com', first_name: 'Jana', title: 'Svadba', event_date: '2027-05-01', hall_name: 'Sála A' },
			{ email: 'jana@example.com', first_name: 'Jana', title: 'Krstiny', event_date: '2027-06-01', hall_name: null },
			{ email: 'peter@example.com', first_name: 'Peter', title: 'Oslava', event_date: '2027-07-01', hall_name: 'Sála B' },
		]);
		expect(out).toHaveLength(2);
		expect(out[0].bookings.map((b) => b.title)).toEqual(['Svadba', 'Krstiny']);
	});

	it('skips rows without an address', () => {
		expect(groupByClient([{ email: null, first_name: 'X', title: 'T', event_date: '2027-01-01', hall_name: null }])).toEqual([]);
	});
});

describe('closureEmail', () => {
	it('names the venue and lists each booking in both languages', () => {
		const { subject, html } = closureEmail('Kaštieľ Mošovce', {
			email: 'a@b.sk', first_name: 'Jana',
			bookings: [{ title: 'Svadba', event_date: '2027-05-01', hall_name: 'Veľká sála' }],
		});
		expect(subject).toContain('Kaštieľ Mošovce');
		expect(html).toContain('Svadba');
		expect(html).toContain('Veľká sála');
		expect(html.match(/<li/g)).toHaveLength(2); // sk + en list
	});

	it('escapes text that clients and venues typed', () => {
		const { html } = closureEmail('<b>Evil</b>', {
			email: 'a@b.sk', first_name: '<a href="x">Klik</a>',
			bookings: [{ title: '<img src=x>', event_date: '2027-05-01', hall_name: null }],
		});
		expect(html).not.toContain('<img');
		expect(html).not.toContain('<a href');
		expect(html).not.toContain('<b>Evil');
		expect(html).toContain('&lt;img src=x&gt;');
	});
});
