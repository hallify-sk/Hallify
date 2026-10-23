<script lang="ts">
	// A rating shown as five stars (D5). Display only; the client's form uses radios.
	import { t } from '$lib/i18n.svelte';

	interface Props { rating: number; size?: number }
	const { rating, size = 14 }: Props = $props();
	const filled = $derived(Math.max(0, Math.min(5, Math.round(rating))));
</script>

<span class="stars" role="img" aria-label={t.feedback.starLabel(filled)} style:--size="{size}px">
	{#each [1, 2, 3, 4, 5] as n}
		<span class="s" class:on={n <= filled} aria-hidden="true">★</span>
	{/each}
</span>

<style>
	.stars { display: inline-flex; gap: 1px; line-height: 1; font-size: var(--size); vertical-align: -1px; }
	.s { color: var(--border); }
	.s.on { color: var(--warning); }
</style>
