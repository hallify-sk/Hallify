<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		label: string;
		value: string | number;
		sublabel?: string;
	}
	const { label, value, sublabel }: Props = $props();
</script>

<div class="kpi card">
	<div class="kpi-label">{label}</div>
	<div class="kpi-value">{value}</div>
	{#if sublabel}
		<div class="kpi-sub">{sublabel}</div>
	{/if}
</div>

<style>
	.kpi {
		padding: 20px 24px;
	}

	.kpi-label {
		font-size: 13px;
		font-weight: 500;
		color: var(--text-muted);
		margin-bottom: 8px;
	}

	.kpi-value {
		font-size: 32px;
		font-weight: 700;
		color: var(--text-base);
		line-height: 1;
	}

	.kpi-sub {
		font-size: 12px;
		color: var(--text-muted);
		margin-top: 4px;
	}
</style>
