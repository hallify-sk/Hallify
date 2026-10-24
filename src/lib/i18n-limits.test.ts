import { describe, expect, it } from 'vitest';
import { sk, en } from './i18n';

// Limit messages agree with their number: "1 aktívnu sálu", not "1 aktívnych sál".
describe('limit messages', () => {
	it('decline the hall count in Slovak', () => {
		expect(sk.serverErrors.hallRestoreLimitReached(1)).toContain('povoľuje 1 aktívnu sálu a toto miesto je obsadené');
		expect(sk.serverErrors.hallReactivateLimitReached(3)).toContain('povoľuje 3 aktívne sály a všetky');
		expect(sk.serverErrors.hallReactivateLimitReached(10)).toContain('povoľuje 10 aktívnych sál a všetky');
		expect(en.serverErrors.hallRestoreLimitReached(1)).toContain("allows 1 active hall and it's in use");
		expect(en.serverErrors.hallRestoreLimitReached(5)).toContain('allows 5 active halls and');
	});

	it('agrees the verb with one skipped photo', () => {
		expect(sk.imageDialog.skippedOverLimit(1)).toBe('1 fotka sa nepridala, pretože by presiahla limit galérie vášho plánu.');
		expect(sk.imageDialog.skippedOverLimit(2)).toContain('fotky sa nepridali, pretože by presiahli');
		expect(sk.imageDialog.skippedOverLimit(7)).toContain('fotiek sa nepridalo, pretože by presiahli');
	});
});
