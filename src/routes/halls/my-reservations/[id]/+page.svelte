<script lang="ts">
	import { venueTitle } from '$lib/page-title';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { tick, untrack } from 'svelte';
	import MiniCalendar from '$lib/components/MiniCalendar.svelte';
	import { statusLabel, statusClass } from '$lib/reservationStatus';
	import { computeExtras } from '$lib/extras';
	import { reveal } from '$lib/reveal';
	import { t, getLocale } from '$lib/i18n.svelte';
	import { formatDate, formatDateTime, formatMoney } from '$lib/format';
	import { formatIban } from '$lib/payment';
	import { imageSrcset } from '$lib/image-variants';
	import { safeHref } from '$lib/safe-url';
	import { normalizeEventType } from '$lib/eventTypes';
	import { statusGuide, nextSteps, progressSteps, daysUntil, amountDue, type StepId, type ProgressStep } from '$lib/reservation-guide';
	import type { PageData, ActionData } from './$types';

	interface Props { data: PageData; form: ActionData; }
	let { data, form }: Props = $props();

	const r = $derived(data.reservation);
	const orgName = $derived(data.domainOrg.name);
	const hall = $derived(data.hallInfo);

	// Extras — editable selection (until approval), with a live cost overview.
	let extraSel = $state<string[]>([...data.selectedExtras]);
	function toggleExtra(id: string) {
		extraSel = extraSel.includes(id) ? extraSel.filter((x) => x !== id) : [...extraSel, id];
	}
	const extrasOverview = $derived(computeExtras(data.extras, data.extrasEditable ? extraSel : data.selectedExtras, r.num_guests));
	// What is booked (saved), for the summary: priced as booked.
	const bookedExtras = $derived(computeExtras(data.extras, data.selectedExtras, r.num_guests));

	let editing = $state(false);

	// Rating the finished event (D5): stars picked here, sent with the comment.
	let fbRating = $state(untrack(() => data.feedback?.row?.rating ?? 0));
	let fbHover = $state(0);
	let fbEditing = $state(untrack(() => !data.feedback?.row));
	const fbShown = $derived(fbHover || fbRating);
	const longDate = (d: string) => formatDate(d, getLocale(), { day: 'numeric', month: 'long', year: 'numeric' });
	const shortDate = (d: string) => formatDate(d, getLocale(), { day: 'numeric', month: 'short' });

	// Price and payment (D6): shown when the venue stated anything, and always while
	// the booking waits for payment, so the client knows what is expected of them.
	const pay = $derived(data.payment);
	const showPayment = $derived(!!pay && (pay.hasAny || r.status === 'waiting_payment'));
	const awaitingPayment = $derived(r.status === 'waiting_payment' && pay?.state !== 'paid');
	const due = $derived(amountDue(pay));
	let copiedKey = $state('');
	async function copyValue(key: string, value: string) {
		try {
			await navigator.clipboard.writeText(value);
			copiedKey = key;
			setTimeout(() => { if (copiedKey === key) copiedKey = ''; }, 2000);
		} catch { /* clipboard refused: the value is on screen to copy by hand */ }
	}
	let confirmCancel = $state(false);

	// ── Where the booking stands and what happens next ──
	const guide = $derived(statusGuide({
		status: r.status, cancelledBy: r.cancelled_by, statusReason: r.status_reason,
		hasStarted: data.hasStarted, isPast: data.isPast,
		paymentState: pay?.state ?? null, hasAmountDue: !!due,
		feedbackState: data.feedback?.state ?? null, hasFeedback: !!data.feedback?.row,
	}));
	const steps = $derived(nextSteps({
		guide, editable: data.editable, extrasEditable: data.extrasEditable, hasExtras: data.extras.length > 0,
		canManageEvent: data.canManageEvent && data.hasFloorplan, canViewSeating: data.canViewSeating, cancellable: data.cancellable,
	}));
	const progress = $derived(progressSteps({
		status: r.status, createdAt: r.created_at, eventDate: r.event_date,
		hasStarted: data.hasStarted, isPast: data.isPast, activity: data.activity,
		payment: pay ? { hasAmounts: pay.hasAmounts, state: pay.state, depositPaidAt: pay.depositPaidAt, paidInFullAt: pay.paidInFullAt } : null,
		asksFeedback: !!hall?.asksFeedback, feedbackAt: data.feedback?.row?.created_at ?? null,
	}));
	const isCancelled = $derived(r.status === 'cancelled');
	const bookAgainHref = $derived(hall?.slug ? `/halls/${hall.slug}` : '/halls');
	const days = $derived(daysUntil(r.event_date, data.todayISO));
	const countdown = $derived(
		days === 0 ? t.myRes.detail.today
		: days === 1 ? t.myRes.detail.tomorrow
		: days === -1 ? t.myRes.detail.yesterday
		: days > 1 ? t.myRes.detail.inDays(days)
		: t.myRes.detail.daysAgo(-days));
	const eventTypeKey = $derived(normalizeEventType(r.event_type));
	const mapHref = $derived(
		hall?.latitude != null && hall?.longitude != null
			? `https://www.google.com/maps/search/?api=1&query=${hall.latitude},${hall.longitude}`
			: hall?.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(hall.address)}` : null);
	const websiteHref = $derived(safeHref(hall?.contactWebsite));
	const timeText = $derived(r.start_time ? `${r.start_time}${r.end_time ? ` – ${r.end_time}` : ''}` : t.myRes.detail.wholeDay);

	const guideTitle = $derived.by(() => {
		const d = t.myRes.detail;
		switch (guide.key) {
			case 'pending': return d.pendingTitle;
			case 'waiting_payment': return d.waitingPaymentTitle;
			case 'approved': return d.approvedTitle;
			case 'planned': return d.plannedTitle;
			case 'in_progress': return d.inProgressTitle;
			case 'finished': return d.finishedTitle;
			case 'declined': return d.declinedTitle;
			case 'cancelled_venue': return d.cancelledVenueTitle;
			case 'cancelled_client': return d.cancelledClientTitle;
			case 'expired': return d.expiredTitle;
			default: return d.cancelledTitle;
		}
	});
	const guideBody = $derived.by(() => {
		const d = t.myRes.detail;
		switch (guide.key) {
			case 'pending': return d.pendingBody(orgName);
			case 'waiting_payment': return pay?.state === 'paid' ? d.waitingPaymentPaid(orgName) : d.waitingPaymentBody(orgName);
			case 'approved': return d.approvedBody(orgName);
			case 'planned': return d.plannedBody(orgName);
			case 'in_progress': return d.inProgressBody;
			case 'finished': return guide.feedbackDue ? d.finishedFeedbackBody(orgName) : data.feedback?.row ? d.finishedRatedBody : d.finishedBody(orgName);
			case 'declined': return d.declinedBody;
			case 'cancelled_venue': return d.cancelledVenueBody(orgName);
			case 'cancelled_client': return d.cancelledClientBody;
			case 'expired': return d.expiredBody;
			default: return d.cancelledBody;
		}
	});

	const stepLabel = (s: ProgressStep) => {
		const d = t.myRes.detail;
		switch (s.id) {
			case 'requested': return d.stepRequested;
			case 'accepted': return s.state === 'done' ? d.stepAccepted : d.stepAcceptedWaiting;
			case 'paid': return s.state === 'done' ? d.stepPaid : s.state === 'partial' ? d.stepDepositPaid : d.stepPay;
			case 'event': return d.stepEvent;
			case 'feedback': return d.stepFeedback;
			case 'cancelled': return guide.key === 'declined' ? d.stepDeclined : guide.key === 'expired' ? d.stepExpired : d.stepCancelled;
		}
	};

	const historyText = (a: { kind: string; status: string | null }) => {
		const d = t.myRes.detail;
		switch (a.kind) {
			case 'created': return d.histCreated;
			case 'declined': return d.histDeclined;
			case 'expired': return d.histExpired;
			case 'edited': return d.histEdited;
			case 'assigned': return d.histAssigned;
			default: return d.histStatus(statusLabel(a.status ?? '', getLocale()));
		}
	};

	let eTitle = $state('');
	let eDate = $state('');
	let eSpecifyTime = $state(false);
	let eStart = $state('');
	let eEnd = $state('');
	let eGuests = $state('');
	let eNotes = $state('');

	async function startEdit() {
		eTitle = r.title;
		eDate = r.event_date;
		eSpecifyTime = !!(r.start_time || r.end_time);
		eStart = r.start_time ?? '';
		eEnd = r.end_time ?? '';
		eGuests = r.num_guests != null ? String(r.num_guests) : '';
		eNotes = r.description ?? '';
		confirmCancel = false;
		editing = true;
		await tick();
		document.getElementById('edit')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
	}

	async function goCancel() {
		confirmCancel = true;
		await tick();
		document.getElementById('cancel')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
	}

	function focusCompose(e: MouseEvent) {
		e.preventDefault();
		document.getElementById('messages')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
		(document.getElementById('compose') as HTMLTextAreaElement | null)?.focus({ preventScroll: true });
	}

	function isoLocal(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

	// Server-computed: blocks AND the days the venue is closed (they used to look free).
	const blockedStrings = $derived.by(() => {
		if (data.unavailableDates) return data.unavailableDates;
		const out: string[] = [];
		for (const b of data.blocks) {
			if (b.block_type === 'date_range' && b.date_from && b.date_to) {
				const end = new Date(b.date_to);
				for (let d = new Date(b.date_from); d <= end; d.setDate(d.getDate() + 1)) out.push(isoLocal(d));
			}
			if (b.block_type === 'weekly' && Array.isArray(b.days_of_week)) {
				const now = new Date();
				for (let i = 0; i < 540; i++) { const d = new Date(now); d.setDate(d.getDate() + i); if ((b.days_of_week as number[]).includes(d.getDay())) out.push(isoLocal(d)); }
			}
		}
		return out;
	});

	const overCapacity = $derived(!!eGuests && !!data.hall?.max_people && Number(eGuests) > data.hall.max_people);

	const fmtTime = (ts: string) =>
		formatDateTime(ts, getLocale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
	const eur = (cents: number) => formatMoney(cents, getLocale());

	/** The venue member's role, in words ('owner' was printed as the raw key). */
	const roleLabel = (role: string) =>
		role === 'owner' ? t.membersAdmin.roleOwner
		: role === 'admin' ? t.membersAdmin.roleAdmin
		: t.membersAdmin.roleMember;

	// An error is shown next to the control that caused it, and scrolled into view:
	// at the top of the page it was drawn far above where the client was looking.
	// Falls back to the top of the page when the control it belongs to is gone.
	const errorScope = $derived.by(() => {
		if (!form?.error) return null;
		const scope = (form as { scope?: string }).scope ?? 'page';
		if (scope === 'update' && !editing) return 'page';
		if (scope === 'cancel' && !data.cancellable) return 'page';
		if (scope === 'extras' && !data.extrasEditable) return 'page';
		if (scope === 'feedback' && data.feedback?.state !== 'open') return 'page';
		return scope;
	});
	function errorInView(node: HTMLElement) {
		node.scrollIntoView({ block: 'center', behavior: 'smooth' });
	}

	let threadEl: HTMLDivElement | null = $state(null);
	let sendingMsg = $state(false);
	async function scrollThread() { await tick(); if (threadEl) threadEl.scrollTop = threadEl.scrollHeight; }
	$effect(() => { if (data.thread.messages.length) scrollThread(); });
</script>

<svelte:head><title>{venueTitle(orgName, r.title)}</title></svelte:head>

{#snippet icon(name: string, size = 16)}
	<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
		{#if name === 'hourglass'}<path d="M6 2h12M6 22h12M7 2v4a5 5 0 0 0 10 0V2M7 22v-4a5 5 0 0 1 10 0v4"/>
		{:else if name === 'card'}<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>
		{:else if name === 'check'}<path d="M20 6 9 17l-5-5"/>
		{:else if name === 'calendar'}<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
		{:else if name === 'party'}<path d="M5.8 11.3 2 22l10.7-3.8M4 3h.01M22 8h.01M15 2h.01M22 20h.01M22 2l-2.2.7a2.9 2.9 0 0 0-1.9 3.4c.1.6-.3 1.2-.9 1.3L14 8M8.6 2.6l.4 1a2.9 2.9 0 0 1-1.2 3.6"/><path d="M11 13c1.9 1.9 2.8 4.1 2 4.9s-3-.1-4.9-2-2.8-4.1-2-4.9 3 .1 4.9 2Z"/>
		{:else if name === 'star'}<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>
		{:else if name === 'x'}<circle cx="12" cy="12" r="9"/><path d="m15 9-6 6M9 9l6 6"/>
		{:else if name === 'edit'}<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/>
		{:else if name === 'gift'}<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v9H5v-9M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5"/>
		{:else if name === 'layout'}<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
		{:else if name === 'sheet'}<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8"/>
		{:else if name === 'message'}<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
		{:else if name === 'search'}<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
		{:else if name === 'pin'}<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>
		{:else if name === 'clock'}<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>
		{:else if name === 'users'}<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
		{:else if name === 'tag'}<path d="M20.59 13.41 13.42 20.6a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z"/><path d="M7 7h.01"/>
		{:else if name === 'phone'}<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.18 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.1 9.9a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>
		{:else if name === 'mail'}<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>
		{:else if name === 'globe'}<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
		{:else if name === 'chev'}<path d="m9 18 6-6-6-6"/>
		{:else}<circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/>
		{/if}
	</svg>
{/snippet}

<div class="rd">
<!-- ── Lead: where you are, what this is, and how it stands ── -->
<section class="section section--lead rd-lead" use:reveal>
	<a href="/halls/my-reservations" class="back">
		<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
		{t.myRes.title}
	</a>

	<div class="section-head section-head--row head">
		<div class="head-titles">
			<p class="eyebrow">{t.nav.reservations}</p>
			<h1>{r.title}</h1>
			<p class="head-sub">{hall?.name ?? r.hall_name} · {longDate(r.event_date)}</p>
		</div>
		<div class="head-badges">
			<span class="badge {statusClass(r.status)}">{statusLabel(r.status, getLocale())}</span>
			{#if data.isPast}
				<span class="badge st-past">{t.event.past}</span>
			{:else if data.hasStarted}
				<span class="badge st-progress">{t.event.inProgress}</span>
			{/if}
		</div>
	</div>

	{#if form?.updated}<div class="toast ok"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> {t.myRes.reservationUpdated}</div>{/if}
	{#if form?.cancelled}<div class="toast ok"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> {t.myRes.reservationCancelled}</div>{/if}
	{#if errorScope === 'page'}<div class="toast err" role="alert">{form?.error}</div>{/if}
</section>

<div class="rd-grid">
	<!-- ── What the status means, and who acts next ── -->
	<section class="rd-hero tone-{guide.tone}" aria-labelledby="guide-title" use:reveal>
		<span class="hero-icon" aria-hidden="true">
			{@render icon(
				guide.key === 'pending' ? 'hourglass'
				: guide.key === 'waiting_payment' ? 'card'
				: guide.key === 'approved' ? 'check'
				: guide.key === 'planned' ? 'calendar'
				: guide.key === 'in_progress' ? 'party'
				: guide.key === 'finished' ? 'star'
				: 'x', 22)}
		</span>
		<div class="hero-body">
			<div class="hero-chips">
				{#if guide.actor === 'venue'}
					<span class="chip chip-venue">{t.myRes.detail.nextVenue}</span>
				{:else if guide.actor === 'client'}
					<span class="chip chip-you">{t.myRes.detail.nextYou}</span>
				{:else if !isCancelled}
					<span class="chip chip-venue">{t.myRes.detail.nothingToDo}</span>
				{/if}
				{#if !isCancelled && !data.isPast}<span class="chip chip-plain">{countdown}</span>{/if}
			</div>
			<h2 id="guide-title" class="hero-title">{guideTitle}</h2>
			<p class="hero-text">{guideBody}</p>
			{#if guide.key === 'pending' && data.editable}<p class="hero-text hero-sub">{t.myRes.detail.pendingCanEdit}</p>{/if}

			{#if guide.paymentDue && due}
				<p class="hero-due">
					<strong>{t.myRes.detail.payNow(eur(due.cents))}</strong>
					{#if due.dueDate}<span>{t.myRes.detail.payBy(longDate(due.dueDate))}</span>{/if}
				</p>
			{:else if guide.key === 'waiting_payment' && pay?.state !== 'paid' && !pay?.hasInstructions && !pay?.hasAmounts}
				<p class="hero-text hero-sub">{t.myRes.detail.waitingPaymentNoDetails}</p>
			{/if}

			{#if guide.key === 'declined' && r.status_reason}
				<figure class="hero-reason">
					<figcaption>{t.myRes.detail.reasonLabel}</figcaption>
					<blockquote>{r.status_reason}</blockquote>
				</figure>
			{/if}

			<div class="hero-actions">
				{#if guide.paymentDue}
					<a href="#payment" class="btn-primary">{@render icon('card', 15)} {t.myRes.detail.ctaPay}</a>
				{:else if guide.feedbackDue}
					<a href="#feedback" class="btn-primary">{@render icon('star', 15)} {t.myRes.detail.ctaFeedback}</a>
				{:else if (guide.key === 'approved' || guide.key === 'planned') && data.canManageEvent && data.hasFloorplan}
					<a href="/halls/my-reservations/{r.id}/layout" class="btn-primary">{@render icon('layout', 15)} {t.myRes.detail.ctaLayout}</a>
				{:else if isCancelled}
					<a href={bookAgainHref} class="btn-primary">{@render icon('search', 15)} {t.myRes.detail.ctaBookAgain}</a>
				{/if}
				<a href="#messages" class="btn-ghost" onclick={focusCompose}>{@render icon('message', 14)} {t.myRes.detail.ctaMessage}</a>
			</div>
		</div>
	</section>

	<!-- ── Progress: what has happened and what is still ahead ── -->
	<section class="rd-card rd-progress" aria-labelledby="progress-title" use:reveal>
		<h2 id="progress-title" class="card-title">{t.myRes.detail.progressTitle}</h2>
		<ol class="stepper">
			{#each progress as s (s.id)}
				<li class="pstep is-{s.state}">
					<span class="pdot" aria-hidden="true">
						{#if s.state === 'done'}{@render icon('check', 13)}
						{:else if s.state === 'stopped'}<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M18 6 6 18M6 6l12 12"/></svg>
						{/if}
					</span>
					<span class="ptext">
						<span class="plabel">{stepLabel(s)}</span>
						{#if s.state === 'current' || (s.state === 'partial' && !isCancelled)}<span class="pnow">{t.myRes.detail.stepNow}</span>{/if}
						{#if s.date}<span class="pdate">{shortDate(s.date)}</span>{/if}
					</span>
				</li>
			{/each}
		</ol>
	</section>

	<!-- ── Next steps: everything the client can do from here ── -->
	<section class="rd-card rd-next" aria-labelledby="next-title" use:reveal>
		<h2 id="next-title" class="card-title">{t.myRes.detail.nextTitle}</h2>
		<ul class="next-list">
			{#each steps as id (id)}
				{@render nextItem(id)}
			{/each}
		</ul>
	</section>

	<!-- ── Summary: the booking at a glance ── -->
	<aside class="rd-side" aria-label={t.myRes.detail.summaryTitle}>
		<section class="rd-card side-card" use:reveal>
			{#if hall?.coverImageUrl}
				<div class="side-photo">
					<img src={hall.coverImageUrl} srcset={imageSrcset(hall.coverImageUrl)} sizes="(max-width: 820px) 100vw, 340px" alt={hall.name} loading="lazy" />
				</div>
			{/if}
			<div class="side-hall">
				<span class="eyebrow side-eyebrow">{t.myRes.detail.summaryTitle}</span>
				<h2 class="side-name">{hall?.name ?? r.hall_name}</h2>
				{#if hall?.address}
					<p class="side-addr">{@render icon('pin', 14)} <span>{hall.address}</span></p>
				{/if}
				<div class="side-links">
					{#if hall?.slug}<a href="/halls/{hall.slug}">{t.myRes.detail.hallPage}</a>{/if}
					{#if mapHref}<a href={mapHref} target="_blank" rel="noopener noreferrer">{t.myRes.detail.openMap} ↗</a>{/if}
				</div>
			</div>

			<dl class="facts">
				<div class="fact">
					<dt>{@render icon('calendar', 15)}<span class="sr-only">{t.myRes.detail.whenLabel}</span></dt>
					<dd>
						<span class="fact-main">{formatDate(r.event_date, getLocale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
						<span class="fact-sub">{timeText}{#if !isCancelled && !data.isPast}<span class="sep" aria-hidden="true">·</span><b>{countdown}</b>{/if}</span>
					</dd>
				</div>
				<div class="fact">
					<dt>{@render icon('users', 15)}<span class="sr-only">{t.common.guests}</span></dt>
					<dd><span class="fact-main">{r.num_guests != null ? `${r.num_guests} ${t.units.guests(r.num_guests)}` : '—'}</span></dd>
				</div>
				{#if eventTypeKey}
					<div class="fact">
						<dt>{@render icon('party', 15)}<span class="sr-only">{t.myRes.detail.eventTypeLabel}</span></dt>
						<dd><span class="fact-main">{t.eventTypes[eventTypeKey]}</span></dd>
					</div>
				{/if}
				<div class="fact">
					<dt>{@render icon('tag', 15)}<span class="sr-only">{t.myRes.reference}</span></dt>
					<dd><span class="fact-sub">{t.myRes.reference}</span> <span class="mono fact-main">{r.invite_code}</span></dd>
				</div>
			</dl>

			{#if r.description}
				<div class="side-block">
					<span class="side-label">{t.myRes.notes}</span>
					<p class="side-notes">{r.description}</p>
				</div>
			{/if}

			{#if bookedExtras.lines.length > 0 && !data.extrasEditable}
				<div class="side-block">
					<span class="side-label">{t.myRes.detail.extrasLabel}</span>
					<ul class="side-lines">
						{#each bookedExtras.lines as l}
							<li><span>{l.name}{l.pricing === 'per_guest' ? ` ×${l.qty}` : ''}</span><span>{eur(l.line_cents)}</span></li>
						{/each}
						<li class="side-total"><span>{t.myRes.total}</span><b>{eur(bookedExtras.totalCents)}</b></li>
					</ul>
				</div>
			{/if}

			{#if !isCancelled && pay}
				<div class="side-block">
					<span class="side-label">{t.myRes.detail.priceTitle}</span>
					{#if pay.hasAmounts}
						<ul class="side-lines">
							{#if pay.priceCents != null}<li><span>{t.myRes.detail.priceLabel}</span><b>{eur(pay.priceCents)}</b></li>{/if}
							{#if pay.depositCents != null}
								<li>
									<span>{t.myRes.detail.depositLabel}</span>
									<span class="side-right">{eur(pay.depositCents)}
										{#if pay.depositPaidAt || pay.paidInFullAt}<small class="ok">{t.payment.statePaid}</small>
										{:else if pay.depositDueDate}<small>{t.payment.dueBy(shortDate(pay.depositDueDate))}</small>{/if}
									</span>
								</li>
							{/if}
							{#if pay.state === 'paid'}
								<li class="side-total ok"><span>{t.payment.statePaid}</span><span>{shortDate(pay.paidInFullAt ?? '')}</span></li>
							{:else if pay.state === 'deposit_paid' && pay.balanceCents != null}
								<!-- Only once something was paid: before that it is just the total again. -->
								<li class="side-total"><span>{t.myRes.detail.toPayLabel}</span><b>{eur(pay.balanceCents)}</b></li>
							{/if}
						</ul>
						{#if showPayment && pay.state !== 'paid'}<a href="#payment" class="side-more">{t.myRes.detail.ctaPay} →</a>{/if}
					{:else}
						<p class="side-muted">{t.myRes.detail.priceNotSet}</p>
					{/if}
				</div>
			{/if}

			{#if data.editable && !editing}
				<button type="button" class="btn-ghost side-edit" onclick={startEdit}>{@render icon('edit', 13)} {t.myRes.detail.editDetails}</button>
			{/if}
		</section>

		<section class="rd-card side-card contact-card" use:reveal>
			<span class="side-label">{t.myRes.detail.contactTitle}</span>
			<p class="contact-name">{orgName}</p>
			<ul class="contact-list">
				{#if hall?.contactPhone}<li><a href="tel:{hall.contactPhone}">{@render icon('phone', 14)} {hall.contactPhone}</a></li>{/if}
				{#if hall?.contactEmail}<li><a href="mailto:{hall.contactEmail}">{@render icon('mail', 14)} {hall.contactEmail}</a></li>{/if}
				{#if websiteHref}<li><a href={websiteHref} target="_blank" rel="noopener noreferrer">{@render icon('globe', 14)} {websiteHref.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a></li>{/if}
				<li><a href="#messages" onclick={focusCompose}>{@render icon('message', 14)} {t.myRes.detail.ctaMessage}</a></li>
			</ul>
		</section>
	</aside>

	<div class="rd-main">
		{#if editing}
			<section class="rd-card" id="edit">
				<h2 class="card-title">{t.myRes.detail.editDetails}</h2>
				<form method="POST" action="?/update" class="edit-form"
					use:enhance={() => async ({ result, update }) => {
						await update({ reset: false });
						if (result.type === 'success') editing = false;
						// The venue decided on it meanwhile: the form closes, the page shows the
						// booking as it is now, and the message says the edit was not saved.
						if (result.type === 'failure' && result.data?.decided) {
							editing = false;
							await invalidateAll();
						}
					}}>
					<input type="hidden" name="eventDate" value={eDate} />
					<input type="hidden" name="startTime" value={eSpecifyTime ? eStart : ''} />
					<input type="hidden" name="endTime" value={eSpecifyTime ? eEnd : ''} />

					<div class="field">
						<label for="e-title">{t.myRes.eventNameLabel} *</label>
						<input id="e-title" name="title" type="text" bind:value={eTitle} required />
					</div>

					<div class="field">
						<!-- svelte-ignore a11y_label_has_associated_control -->
						<label>{t.common.date} *</label>
						<MiniCalendar
							blockedDates={blockedStrings}
							takenDates={data.takenDates}
							heldDates={data.heldDates}
							minDate={data.earliestDate}
							fullMonths={data.fullMonths}
							selectedDate={eDate}
							onselect={(d) => eDate = d}
							showLegend={true}
						/>
						<p class="hint">{t.myRes.dateRecheckHint}</p>
					</div>

					<div class="row">
						<div class="field">
							<label for="e-guests">{t.myRes.expectedGuests}</label>
							<input id="e-guests" name="numGuests" type="number" min="1" max={data.hall?.max_people ?? undefined} bind:value={eGuests} />
							{#if overCapacity}<span class="hint err">{t.myRes.exceedsCapacity} ({data.hall?.max_people}).</span>{/if}
						</div>
						<div class="field">
							<!-- svelte-ignore a11y_label_has_associated_control -->
							<label>{t.createEvent.time}</label>
							<label class="toggle"><input type="checkbox" bind:checked={eSpecifyTime} /> <span>{t.myRes.specifyTime}</span></label>
						</div>
					</div>

					{#if eSpecifyTime}
						<div class="row">
							<div class="field"><label for="e-start">{t.createEvent.startTime}</label><input id="e-start" type="time" bind:value={eStart} /></div>
							<div class="field"><label for="e-end">{t.createEvent.endTime}</label><input id="e-end" type="time" bind:value={eEnd} /></div>
						</div>
					{/if}

					<div class="field">
						<label for="e-notes">{t.myRes.notes}</label>
						<textarea id="e-notes" name="description" rows="3" bind:value={eNotes} placeholder={t.myRes.notesPlaceholder}></textarea>
					</div>

					{#if errorScope === 'update'}
						{#key form}<div class="toast err" role="alert" use:errorInView>{form?.error}</div>{/key}
					{/if}
					<div class="edit-actions">
						<button type="button" class="btn-ghost" onclick={() => editing = false}>{t.common.cancel}</button>
						<button type="submit" class="btn-primary" disabled={!eTitle || !eDate || overCapacity}>{t.myRes.saveChanges}</button>
					</div>
				</form>
			</section>
		{/if}

		<!-- How to pay: first while payment is what the booking waits for. -->
		{#if showPayment && pay && (guide.paymentDue || r.status === 'waiting_payment')}
			{@render paymentCard()}
		{/if}

		<!-- ── Rating the finished event (D5): private to the venue ── -->
		{#if data.feedback}
			{@const fb = data.feedback}
			<section class="rd-card fb-section" id="feedback" use:reveal>
				<h2 class="card-title">{t.feedback.clientTitle}</h2>
				{#if fb.state === 'open'}<p class="card-intro">{t.feedback.clientIntro(orgName)}</p>{/if}

				{#if form?.feedbackSaved}
					<div class="toast ok" role="status"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg> {t.feedback.saved}</div>
				{/if}

				{#if fb.state === 'open' && fbEditing}
					<form method="POST" action="?/feedback" class="fb-form"
						use:enhance={() => async ({ update, result }) => { await update({ reset: false }); if (result.type === 'success') fbEditing = false; }}>
						<fieldset class="fb-stars" onmouseleave={() => (fbHover = 0)}>
							<legend>{t.feedback.ratingLabel}</legend>
							{#each [1, 2, 3, 4, 5] as n}
								<label class="fb-star" class:on={n <= fbShown} onmouseenter={() => (fbHover = n)}>
									<input type="radio" name="rating" value={n} bind:group={fbRating} required />
									<span aria-hidden="true">★</span>
									<span class="sr-only">{t.feedback.starLabel(n)}</span>
								</label>
							{/each}
						</fieldset>
						<label class="fb-label" for="fb-comment">{t.feedback.commentLabel}</label>
						<textarea id="fb-comment" name="comment" rows="4" maxlength="2000" placeholder={t.feedback.commentPlaceholder}>{fb.row?.comment ?? ''}</textarea>
						{#if errorScope === 'feedback'}
							{#key form}<div class="toast err small" role="alert" use:errorInView>{form?.error}</div>{/key}
						{/if}
						<div class="fb-actions">
							<span class="fb-note">{t.feedback.clientEditUntil(longDate(fb.deadline))}</span>
							{#if fb.row}<button type="button" class="btn-ghost" onclick={() => { fbEditing = false; fbRating = fb.row?.rating ?? 0; }}>{t.common.cancel}</button>{/if}
							<button type="submit" class="btn-primary" disabled={!fbRating}>{fb.row ? t.feedback.update : t.feedback.submit}</button>
						</div>
					</form>
				{:else if fb.row}
					<div class="fb-given">
						<div class="fb-given-stars" role="img" aria-label={t.feedback.starLabel(fb.row.rating)}>
							{#each [1, 2, 3, 4, 5] as n}<span class:on={n <= fb.row.rating} aria-hidden="true">★</span>{/each}
						</div>
						{#if fb.row.comment}<p class="fb-given-comment">{fb.row.comment}</p>{/if}
						<div class="fb-actions">
							<span class="fb-note">{fb.state === 'open' ? t.feedback.clientEditUntil(longDate(fb.deadline)) : t.feedback.clientThanks}</span>
							{#if fb.state === 'open'}<button type="button" class="btn-ghost" onclick={() => (fbEditing = true)}>{t.feedback.edit}</button>{/if}
						</div>
					</div>
				{/if}
			</section>
		{/if}

		<!-- Extras: changeable until the venue confirms; afterwards the summary lists them. -->
		{#if data.extrasEditable && data.extras.length > 0}
			<section class="rd-card extras-box" id="extras" use:reveal>
				<h2 class="card-title">{t.myRes.extras}</h2>
				<form method="POST" action="?/editExtras" use:enhance={() => async ({ result, update }) => { await update(); if (result.type === 'failure' && result.data?.decided) await invalidateAll(); }}>
					<div class="row-list">
						{#each data.extras as ex}
							{@const on = extraSel.includes(ex.id)}
							<label class="row-item x-row" class:on>
								<input type="checkbox" checked={on} onchange={() => toggleExtra(ex.id)} />
								<span class="x-main">
									<span class="x-name">{ex.name}</span>
									{#if ex.description}<span class="x-desc">{ex.description}</span>{/if}
									{#if ex.retired}<span class="x-desc">{t.myRes.extraRetired}</span>{/if}
								</span>
								<span class="x-price">{eur(ex.price_cents)}{ex.pricing === 'per_guest' ? ` ${t.myRes.perGuest}` : ''}</span>
							</label>
							{#if on}<input type="hidden" name="extras" value={ex.id} />{/if}
						{/each}
					</div>
					<div class="x-foot">
						<span class="x-total">{t.myRes.total} <b>{eur(extrasOverview.totalCents)}</b></span>
						<button type="submit" class="btn-accent-sm">{t.myRes.saveExtras}</button>
					</div>
				</form>
				{#if form?.extrasSaved}<span class="x-saved">{t.myRes.saved}</span>{/if}
				{#if errorScope === 'extras'}
					{#key form}<div class="toast err small" role="alert" use:errorInView>{form?.error}</div>{/key}
				{/if}
			</section>
		{/if}

		<!-- Paid in full: the summary says so; the account details are no longer needed. -->
		{#if showPayment && pay && pay.state !== 'paid' && !(guide.paymentDue || r.status === 'waiting_payment')}
			{@render paymentCard()}
		{/if}

		<!-- ── The conversation with the venue ── -->
		<section class="rd-card msg-section" id="messages" use:reveal>
			<div class="card-head">
				<h2 class="card-title">{t.nav.messages}</h2>
				<span class="msg-with">{t.myRes.with} {orgName}</span>
			</div>

			<div class="thread" bind:this={threadEl}>
				{#if data.thread.messages.length === 0}
					<div class="thread-empty">
						<span class="icon-tile" aria-hidden="true">
							<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
						</span>
						<p>{t.myRes.noMessagesPrefix} {orgName} {t.myRes.noMessagesSuffix}</p>
					</div>
				{:else}
					{#each data.thread.messages as m}
						{#if m.message_type === 'system'}
							<div class="sys">{m.body}</div>
						{:else}
							{@const mine = m.sender_id === r.user_id}
							<div class="msg" class:mine>
								<div class="bubble">
									{#if !mine}<span class="msg-name">{m.sender_first_name} {m.sender_last_name}{#if m.sender_role}<span class="msg-role">{roleLabel(m.sender_role)}</span>{/if}</span>{/if}
									{#if m.body}<span class="msg-body">{m.body}</span>{/if}
									{#if m.attachment_url?.startsWith('/uploads/')}
										<!-- Attachments the venue sends (images uploaded from the staff inbox). -->
										<a class="msg-att" href={m.attachment_url} target="_blank" rel="noopener noreferrer">
											{#if m.attachment_type?.startsWith('image/')}
												<img src={m.attachment_url} alt={m.attachment_name ?? ''} loading="lazy" />
											{:else}
												{m.attachment_name ?? m.attachment_url}
											{/if}
										</a>
									{/if}
									<span class="msg-time">{fmtTime(m.created_at)}</span>
								</div>
							</div>
						{/if}
					{/each}
				{/if}
			</div>

			{#if form?.msgError}<div class="toast err small">{form.msgError}</div>{/if}

			<form method="POST" action="?/sendMessage" class="compose" use:enhance={() => { sendingMsg = true; return async ({ update }) => { await update(); sendingMsg = false; scrollThread(); }; }}>
				<textarea id="compose" name="body" rows="2" maxlength="5000" placeholder="{t.myRes.composePlaceholder} {orgName}…" aria-label="{t.myRes.composePlaceholder} {orgName}" required></textarea>
				<!-- Disabled while sending: a double click stored the message twice. -->
				<button type="submit" class="btn-primary send" disabled={sendingMsg}>
					<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
					{t.messaging.send}
				</button>
			</form>
		</section>

		<!-- History: what happened to the booking, and when. -->
		{#if data.activity.length > 0}
			<details class="rd-card history">
				<summary class="card-title">{t.myRes.detail.historyTitle}<span class="hist-count">{data.activity.length}</span></summary>
				<ol class="hist-list">
					{#each [...data.activity].reverse() as a}
						<li>
							<time>{fmtTime(a.created_at)}</time>
							<span>{historyText(a)}{#if a.kind !== 'expired'} · <span class="hist-who">{a.by_me ? t.myRes.detail.byYou : t.myRes.detail.byVenue}</span>{/if}</span>
						</li>
					{/each}
				</ol>
			</details>
		{/if}

		<!-- Cancelling, with the venue's notice period; or why it is no longer possible. -->
		{#if data.cancellable}
			<section class="rd-card danger-zone" id="cancel">
				{#if !confirmCancel}
					<div class="dz-row">
						<div>
							<span class="dz-title">{t.myRes.cancelThisReservation}</span>
							<span class="dz-sub">{t.myRes.cancelFreesDate} {orgName}.</span>
							{#if data.cancelDeadline}
								<span class="dz-sub">{t.myRes.freeCancelUntil} {longDate(data.cancelDeadline)}.</span>
							{/if}
						</div>
						<button type="button" class="btn-danger-outline" onclick={() => confirmCancel = true}>{t.event.cancelReservation}</button>
					</div>
				{:else}
					<div class="dz-confirm">
						<span>{t.myRes.cancelConfirmPrefix} <strong>{r.title}</strong>? {t.myRes.cantBeUndone}</span>
						<div class="dz-confirm-actions">
							<button type="button" class="btn-ghost" onclick={() => confirmCancel = false}>{t.myRes.keepIt}</button>
							<form method="POST" action="?/cancel" use:enhance={() => async ({ result, update }) => { await update(); confirmCancel = false; if (result.type === 'failure' && result.data?.decided) await invalidateAll(); }}>
								<button type="submit" class="btn-danger">{t.myRes.yesCancel}</button>
							</form>
						</div>
					</div>
				{/if}
				{#if errorScope === 'cancel'}
					{#key form}<div class="toast err" role="alert" use:errorInView>{form?.error}</div>{/key}
				{/if}
			</section>
		{:else if !isCancelled && !data.isPast && r.status !== 'completed'}
			{#if data.hasStarted}
				<p class="status-note">{t.event.startedLocked}</p>
			{:else if data.cancelWindowClosed && data.cancelDeadline}
				<!-- The notice period has passed: say so instead of offering a Cancel button
				     that the server would refuse. -->
				<p class="status-note">{t.myRes.cancelWindowClosed.replace('{date}', longDate(data.cancelDeadline))}</p>
			{:else if !data.editable}
				<p class="status-note">{t.myRes.lockedNotePrefix} {t.myRes.lockedNoteStatus(statusLabel(r.status, getLocale()))} {t.myRes.lockedNoteMid} {orgName} {t.myRes.lockedNoteSuffix}</p>
			{/if}
		{/if}
	</div>
</div>
</div>

{#snippet nextItem(id: StepId)}
	{@const d = t.myRes.detail}
	{#if id === 'wait'}
		<li class="next-item is-info">
			<span class="next-icon">{@render icon('hourglass')}</span>
			<span class="next-text"><span class="next-label">{d.stepWait}</span><span class="next-hint">{d.stepWaitHint}</span></span>
		</li>
	{:else if id === 'pay'}
		<li><a class="next-item is-key" href="#payment">
			<span class="next-icon">{@render icon('card')}</span>
			<span class="next-text">
				<span class="next-label">{due ? d.payNow(eur(due.cents)) : t.payment.clientTitle}</span>
				<span class="next-hint">{due?.dueDate ? d.payBy(longDate(due.dueDate)) : d.stepPayHint}</span>
			</span>
			<span class="next-chev">{@render icon('chev', 15)}</span>
		</a></li>
	{:else if id === 'feedback'}
		<li><a class="next-item is-key" href="#feedback">
			<span class="next-icon">{@render icon('star')}</span>
			<span class="next-text"><span class="next-label">{d.ctaFeedback}</span>{#if data.feedback}<span class="next-hint">{d.stepFeedbackHint(longDate(data.feedback.deadline))}</span>{/if}</span>
			<span class="next-chev">{@render icon('chev', 15)}</span>
		</a></li>
	{:else if id === 'layout'}
		<li><a class="next-item" class:is-key={guide.key === 'approved'} href="/halls/my-reservations/{r.id}/layout">
			<span class="next-icon">{@render icon('layout')}</span>
			<span class="next-text"><span class="next-label">{d.stepLayout}</span><span class="next-hint">{d.stepLayoutHint}</span></span>
			<span class="next-chev">{@render icon('chev', 15)}</span>
		</a></li>
	{:else if id === 'manifest'}
		<li><a class="next-item" href="/halls/my-reservations/{r.id}/manifest">
			<span class="next-icon">{@render icon('sheet')}</span>
			<span class="next-text"><span class="next-label">{d.stepManifest}</span><span class="next-hint">{d.stepManifestHint}</span></span>
			<span class="next-chev">{@render icon('chev', 15)}</span>
		</a></li>
	{:else if id === 'editDetails'}
		<li><button type="button" class="next-item" onclick={startEdit}>
			<span class="next-icon">{@render icon('edit')}</span>
			<span class="next-text"><span class="next-label">{d.stepEditDetails}</span><span class="next-hint">{d.stepEditDetailsHint}</span></span>
			<span class="next-chev">{@render icon('chev', 15)}</span>
		</button></li>
	{:else if id === 'extras'}
		<li><a class="next-item" href="#extras">
			<span class="next-icon">{@render icon('gift')}</span>
			<span class="next-text"><span class="next-label">{d.stepExtras}</span><span class="next-hint">{d.stepExtrasHint}</span></span>
			<span class="next-chev">{@render icon('chev', 15)}</span>
		</a></li>
	{:else if id === 'message'}
		<li><a class="next-item" href="#messages" onclick={focusCompose}>
			<span class="next-icon">{@render icon('message')}</span>
			<span class="next-text"><span class="next-label">{d.stepMessage}</span><span class="next-hint">{d.stepMessageHint}</span></span>
			<span class="next-chev">{@render icon('chev', 15)}</span>
		</a></li>
	{:else if id === 'calendar'}
		<li><a class="next-item" href="/halls/my-reservations/{r.id}/calendar.ics" download>
			<span class="next-icon">{@render icon('calendar')}</span>
			<span class="next-text"><span class="next-label">{d.stepCalendar}</span><span class="next-hint">{d.stepCalendarHint}</span></span>
			<span class="next-chev">{@render icon('chev', 15)}</span>
		</a></li>
	{:else if id === 'cancel'}
		<li><button type="button" class="next-item is-danger" onclick={goCancel}>
			<span class="next-icon">{@render icon('x')}</span>
			<span class="next-text"><span class="next-label">{d.stepCancel}</span><span class="next-hint">{data.cancelDeadline ? d.stepCancelUntil(longDate(data.cancelDeadline)) : d.stepCancelAnytime}</span></span>
			<span class="next-chev">{@render icon('chev', 15)}</span>
		</button></li>
	{:else if id === 'bookAgain'}
		<li><a class="next-item is-key" href={bookAgainHref}>
			<span class="next-icon">{@render icon('search')}</span>
			<span class="next-text"><span class="next-label">{d.ctaBookAgain}</span><span class="next-hint">{d.stepBookAgainHint}</span></span>
			<span class="next-chev">{@render icon('chev', 15)}</span>
		</a></li>
	{/if}
{/snippet}

{#snippet paymentCard()}
	{#if pay}
		<section class="rd-card pay-box" class:pay-due={awaitingPayment || guide.paymentDue} id="payment" use:reveal>
			<h2 class="card-title">{t.payment.clientTitle}</h2>
			{#if awaitingPayment}
				<p class="pay-lead">{pay.hasInstructions || pay.hasAmounts ? t.payment.clientWaiting : t.payment.clientWaitingNoDetails}</p>
			{/if}
			{#if due && (awaitingPayment || guide.paymentDue)}
				<div class="pay-due-figure">
					<span class="pay-amount">{eur(due.cents)}</span>
					<span class="pay-what">{due.kind === 'deposit' ? t.myRes.detail.depositLabel : due.kind === 'balance' ? t.myRes.detail.toPayLabel : t.myRes.detail.priceLabel}{#if due.dueDate}<span class="sep" aria-hidden="true">·</span>{t.myRes.detail.payBy(longDate(due.dueDate))}{/if}</span>
				</div>
			{/if}
			{#if pay.hasAny}
				<dl class="detail-list pay-list">
					{#if pay.priceCents != null}<div><dt>{t.myRes.detail.priceLabel}</dt><dd>{eur(pay.priceCents)}</dd></div>{/if}
					{#if pay.depositCents != null}
						<div>
							<dt>{t.myRes.detail.depositLabel}</dt>
							<dd>{eur(pay.depositCents)}{#if pay.depositDueDate && !pay.depositPaidAt && !pay.paidInFullAt}<span class="pay-sub">{t.payment.dueBy(longDate(pay.depositDueDate))}</span>{/if}</dd>
						</div>
					{/if}
					{#if pay.state === 'paid'}
						<div><dt>{t.payment.statePaid}</dt><dd class="pay-ok">{t.payment.paidOn(formatDate(pay.paidInFullAt, getLocale()))}</dd></div>
					{:else if pay.state === 'deposit_paid'}
						<div><dt>{t.payment.stateDepositPaid}</dt><dd class="pay-ok">{formatDate(pay.depositPaidAt, getLocale())}</dd></div>
						{#if pay.balanceCents != null}<div><dt>{t.payment.balance}</dt><dd>{eur(pay.balanceCents)}</dd></div>{/if}
					{/if}
					{#if pay.state !== 'paid'}
						{#if pay.iban}
							<div class="full">
								<dt>{t.payment.iban}</dt>
								<dd class="pay-copyrow">
									<span class="mono">{formatIban(pay.iban)}</span>
									<button type="button" class="pay-copy" onclick={() => copyValue('iban', pay.iban ?? '')}>{copiedKey === 'iban' ? t.payment.copied : t.payment.copy}</button>
								</dd>
							</div>
						{/if}
						{#if pay.recipient}<div><dt>{t.payment.recipient}</dt><dd>{pay.recipient}</dd></div>{/if}
						{#if pay.bic}<div><dt>{t.payment.bic}</dt><dd class="mono">{pay.bic}</dd></div>{/if}
						{#if pay.variableSymbol}
							<div>
								<dt>{t.payment.variableSymbol}</dt>
								<dd class="pay-copyrow">
									<span class="mono">{pay.variableSymbol}</span>
									<button type="button" class="pay-copy" onclick={() => copyValue('vs', pay.variableSymbol ?? '')}>{copiedKey === 'vs' ? t.payment.copied : t.payment.copy}</button>
								</dd>
							</div>
						{/if}
						{#if pay.note}<div class="full"><dt>{t.payment.note}</dt><dd class="pay-note">{pay.note}</dd></div>{/if}
					{/if}
				</dl>
			{/if}
			<p class="x-note">{t.payment.clientDisclaimer(orgName)}</p>
		</section>
	{/if}
{/snippet}

<style>
	/* The page measures itself: two columns where there is room, one on a phone. */
	.rd { container-type: inline-size; container-name: rd; min-width: 0; }

	.back { display: inline-flex; align-items: center; gap: 5px; font-size: 13px; color: var(--text-muted); text-decoration: none; font-weight: 500; width: fit-content; margin-bottom: 18px; }
	.back:hover { color: var(--text-base); }

	/* The page title takes the density display scale, as every other page h1 does;
	   app.css gives h1 its tracking but no size. */
	h1 { font-size: var(--display-size); margin: 0; overflow-wrap: anywhere; }

	.rd-lead { padding-bottom: 22px; }
	.head { align-items: flex-start; margin-bottom: 0; }
	.head-titles { min-width: 0; }
	.head-sub { font-size: 13px; color: var(--text-muted); margin: 6px 0 0; }

	.badge { padding: 4px 11px; border-radius: 3px; font-size: 12px; font-weight: 650; white-space: nowrap; flex-shrink: 0; }
	.st-warning { background: var(--warning-dim); color: var(--warning); }
	.st-success { background: var(--success-dim); color: var(--success); }
	/* Labels on the accent tint, so --accent-ink rather than the fill colour. */
	.st-info    { background: var(--accent-dim); color: var(--accent-ink); }
	.st-muted   { background: var(--bg-hover); color: var(--text-muted); }
	.st-danger  { background: var(--danger-dim); color: var(--danger); }
	.st-past     { background: var(--bg-hover); color: var(--text-muted); border: 1px solid var(--border); }
	.st-progress { background: var(--accent-dim); color: var(--accent-ink); }
	.head-badges { display: flex; align-items: center; gap: 6px; flex-shrink: 0; flex-wrap: wrap; justify-content: flex-end; }

	/* ── Layout ── */
	.rd-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 320px;
		grid-template-rows: auto auto auto 1fr;
		grid-template-areas: 'hero side' 'progress side' 'next side' 'main side';
		gap: 18px 26px;
		align-items: start;
		padding-bottom: 12px;
	}
	.rd-hero { grid-area: hero; }
	.rd-progress { grid-area: progress; }
	.rd-next { grid-area: next; }
	.rd-side { grid-area: side; display: flex; flex-direction: column; gap: 18px; min-width: 0; }
	.rd-main { grid-area: main; display: flex; flex-direction: column; gap: 18px; min-width: 0; }

	@container rd (max-width: 820px) {
		.rd-grid { grid-template-columns: minmax(0, 1fr); grid-template-rows: none; grid-template-areas: 'hero' 'progress' 'next' 'side' 'main'; gap: 14px; }
	}

	.rd-card {
		background: var(--bg-panel); border: 1px solid var(--border); border-radius: var(--radius-lg);
		padding: 20px 22px; min-width: 0;
	}
	.card-title { font-size: 15px; font-weight: 650; letter-spacing: -.02em; margin: 0 0 14px; color: var(--text-base); }
	.card-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
	.card-head .card-title { margin: 0; }
	.card-intro { font-size: 13px; color: var(--text-muted); margin: -6px 0 14px; line-height: 1.6; }

	/* ── Status hero ── */
	.rd-hero {
		--tone: var(--accent); --tone-dim: var(--accent-dim); --tone-ink: var(--accent-ink);
		display: flex; gap: 16px; align-items: flex-start;
		padding: 22px 24px; border-radius: var(--radius-lg);
		background: var(--tone-dim);
		border: 1px solid color-mix(in srgb, var(--tone) 32%, transparent);
		min-width: 0;
	}
	.tone-warning { --tone: var(--warning); --tone-dim: var(--warning-dim); --tone-ink: var(--warning); }
	.tone-success { --tone: var(--success); --tone-dim: var(--success-dim); --tone-ink: var(--success); }
	.tone-danger  { --tone: var(--danger);  --tone-dim: var(--danger-dim);  --tone-ink: var(--danger); }
	.tone-muted   { --tone: var(--text-subtle); --tone-dim: var(--bg-hover); --tone-ink: var(--text-muted); }
	.hero-icon {
		flex-shrink: 0; width: 44px; height: 44px; border-radius: 50%;
		display: grid; place-items: center; color: var(--tone-ink);
		background: color-mix(in srgb, var(--tone) 16%, var(--bg-panel));
		border: 1px solid color-mix(in srgb, var(--tone) 30%, transparent);
	}
	.hero-body { flex: 1; min-width: 0; }
	.hero-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
	.chip { font-size: 11px; font-weight: 650; letter-spacing: .02em; padding: 3px 9px; border-radius: 999px; white-space: nowrap; }
	.chip-venue { background: var(--bg-panel); color: var(--text-muted); border: 1px solid var(--border); }
	/* "Your move": the strongest ink on the page, readable on every tone and theme. */
	.chip-you { background: var(--text-base); color: var(--bg-panel); }
	.chip-plain { background: color-mix(in srgb, var(--bg-panel) 70%, transparent); color: var(--text-base); border: 1px solid var(--border-subtle); }
	.hero-title { font-size: clamp(19px, 2.2vw, 24px); font-weight: 650; letter-spacing: -.03em; line-height: 1.2; margin: 0 0 8px; color: var(--text-base); }
	.hero-text { font-size: 14px; line-height: 1.65; color: var(--text-base); margin: 0; max-width: 62ch; }
	.hero-sub { color: var(--text-muted); margin-top: 6px; font-size: 13px; }
	.hero-due { margin: 12px 0 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; font-size: 15px; }
	.hero-due strong { font-size: 18px; font-weight: 700; color: var(--text-base); }
	.hero-due span { color: var(--text-muted); font-size: 13.5px; }
	.hero-reason { margin: 14px 0 0; padding: 12px 14px; border-radius: var(--radius); background: var(--bg-panel); border: 1px solid var(--border); }
	.hero-reason figcaption { font-size: 10.5px; font-weight: 650; text-transform: uppercase; letter-spacing: .1em; color: var(--text-subtle); margin-bottom: 4px; }
	.hero-reason blockquote { margin: 0; font-size: 14px; line-height: 1.6; white-space: pre-line; overflow-wrap: anywhere; color: var(--text-base); }
	.hero-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
	.hero-actions .btn-ghost { background: var(--bg-panel); padding: 9px 14px; font-size: 13px; text-decoration: none; }

	/* ── Progress stepper ── */
	.stepper { list-style: none; margin: 0; padding: 0; display: flex; }
	.pstep { flex: 1 1 0; min-width: 0; position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 8px; padding-right: 8px; }
	/* The line to the next step. */
	.pstep:not(:last-child)::after {
		content: ''; position: absolute; top: 11px; left: 30px; right: 6px; height: 2px; border-radius: 1px;
		background: var(--border);
	}
	.pstep.is-done:not(:last-child)::after { background: var(--success); }
	.pdot {
		width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; flex-shrink: 0;
		border: 2px solid var(--border); background: var(--bg-panel); color: var(--bg-panel); position: relative; z-index: 1;
	}
	.is-done .pdot { background: var(--success); border-color: var(--success); color: var(--bg-panel); }
	.is-current .pdot { border-color: var(--accent); box-shadow: 0 0 0 4px var(--accent-dim); }
	.is-current .pdot::after { content: ''; width: 8px; height: 8px; border-radius: 50%; background: var(--accent); }
	.is-partial .pdot { border-color: var(--success); background: linear-gradient(90deg, var(--success) 50%, var(--bg-panel) 50%); box-shadow: 0 0 0 4px var(--success-dim); }
	.is-stopped .pdot { background: var(--danger); border-color: var(--danger); color: var(--on-danger); }
	.ptext { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
	.plabel { font-size: 12.5px; font-weight: 600; color: var(--text-muted); line-height: 1.3; }
	.is-done .plabel, .is-current .plabel, .is-partial .plabel { color: var(--text-base); }
	.is-stopped .plabel { color: var(--danger); }
	.pnow { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; color: var(--accent-ink); }
	.pdate { font-size: 11.5px; color: var(--text-subtle); }

	@container rd (max-width: 560px) {
		.stepper { flex-direction: column; gap: 0; }
		.pstep { flex-direction: row; align-items: flex-start; gap: 12px; padding: 0 0 16px; }
		.pstep:last-child { padding-bottom: 0; }
		.pstep:not(:last-child)::after { top: 28px; bottom: 2px; left: 11px; right: auto; width: 2px; height: auto; }
		.ptext { flex-direction: row; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; padding-top: 3px; }
	}

	/* ── Next steps ── */
	.next-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
	.next-list > li + li { border-top: 1px solid var(--border-subtle); }
	.next-item {
		display: flex; align-items: center; gap: 12px; width: 100%; padding: 11px 4px;
		background: none; border: none; text-align: left; font: inherit; color: inherit; cursor: pointer;
		text-decoration: none; border-radius: var(--radius-sm); transition: background .15s;
	}
	a.next-item:hover, button.next-item:hover { background: var(--bg-hover); text-decoration: none; }
	.next-item.is-info { cursor: default; }
	.next-icon {
		flex-shrink: 0; width: 34px; height: 34px; border-radius: var(--radius); display: grid; place-items: center;
		background: var(--bg-hover); color: var(--text-muted);
	}
	.is-key .next-icon { background: var(--accent); color: var(--accent-contrast); }
	.is-info .next-icon { background: var(--warning-dim); color: var(--warning); }
	.is-danger .next-icon { background: var(--danger-dim); color: var(--danger); }
	.next-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
	.next-label { font-size: 13.5px; font-weight: 600; color: var(--text-base); }
	.is-key .next-label { color: var(--accent-ink); }
	.is-danger .next-label { color: var(--danger); }
	.next-hint { font-size: 12px; color: var(--text-muted); line-height: 1.45; }
	.next-chev { color: var(--text-subtle); flex-shrink: 0; display: flex; }

	/* ── Side summary ── */
	.side-card { padding: 0; overflow: hidden; }
	.side-card > :not(.side-photo) { margin-left: 20px; margin-right: 20px; }
	.side-photo { aspect-ratio: 16 / 9; background: var(--bg-hover); }
	.side-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
	.side-hall { padding-top: 18px; }
	.side-eyebrow { display: block; color: var(--text-subtle); margin-bottom: 6px; }
	.side-name { font-size: 17px; font-weight: 650; letter-spacing: -.03em; margin: 0; }
	.side-addr { display: flex; gap: 6px; align-items: flex-start; font-size: 12.5px; color: var(--text-muted); margin: 8px 0 0; line-height: 1.5; }
	.side-addr :global(svg) { flex-shrink: 0; margin-top: 2px; }
	.side-links { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 8px; font-size: 12.5px; font-weight: 600; }
	.side-links a { color: var(--accent-ink); }
	.facts { margin-top: 16px; margin-bottom: 0; padding-top: 14px; border-top: 1px solid var(--border-subtle); display: flex; flex-direction: column; gap: 12px; }
	.fact { display: flex; gap: 11px; align-items: flex-start; }
	.fact dt { color: var(--text-subtle); padding-top: 1px; flex-shrink: 0; }
	.fact dd { margin: 0; display: flex; flex-direction: column; gap: 1px; min-width: 0; }
	.fact-main { font-size: 13.5px; font-weight: 600; color: var(--text-base); }
	.fact-sub { font-size: 12.5px; color: var(--text-muted); }
	.fact-sub b { font-weight: 650; color: var(--accent-ink); }
	.fact-sub .sep { margin: 0 6px; }
	.side-block { margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--border-subtle); }
	.side-label { display: block; font-size: 10.5px; font-weight: 650; text-transform: uppercase; letter-spacing: .12em; color: var(--text-subtle); margin-bottom: 8px; }
	.side-notes { font-size: 13px; line-height: 1.55; margin: 0; white-space: pre-line; overflow-wrap: anywhere; }
	.side-lines { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
	.side-lines li { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; color: var(--text-muted); }
	.side-lines li > span:first-child { min-width: 0; overflow-wrap: anywhere; }
	.side-lines b { font-weight: 650; color: var(--text-base); white-space: nowrap; }
	.side-right { display: flex; flex-direction: column; align-items: flex-end; white-space: nowrap; color: var(--text-base); }
	.side-right small { font-size: 11px; color: var(--text-muted); }
	.side-right small.ok, .side-total.ok { color: var(--success); }
	.side-total { padding-top: 6px; border-top: 1px dashed var(--border); color: var(--text-base) !important; font-weight: 600; }
	.side-more { display: inline-block; margin-top: 10px; font-size: 12.5px; font-weight: 600; color: var(--accent-ink); }
	.side-muted { font-size: 12.5px; color: var(--text-muted); margin: 0; }
	.side-edit { margin-top: 16px; margin-bottom: 20px; }
	.side-card > :last-child:not(.side-edit) { margin-bottom: 20px; }
	.contact-card { padding: 18px 0 18px; }
	.contact-card > :last-child { margin-bottom: 0 !important; }
	.contact-name { font-size: 14px; font-weight: 650; margin: 0 0 8px; }
	.contact-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
	.contact-list a { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-base); text-decoration: none; overflow-wrap: anywhere; }
	.contact-list a:hover { color: var(--accent-ink); }
	.contact-list :global(svg) { color: var(--text-subtle); flex-shrink: 0; }

	/* ── History ── */
	.history summary { cursor: pointer; list-style: none; display: flex; align-items: center; gap: 8px; margin: 0; }
	.history summary::-webkit-details-marker { display: none; }
	.history summary::after { content: '▾'; margin-left: auto; color: var(--text-subtle); transition: transform .15s; }
	.history[open] summary::after { transform: rotate(180deg); }
	.hist-count { font-size: 11px; font-weight: 650; padding: 0 6px; border-radius: 3px; background: var(--bg-hover); color: var(--text-subtle); }
	.hist-list { list-style: none; margin: 14px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
	.hist-list li { display: grid; grid-template-columns: 120px 1fr; gap: 10px; font-size: 12.5px; color: var(--text-base); }
	.hist-list time { color: var(--text-subtle); }
	.hist-who { color: var(--text-muted); }
	@container rd (max-width: 480px) { .hist-list li { grid-template-columns: 1fr; gap: 0; } }

	/* ── Rating card ── */
	.fb-form { display: flex; flex-direction: column; gap: 8px; max-width: 560px; }
	.fb-stars { display: flex; gap: 4px; border: none; margin: 0 0 6px; padding: 0; }
	.fb-stars legend { font-size: 12.5px; font-weight: 600; color: var(--text-base); margin-bottom: 6px; padding: 0; }
	.fb-star { position: relative; cursor: pointer; font-size: 30px; line-height: 1; color: var(--border); transition: color .12s, transform .12s; }
	.fb-star.on { color: var(--warning); }
	.fb-star:hover { transform: scale(1.08); }
	.fb-star input { position: absolute; opacity: 0; width: 1px; height: 1px; }
	.fb-star:has(input:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px; }
	.fb-label { font-size: 12.5px; font-weight: 600; color: var(--text-base); }
	.fb-form textarea { resize: vertical; }
	.fb-actions { display: flex; align-items: center; justify-content: flex-end; gap: 10px; flex-wrap: wrap; margin-top: 6px; }
	.fb-note { font-size: 12px; color: var(--text-muted); margin-right: auto; }
	.fb-given-stars { font-size: 24px; color: var(--border); display: flex; gap: 3px; }
	.fb-given-stars .on { color: var(--warning); }
	.fb-given-comment { font-size: 14px; line-height: 1.6; margin: 10px 0 0; white-space: pre-line; overflow-wrap: anywhere; }
	.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }

	.toast { display: flex; align-items: center; gap: 9px; padding: 10px 14px; border-radius: var(--radius); font-size: 13px; font-weight: 600; margin-top: 16px; }
	.toast.ok { color: var(--success); background: var(--success-dim); border: 1px solid color-mix(in srgb, var(--success) 30%, transparent); }
	.toast.err { color: var(--danger); background: var(--danger-dim); border: 1px solid color-mix(in srgb, var(--danger) 30%, transparent); }
	.toast.small { padding: 8px 12px; font-size: 12.5px; }

	.msg-with { font-size: 12px; color: var(--text-subtle); }

	.btn-ghost { display: inline-flex; align-items: center; gap: 6px; padding: 6px 13px; border-radius: var(--radius-sm); background: none; border: 1px solid var(--border); color: var(--text-muted); font-size: 12.5px; font-weight: 600; cursor: pointer; font-family: inherit; transition: background .15s, color .15s; text-decoration: none; }
	.btn-ghost:hover { background: var(--bg-hover); color: var(--text-base); text-decoration: none; }
	/* Primary action: --accent-contrast on the accent fill, plus the signature lift. */
	.btn-primary { display: inline-flex; align-items: center; justify-content: center; gap: 7px; padding: 10px 20px; border-radius: var(--radius-sm); background: var(--accent); color: var(--accent-contrast); font-size: 13px; font-weight: 650; border: none; cursor: pointer; font-family: inherit; text-decoration: none; transition: transform .2s, background .2s; }
	.btn-primary:hover:not(:disabled) { background: var(--accent-hover); transform: translateY(-2px); text-decoration: none; }
	.btn-primary:active:not(:disabled) { transform: translateY(0); }
	.btn-primary:disabled { opacity: .5; cursor: not-allowed; }

	.detail-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 16px 24px; margin: 0; }
	.detail-list .full { grid-column: 1 / -1; }
	/* Eyebrow metrics on a data label — muted ink, since it is not a section overline. */
	.detail-list dt { font-size: 10px; font-weight: 650; text-transform: uppercase; letter-spacing: .13em; color: var(--text-subtle); margin-bottom: 4px; }
	.detail-list dd { font-size: 14px; color: var(--text-base); margin: 0; line-height: 1.5; overflow-wrap: anywhere; }
	.mono { font-family: ui-monospace, monospace; letter-spacing: .02em; }

	/* Price and payment: while the booking waits for payment it carries the warning
	   tint, since that is what the client must act on. */
	.pay-box.pay-due { background: color-mix(in srgb, var(--warning-dim) 70%, var(--bg-panel)); border-color: color-mix(in srgb, var(--warning) 35%, transparent); }
	.pay-lead { font-size: 13.5px; font-weight: 600; color: var(--text-base); margin: -4px 0 14px; }
	.pay-due-figure { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; margin: 0 0 18px; padding: 14px 16px; border-radius: var(--radius); background: var(--bg-panel); border: 1px solid var(--border); }
	.pay-amount { font-size: 26px; font-weight: 700; letter-spacing: -.03em; color: var(--text-base); }
	.pay-what { font-size: 13px; color: var(--text-muted); }
	.pay-what .sep { margin: 0 6px; }
	.pay-list { margin-bottom: 4px; }
	.pay-sub { display: block; font-size: 12px; color: var(--text-muted); }
	.pay-ok { color: var(--success); font-weight: 600; }
	.pay-note { white-space: pre-line; overflow-wrap: anywhere; }
	.pay-copyrow { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
	.pay-copy {
		padding: 2px 9px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-panel);
		color: var(--text-muted); font: inherit; font-size: 11.5px; font-weight: 600; cursor: pointer;
	}
	.pay-copy:hover { color: var(--text-base); background: var(--bg-hover); }

	.extras-box form { display: flex; flex-direction: column; }
	.x-row { cursor: pointer; }
	.x-row.on .x-name { color: var(--accent-ink); }
	.x-row input { width: 16px; height: 16px; flex-shrink: 0; margin: 0; }
	.x-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
	.x-name { font-size: 13px; font-weight: 600; }
	.x-desc { font-size: 11.5px; color: var(--text-muted); }
	.x-price { font-size: 13px; font-weight: 650; white-space: nowrap; }
	.x-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-top: 14px; }
	/* Saving extras is a secondary commit inside the section: the accent tint, not the fill. */
	.btn-accent-sm {
		flex-shrink: 0; padding: 7px 14px; border-radius: var(--radius-sm);
		background: var(--accent-dim); border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent);
		color: var(--accent-ink); font-size: 12.5px; font-weight: 650;
		cursor: pointer; font-family: inherit; transition: background .15s;
	}
	.btn-accent-sm:hover { background: color-mix(in srgb, var(--accent) 18%, transparent); }
	.x-total { font-size: 13px; } .x-total b { font-size: 15px; font-weight: 650; }
	.x-saved { font-size: 12px; color: var(--success); font-weight: 600; }
	.x-note { font-size: 11.5px; color: var(--text-subtle); margin: 10px 0 0; line-height: 1.5; }

	.dz-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
	.dz-title { display: block; font-size: 13px; font-weight: 600; color: var(--text-base); }
	.dz-sub { display: block; font-size: 12px; color: var(--text-muted); margin-top: 2px; line-height: 1.5; }
	.btn-danger-outline { flex-shrink: 0; padding: 7px 14px; border-radius: var(--radius-sm); background: none; border: 1px solid color-mix(in srgb, var(--danger) 35%, var(--border)); color: var(--danger); font-size: 12.5px; font-weight: 600; cursor: pointer; font-family: inherit; transition: background .15s; }
	.btn-danger-outline:hover { background: var(--danger-dim); }
	.dz-confirm { display: flex; flex-direction: column; gap: 10px; padding: 13px 15px; border-radius: var(--radius); background: var(--danger-dim); border: 1px solid color-mix(in srgb, var(--danger) 25%, transparent); }
	.dz-confirm > span { font-size: 13px; color: var(--text-base); line-height: 1.6; }
	.dz-confirm strong { font-weight: 650; }
	.dz-confirm-actions { display: flex; gap: 8px; justify-content: flex-end; align-items: center; flex-wrap: wrap; }
	/* Text ON a solid --danger fill: the status tokens carry their own on-colour. */
	.btn-danger { padding: 7px 15px; border-radius: var(--radius-sm); background: var(--danger); color: var(--on-danger); border: none; font-size: 12.5px; font-weight: 600; cursor: pointer; font-family: inherit; }
	.btn-danger:hover { filter: brightness(.95); }
	.status-note { margin: 0; padding: 0 4px; font-size: 12.5px; color: var(--text-muted); line-height: 1.6; }

	.edit-form { display: flex; flex-direction: column; gap: 14px; }
	.field { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
	.row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
	.edit-form label { font-size: 12px; font-weight: 600; color: var(--text-muted); }
	.edit-form input, .edit-form textarea { font-family: inherit; font-size: 14px; padding: 9px 13px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-panel2); color: var(--text-base); transition: border-color .15s, box-shadow .15s; min-width: 0; }
	.edit-form input:focus, .edit-form textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
	.edit-form textarea { resize: vertical; }
	.toggle { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 400; color: var(--text-muted); cursor: pointer; padding-top: 8px; }
	.toggle input { width: 16px; height: 16px; accent-color: var(--accent); }
	.hint { font-size: 12px; color: var(--text-subtle); margin: 4px 0 0; }
	.hint.err { color: var(--danger); }
	.edit-actions { display: flex; justify-content: flex-end; gap: 8px; }

	.msg-section { display: flex; flex-direction: column; scroll-margin-top: 16px; }
	#payment, #feedback, #extras, #cancel, #edit { scroll-margin-top: 16px; }
	.thread { display: flex; flex-direction: column; gap: 10px; max-height: 420px; min-height: 140px; overflow-y: auto; padding: 4px 2px; }
	.thread-empty { margin: auto; display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; color: var(--text-subtle); padding: 12px; }
	.thread-empty p { font-size: 12.5px; margin: 0; max-width: 34ch; }
	.sys { align-self: center; font-size: 11.5px; color: var(--text-subtle); background: var(--bg-hover); padding: 3px 10px; border-radius: 3px; }
	.msg { display: flex; max-width: 82%; }
	.msg.mine { align-self: flex-end; }
	.bubble { display: flex; flex-direction: column; gap: 2px; padding: 9px 13px; border-radius: var(--radius); background: var(--bg-panel2); border: 1px solid var(--border); min-width: 0; }
	/* Own messages sit ON the accent fill, so their text takes --accent-contrast. */
	.msg.mine .bubble { background: var(--accent); border-color: var(--accent); }
	.msg.mine .msg-body { color: var(--accent-contrast); }
	.msg.mine .msg-time { color: color-mix(in srgb, var(--accent-contrast) 70%, transparent); }
	.msg-name { font-size: 11px; font-weight: 650; color: var(--text-base); display: flex; align-items: center; gap: 6px; }
	.msg-role { font-size: 9px; font-weight: 650; text-transform: uppercase; letter-spacing: .08em; color: var(--accent-ink); background: var(--accent-dim); padding: 0 6px; border-radius: 3px; }
	.msg-body { font-size: 13px; color: var(--text-base); line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
	.msg-time { font-size: 10px; color: var(--text-subtle); align-self: flex-end; }
	.msg-att { font-size: 12.5px; color: inherit; text-decoration: underline; word-break: break-all; }
	.msg-att img { display: block; max-width: 100%; max-height: 240px; border-radius: var(--radius-sm); margin-top: 4px; }

	.compose { display: flex; gap: 8px; align-items: flex-end; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border-subtle); }
	.compose textarea { flex: 1; min-width: 0; font-family: inherit; font-size: 13.5px; padding: 9px 13px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-panel2); color: var(--text-base); resize: vertical; transition: border-color .15s, box-shadow .15s; }
	.compose textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
	.send { flex-shrink: 0; align-self: stretch; }

	@media (prefers-reduced-motion: reduce) {
		.btn-primary:hover:not(:disabled) { transform: none; }
	}

	@container rd (max-width: 560px) {
		/* On a phone the chips and the title say it; the icon only pushed them down. */
		.rd-hero { padding: 18px; }
		.hero-icon { display: none; }
		.rd-card { padding: 16px; }
		.side-card { padding: 0; }
		.side-card > :not(.side-photo) { margin-left: 16px; margin-right: 16px; }
		.contact-card { padding: 16px 0; }
		.row { grid-template-columns: 1fr; }
		.compose { flex-direction: column; align-items: stretch; }
		.send { align-self: flex-end; }
	}
</style>
