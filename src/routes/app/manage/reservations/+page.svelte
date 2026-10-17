<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import { t } from '$lib/i18n.svelte';
	import { EVENT_TYPE_KEYS, CUSTOM_EVENT_TYPE_MAX, eventTypeLabel } from '$lib/eventTypes';
	import type { PageData, ActionData } from './$types';
	import type { ReservationStatus } from '$lib/db';

	interface Props { data: PageData; form: ActionData; }
	const { data, form }: Props = $props();

	let filter = $state<'all' | ReservationStatus>('all');

	// ── Manual entry (a booking taken over the phone) ──
	// Opened by hand, or re-opened automatically when a submit came back with an
	// error — without JS the whole page re-renders and the panel would otherwise
	// close over the message explaining what went wrong.
	let showManual = $state(untrack(() => !!(form as { manualError?: string } | null)?.manualError));
	let manualHall = $state('');
	let manualEventType = $state('');
	let manualEventTypeOther = $state('');

	const bookableHalls = $derived(data.halls.filter(h => h.allow_reservations));
	const manualHallData = $derived(data.halls.find(h => h.id === manualHall));
	const manualTypeTooLong = $derived(manualEventTypeOther.trim().length > CUSTOM_EVENT_TYPE_MAX);
	// Layouts belonging to the chosen hall. A hall with force_layouts refuses a
	// booking without one, so the field has to be reachable here too.
	const manualTemplates = $derived(data.templates.filter(tm => tm.hall_id === manualHall));

	const manualError = $derived((form as { manualError?: string } | null)?.manualError ?? '');

	function typeLabel(raw: string | null | undefined) {
		return eventTypeLabel(raw, t.eventTypes as unknown as Record<string, string>);
	}

	// An event whose date is before today (UTC) has passed.
	const todayISO = new Date().toISOString().slice(0, 10);
	const isPastEvent = (d: string) => d.slice(0, 10) < todayISO;

	const filtered = $derived(
		filter === 'all'
			? data.reservations
			: data.reservations.filter(r => r.status === filter)
	);

	const statusOptions: ReservationStatus[] = ['pending', 'waiting_payment', 'approved', 'planned', 'completed', 'cancelled'];

	function formatDate(d: Date | string) {
		const date = new Date(d);
		return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
	}

	function cnt(s: ReservationStatus) {
		return data.reservations.filter(r => r.status === s).length;
	}

	const STATUS_COLOR: Record<string, string> = {
		pending:         '--s-amber',
		waiting_payment: '--status-violet',
		approved:        '--s-green',
		planned:         '--status-blue',
		completed:       '--s-slate',
		cancelled:       '--s-red',
	};
</script>

<svelte:head><title>{t.adminReservations.title} – Hallify</title></svelte:head>

<div class="page wrap">

	<div class="page-header">
		<div class="page-header-left">
			<h1 class="page-title">{t.adminReservations.title}</h1>
			<span class="total-badge">{data.reservations.length}</span>
		</div>
		<button type="button" class="btn-action" aria-expanded={showManual} aria-controls="manual-panel"
			onclick={() => showManual = !showManual}>
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
				<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
			</svg>
			{t.manualReservation.open}
		</button>
	</div>

	{#if showManual}
		<section id="manual-panel" class="section section--lead">
			<div class="section-head">
				<h2>{t.manualReservation.title}</h2>
				<p>{t.manualReservation.intro}</p>
			</div>

			{#if manualError}
				<div class="alert-error">{manualError}</div>
			{/if}

			{#if bookableHalls.length === 0}
				<div class="card--inset state-block">
					<h2>{t.manualReservation.noBookableHalls}</h2>
					<p>{t.manualReservation.noBookableHallsHint}</p>
					<a class="btn-outline" href="/app/manage/halls">{t.manualReservation.manageHalls}</a>
				</div>
			{:else}
				<form method="POST" action="?/createManual" class="manual-form" use:enhance>
					<div class="field-row">
						<div class="field">
							<label for="m-hall">{t.adminReservations.hall} *</label>
							<select id="m-hall" name="hallId" bind:value={manualHall} required>
								<option value="" disabled>—</option>
								{#each data.halls as h}
									<option value={h.id} disabled={!h.allow_reservations}>
										{h.name}{h.allow_reservations ? '' : ` — ${t.createEvent.closed}`}
									</option>
								{/each}
							</select>
						</div>
						<div class="field">
							<label for="m-date">{t.adminReservations.date} *</label>
							<input id="m-date" name="eventDate" type="date" required min={manualHallData?.earliestDate} />
						</div>
					</div>

					<div class="field">
						<label for="m-title">{t.createEvent.eventName} *</label>
						<input id="m-title" name="title" type="text" required maxlength="160"
							placeholder={t.createEvent.eventNamePlaceholder} />
					</div>

					<div class="field-row">
						<div class="field">
							<label for="m-guests">{t.createEvent.guests}</label>
							<input id="m-guests" name="numGuests" type="number" min="1" max={manualHallData?.max_people}
								placeholder={manualHallData ? String(manualHallData.max_people) : ''} />
						</div>
						<div class="field">
							<label for="m-type">{t.createEvent.eventType}</label>
							<select id="m-type" name="eventType" bind:value={manualEventType}>
								<option value="">—</option>
								{#each EVENT_TYPE_KEYS as key}
									<option value={key}>{t.eventTypes[key]}</option>
								{/each}
							</select>
						</div>
					</div>

					{#if manualEventType === 'other'}
						<div class="field">
							<label for="m-type-other">{t.createEvent.eventTypeOther}</label>
							<input id="m-type-other" name="eventTypeOther" type="text"
								bind:value={manualEventTypeOther} maxlength={CUSTOM_EVENT_TYPE_MAX}
								placeholder={t.createEvent.eventTypeOtherPlaceholder}
								aria-describedby="m-type-other-hint" />
							<span id="m-type-other-hint" class="field-hint" class:err={manualTypeTooLong}>
								{manualTypeTooLong
									? t.createEvent.eventTypeOtherTooLong(CUSTOM_EVENT_TYPE_MAX)
									: t.createEvent.eventTypeOtherHint}
							</span>
						</div>
					{:else}
						<input type="hidden" name="eventTypeOther" value="" />
					{/if}

					{#if manualTemplates.length > 0}
						{#key manualHall}
							<div class="field">
								<label for="m-template">
									{t.reservationAdmin.stepLayout}{manualHallData?.force_layouts ? ' *' : ''}
								</label>
								<select id="m-template" name="templateId" required={!!manualHallData?.force_layouts}>
									<option value="">{t.createEvent.blankLayout}</option>
									{#each manualTemplates as tm}
										<option value={tm.id}>{tm.name}</option>
									{/each}
								</select>
							</div>
						{/key}
					{/if}

					<p class="manual-divider">{t.manualReservation.customerHeading}</p>

					<div class="field-row">
						<div class="field">
							<label for="m-customer">{t.manualReservation.customerName} *</label>
							<input id="m-customer" name="customerName" type="text" required maxlength="120"
								placeholder={t.manualReservation.customerNamePlaceholder} />
						</div>
						<div class="field">
							<label for="m-contact">{t.manualReservation.customerContact}</label>
							<input id="m-contact" name="customerContact" type="text" maxlength="160"
								placeholder={t.manualReservation.customerContactPlaceholder} />
						</div>
					</div>

					<div class="field">
						<label for="m-notes">{t.manualReservation.notes}</label>
						<textarea id="m-notes" name="notes" rows="3" maxlength="2000"
							placeholder={t.manualReservation.notesPlaceholder}></textarea>
					</div>

					<p class="manual-note">{t.manualReservation.ownershipNote}</p>

					<div class="manual-actions">
						<button type="button" class="btn-outline" onclick={() => showManual = false}>{t.common.cancel}</button>
						<button type="submit" class="btn-action" disabled={manualTypeTooLong}>{t.manualReservation.submit}</button>
					</div>
				</form>
			{/if}
		</section>
	{/if}

	<section class="section" class:section--lead={!showManual}>
		<div class="filters">
			<button class="filter-btn" class:active={filter === 'all'} onclick={() => filter = 'all'}>
				{t.adminReservations.filterAll}
				<span class="f-count">{data.reservations.length}</span>
			</button>
			{#each statusOptions as s}
				{@const c = cnt(s)}
				{#if c > 0}
					<button class="filter-btn" class:active={filter === s} onclick={() => filter = s}
						style:--sc={`var(${STATUS_COLOR[s] ?? '--s-slate'})`}>
						{(t.status as Record<string, string>)[s]}
						<span class="f-count">{c}</span>
					</button>
				{/if}
			{/each}
		</div>

		{#if filtered.length === 0}
			<div class="card--inset state-block">
				<span class="icon-tile" aria-hidden="true">
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
				</span>
				<h2>{t.adminReservations.noReservations}</h2>
			</div>
		{:else}
			<div class="res-list row-list">
				<div class="res-head">
					<span>{t.adminReservations.event}</span>
					<span>{t.adminReservations.user}</span>
					<span>{t.adminReservations.hall}</span>
					<span>{t.adminReservations.date}</span>
					<span>{t.adminReservations.status}</span>
					<span></span>
				</div>
				{#each filtered as res}
					{@const sc = STATUS_COLOR[res.status] ?? '--s-slate'}
					<a href="/app/reservation/{res.id}" class="row-item res-row" class:is-past={isPastEvent(res.event_date) && res.status !== 'cancelled'}>
						<div class="td-title">
							<span class="res-title">{res.title}</span>
							{#if isPastEvent(res.event_date) && res.status !== 'cancelled'}<span class="past-tag">{t.event.past}</span>{/if}
							{#if typeLabel(res.event_type)}
								<span class="res-type">{typeLabel(res.event_type)}</span>
							{/if}
						</div>
						<div class="td-user">
							<span class="user-name">{res.user_first_name} {res.user_last_name}</span>
							<span class="user-email">{res.user_email}</span>
						</div>
						<div class="td-hall">{res.hall_name}</div>
						<div class="td-date">{formatDate(res.event_date)}</div>
						<div class="td-status">
							<span class="status-pill" style:--sc={`var(${sc})`}>
								{(t.status as Record<string, string>)[res.status]}
							</span>
						</div>
						<div class="td-arrow">
							<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
						</div>
					</a>
				{/each}
			</div>
		{/if}
	</section>

</div>

<style>
	/* Status inks. Each one has to stay legible as TEXT on paper (the pills colour
	   their label with it), so every value is ink-grade rather than a stock swatch.
	   amber / green / red ride the shared status tokens; violet and blue are the two
	   extra hues, which app.css carries directly (with a dark-theme pair). */
	:root {
		--s-amber:  var(--warning);
		--s-green:  var(--success);
		--s-slate:  var(--text-muted);
		--s-red:    var(--danger);
	}

	@keyframes fadeSlideUp {
		from { opacity: 0; transform: translateY(10px); }
		to   { opacity: 1; transform: translateY(0); }
	}

	.page { padding-block: 24px; animation: fadeSlideUp .2s ease both; }

	.page-header {
		display: flex; align-items: center; justify-content: space-between;
		padding-bottom: 18px;
	}
	.page-header-left { display: flex; align-items: center; gap: 10px; }
	.page-title { font-size: var(--display-size); font-weight: 550; color: var(--text-base); letter-spacing: -.055em; line-height: 1.08; }
	.total-badge {
		font-size: 11px; font-weight: 650; padding: 2px 8px; border-radius: 3px;
		background: var(--accent-dim);
		color: var(--accent-ink);
	}

	/* ── Filter pills ── */
	.filters { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 16px; }

	.filter-btn {
		display: inline-flex; align-items: center; gap: 6px;
		padding: 5px 13px; border-radius: 3px; font-size: 12px; font-weight: 500;
		background: transparent; border: 1px solid var(--border);
		color: var(--text-muted); cursor: pointer; font-family: inherit;
		transition: border-color .15s, color .15s, background .15s;
	}
	.filter-btn:hover { border-color: var(--accent); color: var(--text-base); }
	.filter-btn.active {
		background: color-mix(in srgb, var(--sc, var(--accent-ink)) 10%, transparent);
		border-color: color-mix(in srgb, var(--sc, var(--accent-ink)) 35%, transparent);
		color: var(--sc, var(--accent-ink));
		font-weight: 600;
	}
	.f-count {
		font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 3px;
		background: var(--bg-hover);
	}
	.filter-btn.active .f-count {
		background: color-mix(in srgb, var(--sc, var(--accent-ink)) 15%, transparent);
	}

	/* ── Hairline rows ── */
	.res-list { overflow-x: auto; }

	.res-head {
		display: grid;
		grid-template-columns: minmax(180px, 2fr) minmax(160px, 1.6fr) minmax(90px, 1fr) 110px 120px 24px;
		gap: 14px;
		/* Same inset as .row-item below it, so the column labels sit over their
		   values and the header rule is the same width as the row rules. */
		padding: 0 var(--row-inset, 10px) 8px;
		margin-inline: calc(var(--row-inset, 10px) * -1);
		font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .12em;
		color: var(--text-muted);
		border-bottom: 1px solid var(--border);
		position: sticky;
		top: 0;
		z-index: 1;
		background: var(--bg-base);
	}

	.res-row {
		display: grid;
		grid-template-columns: minmax(180px, 2fr) minmax(160px, 1.6fr) minmax(90px, 1fr) 110px 120px 24px;
		gap: 14px;
		align-items: center;
		cursor: pointer;
		color: var(--text-base);
		text-decoration: none;
		transition: background .15s;
	}
	.res-row:hover { background: var(--bg-hover); }
	.res-row.is-past { opacity: .62; }
	.res-row.is-past:hover { opacity: 1; }
	.past-tag {
		display: inline-block; margin-left: 8px; padding: 1px 7px; border-radius: 3px;
		font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .12em;
		color: var(--text-muted); background: var(--bg-hover); border: 1px solid var(--border); vertical-align: middle;
	}

	.td-title { min-width: 0; }
	.res-title { font-size: 13px; font-weight: 600; color: var(--text-base); }
	/* The occasion, under the name — a quiet meta line, not another column:
	   the row already carries six and a seventh collapses on a laptop. */
	.res-type {
		display: block; margin-top: 2px;
		font-size: 11px; color: var(--text-muted);
		overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
	}

	.td-user { min-width: 0; }
	.user-name  { display: block; font-size: 13px; font-weight: 500; color: var(--text-base); }
	.user-email { display: block; font-size: 11px; color: var(--text-muted); margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

	.td-hall { font-size: 13px; color: var(--text-muted); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.td-date  { font-size: 12px; font-weight: 600; color: var(--text-muted); white-space: nowrap; }

	.status-pill {
		display: inline-flex; align-items: center;
		padding: 3px 9px; border-radius: 3px; font-size: 11px; font-weight: 600; white-space: nowrap;
		background: color-mix(in srgb, var(--sc) 12%, transparent);
		color: var(--sc);
	}

	.td-arrow { color: var(--text-subtle); opacity: .4; display: flex; justify-content: flex-end; }
	.res-row:hover .td-arrow { opacity: 1; color: var(--accent-ink); }

	/* ── Empty state ── */
	/* .card--inset + .state-block in app.css already supply the fill, the stack
	   and the --h3-size heading. Re-declaring them here was the only copy of that
	   block in the app and it sized the heading one step larger than every other
	   empty state. */

	/* ── Manual entry form ── */
	.manual-form { max-width: 680px; }
	.manual-divider {
		margin: 18px 0 14px;
		padding-top: 16px;
		border-top: 1px solid var(--border-subtle);
		font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .12em;
		color: var(--text-muted);
	}
	.manual-note { font-size: 12px; color: var(--text-subtle); margin: 2px 0 0; line-height: 1.5; }
	.manual-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }
	.field-hint { font-size: 11.5px; color: var(--text-muted); margin-top: 4px; }
	.field-hint.err { color: var(--danger); }
	.btn-action:disabled { opacity: .45; cursor: not-allowed; }
	.btn-action:disabled:hover { background: var(--accent); transform: none; }

	@media (max-width: 600px) {
		.page-header { flex-wrap: wrap; gap: 12px; }
	}

	@media (max-width: 760px) {
		.res-head { display: none; }
		.res-row { grid-template-columns: 1fr auto; row-gap: 6px; }
	}
</style>
