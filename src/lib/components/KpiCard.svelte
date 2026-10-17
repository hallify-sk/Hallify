<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		label: string;
		value: string | number;
		sublabel?: string;
		/** Optional leading mark, rendered inside the shared .icon-tile square. */
		icon?: Snippet;
		/** Tints the icon tile. Ignored when no icon is passed. */
		tone?: 'accent' | 'warning' | 'success' | 'danger';
		/** Optional trailing link ("Review →"). Both halves are required for it to render. */
		actionHref?: string;
		actionLabel?: string;
	}
	const {
		label, value, sublabel, icon, tone = 'accent', actionHref, actionLabel,
	}: Props = $props();
</script>

<!--
	One KPI, as a top-anchored stack: tile, then number, then label.

	The stack order is what keeps a strip of these aligned. The old admin
	version put the tile beside the text and centred the two, so a card whose
	label wrapped to a second line pushed its own tile down and the row of
	icons went crooked. Here every row above the label has a fixed height — a
	32px tile, a --display-size number on line-height 1 — so the tiles share a
	line, the numbers share a baseline and the labels all start at the same y,
	whatever the translation does to the text underneath.
-->
<div class="kpi">
	{#if icon}
		<span class="icon-tile icon-tile--sm kpi-icon" data-tone={tone} aria-hidden="true">
			{@render icon()}
		</span>
	{/if}
	<div class="kpi-value">{value}</div>
	<div class="kpi-label">{label}</div>
	{#if sublabel}
		<div class="kpi-sub">{sublabel}</div>
	{/if}
	{#if actionHref && actionLabel}
		<a class="kpi-action" href={actionHref}>{actionLabel}</a>
	{/if}
</div>

<style>
	.kpi {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		min-width: 0;
	}

	.kpi-icon { margin-bottom: 12px; }
	.kpi-icon[data-tone='accent']  { background: var(--accent-dim);  color: var(--accent-ink); }
	.kpi-icon[data-tone='warning'] { background: var(--warning-dim); color: var(--warning); }
	.kpi-icon[data-tone='success'] { background: var(--success-dim); color: var(--success); }
	.kpi-icon[data-tone='danger']  { background: var(--danger-dim);  color: var(--danger); }

	.kpi-value {
		font-size: var(--display-size);
		font-weight: 550;
		letter-spacing: -0.055em;
		color: var(--text-base);
		line-height: 1;
		font-variant-numeric: tabular-nums;
	}

	.kpi-label {
		font-size: var(--meta-size);
		font-weight: 650;
		text-transform: uppercase;
		letter-spacing: 0.13em;
		line-height: 1.7;
		color: var(--text-muted);
		margin-top: 8px;
	}

	.kpi-sub {
		font-size: var(--body-size);
		color: var(--text-muted);
		margin-top: 4px;
	}

	.kpi-action {
		font-size: 11px;
		font-weight: 600;
		color: var(--accent-ink);
		text-decoration: none;
		margin-top: 8px;
	}
	.kpi-action:hover { text-decoration: underline; }
</style>
