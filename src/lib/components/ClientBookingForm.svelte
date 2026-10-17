<script lang="ts">
	import { enhance } from '$app/forms';
	import { onMount } from 'svelte';
	import { booking } from '$lib/analytics';
	import { beforeNavigate } from '$app/navigation';
	import { onDestroy } from 'svelte';
	import MiniCalendar from '$lib/components/MiniCalendar.svelte';
	import { postHold, releaseHoldBeacon } from '$lib/holdClient';
	import { eur } from '$lib/extras';
	import { t } from '$lib/i18n.svelte';

	interface Hall {
		id: string; name: string; color: string; max_people: number;
		auto_approve?: boolean | number; pre_reservation_text?: string | null;
	}
	interface Extra { id: string; name: string; description: string | null; price_cents: number; pricing: 'fixed' | 'per_guest' }
	interface Block { block_type: string; date_from: string | null; date_to: string | null; days_of_week: unknown }
	interface Props {
		hall: Hall;
		blocks: Block[];
		takenDates: string[];
		heldDates: string[];
		earliestDate: string;
		holdMinutes: number;
		backHref: string;
		formError?: string | null;
		/** false on bubble (always pending), otherwise honor hall.auto_approve */
		showAutoApproveNote?: boolean;
		extras?: Extra[];
	}
	const { hall, blocks, takenDates, heldDates, earliestDate, holdMinutes, backHref, formError = null, showAutoApproveNote = true, extras = [] }: Props = $props();

	let selectedExtras = $state<string[]>([]);
	function toggleExtra(id: string) {
		selectedExtras = selectedExtras.includes(id) ? selectedExtras.filter((x) => x !== id) : [...selectedExtras, id];
	}

	function isoLocal(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

	let selectedDate = $state('');
	let specifyTime = $state(false);
	let startTime = $state('');
	let endTime = $state('');
	let numGuests = $state('');
	let holdSeconds = $state(0);
	let holdError = $state('');
	let acquiring = $state(false);
	let heartbeat: ReturnType<typeof setInterval> | null = null;
	let ticker: ReturnType<typeof setInterval> | null = null;

	const holdLabel = $derived(`${Math.floor(holdSeconds / 60)}:${String(holdSeconds % 60).padStart(2, '0')}`);
	const holdActive = $derived(holdSeconds > 0 && !holdError);
	const overCapacity = $derived(!!numGuests && Number(numGuests) > hall.max_people);

	// ── Funnel instrumentation ────────────────────────────────────────────────
	// Step events are what reveal WHERE a booking is abandoned; a single
	// begin/purchase pair only tells you THAT it was. Each step fires once.
	// The component's Hall prop has no slug; id is stable and unambiguous.
	const hallSlug = hall.id;
	onMount(() => booking.beginBooking(hallSlug, hall.name));
	let firedDate = false, firedGuests = false;
	$effect(() => {
		if (selectedDate && !firedDate) { firedDate = true; booking.bookingStep(hallSlug, 'date_selected'); }
	});
	$effect(() => {
		if (numGuests && !overCapacity && !firedGuests) { firedGuests = true; booking.bookingStep(hallSlug, 'guests_entered'); }
	});
	const canSubmit = $derived(!!selectedDate && holdActive && !overCapacity);

	const guestsForExtras = $derived(Math.max(1, Number(numGuests) || 1));
	const extrasTotalCents = $derived(
		extras.filter((e) => selectedExtras.includes(e.id))
			.reduce((s, e) => s + e.price_cents * (e.pricing === 'per_guest' ? guestsForExtras : 1), 0)
	);

	const blockedStrings = $derived.by(() => {
		const out: string[] = [];
		for (const b of blocks) {
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

	function clearTimers() { if (heartbeat) clearInterval(heartbeat); if (ticker) clearInterval(ticker); heartbeat = ticker = null; }

	function startTimers(seconds: number) {
		clearTimers();
		holdSeconds = seconds;
		ticker = setInterval(() => { holdSeconds = Math.max(0, holdSeconds - 1); }, 1000);
		heartbeat = setInterval(async () => {
			if (!selectedDate) return;
			const r = await postHold(hall.id, selectedDate);
			if (r.ok) holdSeconds = r.ttl ?? holdSeconds;
			else { holdError = t.publicBooking.holdExpired; selectedDate = ''; clearTimers(); }
		}, 60_000);
	}

	async function onDateSelect(date: string) {
		holdError = '';
		acquiring = true;
		const r = await postHold(hall.id, date);
		acquiring = false;
		if (!r.ok) {
			holdError = r.reason === 'taken'
				? t.publicBooking.holdTaken
				: t.publicBooking.holdInProgress;
			selectedDate = '';
			clearTimers();
			return;
		}
		selectedDate = date;
		startTimers(r.ttl ?? holdMinutes * 60);
	}

	beforeNavigate(() => { if (selectedDate) releaseHoldBeacon(hall.id, selectedDate); clearTimers(); });
	$effect(() => {
		const onUnload = () => { if (selectedDate) releaseHoldBeacon(hall.id, selectedDate); };
		window.addEventListener('beforeunload', onUnload);
		return () => window.removeEventListener('beforeunload', onUnload);
	});
	onDestroy(clearTimers);
</script>

<a href={backHref} class="back">← {hall.name}</a>

<section class="section section--lead section--flush bk-card">
	<div class="section-head bk-head">
		<span class="bk-dot" style="background:{hall.color}"></span>
		<div>
			<h1>{t.publicBooking.requestReservation}</h1>
			<p class="bk-sub">{hall.name}</p>
		</div>
	</div>

	{#if formError}<div class="bk-error">{formError}</div>{/if}
	{#if hall.pre_reservation_text}<div class="bk-pre card--inset">{hall.pre_reservation_text}</div>{/if}

	<form method="POST" use:enhance class="bk-form">
		<input type="hidden" name="eventDate" value={selectedDate} />
		<input type="hidden" name="startTime" value={specifyTime ? startTime : ''} />
		<input type="hidden" name="endTime" value={specifyTime ? endTime : ''} />
		<input type="hidden" name="numGuests" value={numGuests} />

		<div class="bk-field">
			<label for="title">{t.createEvent.eventName} <span class="req">*</span></label>
			<input id="title" name="title" type="text" placeholder={t.publicBooking.eventNamePlaceholder} required />
		</div>

		<div class="bk-field">
			<!-- svelte-ignore a11y_label_has_associated_control -->
			<label>{t.common.date} <span class="req">*</span></label>
			<MiniCalendar
				blockedDates={blockedStrings}
				takenDates={takenDates}
				heldDates={heldDates}
				minDate={earliestDate}
				selectedDate={selectedDate}
				onselect={onDateSelect}
				showLegend={true}
			/>
			{#if holdError}
				<div class="bk-hold err">{holdError}</div>
			{:else if selectedDate && holdActive}
				<div class="bk-hold ok">
					<span>{new Date(selectedDate).toLocaleDateString('sk-SK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
					<span class="bk-timer">{t.createEvent.heldFor} · {holdLabel}</span>
				</div>
			{:else if acquiring}
				<div class="bk-hold">{t.publicBooking.holdingDate}</div>
			{/if}
			<p class="bk-note">{t.publicBooking.wholeDayNote}</p>
		</div>

		<div class="bk-row">
			<div class="bk-field">
				<label for="numGuests">{t.createEvent.guests}</label>
				<input id="numGuests" type="number" min="1" max={hall.max_people} bind:value={numGuests} placeholder="{t.publicBooking.maxPrefix} {hall.max_people}" />
				{#if overCapacity}<span class="bk-hint err">{t.publicBooking.exceedsCapacity} ({hall.max_people}).</span>{/if}
			</div>
			<div class="bk-field">
				<!-- svelte-ignore a11y_label_has_associated_control -->
				<label>{t.createEvent.time}</label>
				<label class="bk-toggle"><input type="checkbox" bind:checked={specifyTime} /> <span>{t.createEvent.specifyTime}</span></label>
			</div>
		</div>

		{#if specifyTime}
			<div class="bk-row">
				<div class="bk-field"><label for="startTime">{t.createEvent.startTime}</label><input id="startTime" type="time" bind:value={startTime} /></div>
				<div class="bk-field"><label for="endTime">{t.createEvent.endTime}</label><input id="endTime" type="time" bind:value={endTime} /></div>
			</div>
		{/if}

		<div class="bk-field">
			<label for="description">{t.publicBooking.notesLabel}</label>
			<textarea id="description" name="description" rows="3" placeholder={t.publicBooking.notesPlaceholder}></textarea>
		</div>

		{#if extras.length > 0}
			<div class="bk-extras">
				<span class="eyebrow">{t.publicBooking.extrasLabel}</span>
				<div class="row-list">
					{#each extras as ex}
						{@const on = selectedExtras.includes(ex.id)}
						<label class="row-item bk-extra" class:on>
							<input type="checkbox" checked={on} onchange={() => toggleExtra(ex.id)} />
							<span class="bk-extra-main">
								<span class="bk-extra-name">{ex.name}</span>
								{#if ex.description}<span class="bk-extra-desc">{ex.description}</span>{/if}
							</span>
							<span class="bk-extra-price">{eur(ex.price_cents)}{ex.pricing === 'per_guest' ? ` / ${t.publicBooking.perGuest}` : ''}</span>
						</label>
						{#if on}<input type="hidden" name="extras" value={ex.id} />{/if}
					{/each}
				</div>
				{#if extrasTotalCents > 0}
					<div class="bk-extras-total">
						<span>{t.publicBooking.extrasTotal}{guestsForExtras > 1 ? ` (${t.publicBooking.forGuestsPrefix} ${guestsForExtras} ${t.publicBooking.guestsWord})` : ''}</span>
						<b>{eur(extrasTotalCents)}</b>
					</div>
				{/if}
			</div>
		{/if}

		<div class="bk-footer">
			{#if showAutoApproveNote}
				<p class="bk-status">{hall.auto_approve ? t.publicBooking.autoApproveNote : t.publicBooking.reviewNote}</p>
			{:else}
				<p class="bk-status">{t.publicBooking.reviewNote}</p>
			{/if}
			<button type="submit" class="bk-submit" disabled={!canSubmit}>{t.publicBooking.sendRequest}</button>
		</div>
	</form>
</section>

<style>
	.back { font-size: 13px; color: var(--accent-ink); text-decoration: none; font-weight: 600; }
	/* No box: the form is a lead section on the page and supplies only the stack
	   rhythm between its own parts. Padding and type scale come from the density. */
	/* The form is the whole page here, so the section's trailing padding would
	   stack on the route's own bottom gutter. The stack gap is the only rhythm. */
	.bk-card { display: flex; flex-direction: column; gap: 18px; margin-top: 18px; padding-bottom: 0; }
	/* The stack gap already separates the head from the form; .section-head's
	   own --head-gap would add a second one on top of it. */
	.bk-head { display: flex; align-items: flex-start; gap: 14px; margin-bottom: 0; }
	/* The title rides the density scale, so the dot has to centre on whatever
	   the first line turns out to be rather than on a fixed 18px one. */
	.bk-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; margin-top: calc(var(--h2-size) * .57 - 6px); }
	/* .section-head sizes h2/h3; this screen's title is the page h1 and stays one. */
	.section-head h1 { font-size: var(--h2-size); font-weight: 550; letter-spacing: -.045em; line-height: 1.14; margin: 0; color: var(--text-base); }
	.bk-error { padding: 10px 14px; border-radius: var(--radius-sm); font-size: 13px; font-weight: 500; background: var(--danger-dim); color: var(--danger); border: 1px solid color-mix(in srgb, var(--danger) 25%, transparent); }
	.bk-pre { font-size: var(--body-size); color: var(--text-muted); line-height: var(--body-leading); white-space: pre-wrap; }
	.bk-form { display: flex; flex-direction: column; gap: 16px; }
	.bk-field { display: flex; flex-direction: column; gap: 5px; }
	.bk-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
	label { font-size: 12px; font-weight: 600; color: var(--text-muted); }
	.req { color: var(--danger); }
	input, textarea { font-family: inherit; font-size: 14px; padding: 9px 11px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-panel2); color: var(--text-base); }
	input[type=checkbox] { padding: 0; }
	textarea { resize: vertical; }
	.bk-toggle { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 400; color: var(--text-muted); cursor: pointer; padding-top: 8px; }
	.bk-toggle input { width: 16px; height: 16px; accent-color: var(--accent); }
	.bk-hold { display: flex; align-items: center; gap: 8px; margin-top: 10px; padding: 9px 12px; border-radius: var(--radius); font-size: 13px; color: var(--text-muted); background: var(--bg-panel2); border: 1px solid var(--border); }
	.bk-hold.ok { color: var(--text-base); background: var(--accent-dim); border-color: color-mix(in srgb, var(--accent) 35%, var(--border)); }
	.bk-hold.err { color: var(--danger); background: var(--danger-dim); border-color: color-mix(in srgb, var(--danger) 25%, transparent); }
	.bk-timer { margin-left: auto; font-size: 11px; font-weight: 650; font-variant-numeric: tabular-nums; padding: 3px 9px; border-radius: 3px; background: var(--accent); color: var(--accent-contrast); }
	.bk-note { font-size: 12px; color: var(--text-subtle); margin: 6px 0 0; }
	.bk-hint { font-size: 11.5px; margin-top: 4px; }
	.bk-hint.err { color: var(--danger); }
	/* A hairline, not a panel, separates the commitment from the form. */
	.bk-footer { display: flex; flex-direction: column; gap: 10px; margin-top: 4px; padding-top: 16px; border-top: 1px solid var(--border-subtle); }
	.bk-status { font-size: 12px; color: var(--text-muted); font-style: italic; }
	.bk-extras { display: flex; flex-direction: column; gap: 10px; }
	/* Extras are hairline rows now; accent ink, not a border, carries the state. */
	.bk-extra { cursor: pointer; }
	.bk-extra:hover { background: var(--bg-hover); }
	.bk-extra.on .bk-extra-name, .bk-extra.on .bk-extra-price { color: var(--accent-ink); }
	.bk-extra input { width: 16px; height: 16px; flex-shrink: 0; margin: 0; accent-color: var(--accent); }
	.bk-extra-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
	.bk-extra-name { font-size: 13px; font-weight: 600; color: var(--text-base); }
	.bk-extra-desc { font-size: 11.5px; color: var(--text-muted); }
	.bk-extra-price { font-size: 13px; font-weight: 650; color: var(--text-base); white-space: nowrap; }
	.bk-extras-total { display: flex; align-items: center; justify-content: space-between; padding-top: 12px; border-top: 1px solid var(--border); font-size: 13px; }
	.bk-extras-total b { font-size: 15px; font-weight: 650; }
	.bk-submit { width: 100%; padding: 11px; border-radius: var(--radius-sm); background: var(--accent); color: var(--accent-contrast); font-size: 14px; font-weight: 650; border: none; cursor: pointer; font-family: inherit; transition: transform .2s, background .2s, opacity .15s; }
	/* The lift is the signature interaction of this language. */
	.bk-submit:hover:not(:disabled) { background: var(--accent-hover); transform: translateY(-2px); }
	.bk-submit:active:not(:disabled) { transform: translateY(0); }
	.bk-submit:disabled { opacity: .5; cursor: not-allowed; }

	@media (prefers-reduced-motion: reduce) {
		.bk-submit:hover:not(:disabled) { transform: none; }
	}
</style>
