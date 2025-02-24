<script lang="ts">
	import Check from '$lib/icons/Check.svelte';
	import Cross from '$lib/icons/Cross.svelte';
	import Cube from '$lib/icons/Cube.svelte';
	import CursorArrowRays from '$lib/icons/CursorArrowRays.svelte';
	import Icon from '$lib/icons/Icon.svelte';
	import { collapsibleOpen, currentColor, points, walls, zonePoints, zones } from '$lib/util';
	import type { Component } from 'svelte';
	import { selectedBrush } from '../brushes';
	import { v4 as uuidv4 } from 'uuid';
	import Undo from '$lib/icons/Undo.svelte';
	import { pushHistory, redo, tables, undo } from '../lib';
	import Redo from '$lib/icons/Redo.svelte';
	import CubeTransparent from '$lib/icons/CubeTransparent.svelte';
	import NavCollapsibleNoButton from '$lib/components/NavCollapsibleNoButton.svelte';
	import Button from '$lib/components/Button.svelte';
	import colors from 'tailwindcss/colors';

	let openColorDropdown: boolean = $state(false);

	let allowedColors = [
		{ value: colors.red[500], name: 'red' },
		{ value: colors.orange[500], name: 'orange' },
		{ value: colors.amber[500], name: 'amber' },
		{ value: colors.yellow[500], name: 'yellow' },
		{ value: colors.lime[500], name: 'lime' },
		{ value: colors.green[500], name: 'green' },
		{ value: colors.emerald[500], name: 'emerald' },
		{ value: colors.teal[500], name: 'teal' },
		{ value: colors.cyan[500], name: 'cyan' },
		{ value: colors.sky[500], name: 'sky' },
		{ value: colors.blue[500], name: 'blue' },
		{ value: colors.indigo[500], name: 'indigo' },
		{ value: colors.violet[500], name: 'violet' },
		{ value: colors.purple[500], name: 'purple' },
		{ value: colors.fuchsia[500], name: 'fuchsia' },
		{ value: colors.pink[500], name: 'pink' },
		{ value: colors.rose[500], name: 'rose' }
	];

	let {
		allowedBrushes = [
			{ name: 'Cursor', id: 'cursor', icon: CursorArrowRays },
			{ name: 'Wall Painter', id: 'wallPainter', icon: Cube },
			{ name: 'Zone Painter', id: 'zonePainter', icon: CubeTransparent }
		]
	}: {
		allowedBrushes?: { name: string; id: string; icon: Component }[];
	} = $props();
</script>

<div
	class="fixed top-[108px] left-0 z-20 h-12 gap-0.5 w-full pl-[2.625rem] py-0.5 bg-slate-100 border-b border-slate-400/30 flex flex-row items-center"
>
	{#if $selectedBrush == 'cursor'}
		<Icon scale="medium" stroke={1.5} fill="currentColor" forceCenter={true}>
			<CursorArrowRays />
		</Icon>
	{/if}
	{#if $selectedBrush == 'wallPainter'}
		<Button
			disabled={$points.length == 0}
			color="white"
			onclick={() => {
				walls.update((w) => [
					...w,
					{ points: $points.flatMap((point) => [point.x, point.y]), name: uuidv4() }
				]);
				points.set([]);
				pushHistory({
					points: $points,
					zonePoints: $zonePoints,
					walls: $walls,
					zones: $zones,
					tables: $tables
				});
			}}
		>
			<Icon scale="medium" stroke={2} fill="none" forceCenter={true}>
				<Check />
			</Icon>
			Potvrdiť stenu
		</Button>
		<Button
			disabled={$points.length == 0}
			color="white"
			onclick={() => {
				points.set([]);
				pushHistory({
					points: $points,
					zonePoints: $zonePoints,
					walls: $walls,
					zones: $zones,
					tables: $tables
				});
			}}
		>
			<Icon scale="medium" stroke={2} fill="none" forceCenter={true}>
				<Cross />
			</Icon>
			Zrušiť stenu
		</Button>
	{/if}
	{#if $selectedBrush == 'zonePainter'}
		<NavCollapsibleNoButton id="zoneColors" open={openColorDropdown}>
			<Button
				onclick={() => {
					openColorDropdown = !openColorDropdown;
				}}
				color="white"
			>
				<div class="block w-5 h-5 rounded" style="background-color: {$currentColor}"></div>
				<p>Farba</p>
			</Button>
			{#if $collapsibleOpen == 'zoneColors'}
				<div
					class="absolute left-0 flex flex-col py-1 overflow-hidden border rounded-b top-[39px] bg-background-1 border-border-main/30 max-h-80 overflow-y-auto"
				>
					{#each allowedColors as color}
						<Button
							disableBorder={true}
							color="white"
							onclick={() => {
								currentColor.set(color.value);
								openColorDropdown = false;
							}}
						>
							<div class="flex flex-row items-center w-full gap-2 text-left">
								<div class="block w-5 h-5 rounded" style="background-color: {color.value}"></div>
								<p>{color.name}</p>
							</div>
						</Button>
					{/each}
				</div>
			{/if}
		</NavCollapsibleNoButton>
		<button
			disabled={$zonePoints.length == 0}
			class="barButton"
			onclick={() => {
				zones.update((w) => [
					...w,
					{
						points: $zonePoints.flatMap((point) => [point.x, point.y]),
						name: uuidv4(),
						color: $currentColor
					}
				]);
				zonePoints.set([]);
				pushHistory({
					points: $points,
					zonePoints: $zonePoints,
					walls: $walls,
					zones: $zones,
					tables: $tables
				});
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
				pushHistory({
					points: $points,
					zonePoints: $zonePoints,
					walls: $walls,
					zones: $zones,
					tables: $tables
				});
			}}
		>
			<Icon scale="medium" stroke={2} fill="none" forceCenter={true}>
				<Cross />
			</Icon>
			Zrušiť zónu
		</button>
	{/if}
	<Button
		onclick={() => {
			const undoData = undo();
			if (!undoData) return;
			points.set(undoData.points);
			walls.set(undoData.walls);
			tables.set(undoData.tables);
			zonePoints.set(undoData.zonePoints);
			zones.set(undoData.zones);
		}}
		color="white"
	>
		<Icon scale="medium" stroke={2} fill="none" forceCenter={true}>
			<Undo />
		</Icon>
	</Button>
	<Button
		color="white"
		onclick={() => {
			const undoData = redo();
			if (!undoData) return;
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
	</Button>
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
