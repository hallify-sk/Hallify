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
const mockSubRetrieve = vi.fn();
const mockPricesList = vi.fn();
const mockCreatePreview = vi.fn();

type StripeMock = { checkout: unknown; billingPortal: unknown; subscriptions: unknown; prices: unknown; invoices: unknown };

vi.mock('stripe', () => ({
	default: vi.fn(function (this: StripeMock) {
		this.checkout = { sessions: { create: mockSessionCreate } };
		this.billingPortal = { sessions: { create: mockPortalCreate } };
		this.subscriptions = { retrieve: mockSubRetrieve };
		this.prices = { list: mockPricesList };
		this.invoices = { createPreview: mockCreatePreview };
	}),
}));

const { createCheckoutSession, createPortalSession, getWebhookSecret, previewPlanChange, subscriptionPeriod } =
	await import('./stripe.js');

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

	// Venues are businesses — invoices need their company name, address and VAT ID.
	it('collects the billing address and tax ID', async () => {
		await createCheckoutSession({
			orgId: 'org_1',
			plan: 'starter',
			stripeCustomerId: null,
			userEmail: 'x@x.com',
		});
		const params = mockSessionCreate.mock.calls[0][0];
		expect(params.billing_address_collection).toBe('required');
		expect(params.tax_id_collection).toEqual({ enabled: true });
	});

	// Stripe rejects tax ID collection on an existing customer unless the collected
	// name may be written back; with customer_email it rejects customer_update.
	it('lets Checkout update an existing customer, and only then', async () => {
		await createCheckoutSession({
			orgId: 'org_1',
			plan: 'starter',
			stripeCustomerId: 'cus_existing',
			userEmail: 'x@x.com',
		});
		expect(mockSessionCreate.mock.calls[0][0].customer_update).toEqual({ name: 'auto', address: 'auto' });

		await createCheckoutSession({
			orgId: 'org_1',
			plan: 'starter',
			stripeCustomerId: null,
			userEmail: 'x@x.com',
		});
		expect(mockSessionCreate.mock.calls[1][0].customer_update).toBeUndefined();
	});
});

describe('subscriptionPeriod', () => {
	it('reads the period from the subscription item (basil)', () => {
		const sub = { items: { data: [{ current_period_start: 100, current_period_end: 200 }] } };
		expect(subscriptionPeriod(sub as never)).toEqual({ start: 100, end: 200 });
	});

	// Webhook payloads use the endpoint's API version, which may predate basil.
	it('falls back to the pre-basil top-level fields', () => {
		const sub = { current_period_start: 300, current_period_end: 400, items: { data: [{}] } };
		expect(subscriptionPeriod(sub as never)).toEqual({ start: 300, end: 400 });
	});

	it('returns nulls when neither is present', () => {
		expect(subscriptionPeriod({ items: { data: [] } } as never)).toEqual({ start: null, end: null });
	});
});

describe('previewPlanChange', () => {
	const now = Math.floor(Date.now() / 1000);
	const DAY = 86400;

	beforeEach(() => {
		mockSubRetrieve.mockReset();
		mockPricesList.mockReset();
		mockCreatePreview.mockReset();
		// Half of a 30-day period remains.
		mockSubRetrieve.mockResolvedValue({
			id: 'sub_1',
			customer: 'cus_1',
			items: { data: [{ id: 'si_1', current_period_start: now - 15 * DAY, current_period_end: now + 15 * DAY }] },
		});
		mockPricesList.mockResolvedValue({ data: [{ id: 'price_pro' }] });
	});

	it('previews through invoices.createPreview with the new price', async () => {
		mockCreatePreview.mockResolvedValue({ currency: 'eur', lines: { data: [] } });
		await previewPlanChange({ subscriptionId: 'sub_1', currentPlan: 'starter', newPlan: 'professional' });
		const params = mockCreatePreview.mock.calls[0][0];
		expect(params.customer).toBe('cus_1');
		expect(params.subscription).toBe('sub_1');
		expect(params.subscription_details.items).toEqual([{ id: 'si_1', price: 'price_pro' }]);
		expect(params.subscription_details.proration_behavior).toBe('always_invoice');
		expect(typeof params.subscription_details.proration_date).toBe('number');
	});

	// Basil flags prorations on `line.parent`; the next period's full charge must not count.
	it('charges only the net of the proration lines', async () => {
		mockCreatePreview.mockResolvedValue({
			currency: 'eur',
			lines: {
				data: [
					{ amount: 4000, parent: { subscription_item_details: { proration: true } } },
					{ amount: -1500, parent: { subscription_item_details: { proration: true } } },
					{ amount: 7999, parent: { subscription_item_details: { proration: false } } },
				],
			},
		});
		const res = await previewPlanChange({ subscriptionId: 'sub_1', currentPlan: 'starter', newPlan: 'professional' });
		expect(res).toEqual({ amountDue: 2500, currency: 'eur', exact: true });
	});

	it('estimates from the item period when the preview fails', async () => {
		mockCreatePreview.mockRejectedValue(new Error('stripe down'));
		const res = await previewPlanChange({ subscriptionId: 'sub_1', currentPlan: 'starter', newPlan: 'professional' });
		// €50.00 difference × half the period left.
		expect(res.exact).toBe(false);
		expect(res.amountDue).toBeGreaterThanOrEqual(2499);
		expect(res.amountDue).toBeLessThanOrEqual(2501);
	});

	// This used to come out as €0.00, which then surprised the customer at payment.
	it('never estimates zero when the period is unknown', async () => {
		mockSubRetrieve.mockResolvedValue({ id: 'sub_1', customer: 'cus_1', items: { data: [{ id: 'si_1' }] } });
		mockCreatePreview.mockRejectedValue(new Error('stripe down'));
		const res = await previewPlanChange({ subscriptionId: 'sub_1', currentPlan: 'starter', newPlan: 'professional' });
		expect(res).toEqual({ amountDue: 5000, currency: 'eur', exact: false });
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
