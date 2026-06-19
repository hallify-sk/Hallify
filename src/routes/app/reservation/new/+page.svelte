<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto, beforeNavigate } from '$app/navigation';
	import { untrack, onDestroy } from 'svelte';
	import { t } from '$lib/i18n.svelte';
	import { migrateToMultiFloor } from '$lib/floorplan-types';
	import { parseEventTypes, normalizeEventType } from '$lib/eventTypes';
	import SectionHeader from '$lib/components/SectionHeader.svelte';
	import MiniCalendar from '$lib/components/MiniCalendar.svelte';
	import type { PageData, ActionData } from './$types';

	interface Props { data: PageData; form: ActionData; }
	const { data, form }: Props = $props();

	function isoLocal(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

	let selectedHall = $state<string>(untrack(() => data.selectedHallId ?? ''));
	let selectedTemplate = $state('');
	let eventType = $state('');
	let selectedDate = $state<string>('');
	let step = $state(1);

	// Optional event time + guests
	let specifyTime = $state(false);
	let startTime = $state('');
	let endTime = $state('');
	let numGuests = $state('');

	// Hold (anti-race) state
	let holdSeconds = $state(0);
	let holdError = $state('');
	let acquiring = $state(false);
	let heartbeat: ReturnType<typeof setInterval> | null = null;
	let ticker: ReturnType<typeof setInterval> | null = null;

	const selectedHallData = $derived(data.halls.find(h => h.id === selectedHall));
	const minDate = $derived(selectedHallData?.earliestDate ?? isoLocal(new Date()));
	const holdLabel = $derived(`${Math.floor(holdSeconds / 60)}:${String(holdSeconds % 60).padStart(2, '0')}`);
	const holdActive = $derived(holdSeconds > 0 && !holdError);

	const EVENT_TYPES_KEYS: (keyof typeof t.eventTypes)[] = ['wedding', 'ball', 'conference', 'birthday', 'other'];

	const filteredTemplates = $derived(
		data.templates.filter(tmpl => {
			const sel = normalizeEventType(eventType);
			if (!sel) return true;
			const types = parseEventTypes(tmpl.event_type as string | null);
			return types.length === 0 || types.includes(sel);
		})
	);

	const showLayoutStep = $derived(!!selectedHallData?.custom_layouts && filteredTemplates.length > 0);
	const maxStep = $derived(showLayoutStep ? 3 : 2);
	const layoutRequired = $derived(!!selectedHallData?.force_layouts);
	const overCapacity = $derived(!!selectedHallData && !!numGuests && Number(numGuests) > selectedHallData.max_people);
	const canSubmit = $derived(!!selectedHall && !!selectedDate && holdActive && !overCapacity && (!layoutRequired || !!selectedTemplate));

	// Blocked dates from hall rules (taken/held are passed separately to the calendar).
	const blockedDateStrings = $derived.by(() => {
		const result: string[] = [];
		for (const b of data.blocks) {
			if (b.block_type === 'date_range' && b.date_from && b.date_to) {
				const end = new Date(b.date_to);
				for (let d = new Date(b.date_from); d <= end; d.setDate(d.getDate() + 1)) result.push(isoLocal(d));
			}
			if (b.block_type === 'weekly' && b.days_of_week) {
				const now = new Date();
				for (let i = 0; i < 540; i++) {
					const d = new Date(now); d.setDate(d.getDate() + i);
					if ((b.days_of_week as number[]).includes(d.getDay())) result.push(isoLocal(d));
				}
			}
		}
		return result;
	});

	// ── Hold lifecycle ──
	function clearTimers() { if (heartbeat) clearInterval(heartbeat); if (ticker) clearInterval(ticker); heartbeat = ticker = null; }

	function releaseHold(hall = selectedHall, date = selectedDate) {
		if (!hall || !date) return;
		try {
			navigator.sendBeacon?.('/api/holds', new Blob([JSON.stringify({ hallId: hall, date, action: 'release' })], { type: 'application/json' }));
		} catch { /* best effort */ }
	}

	async function acquireHold(date: string) {
		holdError = '';
		acquiring = true;
		try {
			const res = await fetch('/api/holds', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hallId: selectedHall, date }) });
			const body = await res.json().catch(() => ({}));
			if (!res.ok || !body.ok) {
				holdError = body.reason === 'taken'
					? t.publicBooking.holdTaken
					: t.publicBooking.holdInProgress;
				selectedDate = '';
				clearTimers();
				goto(`/app/reservation/new?hall=${selectedHall}`, { replaceState: true, noScroll: true, invalidateAll: true });
				return;
			}
			selectedDate = date;
			startTimers(body.ttl ?? (data.holdMinutes ?? 15) * 60);
		} catch {
			holdError = t.reservationAdmin.holdError;
		} finally {
			acquiring = false;
		}
	}

	function startTimers(seconds: number) {
		clearTimers();
		holdSeconds = seconds;
		ticker = setInterval(() => { holdSeconds = Math.max(0, holdSeconds - 1); }, 1000);
		heartbeat = setInterval(async () => {
			if (!selectedHall || !selectedDate) return;
			try {
				const res = await fetch('/api/holds', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hallId: selectedHall, date: selectedDate }) });
				const body = await res.json().catch(() => ({}));
				if (res.ok && body.ok) holdSeconds = body.ttl ?? holdSeconds;
				else { holdError = t.publicBooking.holdExpired; selectedDate = ''; clearTimers(); }
			} catch { /* keep trying next beat */ }
		}, 60_000);
	}

	function onHallChange() {
		releaseHold();
		selectedDate = '';
		selectedTemplate = '';
		holdError = '';
		clearTimers();
		if (selectedHall) goto(`/app/reservation/new?hall=${selectedHall}`, { replaceState: true, noScroll: true, invalidateAll: true });
	}

	function onDateSelect(date: string) {
		if (!selectedHall) return;
		acquireHold(date);
	}

	function nextStep() { if (step < maxStep) step++; }
	function prevStep() { if (step > 1) step--; }

	// Auto-select hall if only one exists
	$effect(() => {
		if (data.halls.length === 1 && !selectedHall) {
			selectedHall = data.halls[0].id;
			onHallChange();
		}
	});

	// Restore a pre-selected date (e.g. quick-create from the calendar) by acquiring its hold.
	$effect(() => {
		const pre = untrack(() => data.selectedDate);
		if (pre && selectedHall && !selectedDate && !holdError) untrack(() => acquireHold(pre));
	});

	// Release the hold when leaving / closing.
	beforeNavigate(() => { releaseHold(); clearTimers(); });
	$effect(() => {
		const onUnload = () => releaseHold();
		window.addEventListener('beforeunload', onUnload);
		return () => window.removeEventListener('beforeunload', onUnload);
	});
	onDestroy(clearTimers);
</script>

<svelte:head><title>{t.createEvent.title} – Hallify</title></svelte:head>

<div class="page">
	<SectionHeader overline={t.createEvent.overview} title={t.createEvent.title} />

	{#if form?.error}
		<div class="alert-error">{form.error}</div>
	{/if}

	<!-- Step indicator -->
	<div class="step-indicator">
		<!-- Step 1 -->
		<div class="step-item" class:active={step === 1} class:done={step > 1}>
			<div class="step-num">
				{#if step > 1}
					<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
						<polyline points="20 6 9 17 4 12"/>
					</svg>
				{:else}
					1
				{/if}
			</div>
			<span class="step-label">{t.reservationAdmin.stepHallDate}</span>
		</div>

		<div class="step-connector"></div>

		<!-- Step 2 -->
		<div class="step-item" class:active={step === 2} class:done={step > 2} class:future={step < 2}>
			<div class="step-num">
				{#if step > 2}
					<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
						<polyline points="20 6 9 17 4 12"/>
					</svg>
				{:else}
					2
				{/if}
			</div>
			<span class="step-label">{t.event.details}</span>
		</div>

		{#if maxStep === 3}
			<div class="step-connector"></div>

			<!-- Step 3 -->
			<div class="step-item" class:active={step === 3} class:future={step < 3}>
				<div class="step-num">3</div>
				<span class="step-label">{t.reservationAdmin.stepLayout}</span>
			</div>
		{/if}
	</div>

	<form method="POST" use:enhance>
		<!-- Hidden inputs always present for form submission -->
		<input type="hidden" name="hallId" value={selectedHall} />
		<input type="hidden" name="eventDate" value={selectedDate} />
		<input type="hidden" name="templateId" value={selectedTemplate} />
		<input type="hidden" name="startTime" value={specifyTime ? startTime : ''} />
		<input type="hidden" name="endTime" value={specifyTime ? endTime : ''} />
		<input type="hidden" name="numGuests" value={numGuests} />

		<!-- Step 1: Hall & Date -->
		{#if step === 1}
			<div class="step-content">
				<div class="step1-grid">
					<!-- Left: Hall selection -->
					<div class="step1-halls">
						<h2 class="step-section-title">{t.createEvent.selectHall}</h2>
						<div class="hall-grid">
							{#each data.halls as h}
								<button
									type="button"
									class="hall-card"
									class:selected={selectedHall === h.id}
									class:closed={!h.allow_reservations}
									disabled={!h.allow_reservations}
									onclick={() => {
										selectedHall = h.id;
										onHallChange();
									}}
								>
									{#if h.cover_image_url}
										<div class="hall-cover-img" style="background:{h.color}18">
											<img src={h.cover_image_url} alt={h.name} />
											<div class="hall-cover-strip" style="background:{h.color}"></div>
										</div>
									{:else}
										<div class="hall-icon" style="background:color-mix(in srgb,{h.color} 12%,transparent);color:{h.color}">
											<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
												<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
												<polyline points="9 22 9 12 15 12 15 22"/>
											</svg>
										</div>
									{/if}
									<div class="hall-info">
										<span class="hall-name">{h.name}</span>
										<div class="hall-tags">
											<span class="hall-badge">{h.max_people} {t.common.people}</span>
											{#if h.auto_approve}<span class="hall-tag ok">{t.createEvent?.autoApprove ?? 'Auto-approve'}</span>{/if}
											{#if h.min_days_advance > 0}<span class="hall-tag">{h.min_days_advance}d {t.createEvent?.advance ?? 'advance'}</span>{/if}
											{#if !h.allow_reservations}<span class="hall-tag warn">{t.createEvent?.closed ?? 'Closed'}</span>{/if}
										</div>
									</div>
									<div class="hall-card-right">
										{#if h.slug}
											<a href="/halls/{h.slug}" target="_blank" rel="noopener"
												class="hall-profile-link"
												onclick={(e) => e.stopPropagation()}>
												{t.reservationAdmin.profileLink} →
											</a>
										{/if}
									</div>
								</button>
							{/each}
						</div>

						{#if selectedHallData?.pre_reservation_text}
							<div class="info-banner">
								<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0; margin-top: 1px;">
									<circle cx="12" cy="12" r="10"/>
									<line x1="12" y1="16" x2="12" y2="12"/>
									<line x1="12" y1="8" x2="12.01" y2="8"/>
								</svg>
								<p>{selectedHallData.pre_reservation_text}</p>
							</div>
						{/if}
					</div>

					<!-- Right: Calendar -->
					<div class="step1-calendar">
						<h2 class="step-section-title">{t.createEvent.selectDate}</h2>
						{#if !selectedHall}
							<div class="cal-placeholder">{t.createEvent?.pickHallFirst ?? 'Select a hall to see available dates.'}</div>
						{:else}
							<MiniCalendar
								blockedDates={blockedDateStrings}
								takenDates={data.takenDates}
								heldDates={data.heldDates}
								minDate={minDate}
								selectedDate={selectedDate}
								onselect={onDateSelect}
								showLegend={true}
							/>
							{#if holdError}
								<div class="hold-banner err">
									<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
									<span>{holdError}</span>
								</div>
							{:else if selectedDate && holdActive}
								<div class="hold-banner ok">
									<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
									<span>{new Date(selectedDate).toLocaleDateString('sk-SK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
									<span class="hold-timer" title={t.createEvent?.heldHint ?? 'This date is reserved for you while you book'}>{t.createEvent?.heldFor ?? 'Held'} · {holdLabel}</span>
								</div>
							{:else if acquiring}
								<div class="hold-banner">{t.common?.loading ?? 'Holding date…'}</div>
							{/if}
						{/if}
					</div>
				</div>

				<div class="step-actions">
					<a href="/app/" class="btn-outline">{t.common.cancel}</a>
					<button
						type="button"
						class="btn-action"
						disabled={!selectedHall || !selectedDate || !holdActive}
						onclick={nextStep}
					>
						{t.reservationAdmin.continue}
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
							<line x1="5" y1="12" x2="19" y2="12"/>
							<polyline points="12 5 19 12 12 19"/>
						</svg>
					</button>
				</div>
			</div>
		{/if}

		<!-- Step 2: Event Details -->
		{#if step === 2}
			<div class="step-content">
				<div class="card step-card">
					<h2 class="step-section-title" style="margin-bottom: 20px;">{t.event?.details ?? 'Event Details'}</h2>

					<div class="field">
						<label for="title">{t.createEvent.eventName} *</label>
						<input
							id="title"
							name="title"
							type="text"
							placeholder={t.createEvent.eventNamePlaceholder}
							class="input-large"
							required
						/>
					</div>

					<div class="field">
						<label for="eventType">{t.createEvent.eventType}</label>
						<select id="eventType" name="eventType" bind:value={eventType}>
							<option value="">—</option>
							{#each EVENT_TYPES_KEYS as key}
								<option value={key}>{t.eventTypes[key]}</option>
							{/each}
						</select>
					</div>

					<div class="field">
						<label for="description">{t.createEvent.eventDescription}</label>
						<textarea id="description" name="description" rows="3" placeholder="…"></textarea>
					</div>

					<div class="field-row">
						<div class="field">
							<label for="numGuests">{t.createEvent?.guests ?? 'Expected guests'}</label>
							<input id="numGuests" type="number" min="1" max={selectedHallData?.max_people}
								bind:value={numGuests}
								placeholder={selectedHallData ? `max ${selectedHallData.max_people}` : ''} />
							{#if selectedHallData && numGuests && Number(numGuests) > selectedHallData.max_people}
								<span class="field-hint err">{t.createEvent?.overCapacity ?? `Exceeds capacity (${selectedHallData.max_people}).`}</span>
							{/if}
						</div>
						<div class="field">
							<!-- svelte-ignore a11y_label_has_associated_control -->
							<label>{t.createEvent?.time ?? 'Time'}</label>
							<label class="time-toggle">
								<input type="checkbox" bind:checked={specifyTime} />
								<span>{t.createEvent?.specifyTime ?? 'Specify a start/end time (optional)'}</span>
							</label>
						</div>
					</div>

					{#if specifyTime}
						<div class="field-row">
							<div class="field">
								<label for="startTime">{t.createEvent?.startTime ?? 'Start'}</label>
								<input id="startTime" type="time" bind:value={startTime} />
							</div>
							<div class="field">
								<label for="endTime">{t.createEvent?.endTime ?? 'End'}</label>
								<input id="endTime" type="time" bind:value={endTime} />
							</div>
						</div>
					{/if}

					<p class="whole-day-note">{t.createEvent?.wholeDayNote ?? 'Reservations hold the whole day for this hall — the date is blocked for everyone else.'}</p>

					<!-- Summary of step 1 selections -->
					<div class="selection-summary">
						{#if selectedHallData}
							<span class="summary-chip">
								<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
								</svg>
								{selectedHallData.name}
							</span>
						{/if}
						{#if selectedDate}
							<span class="summary-chip">
								<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<rect x="3" y="4" width="18" height="18" rx="2"/>
									<line x1="16" y1="2" x2="16" y2="6"/>
									<line x1="8" y1="2" x2="8" y2="6"/>
									<line x1="3" y1="10" x2="21" y2="10"/>
								</svg>
								{new Date(selectedDate).toLocaleDateString('sk-SK', { day: 'numeric', month: 'long', year: 'numeric' })}
							</span>
						{/if}
					</div>
				</div>

				<div class="step-actions">
					<button type="button" class="btn-outline" onclick={prevStep}>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
							<line x1="19" y1="12" x2="5" y2="12"/>
							<polyline points="12 19 5 12 12 5"/>
						</svg>
						{t.common.back}
					</button>

					{#if maxStep === 2}
						<!-- No layout step: this is the final step -->
						<button type="submit" class="btn-action" disabled={!canSubmit}>
							{t.createEvent.submit}
						</button>
					{:else}
						<button type="button" class="btn-action" onclick={nextStep}>
							{t.reservationAdmin.continue}
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
								<line x1="5" y1="12" x2="19" y2="12"/>
								<polyline points="12 5 19 12 12 19"/>
							</svg>
						</button>
					{/if}
				</div>
			</div>
		{/if}

		<!-- Step 3: Layout (only if templates exist) -->
		{#if step === 3}
			<div class="step-content">
				<div class="card step-card">
					<h2 class="step-section-title" style="margin-bottom: 20px;">{t.createEvent.suggestedLayouts}</h2>

					<div class="templates-grid">
						<!-- Blank layout card first -->
						<label class="template-card" class:selected={selectedTemplate === ''}>
							<input type="radio" name="_templateRadio" value="" bind:group={selectedTemplate} />
							<div class="template-preview blank">
								<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4">
									<rect x="3" y="3" width="18" height="18" rx="2"/>
									<line x1="3" y1="9" x2="21" y2="9"/>
									<line x1="9" y1="21" x2="9" y2="9"/>
								</svg>
								<span>{t.createEvent.blankLayout}</span>
							</div>
						</label>

						{#each filteredTemplates as tmpl}
							{@const tmplFloor = migrateToMultiFloor(tmpl.layout_json).floors[0]}
							<label class="template-card" class:selected={selectedTemplate === tmpl.id}>
								<input type="radio" name="_templateRadio" value={tmpl.id} bind:group={selectedTemplate} />
								<div class="template-preview">
									<svg viewBox="0 0 100 70" preserveAspectRatio="xMidYMid meet">
										{#each tmplFloor.tables as tbl}
											{#if tbl.shape === 'round'}
												<circle cx={tbl.x * 10} cy={tbl.y * 10} r={(tbl.radius ?? 1) * 10 * 0.8} fill="var(--accent)" opacity="0.55"/>
											{:else}
												<rect
													x={(tbl.x - (tbl.width ?? 2) / 2) * 10}
													y={(tbl.y - ((tbl.height ?? 1) / 2)) * 10}
													width={(tbl.width ?? 2) * 10}
													height={(tbl.height ?? 1) * 10}
													rx="2" fill="var(--accent)" opacity="0.55"
												/>
											{/if}
										{/each}
									</svg>
								</div>
								<span class="template-name">{tmpl.name}</span>
								{#if tmpl.event_type}
									<span class="template-tag">{tmpl.event_type}</span>
								{/if}
							</label>
						{/each}
					</div>
				</div>

				<div class="step-actions">
					<button type="button" class="btn-outline" onclick={prevStep}>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
							<line x1="19" y1="12" x2="5" y2="12"/>
							<polyline points="12 19 5 12 12 5"/>
						</svg>
						{t.common.back}
					</button>
					<button type="submit" class="btn-action" disabled={!canSubmit}>
						{t.createEvent.submit}
					</button>
				</div>
			</div>
		{/if}
	</form>
</div>

<style>
	.page {
		padding: 32px 40px;
		overflow-y: auto;
		height: 100%;
		max-width: 900px;
	}

	/* ── Step indicator ─────────────────────────────────────────────── */

	.step-indicator {
		display: flex;
		align-items: center;
		gap: 0;
		margin-bottom: 32px;
	}

	.step-item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 16px;
	}

	.step-item:first-child {
		padding-left: 0;
	}

	.step-num {
		width: 26px;
		height: 26px;
		border-radius: 50%;
		font-size: 12px;
		font-weight: 700;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		transition: background 0.15s, border-color 0.15s, color 0.15s;
		/* default / future */
		background: var(--bg-panel2);
		border: 1.5px solid var(--border);
		color: var(--text-subtle);
	}

	.step-label {
		font-size: 13px;
		font-weight: 500;
		color: var(--text-subtle);
		white-space: nowrap;
		transition: color 0.15s;
	}

	/* Active step */
	.step-item.active .step-num {
		background: var(--accent);
		border-color: var(--accent);
		color: #fff;
	}

	.step-item.active .step-label {
		color: var(--text-base);
		font-weight: 600;
	}

	/* Completed step */
	.step-item.done .step-num {
		background: var(--accent-dim);
		border-color: var(--accent);
		color: var(--accent);
	}

	.step-item.done .step-label {
		color: var(--accent);
	}

	/* Future step (already default, just explicit) */
	.step-item.future .step-num {
		background: var(--bg-panel2);
		border-color: var(--border);
		color: var(--text-subtle);
	}

	.step-connector {
		flex: 1;
		height: 1px;
		background: var(--border);
		min-width: 24px;
		max-width: 48px;
	}

	/* ── Step content wrapper ───────────────────────────────────────── */

	.step-content {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.step-card {
		display: flex;
		flex-direction: column;
	}

	.step-section-title {
		font-size: 15px;
		font-weight: 600;
		color: var(--text-base);
		margin-bottom: 14px;
	}

	/* ── Step 1 layout ──────────────────────────────────────────────── */

	.step1-grid {
		display: grid;
		grid-template-columns: 45fr 55fr;
		gap: 24px;
		align-items: start;
	}

	.step1-halls {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.step1-calendar {
		display: flex;
		flex-direction: column;
		gap: 12px;
		position: sticky;
		top: 20px;
	}

	/* ── Hall cards ─────────────────────────────────────────────────── */

	.hall-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: 10px;
	}

	.hall-card {
		border: 1.5px solid var(--border);
		border-radius: 10px;
		padding: 14px 16px;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 12px;
		transition: border-color 0.15s, background 0.15s;
		background: var(--bg-panel);
		text-align: left;
		width: 100%;
	}

	.hall-card:hover {
		border-color: var(--text-subtle);
		background: var(--bg-hover);
	}

	.hall-card.selected {
		border-color: var(--accent);
		background: var(--accent-dim);
	}

	.hall-icon {
		width: 36px;
		height: 36px;
		border-radius: 8px;
		background: var(--bg-panel2);
		border: 1px solid var(--border);
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-muted);
		flex-shrink: 0;
		transition: background 0.15s, border-color 0.15s;
	}

	.hall-card.selected .hall-icon {
		background: var(--accent-dim);
		border-color: var(--accent);
		color: var(--accent);
	}

	.hall-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.hall-name {
		font-size: 14px;
		font-weight: 600;
		color: var(--text-base);
	}

	.hall-desc {
		font-size: 12px;
		color: var(--text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.hall-badge {
		font-size: 11px;
		font-weight: 600;
		color: var(--text-muted);
		background: var(--bg-panel2);
		border: 1px solid var(--border);
		border-radius: 20px;
		padding: 3px 9px;
		white-space: nowrap;
		flex-shrink: 0;
		transition: background 0.15s, border-color 0.15s, color 0.15s;
	}

	.hall-card.selected .hall-badge {
		background: var(--accent);
		border-color: var(--accent);
		color: #fff;
	}

	.hall-cover-img {
		width: 48px; height: 36px; border-radius: 6px; overflow: hidden;
		flex-shrink: 0; position: relative; border: 1px solid var(--border);
	}
	.hall-cover-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
	.hall-cover-strip {
		position: absolute; bottom: 0; left: 0; right: 0; height: 2px;
	}

	.hall-card-right {
		display: flex; flex-direction: column; align-items: flex-end;
		gap: 4px; flex-shrink: 0;
	}
	.hall-profile-link {
		font-size: 10px; font-weight: 600; color: var(--accent);
		text-decoration: none; white-space: nowrap;
		transition: opacity .1s;
	}
	.hall-profile-link:hover { opacity: .75; }

	/* ── Info banner (pre_reservation_text) ─────────────────────────── */

	.info-banner {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		background: var(--accent-dim);
		border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
		border-radius: 8px;
		padding: 12px 14px;
		color: var(--text-base);
		font-size: 13px;
		line-height: 1.5;
	}

	.info-banner svg {
		color: var(--accent);
	}

	.info-banner p { margin: 0; }

	/* ── Calendar area (step 1) ──────────────────────────────────────── */

	.selected-date-note {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 11px 16px;
		font-size: 13px;
		font-weight: 500;
		color: var(--accent);
	}

	.legend {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 0 4px;
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 11px;
		color: var(--text-muted);
	}

	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.dot.today   { background: var(--accent); }
	.dot.blocked { background: var(--danger); }
	.dot.event   { background: var(--warning); }

	/* ── Step 2: event details ──────────────────────────────────────── */

	.input-large {
		font-size: 16px !important;
		padding: 11px 14px !important;
	}

	.selection-summary {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 8px;
		padding-top: 16px;
		border-top: 1px solid var(--border-subtle);
	}

	.summary-chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		font-weight: 500;
		color: var(--text-muted);
		background: var(--bg-panel2);
		border: 1px solid var(--border);
		border-radius: 20px;
		padding: 4px 10px;
	}

	/* ── Step 3: templates ──────────────────────────────────────────── */

	.templates-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		gap: 12px;
	}

	.template-card {
		cursor: pointer;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.template-card input { display: none; }

	.template-preview {
		border: 2px solid var(--border);
		border-radius: 8px;
		aspect-ratio: 1.4;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--bg-panel2);
		overflow: hidden;
		transition: border-color 0.15s;
		flex-direction: column;
		gap: 6px;
	}

	.template-preview svg { width: 100%; height: 100%; }

	.template-preview.blank {
		color: var(--text-muted);
		font-size: 11px;
		font-weight: 500;
	}

	.template-preview.blank svg {
		width: 28px;
		height: 28px;
	}

	.template-card.selected .template-preview {
		border-color: var(--accent);
		background: var(--accent-dim);
	}

	.template-name {
		font-size: 12px;
		font-weight: 500;
		color: var(--text-base);
	}

	.template-tag {
		font-size: 10px;
		color: var(--accent);
		font-weight: 600;
		text-transform: uppercase;
	}

	/* ── Navigation buttons ─────────────────────────────────────────── */

	.step-actions {
		display: flex;
		justify-content: flex-end;
		gap: 10px;
		padding-top: 4px;
	}

	.btn-action:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.btn-action:disabled:hover {
		background: var(--accent);
	}

	/* ── Redesign additions ── */
	.hall-card:disabled, .hall-card.closed { opacity: .55; cursor: not-allowed; }
	.hall-tags { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 5px; }
	.hall-tag { font-size: 10.5px; font-weight: 600; padding: 2px 7px; border-radius: 99px; background: var(--bg-panel2, var(--bg-base)); color: var(--text-muted); border: 1px solid var(--border); }
	.hall-tag.ok { color: var(--success, #16a34a); background: color-mix(in srgb, var(--success, #16a34a) 12%, transparent); border-color: transparent; }
	.hall-tag.warn { color: var(--danger); background: color-mix(in srgb, var(--danger) 12%, transparent); border-color: transparent; }

	.cal-placeholder { padding: 40px 20px; text-align: center; font-size: 13px; color: var(--text-subtle); border: 1px dashed var(--border); border-radius: 12px; }

	.hold-banner { display: flex; align-items: center; gap: 8px; margin-top: 12px; padding: 10px 12px; border-radius: 9px; font-size: 13px; font-weight: 500; color: var(--text-muted); background: var(--bg-panel2, var(--bg-base)); border: 1px solid var(--border); }
	.hold-banner.ok { color: var(--text-base); border-color: color-mix(in srgb, var(--accent) 35%, var(--border)); background: var(--accent-dim); }
	.hold-banner.ok svg { color: var(--accent); }
	.hold-banner.err { color: var(--danger); background: color-mix(in srgb, var(--danger) 9%, transparent); border-color: color-mix(in srgb, var(--danger) 25%, transparent); }
	.hold-timer { margin-left: auto; font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums; padding: 3px 9px; border-radius: 99px; background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); white-space: nowrap; }

	.time-toggle { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 400; color: var(--text-muted); cursor: pointer; padding-top: 6px; }
	.time-toggle input { width: 16px; height: 16px; accent-color: var(--accent); }
	.whole-day-note { font-size: 12px; color: var(--text-subtle); margin: 4px 0 0; line-height: 1.5; }
	.field-hint { font-size: 11.5px; margin-top: 4px; }
	.field-hint.err { color: var(--danger); }
</style>
