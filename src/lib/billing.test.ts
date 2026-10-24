import { describe, expect, it } from 'vitest';
import { upgradeRoute } from './billing';

describe('upgradeRoute', () => {
	it('sends a never-subscribed organisation to Checkout', () => {
		expect(upgradeRoute({ plan: 'free', status: 'active', stripeSubscriptionId: null, stripeStatus: null })).toBe('checkout');
	});

	// B89 round-1: a suspended subscription (Free meanwhile, subscription still on
	// file) opened a second Checkout and would have billed twice.
	it('sends a suspended subscription to be settled, never to a new Checkout', () => {
		for (const stripeStatus of ['unpaid', 'incomplete', 'paused', null]) {
			expect(upgradeRoute({ plan: 'free', status: 'paused', stripeSubscriptionId: 'sub_1', stripeStatus })).toBe('settle');
		}
	});

	it('changes a paid-up subscription in place, past_due included', () => {
		expect(upgradeRoute({ plan: 'starter', status: 'active', stripeSubscriptionId: 'sub_1', stripeStatus: 'active' })).toBe('change');
		expect(upgradeRoute({ plan: 'starter', status: 'past_due', stripeSubscriptionId: 'sub_1', stripeStatus: 'past_due' })).toBe('change');
	});

	it('lets an organisation whose subscription ended subscribe again', () => {
		expect(upgradeRoute({ plan: 'free', status: 'cancelled', stripeSubscriptionId: 'sub_1', stripeStatus: 'canceled' })).toBe('checkout');
		expect(upgradeRoute({ plan: 'free', status: 'cancelled', stripeSubscriptionId: 'sub_1', stripeStatus: 'incomplete_expired' })).toBe('checkout');
	});
});
