<script lang="ts">
	import { enhance } from '$app/forms';
	import { tick } from 'svelte';
	import MiniCalendar from '$lib/components/MiniCalendar.svelte';
	import { statusLabel, statusClass, fmtDate } from '$lib/reservationStatus';
	import { computeExtras, eur } from '$lib/extras';
	import { t } from '$lib/i18n.svelte';
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

	const blockedStrings = $derived.by(() => {
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

	function fmtTime(ts: string) {
		const iso = ts.includes('T') ? ts : ts.replace(' ', 'T') + 'Z';
		return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
	}

	let threadEl: HTMLDivElement | null = $state(null);
	async function scrollThread() { await tick(); if (threadEl) threadEl.scrollTop = threadEl.scrollHeight; }
	$effect(() => { if (data.thread.messages.length) scrollThread(); });
</script>

<svelte:head><title>{r.title} – {orgName}</title></svelte:head>

<div class="page">
	<a href="/halls/my-reservations" class="back">
		<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
		{t.myRes.title}
	</a>

	<header class="head">
		<div class="head-titles">
			<h1>{r.title}</h1>
			<p class="head-sub">{r.hall_name}</p>
		</div>
		<div class="head-badges">
			<span class="badge {statusClass(r.status)}">{statusLabel(r.status)}</span>
			{#if data.isPast}
				<span class="badge st-past">{t.event.past}</span>
			{:else if data.hasStarted}
				<span class="badge st-progress">{t.event.inProgress}</span>
			{/if}
		</div>
	</header>

	{#if form?.updated}<div class="toast ok"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> {t.myRes.reservationUpdated}</div>{/if}
	{#if form?.cancelled}<div class="toast ok"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> {t.myRes.reservationCancelled}</div>{/if}
	{#if form?.error}<div class="toast err">{form.error}</div>{/if}

	<div class="grid">
		<section class="card">
			<div class="card-head">
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

					<div class="edit-actions">
						<button type="button" class="btn-ghost" onclick={() => editing = false}>{t.common.cancel}</button>
						<button type="submit" class="btn-primary" disabled={!eTitle || !eDate || overCapacity}>{t.myRes.saveChanges}</button>
					</div>
				</form>
			{:else}
				<dl class="detail-list">
					<div><dt>{t.dashboard.hall}</dt><dd>{r.hall_name}</dd></div>
					<div><dt>{t.common.date}</dt><dd>{fmtDate(r.event_date)}</dd></div>
					<div><dt>{t.createEvent.time}</dt><dd>{r.start_time ? `${r.start_time}${r.end_time ? ` – ${r.end_time}` : ''}` : t.calendar.allDay}</dd></div>
					<div><dt>{t.common.guests}</dt><dd>{r.num_guests ?? '—'}</dd></div>
					<div><dt>{t.myRes.reference}</dt><dd class="mono">{r.invite_code}</dd></div>
					{#if r.description}<div class="full"><dt>{t.myRes.notes}</dt><dd>{r.description}</dd></div>{/if}
				</dl>

				{#if data.canViewSeating}
					<div class="event-tools">
						<span class="tools-label">{t.myRes.planYourEvent}</span>
						<div class="tools-row">
							{#if data.canManageEvent}
								<a href="/halls/my-reservations/{r.id}/layout" class="tool-btn">
									<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
									{t.event.tableLayout}
								</a>
							{/if}
							<a href="/halls/my-reservations/{r.id}/manifest" class="tool-btn">
								<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
								{t.myRes.seatingSheet}
							</a>
						</div>
					</div>
				{/if}

				{#if data.extras.length > 0}
					<div class="extras-box">
						<span class="extras-title">{t.myRes.extras}</span>
						{#if data.extrasEditable}
							<form method="POST" action="?/editExtras" use:enhance>
								{#each data.extras as ex}
									{@const on = extraSel.includes(ex.id)}
									<label class="x-row" class:on>
										<input type="checkbox" checked={on} onchange={() => toggleExtra(ex.id)} />
										<span class="x-main">
											<span class="x-name">{ex.name}</span>
											{#if ex.description}<span class="x-desc">{ex.description}</span>{/if}
										</span>
										<span class="x-price">{eur(ex.price_cents)}{ex.pricing === 'per_guest' ? ` ${t.myRes.perGuest}` : ''}</span>
									</label>
									{#if on}<input type="hidden" name="extras" value={ex.id} />{/if}
								{/each}
								<div class="x-foot">
									<span class="x-total">{t.myRes.total} <b>{eur(extrasOverview.totalCents)}</b></span>
									<button type="submit" class="btn-accent-sm">{t.myRes.saveExtras}</button>
								</div>
							</form>
							{#if form?.extrasSaved}<span class="x-saved">{t.myRes.saved}</span>{/if}
						{:else if extrasOverview.lines.length > 0}
							{#each extrasOverview.lines as l}
								<div class="x-line">
									<span>{l.name}{l.pricing === 'per_guest' ? ` (×${l.qty})` : ''}</span>
									<span>{eur(l.line_cents)}</span>
								</div>
							{/each}
							<div class="x-line x-line-total"><span>{t.myRes.total}</span><b>{eur(extrasOverview.totalCents)}</b></div>
							<p class="x-note">{t.myRes.changeExtrasNote}</p>
						{:else}
							<p class="x-empty">{t.myRes.noExtrasSelected}</p>
						{/if}
					</div>
				{/if}

				{#if data.cancellable}
					<div class="danger-zone">
						{#if !confirmCancel}
							<div class="dz-row">
								<div>
									<span class="dz-title">{t.myRes.cancelThisReservation}</span>
									<span class="dz-sub">{t.myRes.cancelFreesDate} {orgName}.</span>
								</div>
								<button type="button" class="btn-danger-outline" onclick={() => confirmCancel = true}>{t.event.cancelReservation}</button>
							</div>
						{:else}
							<div class="dz-confirm">
								<span>{t.myRes.cancelConfirmPrefix} <strong>{r.title}</strong>? {t.myRes.cantBeUndone}</span>
								<div class="dz-confirm-actions">
									<button type="button" class="btn-ghost" onclick={() => confirmCancel = false}>{t.myRes.keepIt}</button>
									<form method="POST" action="?/cancel" use:enhance={() => async ({ update }) => { await update(); confirmCancel = false; }}>
										<button type="submit" class="btn-danger">{t.myRes.yesCancel}</button>
									</form>
								</div>
							</div>
						{/if}
					</div>
				{:else if r.status === 'cancelled'}
					<p class="status-note">{t.myRes.reservationWasCancelled}</p>
				{:else if data.hasStarted}
					<p class="status-note">{t.event.startedLocked}</p>
				{:else if !data.editable}
					<p class="status-note">{t.myRes.lockedNotePrefix} {statusLabel(r.status).toLowerCase()} {t.myRes.lockedNoteMid} {orgName} {t.myRes.lockedNoteSuffix}</p>
				{/if}
			{/if}
		</section>

		<section class="card msg-card">
			<div class="card-head">
				<h2>{t.nav.messages}</h2>
				<span class="msg-with">{t.myRes.with} {orgName}</span>
			</div>

			<div class="thread" bind:this={threadEl}>
				{#if data.thread.messages.length === 0}
					<div class="thread-empty">
						<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
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
									{#if !mine}<span class="msg-name">{m.sender_first_name} {m.sender_last_name}{#if m.sender_role}<span class="msg-role">{m.sender_role}</span>{/if}</span>{/if}
									<span class="msg-body">{m.body}</span>
									<span class="msg-time">{fmtTime(m.created_at)}</span>
								</div>
							</div>
						{/if}
					{/each}
				{/if}
			</div>

			{#if form?.msgError}<div class="toast err small">{form.msgError}</div>{/if}

			<form method="POST" action="?/sendMessage" class="compose" use:enhance={() => async ({ update }) => { await update(); scrollThread(); }}>
				<textarea name="body" rows="2" placeholder="{t.myRes.composePlaceholder} {orgName}…" required></textarea>
				<button type="submit" class="btn-primary send">
					<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
					{t.messaging.send}
				</button>
			</form>
		</section>
	</div>
</div>

<style>
	.page { display: flex; flex-direction: column; gap: 16px; }
	.back { display: inline-flex; align-items: center; gap: 5px; font-size: 13px; color: var(--text-muted); text-decoration: none; font-weight: 500; width: fit-content; }
	.back:hover { color: var(--text-base); }

	.head { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; }
	.head-titles { min-width: 0; }
	.head h1 { font-size: 22px; font-weight: 800; color: var(--text-base); letter-spacing: -0.02em; margin: 0; }
	.head-sub { font-size: 13px; color: var(--text-muted); margin: 3px 0 0; }

	.badge { padding: 4px 11px; border-radius: 99px; font-size: 12px; font-weight: 700; white-space: nowrap; flex-shrink: 0; }
	.st-warning { background: var(--warning-dim); color: var(--warning); }
	.st-success { background: var(--success-dim); color: var(--success); }
	.st-info    { background: var(--accent-dim); color: var(--accent); }
	.st-muted   { background: var(--bg-hover); color: var(--text-muted); }
	.st-danger  { background: var(--danger-dim); color: var(--danger); }
	.st-past     { background: var(--bg-hover); color: var(--text-muted); border: 1px solid var(--border); }
	.st-progress { background: var(--accent-dim); color: var(--accent); }
	.head-badges { display: flex; align-items: center; gap: 6px; flex-shrink: 0; flex-wrap: wrap; justify-content: flex-end; }

	.toast { display: flex; align-items: center; gap: 9px; padding: 10px 14px; border-radius: var(--radius); font-size: 13px; font-weight: 600; }
	.toast.ok { color: var(--success); background: var(--success-dim); border: 1px solid color-mix(in srgb, var(--success) 30%, transparent); }
	.toast.err { color: var(--danger); background: var(--danger-dim); border: 1px solid color-mix(in srgb, var(--danger) 30%, transparent); }
	.toast.small { padding: 8px 12px; font-size: 12.5px; }

	.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }

	.card { background: var(--bg-panel); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 18px 20px; }
	.card-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
	.card-head h2 { font-size: 14px; font-weight: 700; color: var(--text-base); margin: 0; }
	.msg-with { font-size: 12px; color: var(--text-subtle); }

	.btn-ghost { display: inline-flex; align-items: center; gap: 6px; padding: 6px 11px; border-radius: var(--radius); background: none; border: 1px solid var(--border); color: var(--text-muted); font-size: 12.5px; font-weight: 600; cursor: pointer; font-family: inherit; transition: background .12s, color .12s; }
	.btn-ghost:hover { background: var(--bg-hover); color: var(--text-base); }
	.btn-primary { display: inline-flex; align-items: center; justify-content: center; gap: 7px; padding: 8px 16px; border-radius: var(--radius); background: var(--accent); color: #fff; font-size: 13px; font-weight: 600; border: none; cursor: pointer; font-family: inherit; transition: background .15s, opacity .15s; }
	.btn-primary:hover:not(:disabled) { background: var(--accent-hover); }
	.btn-primary:disabled { opacity: .5; cursor: not-allowed; }

	.detail-list { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 18px; margin: 0; }
	.detail-list .full { grid-column: 1 / -1; }
	.detail-list dt { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--text-subtle); margin-bottom: 2px; }
	.detail-list dd { font-size: 14px; color: var(--text-base); margin: 0; line-height: 1.5; }
	.mono { font-family: ui-monospace, monospace; letter-spacing: .02em; }

	.event-tools { margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--border); }
	.tools-label { display: block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--text-subtle); margin-bottom: 10px; }
	.tools-row { display: flex; flex-wrap: wrap; gap: 10px; }
	.tool-btn {
		display: inline-flex; align-items: center; gap: 8px; padding: 9px 14px;
		border: 1px solid var(--border); border-radius: 10px; background: var(--bg-panel);
		font-size: 13px; font-weight: 600; color: var(--text-base); text-decoration: none; transition: border-color .12s, color .12s;
	}
	.tool-btn:hover { border-color: var(--accent); color: var(--accent); }

	.extras-box { margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--border); }
	.extras-title { display: block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--text-subtle); margin-bottom: 10px; }
	.extras-box form { display: flex; flex-direction: column; gap: 8px; }
	.x-row { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border: 1px solid var(--border); border-radius: 10px; cursor: pointer; }
	.x-row.on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 6%, transparent); }
	.x-row input { width: 16px; height: 16px; flex-shrink: 0; margin: 0; }
	.x-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
	.x-name { font-size: 13px; font-weight: 600; }
	.x-desc { font-size: 11.5px; color: var(--text-muted); }
	.x-price { font-size: 13px; font-weight: 700; white-space: nowrap; }
	.x-foot { display: flex; align-items: center; justify-content: space-between; margin-top: 4px; }
	.x-total { font-size: 13px; } .x-total b { font-size: 15px; }
	.x-saved { font-size: 12px; color: var(--success, #16a34a); font-weight: 600; }
	.x-line { display: flex; justify-content: space-between; font-size: 13px; padding: 4px 0; color: var(--text-muted); }
	.x-line-total { border-top: 1px solid var(--border); margin-top: 4px; padding-top: 8px; color: var(--text-base); font-weight: 600; }
	.x-note { font-size: 11.5px; color: var(--text-subtle); margin: 8px 0 0; }
	.x-empty { font-size: 13px; color: var(--text-muted); }

	.danger-zone { margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--border); }
	.dz-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
	.dz-title { display: block; font-size: 13px; font-weight: 600; color: var(--text-base); }
	.dz-sub { display: block; font-size: 12px; color: var(--text-muted); margin-top: 1px; }
	.btn-danger-outline { flex-shrink: 0; padding: 7px 13px; border-radius: var(--radius); background: none; border: 1px solid color-mix(in srgb, var(--danger) 35%, var(--border)); color: var(--danger); font-size: 12.5px; font-weight: 600; cursor: pointer; font-family: inherit; transition: background .12s; }
	.btn-danger-outline:hover { background: var(--danger-dim); }
	.dz-confirm { display: flex; flex-direction: column; gap: 10px; padding: 12px 14px; border-radius: var(--radius); background: var(--danger-dim); border: 1px solid color-mix(in srgb, var(--danger) 25%, transparent); }
	.dz-confirm > span { font-size: 13px; color: var(--text-base); }
	.dz-confirm-actions { display: flex; gap: 8px; justify-content: flex-end; align-items: center; }
	.btn-danger { padding: 7px 14px; border-radius: var(--radius); background: var(--danger); color: #fff; border: none; font-size: 12.5px; font-weight: 600; cursor: pointer; font-family: inherit; }
	.btn-danger:hover { filter: brightness(.95); }
	.status-note { margin: 16px 0 0; padding-top: 14px; border-top: 1px solid var(--border); font-size: 12.5px; color: var(--text-muted); line-height: 1.5; }

	.edit-form { display: flex; flex-direction: column; gap: 14px; }
	.field { display: flex; flex-direction: column; gap: 5px; }
	.row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
	.edit-form label { font-size: 12px; font-weight: 600; color: var(--text-muted); }
	.edit-form input, .edit-form textarea { font-family: inherit; font-size: 14px; padding: 9px 11px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-panel2, var(--bg-base)); color: var(--text-base); }
	.edit-form textarea { resize: vertical; }
	.toggle { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 400; color: var(--text-muted); cursor: pointer; padding-top: 8px; }
	.toggle input { width: 16px; height: 16px; accent-color: var(--accent); }
	.hint { font-size: 12px; color: var(--text-subtle); margin: 4px 0 0; }
	.hint.err { color: var(--danger); }
	.edit-actions { display: flex; justify-content: flex-end; gap: 8px; }

	.msg-card { display: flex; flex-direction: column; }
	.thread { display: flex; flex-direction: column; gap: 10px; max-height: 360px; min-height: 160px; overflow-y: auto; padding: 4px 2px; }
	.thread-empty { margin: auto; display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center; color: var(--text-subtle); padding: 20px; }
	.thread-empty svg { opacity: .55; }
	.thread-empty p { font-size: 12.5px; margin: 0; max-width: 30ch; }
	.sys { align-self: center; font-size: 11.5px; color: var(--text-subtle); background: var(--bg-hover); padding: 3px 10px; border-radius: 99px; }
	.msg { display: flex; max-width: 82%; }
	.msg.mine { align-self: flex-end; }
	.bubble { display: flex; flex-direction: column; gap: 2px; padding: 8px 11px; border-radius: 12px; background: var(--bg-panel2, var(--bg-base)); border: 1px solid var(--border); }
	.msg.mine .bubble { background: var(--accent); border-color: var(--accent); }
	.msg.mine .msg-body { color: #fff; }
	.msg.mine .msg-time { color: rgba(255,255,255,.75); }
	.msg-name { font-size: 11px; font-weight: 700; color: var(--text-base); display: flex; align-items: center; gap: 6px; }
	.msg-role { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; color: var(--accent); background: var(--accent-dim); padding: 0 5px; border-radius: 99px; }
	.msg-body { font-size: 13px; color: var(--text-base); line-height: 1.45; white-space: pre-wrap; word-break: break-word; }
	.msg-time { font-size: 10px; color: var(--text-subtle); align-self: flex-end; }

	.compose { display: flex; gap: 8px; align-items: flex-end; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border); }
	.compose textarea { flex: 1; font-family: inherit; font-size: 13.5px; padding: 9px 11px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-panel2, var(--bg-base)); color: var(--text-base); resize: vertical; }
	.send { flex-shrink: 0; align-self: stretch; }

	@media (max-width: 820px) {
		.grid { grid-template-columns: 1fr; }
		.detail-list { grid-template-columns: 1fr; }
	}
</style>
