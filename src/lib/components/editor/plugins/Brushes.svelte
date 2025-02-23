<script lang="ts">
	import Check from '$lib/icons/Check.svelte';
	import Cross from '$lib/icons/Cross.svelte';
	import Cube from '$lib/icons/Cube.svelte';
	import CursorArrowRays from '$lib/icons/CursorArrowRays.svelte';
	import Icon from '$lib/icons/Icon.svelte';
	import { points, walls, zonePoints, zones } from '$lib/util';
	import type { Component } from 'svelte';
	import { selectedBrush } from '../brushes';
	import { v4 as uuidv4 } from 'uuid';
	import Undo from '$lib/icons/Undo.svelte';
	import { pushHistory, redo, tables, undo } from '../lib';
	import Redo from '$lib/icons/Redo.svelte';
	import CubeTransparent from '$lib/icons/CubeTransparent.svelte';
	let {
		allowedBrushes = [
			{ name: 'Cursor', id: "cursor", icon: CursorArrowRays },
			{ name: 'Wall Painter', id: "wallPainter", icon: Cube },
			{ name: 'Zone Painter', id: "zonePainter", icon: CubeTransparent },
		]
	}: {
		allowedBrushes?: { name: string; id: string; icon: Component }[];
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
				pushHistory({ points: $points, zonePoints: $zonePoints, walls: $walls, zones: $zones, tables: $tables });
			}}
		>
			<Icon scale="medium" stroke={2} fill="none" forceCenter={true}>
				<Check />
			</Icon>
			Potvrdiť stenu
		</button>
		<button
			disabled={$points.length == 0}
			class="barButton"
			onclick={() => {
				points.set([]);
				pushHistory({ points: $points, zonePoints: $zonePoints, walls: $walls, zones: $zones, tables: $tables });
			}}
		>
			<Icon scale="medium" stroke={2} fill="none" forceCenter={true}>
				<Cross />
			</Icon>
			Zrušiť stenu
		</button>
	{/if}
	{#if $selectedBrush == 'zonePainter'}
		<button
			disabled={$zonePoints.length == 0}
			class="barButton"
			onclick={() => {
				zones.update((w) => [
					...w,
					{ points: $zonePoints.flatMap((point) => [point.x, point.y]), name: uuidv4(), color: "#333" }
				]);
				console.log($zones);
				zonePoints.set([]);
				pushHistory({ points: $points, zonePoints: $zonePoints, walls: $walls, zones: $zones, tables: $tables });
			}}
		>
			<Icon scale="medium" stroke={2} fill="none" forceCenter={true}>
				<Check />
			</Icon>
			Potvrdiť zónu
		</button>
		<button
			disabled={$zonePoints.length == 0}
			class="barButton"
			onclick={() => {
				zonePoints.set([]);
				pushHistory({ points: $points, zonePoints: $zonePoints, walls: $walls, zones: $zones, tables: $tables });
			}}
		>
			<Icon scale="medium" stroke={2} fill="none" forceCenter={true}>
				<Cross />
			</Icon>
			Zrušiť zónu
		</button>
	{/if}
	<button

			class="barButton"
			onclick={() => {
				const undoData = undo();
				if(!undoData) return;
				points.set(undoData.points);
				walls.set(undoData.walls);
				tables.set(undoData.tables);
				zonePoints.set(undoData.zonePoints);
				zones.set(undoData.zones);
			}}
		>
			<Icon scale="medium" stroke={2} fill="none" forceCenter={true}>
				<Undo />
			</Icon>
		</button>
		<button

			class="barButton"
			onclick={() => {
				const undoData = redo();
				if(!undoData) return;
				points.set(undoData.points);
				walls.set(undoData.walls);
				tables.set(undoData.tables);
				zonePoints.set(undoData.zonePoints);
				zones.set(undoData.zones);
			}}
		>
			<Icon scale="medium" stroke={2} fill="none" forceCenter={true}>
				<Redo />
			</Icon>
		</button>
</div>

<div
	class="fixed top-0 left-0 z-20 w-10 h-screen border-r pt-[108px] bg-slate-100 border-slate-400/30"
>
	<div class="flex flex-col gap-0.5 p-0.5">
		{#each allowedBrushes as brush}
			<button
				title={brush.name}
				onclick={() => selectedBrush.set(brush.id)}
				class="grid overflow-hidden rounded hover:bg-slate-300/60 aspect-square place-items-center text-slate-600 {$selectedBrush ==
				brush.id
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
		@apply flex flex-row items-center h-full gap-1 px-1.5 py-1 rounded hover:bg-slate-300/60 place-items-center text-slate-600 disabled:bg-slate-200 bg-slate-200/70 disabled:text-slate-400;
	}
</style>
