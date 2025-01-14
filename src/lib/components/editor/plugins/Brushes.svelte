<script lang="ts">
	import Cube from '$lib/icons/Cube.svelte';
	import CursorArrowRays from '$lib/icons/CursorArrowRays.svelte';
	import Icon from '$lib/icons/Icon.svelte';
	import { selectedBrush } from '../brushes';
	let {
		allowedBrushes = [{ name: 'cursor', icon: CursorArrowRays },{ name: 'wallPainter', icon: Cube }]
	}: {
		allowedBrushes?: { name: string; icon: any }[];
	} = $props();
</script>

<div
	class="fixed top-0 left-0 z-20 w-10 h-screen border-r pt-[108px] bg-slate-100 border-slate-400/30"
>
	<div class="flex flex-col gap-0.5 p-0.5">
		{#each allowedBrushes as brush}
			<button
				onclick={() => (selectedBrush.set(brush.name))}
				class="grid overflow-hidden rounded hover:bg-slate-300/60 aspect-square place-items-center text-slate-600 {$selectedBrush ==
					brush.name ? "bg-slate-300 hover:bg-slate-400/60 text-slate-700" : ""}"
			>
				<Icon scale="medium" stroke={1.5} fill="currentColor" forceCenter={true}>
                    {@render brush.icon()}
				</Icon>
			</button>
		{/each}
	</div>
</div>
