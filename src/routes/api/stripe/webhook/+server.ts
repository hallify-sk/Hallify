import { getStripe, getWebhookSecret, getSubscription } from '$lib/stripe';
import { handleStripeEvent } from '$lib/server/stripe-sync';
import type { RequestHandler } from './$types';
import type Stripe from 'stripe';

/** A bad or missing signature (or a stale timestamp): the sender's problem, not ours. */
function isSignatureError(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { type?: string }).type === 'StripeSignatureVerificationError';
}

export const POST: RequestHandler = async (event) => {
  const { request, locals } = event;
  const db = locals.db;

  const body = await request.text();
  const sig  = request.headers.get('stripe-signature') ?? '';

  // Resolved outside the try so a missing key/secret surfaces as a 500 instead of
  // masquerading as an invalid signature.
  const client = getStripe();
  const webhookSecret = getWebhookSecret();

  // The ASYNC variant: on Workers the Stripe SDK only has SubtleCrypto, which is
  // async, so the synchronous constructEvent throws CryptoProviderOnlySupportsAsyncError
  // for every event. That used to be swallowed as "signature invalid" and every
  // production webhook failed with a 400 (plans never activated, packs never credited).
  let stripeEvent: Stripe.Event;
  try {
    stripeEvent = await client.webhooks.constructEventAsync(body, sig, webhookSecret);
  } catch (err) {
    if (isSignatureError(err)) return new Response('Webhook signature invalid', { status: 400 });
    // Anything else is our fault, not the sender's: 500 so Stripe retries and it shows in logs.
    console.error('[stripe webhook] could not verify event', err);
    return new Response('Webhook verification failed', { status: 500 });
  }

  // Everything not worth a retry (an unknown or deleted organisation, a stale or
  // out-of-order event, a price we cannot map) is acknowledged inside. What throws
  // here is a real failure and gets a 500, so Stripe delivers the event again.
  await handleStripeEvent(db, stripeEvent, { retrieveSubscription: getSubscription });

  return new Response('ok');
};
