<script lang="ts">
	import { venueTitle } from '$lib/page-title';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { tick, untrack } from 'svelte';
	import MiniCalendar from '$lib/components/MiniCalendar.svelte';
	import SharedWithCard from '$lib/components/reservation/SharedWithCard.svelte'; // shared events (0038)
	import { statusLabel, statusClass, fmtDate } from '$lib/reservationStatus';
	import { computeExtras } from '$lib/extras';
	import { reveal } from '$lib/reveal';
	import { t, getLocale } from '$lib/i18n.svelte';
	import { formatDate, formatDateTime, formatMoney } from '$lib/format';
	import { formatIban } from '$lib/payment';
	import type { PageData, ActionData } from './$types';

	interface Props { data: PageData; form: ActionData; }
	let { data, form }: Props = $props();

	const r = $derived(data.reservation);
	const orgName = $derived(data.domainOrg.name);

	// Extras — editable selection (until approval), with a live cost overview.
	let extraSel = $state<string[]>([...data.selectedExtras]);
	function toggleExtra(id: string) {
		extraSel = extraSel.includes(id) ? extraSel.filter((x) => x !== id) : [...extraSel, id];
	}
	const extrasOverview = $derived(computeExtras(data.extras, data.extrasEditable ? extraSel : data.selectedExtras, r.num_guests));

	let editing = $state(false);

	// Rating the finished event (D5): stars picked here, sent with the comment.
	let fbRating = $state(untrack(() => data.feedback?.row?.rating ?? 0));
	let fbHover = $state(0);
	let fbEditing = $state(untrack(() => !data.feedback?.row));
	const fbShown = $derived(fbHover || fbRating);
	const longDate = (d: string) => formatDate(d, getLocale(), { day: 'numeric', month: 'long', year: 'numeric' });

	// Price and payment (D6): shown when the venue stated anything, and always while
	// the booking waits for payment, so the client knows what is expected of them.
	const pay = $derived(data.payment);
	const showPayment = $derived(!!pay && (pay.hasAny || r.status === 'waiting_payment'));
	const awaitingPayment = $derived(r.status === 'waiting_payment' && pay?.state !== 'paid');
	let copiedKey = $state('');
	async function copyValue(key: string, value: string) {
		try {
			await navigator.clipboard.writeText(value);
			copiedKey = key;
			setTimeout(() => { if (copiedKey === key) copiedKey = ''; }, 2000);
		} catch { /* clipboard refused: the value is on screen to copy by hand */ }
	}
	let confirmCancel = $state(false);

	let eTitle = $state('');
	let eDate = $state('');
	let eSpecifyTime = $state(false);
	let eStart = $state('');
	let eEnd = $state('');
	let eGuests = $state('');
	let eNotes = $state('');

	function startEdit() {
		eTitle = r.title;
		eDate = r.event_date;
		eSpecifyTime = !!(r.start_time || r.end_time);
		eStart = r.start_time ?? '';
		eEnd = r.end_time ?? '';
		eGuests = r.num_guests != null ? String(r.num_guests) : '';
		eNotes = r.description ?? '';
		confirmCancel = false;
		editing = true;
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

<!-- ── Lead: where you are, what this is, and how it stands ── -->
<section class="section section--lead" use:reveal>
	<a href="/halls/my-reservations" class="back">
		<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
		{t.myRes.title}
	</a>

	<div class="section-head section-head--row head">
		<div class="head-titles">
			<p class="eyebrow">{t.nav.reservations}</p>
			<h1>{r.title}</h1>
			<p class="head-sub">{r.hall_name}</p>
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

<!-- ── The reservation itself ── -->
<section class="section" use:reveal>
	<div class="section-head section-head--row">
		<h2>{t.myRes.detailsHeading}</h2>
		{#if data.editable && !editing}
			<button type="button" class="btn-ghost" onclick={startEdit}>
				<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>
				{t.common.edit}
			</button>
		{/if}
	</div>

	{#if editing}
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
	{:else}
		<dl class="detail-list">
			<div><dt>{t.dashboard.hall}</dt><dd>{r.hall_name}</dd></div>
			<div><dt>{t.common.date}</dt><dd>{fmtDate(r.event_date, getLocale())}</dd></div>
			<div><dt>{t.createEvent.time}</dt><dd>{r.start_time ? `${r.start_time}${r.end_time ? ` – ${r.end_time}` : ''}` : t.calendar.allDay}</dd></div>
			<div><dt>{t.common.guests}</dt><dd>{r.num_guests ?? '—'}</dd></div>
			<div><dt>{t.myRes.reference}</dt><dd class="mono">{r.invite_code}</dd></div>
			{#if r.description}<div class="full"><dt>{t.myRes.notes}</dt><dd>{r.description}</dd></div>{/if}
		</dl>

		{#if showPayment && pay}
			<div class="block pay-box" class:pay-due={awaitingPayment}>
				<span class="eyebrow extras-title">{t.payment.clientTitle}</span>
				{#if awaitingPayment}
					<p class="pay-lead">{pay.hasInstructions || pay.hasAmounts ? t.payment.clientWaiting : t.payment.clientWaitingNoDetails}</p>
				{/if}
				{#if pay.hasAny}
					<dl class="detail-list pay-list">
						{#if pay.priceCents != null}<div><dt>{t.payment.price}</dt><dd>{eur(pay.priceCents)}</dd></div>{/if}
						{#if pay.depositCents != null}
							<div>
								<dt>{t.payment.deposit}</dt>
								<dd>{eur(pay.depositCents)}{#if pay.depositDueDate && !pay.depositPaidAt && !pay.paidInFullAt}<span class="pay-sub">{t.payment.dueBy(formatDate(pay.depositDueDate, getLocale(), { day: 'numeric', month: 'long', year: 'numeric' }))}</span>{/if}</dd>
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
			</div>
		{/if}

		{#if data.canViewSeating}
			<div class="block event-tools">
				<span class="eyebrow tools-label">{t.myRes.planYourEvent}</span>
				<div class="tools-row">
					{#if data.canManageEvent}
						<a href="/halls/my-reservations/{r.id}/layout" class="tool-btn">
							<span class="icon-tile" aria-hidden="true">
								<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
							</span>
							{t.event.tableLayout}
						</a>
					{/if}
					<a href="/halls/my-reservations/{r.id}/manifest" class="tool-btn">
						<span class="icon-tile" aria-hidden="true">
							<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
						</span>
						{t.myRes.seatingSheet}
					</a>
				</div>
			</div>
		{/if}

		{#if data.extras.length > 0}
			<div class="block extras-box">
				<span class="eyebrow extras-title">{t.myRes.extras}</span>
				{#if data.extrasEditable}
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
				{:else if extrasOverview.lines.length > 0}
					<div class="row-list">
						{#each extrasOverview.lines as l}
							<div class="row-item x-line">
								<span>{l.name}{l.pricing === 'per_guest' ? ` (×${l.qty})` : ''}</span>
								<span>{eur(l.line_cents)}</span>
							</div>
						{/each}
						<div class="row-item x-line x-line-total"><span>{t.myRes.total}</span><b>{eur(extrasOverview.totalCents)}</b></div>
					</div>
					<!-- Only while there is still something to change: not on a finished or
					     cancelled booking. -->
					{#if r.status !== 'cancelled' && r.status !== 'completed' && !data.hasStarted}
						<p class="x-note">{t.myRes.changeExtrasNote}</p>
					{/if}
				{:else}
					<p class="x-empty">{t.myRes.noExtrasSelected}</p>
				{/if}
			</div>
		{/if}

		{#if data.cancellable}
			<div class="block danger-zone">
				{#if !confirmCancel}
					<div class="dz-row">
						<div>
							<span class="dz-title">{t.myRes.cancelThisReservation}</span>
							<span class="dz-sub">{t.myRes.cancelFreesDate} {orgName}.</span>
							{#if data.cancelDeadline}
								<span class="dz-sub">{t.myRes.freeCancelUntil} {formatDate(data.cancelDeadline, getLocale(), { day: 'numeric', month: 'long', year: 'numeric' })}.</span>
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
			</div>
		{:else if r.status === 'cancelled'}
			<p class="status-note">{t.myRes.reservationWasCancelled}</p>
		{:else if r.status === 'completed' || data.isPast}
			<!-- "This event has already started" read oddly on a finished event. -->
			<p class="status-note">{t.myRes.eventFinished}</p>
		{:else if data.hasStarted}
			<p class="status-note">{t.event.startedLocked}</p>
		{:else if data.cancelWindowClosed && data.cancelDeadline}
			<!-- The notice period has passed: say so instead of offering a Cancel button
			     that the server would refuse. -->
			<p class="status-note">{t.myRes.cancelWindowClosed.replace('{date}', formatDate(data.cancelDeadline, getLocale(), { day: 'numeric', month: 'long', year: 'numeric' }))}</p>
		{:else if !data.editable}
			<p class="status-note">{t.myRes.lockedNotePrefix} {t.myRes.lockedNoteStatus(statusLabel(r.status, getLocale()))} {t.myRes.lockedNoteMid} {orgName} {t.myRes.lockedNoteSuffix}</p>
		{/if}
	{/if}
</section>

<!-- ── Rating the finished event (D5): private to the venue ── -->
{#if data.feedback}
	{@const fb = data.feedback}
	<section class="section fb-section" id="feedback" use:reveal>
		<div class="section-head">
			<h2>{t.feedback.clientTitle}</h2>
			{#if fb.state === 'open'}<p>{t.feedback.clientIntro(orgName)}</p>{/if}
		</div>

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

<!-- SHARED EVENTS (0038): self-contained card, keep this one line when restyling. --><SharedWithCard members={data.members} canManage={data.access === 'owner'} reservationId={r.id} />

<!-- ── The conversation with the venue ── -->
<section class="section msg-section" use:reveal>
	<div class="section-head section-head--row">
		<h2>{t.nav.messages}</h2>
		<span class="msg-with">{t.myRes.with} {orgName}</span>
	</div>

	<div class="thread" bind:this={threadEl}>
		{#if data.thread.messages.length === 0}
			<div class="card--inset thread-empty">
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
		<textarea name="body" rows="2" maxlength="5000" placeholder="{t.myRes.composePlaceholder} {orgName}…" aria-label="{t.myRes.composePlaceholder} {orgName}" required></textarea>
		<!-- Disabled while sending: a double click stored the message twice. -->
		<button type="submit" class="btn-primary send" disabled={sendingMsg}>
			<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
			{t.messaging.send}
		</button>
	</form>
</section>

<style>
	.back { display: inline-flex; align-items: center; gap: 5px; font-size: 13px; color: var(--text-muted); text-decoration: none; font-weight: 500; width: fit-content; margin-bottom: 18px; }
	.back:hover { color: var(--text-base); }

	/* The page title takes the density display scale, as every other page h1 does;
	   app.css gives h1 its tracking but no size. */
	h1 { font-size: var(--display-size); margin: 0; }

	.head { align-items: flex-start; }
	.head-titles { min-width: 0; }
	.head-sub { font-size: 13px; color: var(--text-muted); margin: 5px 0 0; }

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

	.btn-ghost { display: inline-flex; align-items: center; gap: 6px; padding: 6px 13px; border-radius: var(--radius-sm); background: none; border: 1px solid var(--border); color: var(--text-muted); font-size: 12.5px; font-weight: 600; cursor: pointer; font-family: inherit; transition: background .15s, color .15s; }
	.btn-ghost:hover { background: var(--bg-hover); color: var(--text-base); }
	/* Primary action: --accent-contrast on the accent fill, plus the signature lift. */
	.btn-primary { display: inline-flex; align-items: center; justify-content: center; gap: 7px; padding: 10px 20px; border-radius: var(--radius-sm); background: var(--accent); color: var(--accent-contrast); font-size: 13px; font-weight: 650; border: none; cursor: pointer; font-family: inherit; transition: transform .2s, background .2s; }
	.btn-primary:hover:not(:disabled) { background: var(--accent-hover); transform: translateY(-2px); }
	.btn-primary:active:not(:disabled) { transform: translateY(0); }
	.btn-primary:disabled { opacity: .5; cursor: not-allowed; }

	.detail-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 18px 24px; margin: 0; }
	.detail-list .full { grid-column: 1 / -1; }
	/* Eyebrow metrics on a data label — muted ink, since it is not a section overline. */
	.detail-list dt { font-size: 10px; font-weight: 650; text-transform: uppercase; letter-spacing: .13em; color: var(--text-subtle); margin-bottom: 4px; }
	.detail-list dd { font-size: 14px; color: var(--text-base); margin: 0; line-height: 1.5; }
	.mono { font-family: ui-monospace, monospace; letter-spacing: .02em; }

	/* A sub-block inside a section: a hairline and some room, never a box. */
	.block { margin-top: 26px; padding-top: 22px; border-top: 1px solid var(--border-subtle); }
	.tools-label, .extras-title { display: block; color: var(--text-muted); margin-bottom: 12px; }
	.tools-row { display: flex; flex-wrap: wrap; gap: 10px 22px; }
	.tool-btn {
		display: inline-flex; align-items: center; gap: 10px;
		font-size: 13px; font-weight: 600; color: var(--text-base); text-decoration: none; transition: color .15s;
	}
	.tool-btn:hover { color: var(--accent-ink); text-decoration: none; }

	/* Price and payment: a hairline block like the others; while the booking waits for
	   payment it carries the warning tint, since that is what the client must act on. */
	.pay-box.pay-due {
		padding: 16px 18px; border-top: none; border-radius: var(--radius);
		background: var(--warning-dim); border: 1px solid color-mix(in srgb, var(--warning) 30%, transparent);
	}
	.pay-lead { font-size: 13.5px; font-weight: 600; color: var(--text-base); margin: 0 0 14px; }
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
	.x-foot { display: flex; align-items: center; justify-content: space-between; margin-top: 14px; }
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
	.x-line { justify-content: space-between; font-size: 13px; color: var(--text-muted); }
	.x-line-total { color: var(--text-base); font-weight: 600; }
	/* <b> and <strong> inherit the UA's bold (700 in Chrome, bolder/900 in Firefox),
	   which the type scale forbids — pin them to 650. */
	.x-line-total b { font-weight: 650; }
	.x-note { font-size: 11.5px; color: var(--text-subtle); margin: 8px 0 0; }
	.x-empty { font-size: 13px; color: var(--text-muted); }

	.dz-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
	.dz-title { display: block; font-size: 13px; font-weight: 600; color: var(--text-base); }
	.dz-sub { display: block; font-size: 12px; color: var(--text-muted); margin-top: 2px; line-height: 1.5; }
	.btn-danger-outline { flex-shrink: 0; padding: 7px 14px; border-radius: var(--radius-sm); background: none; border: 1px solid color-mix(in srgb, var(--danger) 35%, var(--border)); color: var(--danger); font-size: 12.5px; font-weight: 600; cursor: pointer; font-family: inherit; transition: background .15s; }
	.btn-danger-outline:hover { background: var(--danger-dim); }
	.dz-confirm { display: flex; flex-direction: column; gap: 10px; padding: 13px 15px; border-radius: var(--radius); background: var(--danger-dim); border: 1px solid color-mix(in srgb, var(--danger) 25%, transparent); }
	.dz-confirm > span { font-size: 13px; color: var(--text-base); line-height: 1.6; }
	.dz-confirm strong { font-weight: 650; }
	.dz-confirm-actions { display: flex; gap: 8px; justify-content: flex-end; align-items: center; }
	/* Text ON a solid --danger fill: the status tokens carry their own on-colour. */
	.btn-danger { padding: 7px 15px; border-radius: var(--radius-sm); background: var(--danger); color: var(--on-danger); border: none; font-size: 12.5px; font-weight: 600; cursor: pointer; font-family: inherit; }
	.btn-danger:hover { filter: brightness(.95); }
	.status-note { margin: 22px 0 0; padding-top: 18px; border-top: 1px solid var(--border-subtle); font-size: 12.5px; color: var(--text-muted); line-height: 1.6; }

	.edit-form { display: flex; flex-direction: column; gap: 14px; }
	.field { display: flex; flex-direction: column; gap: 5px; }
	.row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
	.edit-form label { font-size: 12px; font-weight: 600; color: var(--text-muted); }
	.edit-form input, .edit-form textarea { font-family: inherit; font-size: 14px; padding: 9px 13px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-panel2); color: var(--text-base); transition: border-color .15s, box-shadow .15s; }
	.edit-form input:focus, .edit-form textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
	.edit-form textarea { resize: vertical; }
	.toggle { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 400; color: var(--text-muted); cursor: pointer; padding-top: 8px; }
	.toggle input { width: 16px; height: 16px; accent-color: var(--accent); }
	.hint { font-size: 12px; color: var(--text-subtle); margin: 4px 0 0; }
	.hint.err { color: var(--danger); }
	.edit-actions { display: flex; justify-content: flex-end; gap: 8px; }

	.msg-section { display: flex; flex-direction: column; }
	.thread { display: flex; flex-direction: column; gap: 10px; max-height: 420px; min-height: 160px; overflow-y: auto; padding: 4px 2px; }
	.thread-empty { margin: auto; display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; color: var(--text-subtle); }
	.thread-empty p { font-size: 12.5px; margin: 0; max-width: 34ch; }
	.sys { align-self: center; font-size: 11.5px; color: var(--text-subtle); background: var(--bg-hover); padding: 3px 10px; border-radius: 3px; }
	.msg { display: flex; max-width: 82%; }
	.msg.mine { align-self: flex-end; }
	.bubble { display: flex; flex-direction: column; gap: 2px; padding: 9px 13px; border-radius: var(--radius); background: var(--bg-panel2); border: 1px solid var(--border); }
	/* Own messages sit ON the accent fill, so their text takes --accent-contrast. */
	.msg.mine .bubble { background: var(--accent); border-color: var(--accent); }
	.msg.mine .msg-body { color: var(--accent-contrast); }
	.msg.mine .msg-time { color: color-mix(in srgb, var(--accent-contrast) 70%, transparent); }
	.msg-name { font-size: 11px; font-weight: 650; color: var(--text-base); display: flex; align-items: center; gap: 6px; }
	.msg-role { font-size: 9px; font-weight: 650; text-transform: uppercase; letter-spacing: .08em; color: var(--accent-ink); background: var(--accent-dim); padding: 0 6px; border-radius: 3px; }
	.msg-body { font-size: 13px; color: var(--text-base); line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
	.msg-time { font-size: 10px; color: var(--text-subtle); align-self: flex-end; }
	.msg-att { font-size: 12.5px; color: inherit; text-decoration: underline; word-break: break-all; }
	.msg-att img { display: block; max-width: 240px; max-height: 240px; border-radius: var(--radius-sm); margin-top: 4px; }

	.compose { display: flex; gap: 8px; align-items: flex-end; margin-top: 18px; padding-top: 18px; border-top: 1px solid var(--border-subtle); }
	.compose textarea { flex: 1; font-family: inherit; font-size: 13.5px; padding: 9px 13px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-panel2); color: var(--text-base); resize: vertical; transition: border-color .15s, box-shadow .15s; }
	.compose textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
	.send { flex-shrink: 0; align-self: stretch; }

	@media (prefers-reduced-motion: reduce) {
		.btn-primary:hover:not(:disabled) { transform: none; }
	}

	@media (max-width: 820px) {
		.row { grid-template-columns: 1fr; }
	}
</style>
