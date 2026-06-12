import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock $env/static/private before importing stripe module
vi.mock('$env/static/private', () => ({
	STRIPE_SECRET_KEY: 'sk_test_mock_key',
	STRIPE_WEBHOOK_SECRET: 'whsec_mock_secret',
	STRIPE_PRICE_STARTER: 'price_mock_starter',
	STRIPE_PRICE_PROFESSIONAL: 'price_mock_professional',
	APP_URL: 'http://localhost:5173',
}));

// Mock the stripe SDK
const mockSessionCreate = vi.fn();
const mockPortalCreate = vi.fn();

vi.mock('stripe', () => ({
	default: vi.fn(function () {
		(this as { checkout: unknown; billingPortal: unknown }).checkout = {
			sessions: { create: mockSessionCreate },
		};
		(this as { checkout: unknown; billingPortal: unknown }).billingPortal = {
			sessions: { create: mockPortalCreate },
		};
	}),
}));

const { createCheckoutSession, createPortalSession, STRIPE_WEBHOOK_SECRET } = await import('./stripe.js');

describe('STRIPE_WEBHOOK_SECRET', () => {
	it('is exported from the module', () => {
		expect(STRIPE_WEBHOOK_SECRET).toBe('whsec_mock_secret');
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

	it('passes the starter price ID', async () => {
		await createCheckoutSession({
			orgId: 'org_1',
			plan: 'starter',
			stripeCustomerId: null,
			userEmail: 'test@example.com',
		});
		const params = mockSessionCreate.mock.calls[0][0];
		expect(params.line_items[0].price).toBe('price_mock_starter');
	});

	it('passes the professional price ID', async () => {
		await createCheckoutSession({
			orgId: 'org_1',
			plan: 'professional',
			stripeCustomerId: null,
			userEmail: 'test@example.com',
		});
		const params = mockSessionCreate.mock.calls[0][0];
		expect(params.line_items[0].price).toBe('price_mock_professional');
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

	it('builds success and cancel URLs from APP_URL and returnPath', async () => {
		await createCheckoutSession({
			orgId: 'org_1',
			plan: 'starter',
			stripeCustomerId: null,
			userEmail: 'x@x.com',
			returnPath: '/billing',
		});
		const params = mockSessionCreate.mock.calls[0][0];
		expect(params.success_url).toBe('http://localhost:5173/billing?success=1');
		expect(params.cancel_url).toBe('http://localhost:5173/billing?cancelled=1');
	});

	it('uses /billing as default returnPath', async () => {
		await createCheckoutSession({
			orgId: 'org_1',
			plan: 'starter',
			stripeCustomerId: null,
			userEmail: 'x@x.com',
		});
		const params = mockSessionCreate.mock.calls[0][0];
		expect(params.success_url).toContain('/billing?success=1');
	});

	it('throws for a plan with no configured price', async () => {
		await expect(
			createCheckoutSession({
				orgId: 'org_1',
				plan: 'enterprise',
				stripeCustomerId: null,
				userEmail: 'x@x.com',
			})
		).rejects.toThrow('No Stripe price configured for plan: enterprise');
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

	it('uses /billing as default return path', async () => {
		await createPortalSession('cus_abc');
		expect(mockPortalCreate.mock.calls[0][0].return_url).toBe('http://localhost:5173/billing');
	});

	it('uses custom return path when provided', async () => {
		await createPortalSession('cus_abc', '/settings');
		expect(mockPortalCreate.mock.calls[0][0].return_url).toBe('http://localhost:5173/settings');
	});
});
