import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock runtime env before importing the stripe module. The module reads secrets
// from $env/dynamic/private so they come from Worker secrets rather than being
// inlined into the build.
vi.mock('$env/dynamic/private', () => ({
	env: {
		STRIPE_SECRET_KEY: 'sk_test_mock_key',
		STRIPE_WEBHOOK_SECRET: 'whsec_mock_secret',
		APP_URL: 'http://localhost:5173',
	},
}));

// Mock the stripe SDK
const mockSessionCreate = vi.fn();
const mockPortalCreate = vi.fn();

type StripeMock = { checkout: unknown; billingPortal: unknown };

vi.mock('stripe', () => ({
	default: vi.fn(function (this: StripeMock) {
		this.checkout = { sessions: { create: mockSessionCreate } };
		this.billingPortal = { sessions: { create: mockPortalCreate } };
	}),
}));

const { createCheckoutSession, createPortalSession, getWebhookSecret } = await import('./stripe.js');

describe('getWebhookSecret', () => {
	it('reads the signing secret from runtime env', () => {
		expect(getWebhookSecret()).toBe('whsec_mock_secret');
	});
});

describe('createCheckoutSession', () => {
	beforeEach(() => {
		mockSessionCreate.mockReset();
		mockSessionCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/session_123' });
	});

	it('returns the checkout URL', async () => {
		const url = await createCheckoutSession({
			orgId: 'org_1',
			plan: 'starter',
			stripeCustomerId: null,
			userEmail: 'test@example.com',
		});
		expect(url).toBe('https://checkout.stripe.com/session_123');
	});

	// Pricing is inline `price_data` built from plans.ts — there are no pre-created
	// Stripe Price objects and no STRIPE_PRICE_* env vars any more.
	it('prices starter inline from plans.ts', async () => {
		await createCheckoutSession({
			orgId: 'org_1',
			plan: 'starter',
			stripeCustomerId: null,
			userEmail: 'test@example.com',
		});
		const priceData = mockSessionCreate.mock.calls[0][0].line_items[0].price_data;
		expect(priceData.unit_amount).toBe(2999);
		expect(priceData.currency).toBe('eur');
		expect(priceData.recurring.interval).toBe('month');
		expect(priceData.product_data.name).toBe('Hallify Starter');
	});

	it('prices professional inline from plans.ts', async () => {
		await createCheckoutSession({
			orgId: 'org_1',
			plan: 'professional',
			stripeCustomerId: null,
			userEmail: 'test@example.com',
		});
		const priceData = mockSessionCreate.mock.calls[0][0].line_items[0].price_data;
		expect(priceData.unit_amount).toBe(7999);
		expect(priceData.product_data.name).toBe('Hallify Professional');
	});

	it('uses customer_email when no stripeCustomerId', async () => {
		await createCheckoutSession({
			orgId: 'org_1',
			plan: 'starter',
			stripeCustomerId: null,
			userEmail: 'user@example.com',
		});
		const params = mockSessionCreate.mock.calls[0][0];
		expect(params.customer_email).toBe('user@example.com');
		expect(params.customer).toBeUndefined();
	});

	it('uses existing customer ID when provided', async () => {
		await createCheckoutSession({
			orgId: 'org_1',
			plan: 'starter',
			stripeCustomerId: 'cus_existing',
			userEmail: 'user@example.com',
		});
		const params = mockSessionCreate.mock.calls[0][0];
		expect(params.customer).toBe('cus_existing');
		expect(params.customer_email).toBeUndefined();
	});

	it('embeds orgId in metadata', async () => {
		await createCheckoutSession({
			orgId: 'org_abc',
			plan: 'starter',
			stripeCustomerId: null,
			userEmail: 'x@x.com',
		});
		const params = mockSessionCreate.mock.calls[0][0];
		expect(params.metadata?.orgId).toBe('org_abc');
		expect(params.subscription_data?.metadata?.orgId).toBe('org_abc');
	});

	it('builds success and cancel URLs from APP_URL', async () => {
		await createCheckoutSession({
			orgId: 'org_1',
			plan: 'starter',
			stripeCustomerId: null,
			userEmail: 'x@x.com',
		});
		const params = mockSessionCreate.mock.calls[0][0];
		expect(params.success_url).toBe('http://localhost:5173/app/billing/success?plan=starter');
		expect(params.cancel_url).toBe('http://localhost:5173/app/billing?cancelled=1');
	});

	it('carries the plan through to the success URL', async () => {
		await createCheckoutSession({
			orgId: 'org_1',
			plan: 'professional',
			stripeCustomerId: null,
			userEmail: 'x@x.com',
		});
		expect(mockSessionCreate.mock.calls[0][0].success_url).toContain('plan=professional');
	});

	it('throws for a plan that is not payable', async () => {
		await expect(
			createCheckoutSession({
				orgId: 'org_1',
				plan: 'enterprise',
				stripeCustomerId: null,
				userEmail: 'x@x.com',
			})
		).rejects.toThrow('Plan "enterprise" is not a paid plan');
	});

	it('throws for the free plan', async () => {
		await expect(
			createCheckoutSession({
				orgId: 'org_1',
				plan: 'free',
				stripeCustomerId: null,
				userEmail: 'x@x.com',
			})
		).rejects.toThrow('is not a paid plan');
	});

	it('uses subscription mode', async () => {
		await createCheckoutSession({
			orgId: 'org_1',
			plan: 'starter',
			stripeCustomerId: null,
			userEmail: 'x@x.com',
		});
		const params = mockSessionCreate.mock.calls[0][0];
		expect(params.mode).toBe('subscription');
	});
});

describe('createPortalSession', () => {
	beforeEach(() => {
		mockPortalCreate.mockReset();
		mockPortalCreate.mockResolvedValue({ url: 'https://billing.stripe.com/portal_123' });
	});

	it('returns the portal URL', async () => {
		const url = await createPortalSession('cus_abc');
		expect(url).toBe('https://billing.stripe.com/portal_123');
	});

	it('passes the customer ID', async () => {
		await createPortalSession('cus_xyz');
		expect(mockPortalCreate.mock.calls[0][0].customer).toBe('cus_xyz');
	});

	it('uses /app/billing as default return path', async () => {
		await createPortalSession('cus_abc');
		expect(mockPortalCreate.mock.calls[0][0].return_url).toBe('http://localhost:5173/app/billing');
	});

	it('uses custom return path when provided', async () => {
		await createPortalSession('cus_abc', '/settings');
		expect(mockPortalCreate.mock.calls[0][0].return_url).toBe('http://localhost:5173/settings');
	});
});
