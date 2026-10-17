<script lang="ts">
	import { RSVP_ENABLED } from '$lib/features';
	import { enhance } from '$app/forms';
	import { page } from '$app/stores';
	import { t } from '$lib/i18n.svelte';
	import { migrateToMultiFloor } from '$lib/floorplan-types';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import KpiCard from '$lib/components/KpiCard.svelte';
	import type { PageData, ActionData } from './$types';
	import type { RsvpConfig } from '$lib/db/index';
	import { computeExtras, eur } from '$lib/extras';
	import { eventTypeLabel, parseEventTypes } from '$lib/eventTypes';

	interface Props { data: PageData; form: ActionData; }
	let { data, form }: Props = $props();

	let messageBody = $state('');

	// The occasion the booking was made for — a canonical key, or the label the
	// operator typed in when they picked "Other".
	const eventTypeText = $derived(
		eventTypeLabel(data.reservation.event_type, t.eventTypes as unknown as Record<string, string>)
	);

	const rsvpConfig = $derived((data.reservation.rsvp_config ?? {}) as RsvpConfig);
	const rsvpEnabled = $derived((data.reservation.rsvp_config as RsvpConfig)?.enabled !== false);
	// RSVP/invite is parked as a novelty feature for now (kept in code, hidden from
	// the UI). Flip to re-enable.
	const SHOW_RSVP = RSVP_ENABLED; // single switch: $lib/features

	// Extras — staff can adjust the selection (e.g. after agreeing in chat).
	let extraSel = $state<string[]>([...data.selectedExtras]);
	function toggleExtra(id: string) {
		extraSel = extraSel.includes(id) ? extraSel.filter((x) => x !== id) : [...extraSel, id];
	}
	const extrasOverview = $derived(computeExtras(data.extras, extraSel, data.reservation.num_guests));

	let copied = $state(false);
	let statusOpen = $state(false);
	let templateDialogOpen = $state(false);
	let resetFormRef: HTMLFormElement | undefined = $state();
	let templateFormRef: HTMLFormElement | undefined = $state();
	let statusDropdownRef: HTMLDivElement | undefined = $state();
	let statusFormRef: HTMLFormElement | undefined = $state();

	// Click-outside to close status dropdown
	$effect(() => {
		if (!statusOpen) return;
		function handleClick(e: MouseEvent) {
			if (statusDropdownRef && !statusDropdownRef.contains(e.target as Node)) {
				statusOpen = false;
			}
		}
		document.addEventListener('click', handleClick, true);
		return () => document.removeEventListener('click', handleClick, true);
	});

	// Close template dialog on Escape
	$effect(() => {
		if (!templateDialogOpen) return;
		function handleKey(e: KeyboardEvent) {
			if (e.key === 'Escape') templateDialogOpen = false;
		}
		document.addEventListener('keydown', handleKey);
		return () => document.removeEventListener('keydown', handleKey);
	});

	function resetLayout() {
		if (!confirm(t.event.confirmReset)) return;
		resetFormRef?.requestSubmit();
	}

	function loadTemplate(templateId: string) {
		if (!confirm(t.event.confirmLoadTemplate)) return;
		if (!templateFormRef) return;
		const input = templateFormRef.querySelector('input[name="templateId"]') as HTMLInputElement;
		if (input) { input.value = templateId; templateFormRef.requestSubmit(); }
		templateDialogOpen = false;
	}

	// Dot fills for the status menu. The trigger right above the menu renders a
	// StatusBadge, so these must be the same colours that StatusBadge assigns —
	// otherwise one status shows two different hues in one control.
	const statusColors: Record<string, string> = {
		pending: 'var(--warning)',
		waiting_payment: 'var(--accent-ink)',
		approved: 'var(--success)',
		planned: 'var(--text-base)',
		completed: 'var(--text-muted)',
		cancelled: 'var(--danger)',
	};

	const user = $derived($page.data.user);
	const isAdmin = $derived($page.data.currentOrg?.role === 'owner' || $page.data.currentOrg?.role === 'admin');
	const canEditAdvanced = $derived(
		isAdmin || ['approved', 'planned'].includes(data.reservation.status)
	);
	const canCancel = $derived(
		!['cancelled', 'completed'].includes(data.reservation.status)
	);
	// The table layout is built on the hall's floor plan; without one it's disabled.
	// data.hasFloorplan is computed from the raw DB value in load (fromJson(null) === {}).
	const hasFloorplan = $derived(data.hasFloorplan);
	const canEditLayout = $derived(hasFloorplan && canEditAdvanced);

	function selectStatus(value: string) {
		statusOpen = false;
		if (!statusFormRef) return;
		const input = statusFormRef.querySelector('input[name="status"]') as HTMLInputElement;
		if (input) {
			input.value = value;
			statusFormRef.requestSubmit();
		}
	}
	const isPast = $derived(new Date(data.reservation.event_date) < new Date(new Date().toDateString()));

	function formatDate(d: Date | string) {
		return new Date(d).toLocaleDateString('sk-SK', {
			weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
		});
	}

	async function copyInvite() {
		await navigator.clipboard.writeText(data.inviteUrl);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}

	// Count tables/seats from layout (across all floors)
	const layoutStats = $derived.by(() => {
		if (!data.reservation.layout_json) return { tables: 0, seats: 0 };
		const state = migrateToMultiFloor(data.reservation.layout_json);
		let tableCount = 0, seatCount = 0;
		for (const floor of state.floors) {
			tableCount += floor.tables.length;
			for (const t of floor.tables) {
				seatCount += (Number(t.chairsTop) || 0) + (Number(t.chairsBottom) || 0) +
					(Number(t.chairsLeft) || 0) + (Number(t.chairsRight) || 0) || (Number(t.chairs) || 0);
			}
		}
		return { tables: tableCount, seats: seatCount };
	});
</script>

<svelte:head><title>{data.reservation.title} – Hallify</title></svelte:head>

<div class="page">
<div class="wrap">
	<!-- Header -->
	<div class="page-header">
		<div class="ph-left">
			<a href={isAdmin ? '/app/manage/reservations' : '/app/'} class="back-link">
				<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
				{t.event.backToEvents}
			</a>
			<div class="ph-titlerow">
				<h1 class="page-title">{data.reservation.title}</h1>
				<StatusBadge status={data.reservation.status} />
			</div>
		</div>
		<div class="ph-actions">
			{#if SHOW_RSVP && canEditAdvanced}
				<a href="/app/reservation/{data.reservation.id}/rsvp-editor" class="btn-outline btn-sm">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
					</svg>
					{t.event.rsvpSettings}
				</a>
			{/if}
			{#if canCancel && !isAdmin}
				<form method="POST" action="?/cancel" use:enhance style="display:inline"
					onsubmit={(e) => { if (!confirm(t.event.confirmCancel)) e.preventDefault(); }}>
					<button type="submit" class="btn-danger btn-sm">{t.event.cancelReservation}</button>
				</form>
			{/if}
		</div>
	</div>

	{#if isPast}
		<div class="alert-warning past-banner">
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
			</svg>
			{t.event.pastEvent}
		</div>
	{/if}

	{#if !canEditAdvanced && !isAdmin}
		<div class="alert-warning" style="margin-bottom:20px">
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
			</svg>
			{t.event.pendingNotice}
		</div>
	{/if}

	<!-- Event details -->
	<section class="section section--lead">
		<div class="section-head section-head--row">
			<div>
				<span class="eyebrow">{t.event.manage}</span>
				<h2>{t.event.details}</h2>
			</div>

			<!-- Status control -->
			{#if isAdmin}
				<form method="POST" action="?/updateStatus" use:enhance bind:this={statusFormRef} class="status-form">
					<input type="hidden" name="status" value={data.reservation.status} />
					<div class="status-dropdown" bind:this={statusDropdownRef}>
						<button
							type="button"
							class="status-trigger"
							onclick={() => (statusOpen = !statusOpen)}
						>
							<StatusBadge status={data.reservation.status} />
							<svg class="status-chevron" class:open={statusOpen} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<polyline points="6 9 12 15 18 9"/>
							</svg>
						</button>
						{#if statusOpen}
							<div class="card card--raised status-menu">
								{#each ['pending', 'waiting_payment', 'approved', 'planned', 'completed', 'cancelled'] as opt}
									<button
										type="button"
										class="status-option"
										class:active={data.reservation.status === opt}
										onclick={() => selectStatus(opt)}
									>
										<span class="status-dot" style="background:{statusColors[opt]}"></span>
										{(t.status as Record<string, string>)[opt]}
									</button>
								{/each}
							</div>
						{/if}
					</div>
				</form>
			{:else}
				<StatusBadge status={data.reservation.status} />
			{/if}
		</div>

		<div class="row-list">
			<div class="row-item">
				<div class="detail-icon">
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2">
						<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
						<line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
					</svg>
				</div>
				<div>
					<div class="detail-label">{t.event.dateTime}</div>
					<div class="detail-value">{formatDate(data.reservation.event_date)}</div>
					{#if data.reservation.start_time && data.reservation.end_time}
						<div class="detail-sub">{data.reservation.start_time} - {data.reservation.end_time}</div>
					{/if}
				</div>
			</div>

			{#if eventTypeText}
				<div class="row-item">
					<div class="detail-icon">
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" aria-hidden="true">
							<path d="M20.59 13.41 13.42 20.6a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z"/><line x1="7" y1="7" x2="7.01" y2="7"/>
						</svg>
					</div>
					<div>
						<div class="detail-label">{t.createEvent.eventType}</div>
						<div class="detail-value">{eventTypeText}</div>
					</div>
				</div>
			{/if}

			<div class="row-item">
				<div class="detail-icon dot" style="background:var(--accent)"></div>
				<div>
					<div class="detail-label">{t.event.venue}</div>
					<div class="detail-value">{data.reservation.hall_name}</div>
					<div class="detail-sub">{t.common.capacity}: {data.reservation.hall_max_people} {t.common.people}</div>
				</div>
			</div>

			<div class="row-item">
				<div class="detail-icon">
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2">
						<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
						<circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
						<path d="M16 3.13a4 4 0 0 1 0 7.75"/>
					</svg>
				</div>
				<div>
					<div class="detail-label">{t.event.attendees}</div>
					<div class="detail-value">{data.reservation.num_guests ?? 0} {t.common.people}</div>
					<div class="detail-sub">{t.event.seats}: {layoutStats.seats}</div>
				</div>
			</div>

			<div class="row-item">
				<div class="detail-icon">
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2">
						<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
					</svg>
				</div>
				<div>
					<div class="detail-label">{t.calendar.bookedBy}</div>
					<div class="detail-value">{data.reservation.user_first_name} {data.reservation.user_last_name}</div>
					{#if data.reservation.user_email}
						<div class="detail-sub"><a href="mailto:{data.reservation.user_email}" style="color:var(--accent-ink);text-decoration:none">{data.reservation.user_email}</a></div>
					{/if}
				</div>
			</div>
		</div>
	</section>

	<!-- Assign / invite a client (staff only) -->
	{#if isAdmin}
		<section class="section">
			<div class="section-head">
				<h2 class="assign-h2">
					<svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
					<span class="assign-title">{t.reservationAdmin.assignTitle}</span>
				</h2>
			</div>

			{#if data.clientOwner}
				<p class="assign-state ok">{t.reservationAdmin.assignOwnerIs} <strong>{data.reservation.user_first_name} {data.reservation.user_last_name}</strong></p>
			{:else if data.pendingInvite}
				<div class="assign-state pending">
					<span>{t.reservationAdmin.assignInvitePending} <strong>{data.pendingInvite.email}</strong></span>
					<div class="assign-pending-actions">
						<form method="POST" action="?/resendInvite" use:enhance><button class="assign-link" type="submit">{t.reservationAdmin.assignResend}</button></form>
						<form method="POST" action="?/cancelInvite" use:enhance><button class="assign-link danger" type="submit">{t.reservationAdmin.assignCancel}</button></form>
					</div>
				</div>
			{:else}
				<p class="assign-state muted">{t.reservationAdmin.assignNoClient}</p>
			{/if}

			{#if form?.assigned}<div class="assign-toast ok">{t.reservationAdmin.assignedToast}</div>{/if}
			{#if form?.invited}<div class="assign-toast ok">{t.reservationAdmin.invitedToast}{#if form?.emailSent === false} — {t.reservationAdmin.assignEmailFailed}{/if}</div>{/if}
			{#if form?.inviteResent}<div class="assign-toast ok">{t.reservationAdmin.inviteResentToast}{#if form?.emailSent === false} — {t.reservationAdmin.assignEmailFailed}{/if}</div>{/if}
			{#if form?.inviteCancelled}<div class="assign-toast">{t.reservationAdmin.inviteCancelledToast}</div>{/if}

			<details class="assign-form-wrap" open={!data.clientOwner && !data.pendingInvite}>
				<summary>{(data.clientOwner || data.pendingInvite) ? t.reservationAdmin.assignReassign : t.reservationAdmin.assignCta}</summary>
				<form method="POST" action="?/assignClient" use:enhance class="assign-form">
					<div class="assign-names">
						<input name="firstName" placeholder={t.reservationAdmin.assignFirstName} required />
						<input name="lastName" placeholder={t.reservationAdmin.assignLastName} required />
					</div>
					<input name="email" type="email" placeholder={t.reservationAdmin.assignEmail} required />
					<p class="assign-hint">{t.reservationAdmin.assignHint}</p>
					{#if form?.assignError}<span class="assign-err">{form.assignError}</span>{/if}
					<button type="submit" class="btn-action btn-sm">{t.reservationAdmin.assignSubmit}</button>
				</form>
			</details>
		</section>
	{/if}

	<!-- Extras (booked add-ons; staff can adjust) -->
	{#if data.extras.length > 0}
		<section class="section">
			<div class="section-head section-head--row">
				<h2>{t.myRes.extras}</h2>
				<span class="extras-block-total">{eur(extrasOverview.totalCents)}</span>
			</div>
			{#if isAdmin}
				<form method="POST" action="?/editExtras" use:enhance class="extras-form">
					<div class="row-list">
					{#each data.extras as ex}
						{@const on = extraSel.includes(ex.id)}
						<label class="row-item exr" class:on>
							<input type="checkbox" checked={on} onchange={() => toggleExtra(ex.id)} />
							<span class="exr-main"><span class="exr-name">{ex.name}</span>{#if ex.description}<span class="exr-desc">{ex.description}</span>{/if}</span>
							<span class="exr-price">{eur(ex.price_cents)}{ex.pricing === 'per_guest' ? ` ${t.myRes.perGuest}` : ''}</span>
						</label>
						{#if on}<input type="hidden" name="extras" value={ex.id} />{/if}
					{/each}
					</div>
					<div class="exr-foot">
						{#if form?.extrasSaved}<span class="exr-saved">{t.myRes.saved}</span>{/if}
						<button type="submit" class="btn-action btn-sm">{t.myRes.saveExtras}</button>
					</div>
				</form>
			{:else}
				<div class="row-list">
				{#each extrasOverview.lines as l}
					<div class="row-item exr-line"><span>{l.name}{l.pricing === 'per_guest' ? ` (×${l.qty})` : ''}</span><span>{eur(l.line_cents)}</span></div>
				{:else}
					<p class="exr-empty">{t.reservationAdmin.extrasNoneSelected}</p>
				{/each}
				</div>
			{/if}
		</section>
	{/if}

	<!-- Message the client (staff only; only when a real client owns it) -->
	{#if isAdmin && data.clientOwner}
		<section class="section">
			<div class="section-head section-head--row">
				<h2>{t.reservationAdmin.messageTheClient}</h2>
				<a href="/app/manage/messages" class="msg-client-link">{t.reservationAdmin.openMessages}</a>
			</div>
			<div class="msg-client">
				{#if form?.messageSent}
					<div class="msg-sent">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
						{t.reservationAdmin.messageSentTo} {data.reservation.user_first_name}.
					</div>
				{/if}
				<form method="POST" action="?/messageClient" use:enhance={() => async ({ update }) => { await update({ reset: true }); messageBody = ''; }}>
					<textarea name="body" rows="3" bind:value={messageBody}
						placeholder="{t.reservationAdmin.messageComposePrefix} {data.reservation.user_first_name}{t.reservationAdmin.messageComposeSuffix}"></textarea>
					<div class="msg-client-actions">
						{#if form?.error}<span class="msg-err">{form.error}</span>{/if}
						<button type="submit" class="btn-action btn-sm" disabled={!messageBody.trim()}>{t.reservationAdmin.sendMessage}</button>
					</div>
				</form>
			</div>
		</section>
	{/if}

	{#if data.reservation.description}
		<section class="section">
			<div class="section-head">
				<h2>{t.event.eventDescription}</h2>
			</div>
			<p class="desc-text">{data.reservation.description}</p>
		</section>
	{/if}

	<!-- RSVP stats (RSVP — hidden while the feature is parked) -->
	{#if SHOW_RSVP}
		<section class="section">
			<div class="section-head">
				<h2>{t.event.rsvpSettings}</h2>
			</div>
			<div class="stat-stack">
				<KpiCard
					label={t.event.totalAttendees}
					value={data.rsvps.length}
					sublabel="{t.common.of} {layoutStats.seats} {t.event.seats}"
				/>
				<KpiCard
					label={t.event.registrations}
					value={data.rsvps.length}
				/>
				<div class="card card--inset invite-card">
					<div class="invite-header">
						<div class="invite-label">{t.event.inviteLink}</div>
						<form method="POST" action="?/toggleRsvp" use:enhance={() => {
							return async ({ update }) => { await update({ reset: false }); };
						}}>
							<input type="hidden" name="enabled" value={rsvpEnabled ? 'false' : 'true'} />
							<button type="submit" class="rsvp-toggle" class:on={rsvpEnabled}
								title={rsvpEnabled ? t.event.rsvpEnabled : t.event.rsvpDisabled}>
								<span class="rsvp-toggle-knob"></span>
							</button>
						</form>
					</div>
					{#if rsvpEnabled}
						<button onclick={copyInvite} class="btn-action" style="width:100%">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
								<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
							</svg>
							{copied ? t.event.copied : t.event.copyLink}
						</button>
					{:else}
						<p class="rsvp-disabled-msg">{t.event.rsvpDisabled}</p>
					{/if}
				</div>
			</div>
		</section>
	{/if}

	<!-- Table layout section -->
	<section class="section">
		<div class="section-head">
			<h2>{t.event.tableLayout}</h2>
			<p>
				{#if !hasFloorplan}
					{t.reservationAdmin.noFloorplanSub}
				{:else}
					{canEditLayout ? t.event.customLayout : t.event.layoutLocked}
				{/if}
			</p>
		</div>

		{#if !hasFloorplan}
			<div class="card card--inset layout-empty">
				<div class="icon-tile">
					<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
				</div>
				<h3>{t.reservationAdmin.noFloorplanTitle}</h3>
				<p>{t.reservationAdmin.noFloorplanBodyPrefix} <strong>{data.reservation.hall_name}</strong> {t.reservationAdmin.noFloorplanBodySuffix}</p>
				{#if isAdmin}
					<a href="/app/manage/halls/{data.reservation.hall_id}" class="btn-action btn-sm">{t.reservationAdmin.openHallSettings}</a>
				{/if}
			</div>
		{:else}
			<div class="layout-summary">
				<div class="ls-stats">
					<div class="ls-stat"><span class="ls-num">{layoutStats.tables}</span><span class="ls-lbl">{t.event.tables}</span></div>
					<div class="ls-stat"><span class="ls-num">{layoutStats.seats}</span><span class="ls-lbl">{t.event.seats}</span></div>
				</div>
				{#if canEditLayout}
					<div class="ls-actions">
						<a href="/app/reservation/{data.reservation.id}/layout" class="btn-action">
							<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
							{t.event.editLayout}
						</a>
						<a href="/app/reservation/{data.reservation.id}/manifest" class="btn-outline">
							<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
							{t.myRes.seatingSheet}
						</a>
						<button type="button" class="btn-outline" onclick={() => (templateDialogOpen = true)}>{t.event.loadTemplate}</button>
						<button type="button" class="btn-outline" onclick={resetLayout}>{t.event.resetLayout}</button>
					</div>
					<p class="ls-note">{t.reservationAdmin.seatingEditorNote}</p>
				{:else}
					<div class="ls-actions">
						<a href="/app/reservation/{data.reservation.id}/manifest" class="btn-outline">
							<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
							{t.myRes.seatingSheet}
						</a>
					</div>
					<p class="ls-note">{t.event.layoutLocked}</p>
				{/if}
			</div>
		{/if}
	</section>
</div>
</div>

<!-- Hidden forms -->
<form method="POST" action="?/resetLayout" use:enhance bind:this={resetFormRef} style="display:none"></form>
<form method="POST" action="?/loadTemplate" use:enhance bind:this={templateFormRef} style="display:none">
	<input type="hidden" name="templateId" value="" />
</form>

<!-- Template dialog -->
{#if templateDialogOpen}
	<div class="dialog-backdrop" onclick={() => (templateDialogOpen = false)} role="presentation">
		<div class="card card--raised dialog-card" onclick={(e) => e.stopPropagation()} role="dialog">
			<div class="dialog-header">
				<h2>{t.event.loadTemplate}</h2>
				<button type="button" class="dialog-close" onclick={() => (templateDialogOpen = false)}>
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
					</svg>
				</button>
			</div>
			{#if data.templates.length === 0}
				<p class="no-templates">{t.event.noTemplates}</p>
			{:else}
				<div class="template-list">
					{#each data.templates as tmpl}
						{@const tmplTypes = parseEventTypes(tmpl.event_type as string | null)}
						<button type="button" class="template-item" onclick={() => loadTemplate(tmpl.id)}>
							<div class="template-name">{tmpl.name}</div>
							{#if tmplTypes.length}
								<!-- The column holds a JSON array of keys; printing it raw put
								     `["wedding","ball"]` on the row. -->
								<div class="template-type">{tmplTypes.map(k => t.eventTypes[k]).join(' · ')}</div>
							{/if}
						</button>
					{/each}
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.page {
		padding: 24px 0 48px;
		overflow-y: auto;
		height: 100%;
	}

	.page-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		flex-wrap: wrap;
		margin-bottom: 20px;
	}
	.ph-left { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
	.back-link {
		display: inline-flex; align-items: center; gap: 5px;
		font-size: 12.5px; font-weight: 600; color: var(--text-muted);
		text-decoration: none; transition: color .15s;
	}
	.back-link:hover { color: var(--accent-ink); }
	.ph-titlerow { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
	.page-title { font-size: 20px; font-weight: 650; letter-spacing: -.055em; color: var(--text-base); margin: 0; }
	.ph-actions { display: flex; align-items: center; gap: 10px; flex-shrink: 0; flex-wrap: wrap; }

	.past-banner { margin-bottom: 20px; }

	/* ── Detail rows: icon gutter + label / value / sub stack ── */
	.detail-icon {
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.detail-icon.dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		margin: 10px;
	}

	.detail-label {
		font-size: 13px;
		font-weight: 600;
		color: var(--text-base);
		margin-bottom: 2px;
	}

	.detail-value {
		font-size: 14px;
		color: var(--text-base);
	}

	.detail-sub {
		font-size: 13px;
		color: var(--text-muted);
	}

	/* ── Extras ── */
	.extras-block-total { font-size: 15px; font-weight: 650; letter-spacing: -.03em; color: var(--text-base); }
	.extras-form { display: flex; flex-direction: column; gap: 12px; }
	.exr { cursor: pointer; }
	.exr.on { background: color-mix(in srgb, var(--accent) 6%, transparent); }
	.exr input { width: 15px; height: 15px; flex-shrink: 0; margin: 0; }
	.exr-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
	.exr-name { font-size: 12.5px; font-weight: 600; }
	.exr-desc { font-size: 11px; color: var(--text-muted); }
	.exr-price { font-size: 12.5px; font-weight: 650; white-space: nowrap; }
	.exr-foot { display: flex; align-items: center; justify-content: flex-end; gap: 10px; }
	.exr-saved { font-size: 12px; color: var(--success); font-weight: 600; }
	.exr-line { justify-content: space-between; font-size: 12.5px; color: var(--text-muted); }
	.exr-empty { font-size: 12.5px; color: var(--text-muted); margin: 0; }

	/* ── Message-the-client composer ── */
	.msg-client-link { font-size: 12px; font-weight: 600; color: var(--accent-ink); text-decoration: none; }
	.msg-client-link:hover { text-decoration: underline; }
	.msg-client { max-width: 640px; }
	.msg-client textarea {
		width: 100%; box-sizing: border-box; resize: vertical; font: inherit; font-size: 13px; line-height: 1.5;
		padding: 9px 11px; border: 1px solid var(--border); border-radius: var(--radius);
		background: var(--bg-panel); color: var(--text-base);
		transition: border-color .15s, box-shadow .15s;
	}
	.msg-client textarea:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
	.msg-client-actions { display: flex; align-items: center; justify-content: flex-end; gap: 10px; margin-top: 8px; }
	.msg-err { font-size: 12px; color: var(--danger); margin-right: auto; }
	.msg-sent {
		display: flex; align-items: center; gap: 6px; margin-bottom: 10px;
		font-size: 12.5px; font-weight: 600; color: var(--success);
	}

	/* ── Assign / invite a client ── */
	.assign-h2 { display: flex; align-items: center; gap: 8px; color: var(--text-muted); }
	.assign-title { color: var(--text-base); }
	.assign-state { font-size: 12.5px; color: var(--text-muted); margin: 0 0 8px; }
	.assign-state.ok { color: var(--text-base); }
	.assign-state.muted { color: var(--text-subtle); }
	.assign-state.pending {
		display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;
		padding: 8px 11px; border-radius: var(--radius); background: var(--warning-dim);
		color: var(--text-base); max-width: 640px;
	}
	.assign-pending-actions { display: flex; gap: 12px; }
	.assign-link {
		background: none; border: none; padding: 0; cursor: pointer; font: inherit;
		font-size: 12px; font-weight: 600; color: var(--accent-ink); text-decoration: underline;
	}
	.assign-link.danger { color: var(--danger); }
	.assign-toast {
		font-size: 12.5px; font-weight: 600; margin: 0 0 8px; padding: 7px 10px; border-radius: var(--radius);
		background: var(--bg-hover); color: var(--text-muted); max-width: 640px;
	}
	.assign-toast.ok { color: var(--success); }
	.assign-form-wrap > summary {
		cursor: pointer; font-size: 12.5px; font-weight: 600; color: var(--accent-ink);
		list-style: none; user-select: none;
	}
	.assign-form-wrap > summary::-webkit-details-marker { display: none; }
	.assign-form { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; max-width: 460px; }
	.assign-names { display: flex; gap: 8px; }
	.assign-form input {
		width: 100%; box-sizing: border-box; font: inherit; font-size: 13px;
		padding: 8px 11px; border: 1px solid var(--border); border-radius: var(--radius);
		background: var(--bg-panel); color: var(--text-base);
		transition: border-color .15s, box-shadow .15s;
	}
	.assign-form input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
	.assign-hint { font-size: 11.5px; line-height: 1.5; color: var(--text-subtle); margin: 0; }
	.assign-err { font-size: 12px; color: var(--danger); }

	.desc-text {
		font-size: 14px;
		color: var(--text-muted);
		line-height: 1.6;
		margin: 0;
		max-width: 68ch;
	}

	.status-form {
		display: flex;
		gap: 10px;
		align-items: center;
	}

	/* Custom status dropdown */
	.status-dropdown {
		position: relative;
	}

	.status-trigger {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 4px 8px 4px 4px;
		border-radius: var(--radius);
		border: 1px solid var(--border);
		background: var(--bg-panel);
		cursor: pointer;
		transition: border-color 0.15s, box-shadow 0.15s;
	}

	.status-trigger:hover {
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-dim);
	}

	.status-chevron {
		transition: transform 0.2s;
		color: var(--text-muted);
	}

	.status-chevron.open {
		transform: rotate(180deg);
	}

	/* .card--raised supplies the floating surface; this only places it. */
	.status-menu {
		position: absolute;
		top: 100%;
		right: 0;
		margin-top: 4px;
		border-radius: var(--radius);
		padding: 6px;
		min-width: 170px;
		z-index: 201;
	}

	.status-option {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 8px 14px;
		border-radius: var(--radius-sm);
		font-size: 13px;
		font-weight: 500;
		color: var(--text-base);
		cursor: pointer;
		background: none;
		border: none;
		font-family: inherit;
		text-align: left;
	}

	.status-option:hover {
		background: var(--bg-panel2);
	}

	.status-option.active {
		background: var(--bg-panel2);
		font-weight: 600;
	}

	.status-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.stat-stack {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: 16px;
	}

	.invite-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 12px;
	}

	.invite-label {
		font-size: 13px;
		font-weight: 500;
		color: var(--text-muted);
	}

	.rsvp-toggle {
		position: relative;
		width: 36px;
		height: 20px;
		/* A toggle track is a pill — it keeps its own geometry. */
		border-radius: 99px;
		/* The knob is --bg-panel, so the off track has to be dark enough for it to
		   read: on --border the knob lands at 1.4:1 in dark mode and vanishes. */
		background: var(--text-subtle);
		border: none;
		cursor: pointer;
		transition: background 0.2s;
		padding: 0;
		flex-shrink: 0;
	}

	.rsvp-toggle.on {
		background: var(--accent);
	}

	.rsvp-toggle-knob {
		position: absolute;
		top: 2px;
		left: 2px;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: var(--bg-panel);
		transition: transform 0.2s;
		box-shadow: var(--shadow-xs);
	}

	.rsvp-toggle.on .rsvp-toggle-knob {
		transform: translateX(16px);
	}

	.rsvp-disabled-msg {
		font-size: 13px;
		color: var(--text-muted);
		text-align: center;
		padding: 8px 0;
	}

	/* Read-only layout summary (editing happens only in the full editor) */
	.layout-summary { display: flex; flex-direction: column; align-items: flex-start; gap: 16px; }
	.ls-stats { display: flex; gap: 36px; flex-wrap: wrap; }
	.ls-stat { display: flex; flex-direction: column; gap: 2px; }
	.ls-num { font-size: 26px; font-weight: 650; color: var(--text-base); letter-spacing: -.045em; }
	.ls-lbl { font-size: 12px; color: var(--text-muted); }
	.ls-actions { display: flex; gap: 10px; flex-wrap: wrap; }
	.ls-note { font-size: 12.5px; color: var(--text-subtle); max-width: 52ch; margin: 0; line-height: 1.5; }

	/* Empty state — .card--inset supplies the fill, .icon-tile the marker. */
	.layout-empty {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 10px;
	}
	.layout-empty h3 { font-size: 16px; font-weight: 650; letter-spacing: -.03em; color: var(--text-base); margin: 2px 0 0; }
	.layout-empty p { font-size: 13px; color: var(--text-muted); line-height: 1.6; max-width: 50ch; margin: 0; }

	/* Template dialog */
	.dialog-backdrop {
		position: fixed;
		inset: 0;
		z-index: 1000;
		background: rgba(0, 0, 0, 0.4);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 20px;
	}

	/* .card--raised supplies the surface; the dialog only sizes it. */
	.dialog-card {
		width: 100%;
		max-width: 420px;
		padding: 0;
		overflow: hidden;
	}

	.dialog-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 18px 20px;
		border-bottom: 1px solid var(--border);
	}

	.dialog-header h2 {
		font-size: 16px;
		font-weight: 550;
		letter-spacing: -.045em;
		margin: 0;
	}

	.dialog-close {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: var(--radius);
		border: none;
		background: none;
		cursor: pointer;
		color: var(--text-muted);
	}

	.dialog-close:hover {
		background: var(--bg-panel2);
		color: var(--text-base);
	}

	.no-templates {
		padding: 24px 20px;
		text-align: center;
		font-size: 13px;
		color: var(--text-muted);
	}

	.template-list {
		padding: 8px;
		max-height: 360px;
		overflow-y: auto;
	}

	.template-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 12px 14px;
		border-radius: var(--radius);
		border: none;
		background: none;
		cursor: pointer;
		font-family: inherit;
		text-align: left;
	}

	.template-item:hover {
		background: var(--bg-panel2);
	}

	.template-name {
		font-size: 14px;
		font-weight: 500;
	}

	.template-type {
		font-size: 12px;
		color: var(--text-muted);
		background: var(--bg-panel2);
		padding: 2px 8px;
		border-radius: var(--radius-sm);
	}
</style>
