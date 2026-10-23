import { describe, expect, it } from 'vitest';
import { PLANS } from './plans';
import { sk, en } from './i18n';
import { planFeatureList } from './plan-features';
import { isEntitled, resolveStripePlan, toStatus } from './billing';

describe('planFeatureList', () => {
	it('speaks Slovak on the Slovak page, with the right noun forms', () => {
		const free = planFeatureList(PLANS.free, sk.accountPages.planFeatures);
		expect(free).toContain('1 priestor');
		expect(free).toContain('2 členovia tímu');
		expect(free).toContain('5 rezervácií na priestor mesačne');
		expect(free).toContain('Bezplatná subdoména');
		expect(planFeatureList(PLANS.starter, sk.accountPages.planFeatures)).toContain('3 priestory');
		expect(planFeatureList(PLANS.enterprise, sk.accountPages.planFeatures)).toContain('Neobmedzený počet priestorov');
	});

	it('follows the limits the app enforces, in English too', () => {
		const pro = planFeatureList(PLANS.professional, en.accountPages.planFeatures);
		expect(pro).toContain('10 venues');
		expect(pro).toContain('Unlimited team members');
		expect(pro).toContain(`${PLANS.professional.limits.maxExtrasPerHall} bookable extras per venue`);
		expect(pro).toContain('Priority support');
		expect(pro).not.toContain('SLA');
	});

	it('sells no RSVP on any plan while RSVP is switched off (B41)', () => {
		for (const plan of Object.values(PLANS)) {
			for (const list of [plan.features, planFeatureList(plan, sk.accountPages.planFeatures), planFeatureList(plan, en.accountPages.planFeatures)]) {
				expect(list.join(' ')).not.toMatch(/rsvp/i);
			}
		}
	});
});

describe('billing status helpers', () => {
	it('never maps an unknown Stripe status to active', () => {
		expect(toStatus('unpaid')).toBe('paused');
		expect(toStatus(undefined)).toBe('paused');
		expect(isEntitled(toStatus('unpaid'))).toBe(false);
		expect(isEntitled(toStatus('past_due'))).toBe(true);
	});

	it('resolves the plan from price, then metadata, then what we knew', () => {
		expect(resolveStripePlan(2999, 'professional', null)).toBe('starter');
		expect(resolveStripePlan(4999, 'professional', null)).toBe('professional');
		expect(resolveStripePlan(4999, 'gold', 'starter')).toBe('starter');
		expect(resolveStripePlan(4999, undefined, 'free')).toBeNull();
	});
});

describe('the €1 test payment', () => {
	it('activates Starter from its metadata, since €1 matches no plan price', () => {
		expect(resolveStripePlan(100, 'starter', null)).toBe('starter');
	});
});
