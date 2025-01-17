<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		scale,
		isPeer = false,
		children,
		stroke = 1.5,
		fill = "none",
		forceCenter = false
	}: { scale: 'big' | 'medium' | 'small' | 'tiny'; isPeer?: boolean; children: Snippet, stroke?: number, fill?: string, forceCenter?: boolean } = $props();
</script>

<svg
	data-slot="icon"
	aria-hidden="true"
	fill={fill}
	stroke-width="{stroke}"
	stroke="currentColor"
	viewBox="0 0 24 24"
	xmlns="http://www.w3.org/2000/svg"
	class:peer={isPeer}
	class="{ scale === 'big'
		? 'w-12 h-12'
		: scale === 'medium'
			? 'w-6 h-6'
			: scale === 'small'
				? 'w-5 h-5'
				: 'w-3 h-3'} {forceCenter ? "grid place-items-center" : "" }"
>
	{@render children?.()}
</svg>
