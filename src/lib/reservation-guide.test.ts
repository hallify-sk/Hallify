import { describe, expect, it } from 'vitest';
import { statusGuide, nextSteps, progressSteps, daysUntil, amountDue, acceptedAt, cancelledAt } from './reservation-guide';

describe('statusGuide: what the status means and who acts next', () => {
	it('a pending request waits for the venue', () => {
		expect(statusGuide({ status: 'pending' })).toMatchObject({ key: 'pending', actor: 'venue', tone: 'warning' });
	});

	it('waiting for payment is the client\'s move until it is paid', () => {
		expect(statusGuide({ status: 'waiting_payment', paymentState: 'unpaid', hasAmountDue: true }))
			.toMatchObject({ key: 'waiting_payment', actor: 'client', paymentDue: true });
		// No amounts stated yet: still the client's move (ask the venue for details).
		expect(statusGuide({ status: 'waiting_payment', paymentState: 'none' })).toMatchObject({ actor: 'client', paymentDue: true });
		expect(statusGuide({ status: 'waiting_payment', paymentState: 'paid' })).toMatchObject({ actor: 'venue', paymentDue: false });
	});

	it('an approved booking is the client\'s to plan, and flags an outstanding amount', () => {
		expect(statusGuide({ status: 'approved' })).toMatchObject({ key: 'approved', actor: 'client', tone: 'success', paymentDue: false });
		expect(statusGuide({ status: 'approved', paymentState: 'deposit_paid', hasAmountDue: true })).toMatchObject({ paymentDue: true });
		expect(statusGuide({ status: 'approved', paymentState: 'paid', hasAmountDue: true })).toMatchObject({ paymentDue: false });
	});

	it('planned needs nothing unless something is still to pay', () => {
		expect(statusGuide({ status: 'planned' })).toMatchObject({ key: 'planned', actor: 'nobody' });
		expect(statusGuide({ status: 'planned', paymentState: 'unpaid', hasAmountDue: true })).toMatchObject({ actor: 'client', paymentDue: true });
	});

	it('a started event is in progress; a finished one asks for feedback when the card is open', () => {
		expect(statusGuide({ status: 'approved', hasStarted: true })).toMatchObject({ key: 'in_progress', actor: 'nobody' });
		expect(statusGuide({ status: 'planned', hasStarted: true, isPast: true })).toMatchObject({ key: 'finished' });
		expect(statusGuide({ status: 'completed', feedbackState: 'open', hasFeedback: false })).toMatchObject({ key: 'finished', actor: 'client', feedbackDue: true });
		expect(statusGuide({ status: 'completed', feedbackState: 'open', hasFeedback: true })).toMatchObject({ actor: 'nobody', feedbackDue: false });
		expect(statusGuide({ status: 'completed', feedbackState: null })).toMatchObject({ feedbackDue: false });
	});

	it('tells the cancellations apart by who ended the booking', () => {
		expect(statusGuide({ status: 'cancelled', cancelledBy: 'venue', statusReason: 'Termín je obsadený' }).key).toBe('declined');
		expect(statusGuide({ status: 'cancelled', cancelledBy: 'venue', statusReason: '  ' }).key).toBe('cancelled_venue');
		expect(statusGuide({ status: 'cancelled', cancelledBy: 'client' }).key).toBe('cancelled_client');
		expect(statusGuide({ status: 'cancelled', cancelledBy: 'expired' }).key).toBe('expired');
		expect(statusGuide({ status: 'cancelled', cancelledBy: null }).key).toBe('cancelled');
		expect(statusGuide({ status: 'cancelled', cancelledBy: 'venue', statusReason: 'x' }).tone).toBe('danger');
	});
});

describe('nextSteps', () => {
	const g = (input: Parameters<typeof statusGuide>[0]) => statusGuide(input);

	it('pending: wait first, then what can still be changed', () => {
		expect(nextSteps({ guide: g({ status: 'pending' }), editable: true, extrasEditable: true, hasExtras: true, cancellable: true }))
			.toEqual(['wait', 'editDetails', 'extras', 'message', 'calendar', 'cancel']);
		// No extras offered: no extras step.
		expect(nextSteps({ guide: g({ status: 'pending' }), editable: true, extrasEditable: true, hasExtras: false })).not.toContain('extras');
	});

	it('waiting for payment: pay comes first', () => {
		const steps = nextSteps({ guide: g({ status: 'waiting_payment', paymentState: 'unpaid', hasAmountDue: true }), extrasEditable: true, hasExtras: true, cancellable: true });
		expect(steps[0]).toBe('pay');
		expect(steps).toContain('cancel');
	});

	it('approved: seating tools when allowed, cancel only within the notice period', () => {
		expect(nextSteps({ guide: g({ status: 'approved' }), canManageEvent: true, canViewSeating: true, cancellable: true }))
			.toEqual(['layout', 'manifest', 'message', 'calendar', 'cancel']);
		expect(nextSteps({ guide: g({ status: 'approved' }), canManageEvent: false, canViewSeating: false, cancellable: false }))
			.toEqual(['message', 'calendar']);
	});

	it('completed: feedback first, no calendar', () => {
		expect(nextSteps({ guide: g({ status: 'completed', feedbackState: 'open' }), canViewSeating: true }))
			.toEqual(['feedback', 'manifest', 'message']);
	});

	it('cancelled: book again or write to the venue, nothing else', () => {
		for (const by of ['client', 'venue', 'expired', null]) {
			expect(nextSteps({ guide: g({ status: 'cancelled', cancelledBy: by }), cancellable: true, editable: true })).toEqual(['bookAgain', 'message']);
		}
	});
});

describe('progressSteps', () => {
	const activity = [
		{ kind: 'created', status: 'pending', created_at: '2026-10-01 08:00:00' },
		{ kind: 'status', status: 'waiting_payment', created_at: '2026-10-02 11:00:00' },
		{ kind: 'status', status: 'approved', created_at: '2026-10-20 10:00:00' },
	];

	it('a pending request is at "accepted"', () => {
		const s = progressSteps({ status: 'pending', createdAt: '2026-10-01', eventDate: '2026-12-01' });
		expect(s.map((x) => [x.id, x.state])).toEqual([['requested', 'done'], ['accepted', 'current'], ['event', 'upcoming']]);
	});

	it('includes a payment step when there is something to pay, dated from history', () => {
		const s = progressSteps({
			status: 'waiting_payment', createdAt: '2026-10-01', eventDate: '2026-12-01', activity,
			payment: { hasAmounts: true, state: 'unpaid', depositPaidAt: null, paidInFullAt: null }, asksFeedback: true,
		});
		expect(s.map((x) => [x.id, x.state])).toEqual([
			['requested', 'done'], ['accepted', 'done'], ['paid', 'current'], ['event', 'upcoming'], ['feedback', 'upcoming'],
		]);
		expect(s[1].date).toBe('2026-10-02 11:00:00');
	});

	it('a part-paid booking stays on the payment step', () => {
		const s = progressSteps({
			status: 'approved', createdAt: '2026-10-01', eventDate: '2026-12-01', activity,
			payment: { hasAmounts: true, state: 'deposit_paid', depositPaidAt: '2026-10-20', paidInFullAt: null },
		});
		expect(s.find((x) => x.id === 'paid')).toMatchObject({ state: 'partial', date: '2026-10-20' });
	});

	it('a finished, rated event is done all the way', () => {
		const s = progressSteps({
			status: 'completed', createdAt: '2026-09-01', eventDate: '2026-10-20', isPast: true, activity,
			payment: { hasAmounts: true, state: 'paid', depositPaidAt: null, paidInFullAt: '2026-10-15' },
			asksFeedback: true, feedbackAt: '2026-10-22 10:00:00',
		});
		expect(s.every((x) => x.state === 'done')).toBe(true);
	});

	it('a completed event waiting for a rating is at feedback', () => {
		const s = progressSteps({ status: 'completed', createdAt: '2026-09-01', eventDate: '2026-10-20', isPast: true, asksFeedback: true });
		expect(s.at(-1)).toMatchObject({ id: 'feedback', state: 'current' });
	});

	it('a cancelled booking keeps what happened and ends at the cancellation', () => {
		const declined = progressSteps({
			status: 'cancelled', createdAt: '2026-10-01', eventDate: '2026-12-01',
			activity: [{ kind: 'created', status: 'pending', created_at: '2026-10-01' }, { kind: 'declined', status: 'cancelled', created_at: '2026-10-03' }],
		});
		expect(declined.map((x) => [x.id, x.state])).toEqual([['requested', 'done'], ['cancelled', 'stopped']]);
		expect(declined[1].date).toBe('2026-10-03');

		const afterApproval = progressSteps({
			status: 'cancelled', createdAt: '2026-10-01', eventDate: '2026-12-01',
			activity: [...activity, { kind: 'status', status: 'cancelled', created_at: '2026-10-25' }],
		});
		expect(afterApproval.map((x) => x.id)).toEqual(['requested', 'accepted', 'cancelled']);
	});

	it('an auto-approved booking was accepted when it was created', () => {
		expect(acceptedAt([{ kind: 'created', status: 'approved', created_at: '2026-10-05' }])).toBe('2026-10-05');
		expect(acceptedAt([{ kind: 'created', status: 'pending', created_at: '2026-10-05' }])).toBeNull();
		expect(cancelledAt([{ kind: 'expired', status: 'cancelled', created_at: '2026-10-07' }])).toBe('2026-10-07');
	});
});

describe('daysUntil and amountDue', () => {
	it('counts calendar days', () => {
		expect(daysUntil('2026-11-16', '2026-10-24')).toBe(23);
		expect(daysUntil('2026-10-24', '2026-10-24')).toBe(0);
		expect(daysUntil('2026-10-20', '2026-10-24')).toBe(-4);
		// Across the October clock change (UTC arithmetic, no 23-hour day).
		expect(daysUntil('2026-10-26', '2026-10-24 23:59:59')).toBe(2);
	});

	const p = { depositCents: null, depositPaidAt: null, paidInFullAt: null, balanceCents: null, priceCents: null, depositDueDate: null };
	it('asks for the deposit first, then the balance', () => {
		expect(amountDue({ ...p, priceCents: 250000, depositCents: 50000, depositDueDate: '2026-11-05', balanceCents: 250000 }))
			.toEqual({ cents: 50000, kind: 'deposit', dueDate: '2026-11-05' });
		expect(amountDue({ ...p, priceCents: 250000, depositCents: 50000, depositPaidAt: '2026-10-20', balanceCents: 200000 }))
			.toEqual({ cents: 200000, kind: 'balance', dueDate: null });
		expect(amountDue({ ...p, priceCents: 90000, balanceCents: 90000 })).toEqual({ cents: 90000, kind: 'price', dueDate: null });
	});

	it('has nothing due when paid or unstated', () => {
		expect(amountDue(null)).toBeNull();
		expect(amountDue(p)).toBeNull();
		expect(amountDue({ ...p, priceCents: 90000, paidInFullAt: '2026-10-20' })).toBeNull();
		expect(amountDue({ ...p, depositCents: 40000, depositPaidAt: '2026-10-20' })).toBeNull();
	});
});
