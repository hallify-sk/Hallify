<script lang="ts">
	import { enhance } from '$app/forms';
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

<div class="bk-card">
	<div class="bk-head">
		<span class="bk-dot" style="background:{hall.color}"></span>
		<div>
			<h1>{t.publicBooking.requestReservation}</h1>
			<p class="bk-sub">{hall.name}</p>
		</div>
	</div>

	{#if formError}<div class="bk-error">{formError}</div>{/if}
	{#if hall.pre_reservation_text}<div class="bk-pre">{hall.pre_reservation_text}</div>{/if}

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
				<span class="bk-extras-label">{t.publicBooking.extrasLabel}</span>
				{#each extras as ex}
					{@const on = selectedExtras.includes(ex.id)}
					<label class="bk-extra" class:on>
						<input type="checkbox" checked={on} onchange={() => toggleExtra(ex.id)} />
						<span class="bk-extra-main">
							<span class="bk-extra-name">{ex.name}</span>
							{#if ex.description}<span class="bk-extra-desc">{ex.description}</span>{/if}
						</span>
						<span class="bk-extra-price">{eur(ex.price_cents)}{ex.pricing === 'per_guest' ? ` / ${t.publicBooking.perGuest}` : ''}</span>
					</label>
					{#if on}<input type="hidden" name="extras" value={ex.id} />{/if}
				{/each}
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
</div>

<style>
	.back { font-size: 13px; color: var(--accent); text-decoration: none; font-weight: 600; }
	.bk-card { background: var(--bg-panel, var(--surface)); border: 1px solid var(--border); border-radius: 14px; padding: 24px; display: flex; flex-direction: column; gap: 18px; margin-top: 14px; }
	.bk-head { display: flex; align-items: center; gap: 14px; }
	.bk-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
	.bk-head h1 { font-size: 18px; font-weight: 800; color: var(--text-base); margin-bottom: 2px; }
	.bk-sub { font-size: 13px; color: var(--text-muted); }
	.bk-error { padding: 10px 14px; border-radius: 8px; font-size: 13px; font-weight: 500; background: color-mix(in srgb, var(--danger) 10%, transparent); color: var(--danger); border: 1px solid color-mix(in srgb, var(--danger) 25%, transparent); }
	.bk-pre { font-size: 13px; color: var(--text-muted); background: var(--bg-panel2, var(--bg-base)); border-radius: 8px; padding: 12px; border: 1px solid var(--border); line-height: 1.5; white-space: pre-wrap; }
	.bk-form { display: flex; flex-direction: column; gap: 16px; }
	.bk-field { display: flex; flex-direction: column; gap: 5px; }
	.bk-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
	label { font-size: 12px; font-weight: 600; color: var(--text-muted); }
	.req { color: var(--danger); }
	input, textarea { font-family: inherit; font-size: 14px; padding: 9px 11px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-panel2, var(--bg-base)); color: var(--text-base); }
	input[type=checkbox] { padding: 0; }
	textarea { resize: vertical; }
	.bk-toggle { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 400; color: var(--text-muted); cursor: pointer; padding-top: 8px; }
	.bk-toggle input { width: 16px; height: 16px; accent-color: var(--accent); }
	.bk-hold { display: flex; align-items: center; gap: 8px; margin-top: 10px; padding: 9px 12px; border-radius: 9px; font-size: 13px; color: var(--text-muted); background: var(--bg-panel2, var(--bg-base)); border: 1px solid var(--border); }
	.bk-hold.ok { color: var(--text-base); background: var(--accent-dim); border-color: color-mix(in srgb, var(--accent) 35%, var(--border)); }
	.bk-hold.err { color: var(--danger); background: color-mix(in srgb, var(--danger) 9%, transparent); border-color: color-mix(in srgb, var(--danger) 25%, transparent); }
	.bk-timer { margin-left: auto; font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums; padding: 3px 9px; border-radius: 99px; background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); }
	.bk-note { font-size: 12px; color: var(--text-subtle); margin: 6px 0 0; }
	.bk-hint { font-size: 11.5px; margin-top: 4px; }
	.bk-hint.err { color: var(--danger); }
	.bk-footer { display: flex; flex-direction: column; gap: 10px; margin-top: 4px; }
	.bk-status { font-size: 12px; color: var(--text-muted); font-style: italic; }
	.bk-extras { display: flex; flex-direction: column; gap: 8px; margin-bottom: 6px; }
	.bk-extras-label { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--text-subtle); }
	.bk-extra { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border: 1px solid var(--border); border-radius: 10px; cursor: pointer; background: var(--bg-panel); }
	.bk-extra.on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 6%, var(--bg-panel)); }
	.bk-extra input { width: 16px; height: 16px; flex-shrink: 0; margin: 0; }
	.bk-extra-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
	.bk-extra-name { font-size: 13px; font-weight: 600; color: var(--text-base); }
	.bk-extra-desc { font-size: 11.5px; color: var(--text-muted); }
	.bk-extra-price { font-size: 13px; font-weight: 700; color: var(--text-base); white-space: nowrap; }
	.bk-extras-total { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border-radius: 9px; background: var(--bg-panel2, var(--bg-base)); font-size: 13px; }
	.bk-extras-total b { font-size: 15px; }
	.bk-submit { width: 100%; padding: 11px; border-radius: 8px; background: var(--accent); color: #fff; font-size: 14px; font-weight: 600; border: none; cursor: pointer; font-family: inherit; transition: opacity .15s; }
	.bk-submit:hover:not(:disabled) { opacity: .9; }
	.bk-submit:disabled { opacity: .5; cursor: not-allowed; }
</style>
