import { describe, expect, it } from 'vitest';
import {
	DEFAULT_SECTIONS,
	SECTION_DEFINITIONS,
	resolveSections,
	visibleSections,
	type SiteSection
} from './site-sections';

const ctx = (over: Partial<Parameters<typeof visibleSections>[1]> = {}) => ({
	hallCount: 3,
	hasContact: true,
	hasIntro: true,
	...over
});

describe('resolving a stored section list', () => {
	it('falls back to the default page when nothing is stored', () => {
		expect(resolveSections(null).map((s) => s.type)).toEqual(DEFAULT_SECTIONS.map((s) => s.type));
		expect(resolveSections([]).map((s) => s.type)).toEqual(DEFAULT_SECTIONS.map((s) => s.type));
	});

	it('leads with the featured venue by default, and not with search', () => {
		// Search above the venues is what made every site read as a directory.
		const order = DEFAULT_SECTIONS.filter((s) => s.enabled).map((s) => s.type);
		expect(order[0]).toBe('featured');
		expect(order[1]).toBe('hall-list');
		expect(order).not.toContain('search');
	});

	it('keeps the stored order', () => {
		const stored: SiteSection[] = [
			{ type: 'about', enabled: true },
			{ type: 'featured', enabled: true }
		];
		expect(resolveSections(stored).slice(0, 2).map((s) => s.type)).toEqual(['about', 'featured']);
	});

	it('drops a type this build no longer knows', () => {
		// A section removed in a later release must not keep rendering from an old row.
		const stored = [{ type: 'carousel', enabled: true }, { type: 'about', enabled: true }];
		expect(resolveSections(stored).map((s) => s.type)).not.toContain('carousel');
	});

	it('collapses duplicates', () => {
		const stored = [
			{ type: 'about', enabled: true },
			{ type: 'about', enabled: false }
		];
		expect(resolveSections(stored).filter((s) => s.type === 'about')).toHaveLength(1);
	});

	it('appends a newly added section type as disabled', () => {
		// Shipping a new section must not switch it on for every existing site.
		const stored = [{ type: 'featured', enabled: true }];
		const resolved = resolveSections(stored);
		expect(resolved).toHaveLength(SECTION_DEFINITIONS.length);
		for (const s of resolved.slice(1)) expect(s.enabled).toBe(false);
	});

	it('survives malformed input', () => {
		expect(resolveSections('nonsense').length).toBeGreaterThan(0);
		expect(resolveSections([null, 7, { nope: true }]).length).toBeGreaterThan(0);
	});
});

describe('deciding what to render', () => {
	it('renders only enabled sections, in order', () => {
		const sections: SiteSection[] = [
			{ type: 'featured', enabled: true },
			{ type: 'search', enabled: false },
			{ type: 'about', enabled: true }
		];
		expect(visibleSections(sections, ctx())).toEqual(['featured', 'about']);
	});

	it('hides venue sections when the org has no public halls', () => {
		// A heading over a blank space is worse than no section at all.
		const sections: SiteSection[] = [
			{ type: 'featured', enabled: true },
			{ type: 'hall-list', enabled: true },
			{ type: 'about', enabled: true }
		];
		expect(visibleSections(sections, ctx({ hallCount: 0 }))).toEqual(['about']);
	});

	it('hides About with no intro written, and Contact with no details', () => {
		const sections: SiteSection[] = [
			{ type: 'about', enabled: true },
			{ type: 'contact', enabled: true }
		];
		expect(visibleSections(sections, ctx({ hasIntro: false, hasContact: false }))).toEqual([]);
	});

	it('keeps the call to action, which needs no data of its own', () => {
		const sections: SiteSection[] = [{ type: 'cta', enabled: true }];
		expect(visibleSections(sections, ctx({ hallCount: 0, hasContact: false, hasIntro: false })))
			.toEqual(['cta']);
	});
});
