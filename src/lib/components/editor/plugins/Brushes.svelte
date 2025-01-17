<script lang="ts">
	import Check from '$lib/icons/Check.svelte';
	import Cross from '$lib/icons/Cross.svelte';
	import Cube from '$lib/icons/Cube.svelte';
	import CursorArrowRays from '$lib/icons/CursorArrowRays.svelte';
	import Icon from '$lib/icons/Icon.svelte';
	import { points, walls } from '$lib/util';
	import type { Component } from 'svelte';
	import { selectedBrush } from '../brushes';
	import { v4 as uuidv4 } from 'uuid';
	let {
		allowedBrushes = [
			{ name: 'cursor', icon: CursorArrowRays },
			{ name: 'wallPainter', icon: Cube }
		]
	}: {
		allowedBrushes?: { name: string; icon: Component }[];
	} = $props();
</script>

<div
	class="fixed top-[108px] left-0 z-20 h-10 gap-0.5 w-full pl-[2.625rem] py-0.5 bg-slate-100 border-b border-slate-400/30 flex flex-row items-center"
>
	{#if $selectedBrush == 'cursor'}
		<Icon scale="medium" stroke={1.5} fill="currentColor" forceCenter={true}>
			<CursorArrowRays />
		</Icon>
	{/if}
	{#if $selectedBrush == 'wallPainter'}
		<button
			disabled={$points.length == 0}
			class="barButton"
			onclick={() => {
				walls.update((w) => [
					...w,
					{ points: $points.flatMap((point) => [point.x, point.y]), name: uuidv4() }
				]);
				points.set([]);
			}}
		>
			<Icon scale="medium" stroke={2} fill="none" forceCenter={true}>
				<Check />
			</Icon>
			Potvrdiť tvar
		</button>
		<button
			disabled={$points.length == 0}
			class="barButton"
			onclick={() => {
				points.set([]);
			}}
		>
			<Icon scale="medium" stroke={2} fill="none" forceCenter={true}>
				<Cross />
			</Icon>
			Zrušiť tvar
		</button>
	{/if}
</div>

<div
	class="fixed top-0 left-0 z-20 w-10 h-screen border-r pt-[108px] bg-slate-100 border-slate-400/30"
>
	<div class="flex flex-col gap-0.5 p-0.5">
		{#each allowedBrushes as brush}
			<button
				title={brush.name}
				onclick={() => selectedBrush.set(brush.name)}
				class="grid overflow-hidden rounded hover:bg-slate-300/60 aspect-square place-items-center text-slate-600 {$selectedBrush ==
				brush.name
					? 'bg-slate-300 hover:bg-slate-400/60 text-slate-700'
					: ''}"
			>
				<Icon scale="medium" stroke={1.5} fill="currentColor" forceCenter={true}>
					<brush.icon />
				</Icon>
			</button>
		{/each}
	</div>
</div>

<style lang="postcss">
	.barButton {
		@apply flex flex-row items-center h-full gap-1 px-1.5 py-1 rounded hover:bg-slate-300/60 place-items-center text-slate-600 disabled:bg-slate-200 disabled:text-slate-400;
	}
</style>
