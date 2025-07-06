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
	import { gridData, pushHistory, redo, screenshotStage, tables, undo } from '../lib';
	import Redo from '$lib/icons/Redo.svelte';
	import CubeTransparent from '$lib/icons/CubeTransparent.svelte';
	import NavCollapsibleNoButton from '$lib/components/NavCollapsibleNoButton.svelte';
	import Button from '$lib/components/Button.svelte';
	import colors from 'tailwindcss/colors';
	import Save from '$lib/icons/Save.svelte';
	import { applyAction, enhance } from '$app/forms';
	import Dialog from '$lib/components/Dialog.svelte';
	import TextInput from '$lib/components/inputs/TextInput.svelte';
	import Checkbox from '$lib/components/inputs/Checkbox.svelte';

	let openColorDropdown: boolean = $state(false);
	let showSaveDialog: boolean = $state(false);
	let planName: string = $state('');
	let makeDefault: boolean = $state(false);
	let saveError: string = $state('');
	let isSaving: boolean = $state(false);

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
	class="fixed top-[108px] left-0 z-20 h-12 gap-0.5 w-full pl-[2.625rem] pr-1 py-0.5 bg-background-1 border-b border-slate-400/30 flex flex-row items-center justify-between"
>
	<div class="flex flex-row items-center gap-1">
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
						gridData: $gridData,
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
						gridData: $gridData,
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
						gridData: $gridData,
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
						gridData: $gridData,
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
	</div>
	<div class="flex flex-row items-center gap-1">
		<Button
			onclick={() => {
				const undoData = undo();
				if (!undoData) return;
				gridData.set(undoData.gridData);
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
				gridData.set(undoData.gridData);
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
		<Button 
			color="primary" 
			onclick={() => {
				showSaveDialog = true;
				planName = '';
				makeDefault = false;
				saveError = '';
			}}
		>
			<Icon scale="medium" stroke={2} fill="none" forceCenter={true}>
				<Save />
			</Icon>
			Uložiť
		</Button>
	</div>
</div>

<div
	class="fixed top-0 left-0 z-20 w-10 h-screen border-r pt-[108px] bg-background-1 border-slate-400/30"
>
	<div class="flex flex-col gap-0.5 p-0.5">
		{#each allowedBrushes as brush}
			<button
				title={brush.name}
				onclick={() => selectedBrush.set(brush.id)}
				class="grid overflow-hidden rounded hover:bg-background-2 aspect-square place-items-center text-text-main {$selectedBrush ==
				brush.id
					? 'bg-background-4 hover:bg-background-5 text-text-main'
					: ''}"
			>
				<Icon scale="medium" stroke={1.5} fill="currentColor" forceCenter={true}>
					<brush.icon />
				</Icon>
			</button>
		{/each}
	</div>
</div>

<!-- Save Plan Dialog -->
<Dialog bind:open={showSaveDialog}>
	{#snippet header()}
		<p>Uložiť plán sály</p>
	{/snippet}
	
	<div class="p-6 space-y-4">
		{#if saveError}
			<div class="p-3 text-sm text-red-600 bg-red-100 border border-red-300 rounded">
				{saveError}
			</div>
		{/if}
		
		<div>
			<label for="plan-name" class="block text-sm font-medium text-text-main mb-2">
				Názov plánu
			</label>
			<TextInput
				id="plan-name"
				bind:value={planName}
				placeholder="Zadajte názov plánu..."
				disabled={isSaving}
			/>
		</div>
		
		<div>
			<div class="flex items-center gap-2">
				<Checkbox
					id="make-default"
					name="make-default"
					bind:checked={makeDefault}
					disabled={isSaving}
				/>
				<label for="make-default" class="text-sm text-text-main cursor-pointer">
					Nastaviť ako predvolený plán pre túto sálu
				</label>
			</div>
		</div>
	</div>
	
	<div class="flex justify-between p-4 border-t border-border-main/30 bg-background-2">
		<Button 
			color="transparent" 
			onclick={() => {
				showSaveDialog = false;
				planName = '';
				makeDefault = false;
				saveError = '';
			}}
			disabled={isSaving}
		>
			Zrušiť
		</Button>
		<Button 
			color="primary" 
			disabled={!planName.trim() || isSaving}
			onclick={async () => {
				if (!planName.trim()) {
					saveError = 'Názov plánu je povinný';
					return;
				}
				
				isSaving = true;
				saveError = '';
				
				try {
					const screenshot = screenshotStage();
					const formData = new FormData();
					
					formData.append('plan', JSON.stringify({
						gridData: $gridData,
						points: $points,
						walls: $walls,
						tables: $tables,
						zonePoints: $zonePoints,
						zones: $zones
					}));
					formData.append('screenshot', screenshot || '');
					formData.append('name', planName.trim());
					formData.append('makeDefault', makeDefault.toString());
					
					const response = await fetch('?/savePlan', {
						method: 'POST',
						body: formData
					});
					
					if (response.ok) {
						showSaveDialog = false;
						planName = '';
						makeDefault = false;
						// Optionally show success message or redirect
					} else {
						const result = await response.text();
						saveError = 'Nepodarilo sa uložiť plán';
					}
				} catch (error) {
					saveError = 'Nastala chyba pri ukladaní plánu';
				} finally {
					isSaving = false;
				}
			}}
		>
			{#if isSaving}
				<svg class="w-4 h-4 mr-2 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
					<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
					<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v16a8 8 0 01-8-8z"></path>
				</svg>
				Ukladá sa...
			{:else}
				<Icon scale="small">
					<Save />
				</Icon>
				Uložiť plán
			{/if}
		</Button>
	</div>
</Dialog>

<style lang="postcss">
	.barButton {
		@apply flex flex-row items-center h-full gap-1 px-1.5 py-1 rounded hover:bg-slate-300/60 place-items-center text-slate-600 disabled:bg-slate-200 bg-slate-200/70 disabled:text-slate-400;
	}
</style>
