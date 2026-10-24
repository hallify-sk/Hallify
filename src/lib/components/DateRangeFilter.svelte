<script lang="ts">
	/* A from–to pair of native date fields drawn as one control, for ListToolbar.

	   An EMPTY date field is not drawn empty by every browser: Safari on macOS paints
	   today's date into it, so "no limit" read as "today – today" on the reservations
	   list. While a field is empty and not being edited its own text is hidden and the
	   placeholder given here shows instead, in every browser. */
	interface Props {
		from: string;
		to: string;
		label: string;
		fromLabel: string;
		toLabel: string;
		/** Shown in an empty field (defaults to the label). */
		fromPlaceholder?: string;
		toPlaceholder?: string;
		/** A link to the same list without the dates (works without JS too). */
		clearHref?: string;
		clearLabel?: string;
		fromName?: string;
		toName?: string;
	}
	const { from, to, label, fromLabel, toLabel, fromPlaceholder, toPlaceholder, clearHref, clearLabel, fromName = 'from', toName = 'to' }: Props = $props();

	let fromVal = $state('');
	let toVal = $state('');
	$effect.pre(() => { fromVal = from; });
	$effect.pre(() => { toVal = to; });

	function pickDate(e: MouseEvent) {
		try { (e.currentTarget as HTMLInputElement).showPicker?.(); } catch { /* not allowed here: typing still works */ }
	}
</script>

<div class="lt-range lt-control" role="group" aria-label={label}>
	<svg class="lr-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4.5" width="18" height="16.5" rx="2"/><line x1="16" y1="2.5" x2="16" y2="6.5"/><line x1="8" y1="2.5" x2="8" y2="6.5"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
	<span class="lr-field" class:empty={!fromVal} data-placeholder={fromPlaceholder ?? fromLabel}>
		<input type="date" name={fromName} bind:value={fromVal} max={toVal || undefined} aria-label={fromLabel} onclick={pickDate} />
	</span>
	<span class="lr-dash" aria-hidden="true">–</span>
	<span class="lr-field" class:empty={!toVal} data-placeholder={toPlaceholder ?? toLabel}>
		<input type="date" name={toName} bind:value={toVal} min={fromVal || undefined} aria-label={toLabel} onclick={pickDate} />
	</span>
	{#if clearHref && (from || to)}
		<a class="lr-clear" href={clearHref} aria-label={clearLabel} title={clearLabel}>
			<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
		</a>
	{/if}
</div>

<style>
	.lt-range {
		display: inline-flex; align-items: center; gap: 2px;
		flex: 0 0 auto;
		padding: 0 6px 0 11px;
		background: var(--bg-panel2); border: 1px solid var(--border); border-radius: var(--radius-sm);
		transition: border-color .15s, box-shadow .15s;
	}
	.lt-range:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
	.lr-icon { color: var(--text-subtle); flex-shrink: 0; margin-right: 4px; }
	.lr-dash { color: var(--text-subtle); font-size: 13px; padding: 0 2px; }

	.lr-field { position: relative; display: inline-flex; flex: 1 1 92px; min-width: 0; }
	/* The fields sit inside the group's border: no chrome of their own. */
	.lr-field input {
		width: 100%; min-width: 0; height: calc(var(--control-h) - 2px);
		padding: 0 4px; border: 0; border-radius: 0; background: transparent; box-shadow: none;
		font-size: 13px; font-variant-numeric: tabular-nums; color: var(--text-base);
	}
	.lr-field input:focus { box-shadow: none; border: 0; }
	.lr-field input { cursor: pointer; }
	/* One calendar icon leads the group; the per-field ones go, and a click on the
	   field opens its picker instead (pickDate). */
	.lr-field input::-webkit-calendar-picker-indicator { display: none; }

	/* Empty and not being edited: hide whatever the browser draws (dd.mm.yyyy, or
	   Safari's today) and show the placeholder. */
	.lr-field.empty::before {
		content: attr(data-placeholder);
		position: absolute; left: 4px; top: 50%; transform: translateY(-50%);
		font-size: 13px; color: var(--text-subtle); pointer-events: none; white-space: nowrap;
	}
	.lr-field.empty:focus-within::before { content: none; }
	.lr-field.empty:not(:focus-within) input { color: transparent; }
	.lr-field.empty:not(:focus-within) input::-webkit-datetime-edit { color: transparent; }
	.lr-field.empty:not(:focus-within) input::-webkit-datetime-edit-fields-wrapper { color: transparent; }
	.lr-field.empty:not(:focus-within) input::-webkit-datetime-edit-text,
	.lr-field.empty:not(:focus-within) input::-webkit-datetime-edit-day-field,
	.lr-field.empty:not(:focus-within) input::-webkit-datetime-edit-month-field,
	.lr-field.empty:not(:focus-within) input::-webkit-datetime-edit-year-field { color: transparent; }

	.lr-clear {
		display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
		width: 20px; height: 20px; margin-left: 2px; border-radius: 50%;
		color: var(--text-muted); text-decoration: none;
	}
	.lr-clear:hover { background: var(--bg-hover); color: var(--text-base); }
</style>
