// What a client's booking page says about where the booking stands and what happens
// next (owner feedback, Oct 2026: the page "feels empty and confusing; it is not
// clear whether you should wait for a confirmation or take some action").
//
// Pure: the page passes in what it knows and renders the result with its own
// strings, so the rules can be tested without a database or a browser.
//
// The lifecycle (staff side: src/routes/app/reservation/[id], $lib/server/ops):
//   pending ─▶ waiting_payment ─▶ approved ─▶ planned ─▶ completed
//      │            │                │           │      (automatic, the day after)
//      └────────────┴────────────────┴───────────┴─▶ cancelled
// cancelled_by says who ended it: 'client', 'venue' (a decline carries status_reason)
// or 'expired' (the date passed while the request still waited).

export type GuideKey =
	| 'pending'
	| 'waiting_payment'
	| 'approved'
	| 'planned'
	| 'in_progress'
	| 'finished'
	| 'declined'
	| 'cancelled_venue'
	| 'cancelled_client'
	| 'expired'
	| 'cancelled';

/** Who moves the booking on from here. */
export type NextActor = 'venue' | 'client' | 'nobody';
export type GuideTone = 'warning' | 'success' | 'info' | 'muted' | 'danger';

export interface GuideInput {
	status: string;
	cancelledBy?: string | null;
	statusReason?: string | null;
	hasStarted?: boolean;
	isPast?: boolean;
	/** From $lib/payment: 'none' | 'unpaid' | 'deposit_paid' | 'paid'. */
	paymentState?: string | null;
	/** An amount is still due (amountDue() below found one). */
	hasAmountDue?: boolean;
	/** The rating card: 'open' | 'closed', or null when there is none. */
	feedbackState?: string | null;
	hasFeedback?: boolean;
}

export interface StatusGuide {
	key: GuideKey;
	actor: NextActor;
	tone: GuideTone;
	/** An approved booking with an amount still to pay: the client should pay. */
	paymentDue: boolean;
	/** The rating card waits for the client. */
	feedbackDue: boolean;
}

export function statusGuide(i: GuideInput): StatusGuide {
	const unpaid = !!i.hasAmountDue && i.paymentState !== 'paid';
	const feedbackDue = i.feedbackState === 'open' && !i.hasFeedback;
	const base = { paymentDue: false, feedbackDue: false };

	if (i.status === 'cancelled') {
		if (i.cancelledBy === 'client') return { ...base, key: 'cancelled_client', actor: 'nobody', tone: 'muted' };
		if (i.cancelledBy === 'expired') return { ...base, key: 'expired', actor: 'nobody', tone: 'muted' };
		if (i.cancelledBy === 'venue') {
			return { ...base, key: i.statusReason?.trim() ? 'declined' : 'cancelled_venue', actor: 'nobody', tone: 'danger' };
		}
		return { ...base, key: 'cancelled', actor: 'nobody', tone: 'muted' };
	}
	// Completed, or over and only waiting for the nightly sweep to say so.
	if (i.status === 'completed' || (i.isPast && (i.status === 'approved' || i.status === 'planned'))) {
		return { ...base, key: 'finished', actor: feedbackDue ? 'client' : 'nobody', tone: 'muted', feedbackDue };
	}
	if (i.hasStarted && (i.status === 'approved' || i.status === 'planned')) {
		return { ...base, key: 'in_progress', actor: 'nobody', tone: 'info' };
	}
	switch (i.status) {
		case 'pending':
			return { ...base, key: 'pending', actor: 'venue', tone: 'warning' };
		case 'waiting_payment':
			// Paid in full but not yet moved on: the venue confirms next.
			return i.paymentState === 'paid'
				? { ...base, key: 'waiting_payment', actor: 'venue', tone: 'warning' }
				: { ...base, key: 'waiting_payment', actor: 'client', tone: 'warning', paymentDue: true };
		case 'approved':
			return { ...base, key: 'approved', actor: 'client', tone: 'success', paymentDue: unpaid };
		case 'planned':
			return { ...base, key: 'planned', actor: unpaid ? 'client' : 'nobody', tone: 'info', paymentDue: unpaid };
		default:
			return { ...base, key: 'cancelled', actor: 'nobody', tone: 'muted' };
	}
}

// ── Next steps ───────────────────────────────────────────────────────────────

export type StepId =
	| 'wait'           // nothing to do: the venue answers
	| 'pay'            // pay the deposit / price
	| 'editDetails'    // change date, time, guests while pending
	| 'extras'         // change the booked extras
	| 'layout'         // arrange tables and seat guests
	| 'manifest'       // view / print the seating sheet
	| 'feedback'       // rate the finished event
	| 'message'        // write to the venue
	| 'calendar'       // add the event to a calendar (.ics)
	| 'cancel'         // cancel, while the notice period allows
	| 'bookAgain';     // a cancelled booking: choose another date

export interface StepsInput {
	guide: StatusGuide;
	editable?: boolean;
	extrasEditable?: boolean;
	hasExtras?: boolean;
	canManageEvent?: boolean;
	canViewSeating?: boolean;
	cancellable?: boolean;
}

/** The actions for the "Next steps" card, most important first. */
export function nextSteps(i: StepsInput): StepId[] {
	const g = i.guide;
	const out: StepId[] = [];
	const cancelled = ['declined', 'cancelled_venue', 'cancelled_client', 'expired', 'cancelled'].includes(g.key);

	if (cancelled) return ['bookAgain', 'message'];

	if (g.key === 'pending') out.push('wait');
	if (g.paymentDue || (g.key === 'waiting_payment')) out.push('pay');
	if (g.feedbackDue) out.push('feedback');
	if (i.canManageEvent) out.push('layout');
	if (i.canViewSeating) out.push('manifest');
	if (i.editable) out.push('editDetails');
	if (i.extrasEditable && i.hasExtras) out.push('extras');
	out.push('message');
	if (g.key !== 'finished' && g.key !== 'in_progress') out.push('calendar');
	if (i.cancellable) out.push('cancel');
	return out;
}

// ── Progress ─────────────────────────────────────────────────────────────────

export type ProgressId = 'requested' | 'accepted' | 'paid' | 'event' | 'feedback' | 'cancelled';
export type ProgressState = 'done' | 'current' | 'upcoming' | 'partial' | 'stopped';

export interface ProgressStep {
	id: ProgressId;
	state: ProgressState;
	/** YYYY-MM-DD or a stored timestamp, when known. */
	date: string | null;
}

/** One history entry, client-safe columns only (no actor, no note). */
export interface ActivityLite {
	kind: string;
	status: string | null;
	created_at: string;
}

export interface ProgressInput {
	status: string;
	createdAt: string;
	eventDate: string;
	hasStarted?: boolean;
	isPast?: boolean;
	activity?: ActivityLite[];
	payment?: { hasAmounts: boolean; state: string; depositPaidAt: string | null; paidInFullAt: string | null } | null;
	/** The hall asks for a rating after the event. */
	asksFeedback?: boolean;
	feedbackAt?: string | null;
}

const ACCEPTED = new Set(['waiting_payment', 'approved', 'planned', 'completed']);

/** When the venue first accepted the booking (or it was created already accepted). */
export function acceptedAt(activity: ActivityLite[] = []): string | null {
	const hits = activity
		.filter((a) => (a.kind === 'status' || a.kind === 'created') && a.status && ACCEPTED.has(a.status))
		.map((a) => a.created_at)
		.sort();
	return hits[0] ?? null;
}

/** When it was cancelled, declined or expired (the latest such entry). */
export function cancelledAt(activity: ActivityLite[] = []): string | null {
	const hits = activity
		.filter((a) => a.kind === 'declined' || a.kind === 'expired' || (a.kind === 'status' && a.status === 'cancelled'))
		.map((a) => a.created_at)
		.sort();
	return hits[hits.length - 1] ?? null;
}

/** Requested → Accepted → Paid (when there is something to pay) → Event → Feedback. */
export function progressSteps(i: ProgressInput): ProgressStep[] {
	const act = i.activity ?? [];
	const accepted = ACCEPTED.has(i.status) || (i.status === 'cancelled' && !!acceptedAt(act));
	const pay = i.payment;
	const withPay = !!pay && (pay.hasAmounts || i.status === 'waiting_payment');
	const finished = i.status === 'completed' || (!!i.isPast && i.status !== 'cancelled');

	const steps: ProgressStep[] = [{ id: 'requested', state: 'done', date: i.createdAt }];
	steps.push({ id: 'accepted', state: accepted ? 'done' : 'upcoming', date: accepted ? acceptedAt(act) : null });
	if (withPay) {
		const state: ProgressState = pay!.state === 'paid' ? 'done' : pay!.state === 'deposit_paid' ? 'partial' : 'upcoming';
		steps.push({ id: 'paid', state, date: pay!.paidInFullAt ?? pay!.depositPaidAt ?? null });
	}
	steps.push({ id: 'event', state: finished ? 'done' : 'upcoming', date: i.eventDate });
	if (i.asksFeedback) steps.push({ id: 'feedback', state: i.feedbackAt ? 'done' : 'upcoming', date: i.feedbackAt ?? null });

	if (i.status === 'cancelled') {
		// What happened up to the cancellation, then where it stopped.
		const kept = steps.filter((s) => s.state === 'done' || s.state === 'partial');
		return [...kept, { id: 'cancelled', state: 'stopped', date: cancelledAt(act) }];
	}

	// The first step not yet done is where the booking is now.
	// A part-paid step stays 'partial' (it says what was received) but is still current.
	const cur = steps.find((s) => s.state === 'upcoming' || s.state === 'partial');
	if (cur && cur.state === 'upcoming') cur.state = 'current';
	return steps;
}

// ── Dates ────────────────────────────────────────────────────────────────────

/** Whole calendar days from `todayISO` to `dateISO` (negative when past). */
export function daysUntil(dateISO: string, todayISO: string): number {
	const a = Date.parse(`${todayISO.slice(0, 10)}T00:00:00Z`);
	const b = Date.parse(`${dateISO.slice(0, 10)}T00:00:00Z`);
	return Math.round((b - a) / 86_400_000);
}

/** What the client should pay now: an unpaid deposit first, then the balance. */
export function amountDue(p: {
	depositCents: number | null; depositPaidAt: string | null; paidInFullAt: string | null;
	balanceCents: number | null; priceCents: number | null; depositDueDate: string | null;
} | null | undefined): { cents: number; kind: 'deposit' | 'balance' | 'price'; dueDate: string | null } | null {
	if (!p || p.paidInFullAt) return null;
	if (p.depositCents != null && p.depositCents > 0 && !p.depositPaidAt) {
		return { cents: p.depositCents, kind: 'deposit', dueDate: p.depositDueDate };
	}
	if (p.depositPaidAt && p.balanceCents != null && p.balanceCents > 0) return { cents: p.balanceCents, kind: 'balance', dueDate: null };
	if (!p.depositPaidAt && p.priceCents != null && p.priceCents > 0) return { cents: p.priceCents, kind: 'price', dueDate: null };
	return null;
}
