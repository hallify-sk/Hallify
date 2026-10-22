import { describe, expect, it } from 'vitest';
import { AI_CREDIT_PACKS, CENTS_PER_CREDIT, CREDITS_PER_EUR, creditsForCents } from './ai-credits';
import { PLANS } from './plans';

describe('AI credit rate', () => {
	it('is 10 credits to the euro', () => {
		expect(CREDITS_PER_EUR).toBe(10);
		expect(CENTS_PER_CREDIT).toBe(10);
	});
	it('sells packs at €5, €10 and €25', () => {
		expect(AI_CREDIT_PACKS.map((c) => c * CENTS_PER_CREDIT)).toEqual([500, 1000, 2500]);
	});
	it('credits what was paid, whatever pack the checkout named', () => {
		expect(creditsForCents(500)).toBe(50);
		expect(creditsForCents(2500)).toBe(250);
		expect(creditsForCents(0)).toBe(0);
	});
	it('keeps the plan allowances at the same euro value as before (€0.20 / €2 / €6)', () => {
		const eur = (id: string) => PLANS[id as keyof typeof PLANS].limits.aiCreditsMonthly / CREDITS_PER_EUR;
		expect([eur('free'), eur('starter'), eur('professional')]).toEqual([0.2, 2, 6]);
	});
});
