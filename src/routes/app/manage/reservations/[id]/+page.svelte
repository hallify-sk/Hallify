<script lang="ts">
	import { enhance } from '$app/forms';
	import { t } from '$lib/i18n';
	import type { PageData, ActionData } from './$types';
	import type { ReservationStatus } from '$lib/db';

	interface Props { data: PageData; form: ActionData; }
	const { data, form }: Props = $props();

	const res = $derived(data.reservation);
	const statusOptions: ReservationStatus[] = ['pending', 'waiting_payment', 'approved', 'planned', 'completed', 'cancelled'];

	let detailSaved  = $state(false);
	let statusSaved  = $state(false);
	let statusMessage = $state('');

	function formatDate(d: Date | string) {
		return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
	}
	function isoDate(d: Date | string) {
		return new Date(d).toISOString().split('T')[0];
	}

	const STATUS_COLOR: Record<string, string> = {
		pending:         '--s-amber',
		waiting_payment: '--s-indigo',
		approved:        '--s-green',
		planned:         '--s-blue',
		completed:       '--s-slate',
		cancelled:       '--s-red',
	};
	function sc(status: string) {
		return `var(${STATUS_COLOR[status] ?? '--s-slate'})`;
	}
</script>

<svelte:head><title>{res.title} – Reservations – Hallify</title></svelte:head>

<div class="page">

	<!-- Breadcrumb -->
	<nav class="breadcrumb">
		<a href="/app/manage/reservations">Reservations</a>
		<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
		<span>{res.title}</span>
	</nav>

	<!-- Page header -->
	<div class="page-header">
		<div class="page-header-left">
			<h1 class="page-title">{res.title}</h1>
			<span class="status-pill" style:--sc={sc(res.status)}>
				{(t.status as Record<string, string>)[res.status]}
			</span>
		</div>
		<div class="header-actions">
			{#if data.ticketId}
				<a href="/app/manage/messages/{data.ticketId}" class="btn-ghost">
					<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
					Messages
				</a>
			{:else}
				<form method="POST" action="?/openChat" use:enhance style="display:contents">
					<button type="submit" class="btn-ghost">
						<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
						Open chat
					</button>
				</form>
			{/if}
			<a href="/app/reservation/{res.id}" target="_blank" rel="noopener" class="btn-ghost">
				<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
				View event
			</a>
		</div>
	</div>

	{#if form?.error}
		<div class="alert-error">{form.error}</div>
	{/if}

	<div class="detail-grid">

		<!-- ── Left: edit form ── -->
		<div class="card">
			<div class="card-section-header">
				<span class="card-section-title">Event details</span>
			</div>
			<form
				method="POST"
				action="?/updateDetails"
				use:enhance={() => async ({ result, update }) => {
					if (result.type === 'success') {
						detailSaved = true;
						setTimeout(() => detailSaved = false, 2500);
					} else {
						await update({ reset: false });
					}
				}}
				class="form-body"
			>
				<div class="field">
					<label class="field-label" for="d-title">{t.createEvent.eventName} *</label>
					<input class="field-input" id="d-title" name="title" type="text" value={res.title} required />
				</div>
				<div class="field">
					<label class="field-label" for="d-desc">{t.createEvent.eventDescription}</label>
					<textarea class="field-input field-textarea" id="d-desc" name="description" rows="4">{res.description ?? ''}</textarea>
				</div>
				<div class="field-row">
					<div class="field field-grow">
						<label class="field-label" for="d-date">{t.common.date} *</label>
						<input class="field-input" id="d-date" name="event_date" type="date" value={isoDate(res.event_date)} required />
					</div>
					<div class="field field-grow">
						<label class="field-label" for="d-from">From</label>
						<input class="field-input" id="d-from" name="start_time" type="time" value={res.start_time ?? ''} />
					</div>
					<div class="field field-grow">
						<label class="field-label" for="d-to">To</label>
						<input class="field-input" id="d-to" name="end_time" type="time" value={res.end_time ?? ''} />
					</div>
				</div>
				<div class="form-footer">
					{#if detailSaved}
						<span class="saved-badge">
							<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
							Saved
						</span>
					{/if}
					<button type="submit" class="btn-save">{t.common.save}</button>
				</div>
			</form>
		</div>

		<!-- ── Right column ── -->
		<div class="side-stack">

			<!-- Info card -->
			<div class="card">
				<div class="card-section-header">
					<span class="card-section-title">Details</span>
				</div>
				<div class="info-rows">
					<div class="info-row">
						<span class="info-label">Guest</span>
						<span class="info-val">{res.user_first_name} {res.user_last_name}</span>
					</div>
					<div class="info-row">
						<span class="info-label">Email</span>
						<a href="mailto:{res.user_email}" class="info-link">{res.user_email}</a>
					</div>
					<div class="info-row">
						<span class="info-label">Hall</span>
						<span class="info-val">{res.hall_name}</span>
					</div>
					<div class="info-row">
						<span class="info-label">Capacity</span>
						<span class="info-val">{res.hall_max_people} guests</span>
					</div>
					<div class="info-row">
						<span class="info-label">Event date</span>
						<span class="info-val">{formatDate(res.event_date)}</span>
					</div>
					{#if res.start_time || res.end_time}
						<div class="info-row">
							<span class="info-label">Time</span>
							<span class="info-val">
								{res.start_time ?? '—'}{res.end_time ? ` – ${res.end_time}` : ''}
							</span>
						</div>
					{/if}
					<div class="info-row" style="border-bottom:none">
						<span class="info-label">Created</span>
						<span class="info-val">{formatDate(res.created_at)}</span>
					</div>
				</div>
			</div>

			<!-- Status card -->
			<div class="card">
				<div class="card-section-header">
					<span class="card-section-title">Status</span>
					<span class="status-pill" style:--sc={sc(res.status)}>
						{(t.status as Record<string, string>)[res.status]}
					</span>
				</div>
				<form
					method="POST"
					action="?/updateStatus"
					use:enhance={() => async ({ result, update }) => {
						if (result.type === 'success') {
							statusSaved = true;
							statusMessage = '';
							setTimeout(() => statusSaved = false, 2500);
						} else {
							await update({ reset: false });
						}
					}}
					class="form-body"
				>
					<div class="field">
						<label class="field-label" for="s-status">Change to</label>
						<select class="field-input field-select" id="s-status" name="status">
							{#each statusOptions as s}
								<option value={s} selected={res.status === s}>
									{(t.status as Record<string, string>)[s]}
								</option>
							{/each}
						</select>
					</div>
					<div class="field">
						<label class="field-label" for="s-msg">Message to guest <span class="label-optional">(optional)</span></label>
						<textarea class="field-input field-textarea" id="s-msg" name="message"
							bind:value={statusMessage} rows="3"
							placeholder="Add a note that will be sent to the guest…"></textarea>
					</div>
					<div class="form-footer">
						{#if statusSaved}
							<span class="saved-badge">
								<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
								Updated
							</span>
						{/if}
						<button type="submit" class="btn-save">{t.common.save}</button>
					</div>
				</form>
			</div>

		</div>

	</div>
</div>

<style>
	:root {
		--s-amber:  #f59e0b;
		--s-indigo: #6366f1;
		--s-green:  #22c55e;
		--s-blue:   #3b82f6;
		--s-slate:  #94a3b8;
		--s-red:    #ef4444;
	}

	@keyframes fadeSlideUp {
		from { opacity: 0; transform: translateY(10px); }
		to   { opacity: 1; transform: translateY(0); }
	}

	.page { padding: 24px 28px; animation: fadeSlideUp .2s ease both; }

	/* ── Breadcrumb ── */
	.breadcrumb {
		display: flex; align-items: center; gap: 5px;
		font-size: 12px; color: var(--text-subtle); margin-bottom: 16px;
	}
	.breadcrumb a { color: var(--text-subtle); text-decoration: none; transition: color .1s; }
	.breadcrumb a:hover { color: var(--accent); }
	.breadcrumb svg { opacity: .5; flex-shrink: 0; }

	/* ── Page header ── */
	.page-header {
		display: flex; align-items: center; justify-content: space-between;
		flex-wrap: wrap; gap: 12px; margin-bottom: 20px;
	}
	.page-header-left { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
	.page-title { font-size: 18px; font-weight: 800; color: var(--text-base); letter-spacing: -.025em; }

	.header-actions { display: flex; align-items: center; gap: 8px; }

	/* ── Status pill ── */
	.status-pill {
		display: inline-flex; align-items: center;
		padding: 4px 11px; border-radius: 99px; font-size: 11px; font-weight: 700; white-space: nowrap;
		background: color-mix(in srgb, var(--sc) 12%, transparent);
		color: var(--sc);
	}

	/* ── Alert ── */
	.alert-error {
		padding: 9px 13px; border-radius: 7px; font-size: 12px; margin-bottom: 16px;
		background: color-mix(in srgb, var(--danger,#ef4444) 10%, transparent);
		border: 1px solid color-mix(in srgb, var(--danger,#ef4444) 25%, transparent);
		color: var(--danger,#ef4444);
	}

	/* ── Layout ── */
	.detail-grid {
		display: grid;
		grid-template-columns: 1fr 300px;
		gap: 16px;
		align-items: start;
	}

	/* ── Card ── */
	.card {
		background: var(--bg-panel); border: 1px solid var(--border);
		border-radius: 12px; overflow: hidden;
	}
	.card-section-header {
		display: flex; align-items: center; justify-content: space-between;
		padding: 14px 18px; border-bottom: 1px solid var(--border);
	}
	.card-section-title { font-size: 13px; font-weight: 700; color: var(--text-base); }

	/* ── Form ── */
	.form-body { padding: 16px 18px; display: flex; flex-direction: column; gap: 14px; }
	.field { display: flex; flex-direction: column; gap: 4px; }
	.field-row { display: flex; gap: 10px; }
	.field-grow { flex: 1; min-width: 0; }
	.field-label {
		font-size: 10px; font-weight: 700; text-transform: uppercase;
		letter-spacing: .06em; color: var(--text-subtle);
	}
	.label-optional { font-weight: 400; text-transform: none; letter-spacing: 0; font-size: 10px; }
	.field-input {
		padding: 7px 10px; border: 1px solid var(--border); border-radius: 7px;
		background: var(--bg-panel2, var(--bg-base)); font-size: 13px;
		color: var(--text-base); font-family: inherit; outline: none; transition: border-color .12s;
	}
	.field-input:focus { border-color: var(--accent); }
	.field-textarea { resize: vertical; }
	.field-select { cursor: pointer; }

	.form-footer {
		display: flex; align-items: center; justify-content: flex-end; gap: 10px;
		padding-top: 4px;
	}
	.saved-badge {
		display: flex; align-items: center; gap: 5px;
		font-size: 11px; font-weight: 600; color: var(--success, #22c55e);
	}
	.btn-save {
		padding: 7px 18px; border-radius: 7px; font-size: 12px; font-weight: 600;
		background: var(--accent); color: #fff; border: none; cursor: pointer;
		font-family: inherit; transition: opacity .12s;
	}
	.btn-save:hover { opacity: .88; }

	/* ── Buttons ── */
	.btn-ghost {
		display: inline-flex; align-items: center; gap: 6px;
		padding: 6px 13px; border-radius: 7px; font-size: 12px; font-weight: 500;
		background: none; border: 1px solid var(--border); color: var(--text-muted);
		cursor: pointer; font-family: inherit; text-decoration: none; transition: border-color .1s, color .1s;
	}
	.btn-ghost:hover { border-color: var(--accent); color: var(--text-base); }

	/* ── Info rows ── */
	.info-rows { padding: 4px 0; }
	.info-row {
		display: flex; align-items: baseline; justify-content: space-between; gap: 12px;
		padding: 9px 18px; border-bottom: 1px solid var(--border-subtle, var(--border));
	}
	.info-label { font-size: 11px; font-weight: 600; color: var(--text-subtle); flex-shrink: 0; }
	.info-val   { font-size: 13px; color: var(--text-base); text-align: right; }
	.info-link  { font-size: 13px; color: var(--accent); text-decoration: none; }
	.info-link:hover { text-decoration: underline; }

	/* ── Side stack ── */
	.side-stack { display: flex; flex-direction: column; gap: 16px; }

	/* ── Responsive ── */
	@media (max-width: 800px) {
		.detail-grid { grid-template-columns: 1fr; }
	}
</style>
