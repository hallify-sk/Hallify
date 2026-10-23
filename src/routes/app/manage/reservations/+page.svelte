<script lang="ts">
	import { pageTitle } from '$lib/page-title';
	import { enhance } from '$app/forms';
	import CapNotices from '$lib/components/CapNotices.svelte';
	import { untrack } from 'svelte';
	import { page } from '$app/stores';
	import { t, getLocale } from '$lib/i18n.svelte';
	import { formatDate as fmtLocaleDate } from '$lib/format';
	import { EVENT_TYPE_KEYS, CUSTOM_EVENT_TYPE_MAX, eventTypeLabel } from '$lib/eventTypes';
	import type { PageData, ActionData } from './$types';
	import type { ReservationStatus } from '$lib/db';

	interface Props { data: PageData; form: ActionData; }
	const { data, form }: Props = $props();

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

	const statusOptions: ReservationStatus[] = ['pending', 'waiting_payment', 'approved', 'planned', 'completed', 'cancelled'];

	function formatDate(d: string) {
		return fmtLocaleDate(d, getLocale());
	}

	function cnt(s: ReservationStatus) {
		return data.counts[s] ?? 0;
	}
	const allCount = $derived(Object.values(data.counts).reduce((a, b) => a + b, 0));

	/** The current list URL with some parameters changed (and paging reset unless given). */
	function hrefWith(patch: Record<string, string | number | null>) {
		const u = new URLSearchParams($page.url.searchParams);
		if (!('page' in patch)) u.delete('page');
		for (const [k, v] of Object.entries(patch)) {
			if (v === null || v === '') u.delete(k);
			else u.set(k, String(v));
		}
		const qs = u.toString();
		return qs ? `?${qs}` : '?';
	}
	const exportHref = $derived(`/app/manage/reservations/export${$page.url.search}`);
	const filtersActive = $derived(!!(data.filters.q || data.filters.hall || data.filters.from || data.filters.to || data.filters.status));
	const firstShown = $derived(data.total === 0 ? 0 : (data.page - 1) * 50 + 1);
	const lastShown = $derived(Math.min(data.page * 50, data.total));

	function autoSubmit(e: Event) {
		(e.currentTarget as HTMLSelectElement).form?.requestSubmit();
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

<svelte:head><title>{pageTitle(t.adminReservations.title)}</title></svelte:head>

<div class="page wrap">

	<div class="page-header">
		<div class="page-header-left">
			<h1 class="page-title">{t.adminReservations.title}</h1>
			<span class="total-badge">{data.total}</span>
		</div>
		<button type="button" class="btn-action" aria-expanded={showManual} aria-controls="manual-panel"
			onclick={() => showManual = !showManual}>
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
				<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
			</svg>
			{t.manualReservation.open}
		</button>
	</div>

	<CapNotices caps={data.caps} canUpgrade={data.navPermissions.includes('billing.manage')} />

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
							<!-- The clients' notice period does not bind the venue: today is fine. -->
							<input id="m-date" name="eventDate" type="date" required min={data.today} />
						</div>
					</div>

					<div class="field-row">
						<div class="field">
							<label for="m-start">{t.resOps.startTime}</label>
							<input id="m-start" name="startTime" type="time" />
						</div>
						<div class="field">
							<label for="m-end">{t.resOps.endTime}</label>
							<input id="m-end" name="endTime" type="time" />
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
						<label for="m-notes">{t.resOps.internalNotes}</label>
						<textarea id="m-notes" name="notes" rows="3" maxlength="2000"
							placeholder={t.resOps.internalNotesPlaceholder}></textarea>
					</div>

					<div class="field">
						<label for="m-status">{t.resOps.initialStatus}</label>
						<select id="m-status" name="initialStatus" aria-describedby="m-status-hint">
							{#each data.staffStatuses as st}
								<option value={st} selected={st === 'approved'}>{(t.status as Record<string, string>)[st]}</option>
							{/each}
						</select>
						<span id="m-status-hint" class="field-hint">{t.resOps.initialStatusHint}</span>
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
		<nav class="when-tabs" aria-label={t.adminReservations.date}>
			{#each [['upcoming', t.resOps.whenUpcoming], ['past', t.resOps.whenPast], ['all', t.resOps.whenAll]] as [w, label]}
				<a href={hrefWith({ when: w, sort: null })} class="when-tab" class:active={data.filters.when === w}
					aria-current={data.filters.when === w ? 'page' : undefined}>{label}</a>
			{/each}
		</nav>

		<form method="GET" class="list-filters" data-sveltekit-keepfocus data-sveltekit-noscroll>
			<input type="hidden" name="when" value={data.filters.when} />
			{#if data.filters.status}<input type="hidden" name="status" value={data.filters.status} />{/if}
			<label class="sr-only" for="f-q">{t.resOps.search}</label>
			<input id="f-q" class="lf-search" type="search" name="q" value={data.filters.q} placeholder={t.resOps.searchPlaceholder} maxlength="100" />
			<label class="sr-only" for="f-hall">{t.adminReservations.hall}</label>
			<select id="f-hall" name="hall" onchange={autoSubmit}>
				<option value="">{t.calendar.allHalls}</option>
				{#each data.halls as h}<option value={h.id} selected={data.filters.hall === h.id}>{h.name}</option>{/each}
			</select>
			<label class="lf-date"><span>{t.resOps.dateFrom}</span><input type="date" name="from" value={data.filters.from} /></label>
			<label class="lf-date"><span>{t.resOps.dateTo}</span><input type="date" name="to" value={data.filters.to} /></label>
			<label class="sr-only" for="f-sort">{t.resOps.sortLabel}</label>
			<select id="f-sort" name="sort" onchange={autoSubmit}>
				<option value="date_asc" selected={data.filters.sort === 'date_asc'}>{t.resOps.sortDateAsc}</option>
				<option value="date_desc" selected={data.filters.sort === 'date_desc'}>{t.resOps.sortDateDesc}</option>
				<option value="created" selected={data.filters.sort === 'created'}>{t.resOps.sortCreated}</option>
			</select>
			<button type="submit" class="btn-outline btn-sm">{t.resOps.search}</button>
			{#if filtersActive}<a class="lf-clear" href="?when={data.filters.when}">{t.resOps.clearFilters}</a>{/if}
			<a class="lf-export" href={exportHref} download>{t.resOps.exportCsv}</a>
		</form>

		<div class="filters">
			<a class="filter-btn" class:active={!data.filters.status} href={hrefWith({ status: null })}>
				{t.adminReservations.filterAll}
				<span class="f-count">{allCount}</span>
			</a>
			{#each statusOptions as s}
				{@const c = cnt(s)}
				{#if c > 0 || data.filters.status === s}
					<a class="filter-btn" class:active={data.filters.status === s} href={hrefWith({ status: s })}
						style:--sc={`var(${STATUS_COLOR[s] ?? '--s-slate'})`}>
						{(t.status as Record<string, string>)[s]}
						<span class="f-count">{c}</span>
					</a>
				{/if}
			{/each}
		</div>

		{#if data.reservations.length === 0}
			<div class="card--inset state-block">
				<span class="icon-tile" aria-hidden="true">
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
				</span>
				<h2>{filtersActive || data.filters.when !== 'all' ? t.resOps.noMatches : t.adminReservations.noReservations}</h2>
			</div>
		{:else}
			<div class="res-list row-list">
				<div class="res-head">
					<span>{t.adminReservations.reservation}</span>
					<span>{t.adminReservations.user}</span>
					<span class="h-hall">{t.adminReservations.hall}</span>
					<span>{t.adminReservations.date}</span>
					<span>{t.adminReservations.status}</span>
					<span></span>
				</div>
				{#each data.reservations as res (res.id)}
					{@const sc = STATUS_COLOR[res.status] ?? '--s-slate'}
					<a href="/app/reservation/{res.id}" class="row-item row-item--bleed res-row" class:is-past={isPastEvent(res.event_date) && res.status !== 'cancelled'}>
						<div class="td-title">
							<span class="res-title">{res.title}</span>
							{#if isPastEvent(res.event_date) && res.status !== 'cancelled'}<span class="past-tag">{t.event.past}</span>{/if}
							{#if typeLabel(res.event_type)}
								<span class="res-type">{typeLabel(res.event_type)}</span>
							{/if}
							<!-- The hall, here instead of in its own column when the list is narrow. -->
							<span class="res-type res-hall-inline">{res.hall_name}</span>
						</div>
						<div class="td-user">
							{#if res.customer_name}
								<!-- A phone booking: the customer, not the colleague who typed it in. -->
								<span class="user-name">{res.customer_name} <span class="phone-tag">{t.resOps.byPhone}</span></span>
								<span class="user-email">{res.customer_contact ?? ''}</span>
							{:else}
								<span class="user-name">{res.user_first_name ?? ''} {res.user_last_name ?? ''}</span>
								<span class="user-email">{res.user_email ?? ''}</span>
								{#if res.user_email_unverified}
									<span class="unverified-tag" title={t.identity.emailNotVerifiedHint}>{t.identity.emailNotVerified}</span>
								{/if}
							{/if}
						</div>
						<div class="td-hall">{res.hall_name}</div>
						<div class="td-date">{formatDate(res.event_date)}{#if res.start_time}<span class="td-time">{res.start_time.slice(0, 5)}</span>{/if}</div>
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

			<div class="pager">
				<span class="pager-info">{t.resOps.showing(firstShown, lastShown, data.total)}</span>
				{#if data.pages > 1}
					<div class="pager-links">
						{#if data.page > 1}<a class="btn-outline btn-sm" href={hrefWith({ page: data.page - 1 })} rel="prev">{t.resOps.prevPage}</a>{/if}
						<span class="pager-num">{data.page} / {data.pages}</span>
						{#if data.page < data.pages}<a class="btn-outline btn-sm" href={hrefWith({ page: data.page + 1 })} rel="next">{t.resOps.nextPage}</a>{/if}
					</div>
				{/if}
			</div>
		{/if}
	</section>

</div>

<style>
	/* The client has not confirmed their address yet (D11). */
	.unverified-tag { font-size: 10.5px; font-weight: 600; color: var(--warning); white-space: nowrap; }

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

	.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }

	/* ── Upcoming / past split, search and filters ── */
	.when-tabs { display: flex; gap: 4px; margin-bottom: 12px; border-bottom: 1px solid var(--border); }
	.when-tab {
		padding: 7px 12px; margin-bottom: -1px; font-size: 13px; font-weight: 550; color: var(--text-muted);
		text-decoration: none; border-bottom: 2px solid transparent;
	}
	.when-tab:hover { color: var(--text-base); }
	.when-tab.active { color: var(--accent-ink); border-bottom-color: var(--accent); }
	.list-filters { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 12px; }
	.list-filters input, .list-filters select {
		font: inherit; font-size: 12.5px; padding: 6px 9px; border: 1px solid var(--border);
		border-radius: var(--radius-sm); background: var(--bg-panel); color: var(--text-base);
	}
	.lf-search { flex: 1 1 220px; min-width: 0; }
	.lf-date { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-muted); }
	.lf-clear, .lf-export { font-size: 12px; font-weight: 600; color: var(--accent-ink); text-decoration: none; }
	.lf-clear:hover, .lf-export:hover { text-decoration: underline; }
	.lf-export { margin-left: auto; }
	.phone-tag {
		display: inline-block; margin-left: 4px; padding: 0 5px; border-radius: 3px;
		font-size: 10px; font-weight: 600; color: var(--text-muted); background: var(--bg-hover);
	}
	.td-time { display: block; font-weight: 500; font-size: 11px; color: var(--text-subtle); }
	.pager { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 14px; }
	.pager-info { font-size: 12px; color: var(--text-muted); }
	.pager-links { display: flex; align-items: center; gap: 8px; }
	.pager-num { font-size: 12px; color: var(--text-muted); }

	/* ── Filter pills ── */
	.filters { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 16px; }

	.filter-btn {
		display: inline-flex; align-items: center; gap: 6px;
		padding: 5px 13px; border-radius: 3px; font-size: 12px; font-weight: 500;
		background: transparent; border: 1px solid var(--border);
		color: var(--text-muted); cursor: pointer; font-family: inherit; text-decoration: none;
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
	/* Laid out by the width the list actually gets, not the window's: with the
	   sidebar open, a 900 px window leaves the list about 610 px, and the six fixed
	   columns ran off its edge (the status was cut off behind a scrollbar). */
	.res-list { container-type: inline-size; }
	.res-hall-inline { display: none; }

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

	/* Narrower: the hall moves under the event name, the other columns shrink. */
	@container (max-width: 760px) {
		.res-head, .res-row { grid-template-columns: minmax(0, 2fr) minmax(0, 1.5fr) 96px 112px 16px; gap: 12px; }
		.h-hall, .td-hall { display: none; }
		.res-hall-inline { display: block; }
	}
	/* Phone: two columns, label-less. */
	@container (max-width: 520px) {
		.res-head, .td-arrow { display: none; }
		.res-row { grid-template-columns: 1fr auto; row-gap: 6px; }
	}
</style>
