<script lang="ts">
	/* One filter bar for the console's lists (reservations, clients): a search field
	   taking the free width, the page's own filters (selects, a date range) beside it,
	   and the CSV export at the end. Every control is one height (--control-h).

	   It is a plain GET form, so the URL stays the source of truth and the server does
	   the filtering. With JS the form submits itself: a select or date on change, the
	   search after a short pause in typing. Without JS the submit button is there to
	   press (it is only tucked away once the page is hydrated); Enter works either way. */
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';

	interface Props {
		/** The current search, from the URL. */
		q: string;
		searchLabel: string;
		searchPlaceholder: string;
		submitLabel: string;
		exportHref?: string;
		exportLabel?: string;
		/** Accessible name of the whole bar. */
		label?: string;
		/** Hidden inputs that carry the rest of the URL state (tab, status…). */
		hidden?: Snippet;
		/** The page's own controls: .lt-select selects, a DateRangeFilter. */
		filters?: Snippet;
		/** A row under the bar: status chips, a clear link. */
		below?: Snippet;
	}
	const { q, searchLabel, searchPlaceholder, submitLabel, exportHref, exportLabel, label, hidden, filters, below }: Props = $props();

	const uid = `lt-${Math.random().toString(36).slice(2, 8)}`;
	let form: HTMLFormElement | undefined = $state();
	let search: HTMLInputElement | undefined = $state();
	let hydrated = $state(false);
	// Typed text is kept locally: the URL catches up a moment later, and writing that
	// (shorter) value back into the field would eat what was typed in the meantime.
	let text = $state('');
	$effect.pre(() => {
		const v = q;
		if (typeof document === 'undefined' || document.activeElement !== search) text = v;
	});
	onMount(() => { hydrated = true; });

	let timer: ReturnType<typeof setTimeout> | undefined;
	function submitSoon(delay: number) {
		clearTimeout(timer);
		timer = setTimeout(() => form?.requestSubmit(), delay);
	}
	function onInput(e: Event) {
		if (e.target === search) submitSoon(350);
	}
	/** Leave empty fields out of the URL (`?hall=&from=&to=` says nothing). SvelteKit
	 *  reads the form after this handler runs, so they are disabled for that moment. */
	function onSubmit() {
		clearTimeout(timer);
		if (!form) return;
		const empty = [...form.elements].filter((el): el is HTMLInputElement | HTMLSelectElement =>
			(el instanceof HTMLInputElement || el instanceof HTMLSelectElement)
			&& !!el.name && el.value === '' && !el.disabled && el !== document.activeElement);
		for (const el of empty) el.disabled = true;
		setTimeout(() => { for (const el of empty) el.disabled = false; });
	}
	function onChange(e: Event) {
		// The search field's own `change` (on blur) is already covered by the pause above.
		if (e.target !== search) submitSoon(0);
	}
</script>

<div class="lt">
	<form bind:this={form} method="GET" class="lt-bar" role="search" aria-label={label}
		data-sveltekit-keepfocus data-sveltekit-noscroll data-sveltekit-replacestate
		oninput={onInput} onchange={onChange} onsubmit={onSubmit}>
		{@render hidden?.()}
		<div class="lt-search">
			<svg class="lt-search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7.5"/><line x1="20.5" y1="20.5" x2="16.4" y2="16.4"/></svg>
			<label class="sr-only" for="{uid}-q">{searchLabel}</label>
			<input bind:this={search} id="{uid}-q" type="search" name="q" bind:value={text}
				placeholder={searchPlaceholder} maxlength="100" autocomplete="off" spellcheck="false" />
		</div>
		{@render filters?.()}
		<button type="submit" class="btn-outline lt-submit" class:sr-only={hydrated}>{submitLabel}</button>
		{#if exportHref && exportLabel}
			<a class="btn-outline lt-export" href={exportHref} download title={exportLabel}>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3v12"/><polyline points="7 10 12 15 17 10"/><path d="M5 21h14"/></svg>
				<span class="lt-export-label">{exportLabel}</span>
			</a>
		{/if}
	</form>
	{#if below}<div class="lt-below">{@render below()}</div>{/if}
</div>

<style>
	.lt { container-type: inline-size; margin-bottom: 14px; }
	.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; padding: 0; margin: -1px; }

	.lt-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }

	/* Every control on the bar: the app's field look (app.css), one height. */
	.lt-bar :global(:is(input[type="search"], .lt-select, .lt-control)) {
		height: var(--control-h); min-height: var(--control-h);
		font-size: 13px;
	}
	.lt-bar :global(.lt-select) {
		width: auto; flex: 0 1 auto; max-width: 220px; min-width: 0;
		padding-block: 0; padding-inline: 11px 8px;
		text-overflow: ellipsis;
	}

	.lt-search { position: relative; flex: 1 1 260px; min-width: 0; display: flex; align-items: center; }
	.lt-search-icon { position: absolute; left: 12px; color: var(--text-subtle); pointer-events: none; }
	.lt-search input {
		width: 100%;
		background: var(--bg-panel2); border: 1px solid var(--border); border-radius: var(--radius-sm);
		color: var(--text-base); font: inherit; font-size: 13px; outline: none;
		padding: 0 10px 0 34px;
		transition: border-color .15s, box-shadow .15s;
	}
	.lt-search input::placeholder { color: var(--text-subtle); }
	.lt-search input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
	.lt-search input::-webkit-search-cancel-button { cursor: pointer; }

	.lt-submit, .lt-export { height: var(--control-h); padding-block: 0; padding-inline: 14px; font-size: 12.5px; text-decoration: none; }
	.lt-export { margin-left: auto; color: var(--text-base); }
	.lt-export svg { color: var(--text-muted); flex-shrink: 0; }

	.lt-below { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; margin-top: 12px; }

	/* Tablet, on a bar with a date range (a lone select still fits one line): the
	   search and the export share the first line, the filters the next. The search's
	   basis leaves room for the export button only, so nothing else fits beside it. */
	@container (max-width: 880px) {
		.lt-bar:has(:global(.lt-range)) .lt-search { flex: 1 1 calc(100% - 200px); order: -2; }
		.lt-bar:has(:global(.lt-range)) .lt-export { order: -1; margin-left: 0; }
		.lt-bar:has(:global(.lt-range)) :global(.lt-select) { flex: 1 1 150px; max-width: none; }
	}
	/* Phone: the same on every bar, with the export shrunk to its icon; the selects
	   go two to a line and the date range gets a line of its own under them. */
	@container (max-width: 560px) {
		.lt-bar.lt-bar.lt-bar .lt-search { flex: 1 1 calc(100% - var(--control-h) - 8px); order: -2; }
		.lt-bar.lt-bar.lt-bar .lt-export { order: -1; margin-left: 0; width: var(--control-h); padding: 0; justify-content: center; }
		.lt-export-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; }
		.lt-bar.lt-bar.lt-bar :global(.lt-select) { flex: 1 1 calc(50% - 5px); max-width: none; }
		.lt-bar :global(.lt-range) { flex: 1 1 100%; order: 1; }
		.lt-submit:not(.sr-only) { flex: 1 1 100%; justify-content: center; order: 2; }
	}
</style>
