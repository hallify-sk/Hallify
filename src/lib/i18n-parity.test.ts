import { describe, expect, it } from 'vitest';
import { sk, en } from './i18n';

/**
 * The Slovak and English dictionaries must hold exactly the same keys.
 *
 * `st()` is typed as `typeof sk`, so a key present only in Slovak compiles fine and
 * then renders `undefined` to an English-speaking user — and one present only in
 * English is a type error in a place far from the mistake. Neither shows up in
 * svelte-check, because both dictionaries are valid objects on their own.
 *
 * This file is also the cheapest guard against the failure that has actually
 * happened repeatedly here: adding a block to the first `foo: {` the editor finds
 * and landing both copies in the Slovak half.
 */
function keyPaths(value: unknown, prefix = ''): string[] {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return [prefix];
	const out: string[] = [];
	for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
		const path = prefix ? `${prefix}.${k}` : k;
		// A function entry is a leaf: its parameters are not part of the key shape.
		if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...keyPaths(v, path));
		else out.push(path);
	}
	return out.sort();
}

describe('i18n dictionaries', () => {
	it('hold identical key sets in both locales', () => {
		const skKeys = keyPaths(sk);
		const enKeys = keyPaths(en);

		const missingInEn = skKeys.filter((k) => !enKeys.includes(k));
		const missingInSk = enKeys.filter((k) => !skKeys.includes(k));

		expect({ missingInEn, missingInSk }).toEqual({ missingInEn: [], missingInSk: [] });
	});

	it('agree on which entries are functions', () => {
		// A key that takes a count in one locale and is a plain string in the other
		// renders "[object Object]" or throws, depending on which side calls it.
		const shapes = (dict: unknown, prefix = ''): Record<string, string> => {
			const out: Record<string, string> = {};
			for (const [k, v] of Object.entries(dict as Record<string, unknown>)) {
				const path = prefix ? `${prefix}.${k}` : k;
				if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, shapes(v, path));
				else out[path] = typeof v;
			}
			return out;
		};
		const a = shapes(sk);
		const b = shapes(en);
		const mismatched = Object.keys(a).filter((k) => k in b && a[k] !== b[k]);
		expect(mismatched).toEqual([]);
	});
});
