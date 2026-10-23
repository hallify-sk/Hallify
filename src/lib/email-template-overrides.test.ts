import { describe, it, expect } from 'vitest';
import { templateOverrides, previewTemplate } from './email-template-overrides';

const defaults = { a: '<p>A {{title}}</p>', b: '<p>B</p>' };

describe('templateOverrides', () => {
	it('keeps only templates that differ from the default', () => {
		expect(templateOverrides({ a: '<p>A {{title}}</p>', b: '<p>Changed</p>' }, defaults)).toEqual({ b: '<p>Changed</p>' });
	});

	it('treats an emptied template as "use the default"', () => {
		expect(templateOverrides({ a: '   ', b: '' }, defaults)).toEqual({});
	});

	it('drops keys it does not know', () => {
		expect(templateOverrides({ evil: 'x' }, defaults)).toEqual({});
	});
});

describe('previewTemplate', () => {
	it('fills sample values, escaped', () => {
		const out = previewTemplate('<b>{{title}}</b> {{unknown}}');
		expect(out).toContain('<b>Svadba Novákovci</b>');
		expect(out).toContain('{{unknown}}');
	});
});
