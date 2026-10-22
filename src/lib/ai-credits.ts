/**
 * What an AI credit is worth: 1 credit = 10 euro cents, so 10 credits = 1 EUR.
 *
 * Everything that turns credits into money, or money into credits, reads this:
 * metered charges, plan allowances, top-up packs, and the Stripe webhook. Balances
 * are kept in milli-credits (1 credit = 1000 mc).
 */
export const CREDITS_PER_EUR = 10;
export const CENTS_PER_CREDIT = 100 / CREDITS_PER_EUR;

/** AI credit packs on sale, at the plain rate (no volume discount): €5, €10, €25. */
export const AI_CREDIT_PACKS = [50, 100, 250] as const;

/** Credits bought by a payment of this many euro cents. */
export function creditsForCents(cents: number): number {
	return Math.floor(cents / CENTS_PER_CREDIT);
}
