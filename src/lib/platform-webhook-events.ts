// The platform webhook events: their names, how the admin page groups them, and the
// exact fields each payload's `data` may carry. This list is the documentation and the
// filter at once: buildPlatformPayload ($lib/server/platform-webhooks) copies only the
// fields named here, so nothing else (a password hash, a token, a client's name) can
// ride along by accident when a call site passes more than it should.
//
// Shared by the server and the admin page (event checkboxes, payload reference), so it
// imports nothing.

export const PLATFORM_EVENT_GROUPS = {
	accounts: ['user.registered', 'user.email_verified', 'user.deleted'],
	organisations: ['org.created', 'org.closed', 'org.plan_changed'],
	billing: ['payment.succeeded', 'payment.failed', 'ai_credits.purchased'],
	services: ['floorplan_request.created', 'setup_service.requested', 'custom_domain.verified', 'custom_domain.failed'],
	activity: ['feedback.received', 'reservation.created'],
} as const;

export type PlatformEventGroup = keyof typeof PLATFORM_EVENT_GROUPS;
export type PlatformEvent = (typeof PLATFORM_EVENT_GROUPS)[PlatformEventGroup][number];
/** `platform.test` is the "Send test" button; nobody subscribes to it, every endpoint gets it. */
export type PlatformPayloadEvent = PlatformEvent | 'platform.test';

export const PLATFORM_EVENTS: readonly PlatformEvent[] = Object.values(PLATFORM_EVENT_GROUPS).flat();

/** The fields of each event's `data`, in the order they are documented. */
export const PLATFORM_EVENT_FIELDS = {
	'user.registered': ['user_id', 'email', 'source', 'org_id', 'locale'],
	'user.email_verified': ['user_id', 'email'],
	'user.deleted': ['user_id', 'orgs_closed', 'orgs_handed_over'],
	'org.created': ['org_id', 'name', 'slug', 'plan', 'created_by'],
	'org.closed': ['org_id', 'name', 'slug', 'reason', 'plan', 'member_count', 'reservation_count', 'subscription_cancelled'],
	'org.plan_changed': ['org_id', 'change', 'old_plan', 'new_plan', 'old_status', 'new_status', 'source', 'stripe_subscription_id'],
	'payment.succeeded': ['org_id', 'kind', 'amount_cents', 'currency', 'plan', 'stripe_object_id'],
	'payment.failed': ['org_id', 'kind', 'amount_cents', 'currency', 'attempt_count', 'next_attempt_at', 'stripe_object_id'],
	'ai_credits.purchased': ['org_id', 'credits', 'amount_cents', 'currency', 'purchased_by', 'stripe_checkout_session_id'],
	'floorplan_request.created': ['request_id', 'org_id', 'hall_id', 'requested_by', 'has_note'],
	'setup_service.requested': ['org_id', 'requested_by', 'price_cents', 'has_note'],
	'custom_domain.verified': ['org_id', 'domain_id', 'domain'],
	'custom_domain.failed': ['org_id', 'domain_id', 'domain', 'reason', 'problem'],
	'feedback.received': ['org_id', 'hall_id', 'reservation_id', 'rating', 'has_comment', 'updated'],
	'reservation.created': ['org_id', 'hall_id', 'reservation_id', 'status', 'source'],
	'platform.test': ['message', 'sent_by'],
} as const satisfies Record<PlatformPayloadEvent, readonly string[]>;

/** What a call site may pass for an event: only its documented fields. */
export type PlatformEventData<E extends PlatformPayloadEvent> = {
	[K in (typeof PLATFORM_EVENT_FIELDS)[E][number]]?: string | number | boolean | null;
};

export function isPlatformEvent(v: unknown): v is PlatformEvent {
	return typeof v === 'string' && (PLATFORM_EVENTS as readonly string[]).includes(v);
}

/** The JSON body every endpoint receives. */
export interface PlatformWebhookPayload {
	/** Unique per event and endpoint, the same on every retry: deduplicate on it. */
	id: string;
	event: PlatformPayloadEvent;
	/** ISO 8601, when the event happened (not when this attempt was sent). */
	created_at: string;
	data: Record<string, string | number | boolean | null>;
}
