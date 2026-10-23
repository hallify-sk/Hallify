-- 0015: what Stripe says about a subscription, kept apart from what the org gets.
--
-- `subscriptions.plan` stays the plan the organisation is ENTITLED to right now: every
-- limit and paid feature in the app reads it. A subscription that Stripe has
-- suspended (unpaid, paused, a first payment never completed) no longer grants its
-- plan, but the billing page still needs to say which plan it was and why it is off.
-- Additive only: existing rows keep working with NULLs in the new columns.

-- The plan the Stripe subscription is for, whether or not it is currently paid up.
ALTER TABLE subscriptions ADD COLUMN stripe_plan TEXT;
-- Stripe's own status word (active, past_due, unpaid, incomplete, ...), for display
-- and to recognise a subscription that has ended for good (canceled never comes back).
ALTER TABLE subscriptions ADD COLUMN stripe_status TEXT;
-- `created` (unix seconds) of the newest Stripe event applied to this row. Stripe does
-- not deliver events in order; an older event than this one is ignored.
ALTER TABLE subscriptions ADD COLUMN stripe_event_at INTEGER;

-- Whether a hall was public when a plan downgrade suspended it, so the hall comes back
-- the way it was when the plan allows it again (it used to come back as a draft).
ALTER TABLE halls ADD COLUMN public_before_lock INTEGER;

-- Existing Stripe-backed rows: the plan on record is the subscription's plan.
UPDATE subscriptions SET stripe_plan = plan
 WHERE stripe_subscription_id IS NOT NULL AND plan != 'free' AND stripe_plan IS NULL;
-- A paused Stripe subscription is not paid for: it no longer grants its plan. (Only
-- Stripe writes 'paused'; a platform override always writes 'active'.)
UPDATE subscriptions SET plan = 'free' WHERE status = 'paused' AND stripe_subscription_id IS NOT NULL;
