<script lang="ts">
	/**
	 * A small "what does this mean?" affordance beside a field label.
	 *
	 * Deliberately a <button> with a popover rather than a `title` attribute: a title
	 * never appears on touch, is unreachable by keyboard, and is announced
	 * inconsistently by screen readers. This opens on click or Enter/Space, closes on
	 * Escape or an outside click, and is wired to the trigger with aria-describedby so
	 * the explanation is read out with the control it explains.
	 */
	interface Props {
		/** The explanation. Already-translated text — this component adds no copy. */
		text: string;
		/** Accessible name for the trigger, e.g. "What is this?". */
		label: string;
	}
	const { text, label }: Props = $props();

	let open = $state(false);
	let root = $state<HTMLElement | null>(null);
	const id = `hint-${Math.random().toString(36).slice(2, 9)}`;

	function onDocumentPointer(event: MouseEvent) {
		if (root && !root.contains(event.target as Node)) open = false;
	}

	function onKey(event: KeyboardEvent) {
		if (event.key === 'Escape' && open) {
			open = false;
			// Escape should leave focus on the trigger, not nowhere.
			(root?.querySelector('button') as HTMLButtonElement | null)?.focus();
		}
	}

	$effect(() => {
		if (!open) return;
		document.addEventListener('pointerdown', onDocumentPointer, true);
		document.addEventListener('keydown', onKey, true);
		return () => {
			document.removeEventListener('pointerdown', onDocumentPointer, true);
			document.removeEventListener('keydown', onKey, true);
		};
	});
</script>

<span class="info-hint" bind:this={root}>
	<button
		type="button"
		class="info-trigger"
		aria-label={label}
		aria-expanded={open}
		aria-describedby={open ? id : undefined}
		onclick={() => (open = !open)}
	>
		<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
			<circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
		</svg>
	</button>
	{#if open}
		<span class="info-pop" {id} role="note">{text}</span>
	{/if}
</span>

<style>
	.info-hint {
		position: relative;
		display: inline-flex;
		vertical-align: middle;
		margin-left: 5px;
	}

	.info-trigger {
		display: grid;
		place-items: center;
		width: 18px;
		height: 18px;
		padding: 0;
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-subtle);
		cursor: pointer;
		transition: color .15s, background .15s;
	}
	.info-trigger:hover,
	.info-trigger[aria-expanded='true'] {
		color: var(--accent-ink);
		background: var(--bg-hover);
	}

	.info-pop {
		position: absolute;
		z-index: 40;
		top: calc(100% + 6px);
		left: -8px;
		width: max-content;
		max-width: 260px;
		padding: 9px 11px;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--bg-panel);
		box-shadow: var(--shadow);
		color: var(--text-muted);
		font-size: 12px;
		font-weight: 400;
		line-height: 1.6;
		letter-spacing: 0;
		text-transform: none;
		white-space: normal;
	}

	/* Near the right edge the popover would otherwise push the page sideways. */
	@media (max-width: 560px) {
		.info-pop { left: auto; right: -8px; }
	}
</style>
