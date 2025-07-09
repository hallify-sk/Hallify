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
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';

	let openColorDropdown: boolean = $state(false);
	let showSaveDialog: boolean = $state(false);
	let saveError: string = $state('');
	let isSaving: boolean = $state(false);
	let showToast: boolean = $state(false);
	let toastMessage: string = $state('');

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
		],
		data
	}: {
		allowedBrushes?: { name: string; id: string; icon: Component }[];
		data?: any;
	} = $props();

	// Determine if we're creating a new plan or editing existing
	let isNewPlan = $derived(data?.isNewPlan || false);
	let hallId = $derived(data?.hall?.id);

	// Toast auto-hide effect
	$effect(() => {
		if (showToast) {
			const timer = setTimeout(() => {
				showToast = false;
			}, 3000);
			return () => clearTimeout(timer);
		}
	});

	// Function to show toast
	function showToastMessage(message: string) {
		toastMessage = message;
		showToast = true;
	}

	// Function to handle saving
	async function handleSave() {
		if (isNewPlan) {
			// For new plans, show dialog
			showSaveDialog = true;
			saveError = '';
		} else {
			// For existing plans, save directly with toast confirmation
			await savePlan(false);
		}
	}

	// Function to actually save the plan
	async function savePlan(isFromDialog = true) {
		isSaving = true;
		saveError = '';
		
		try {
			const screenshot = screenshotStage();
			const formData = new FormData();
			
			formData.append('plan', JSON.stringify({
				elements: [], // Ensure we always have elements for validation
				gridData: $gridData,
				points: $points,
				walls: $walls,
				tables: $tables,
				zonePoints: $zonePoints,
				zones: $zones
			}));
			formData.append('screenshot', screenshot || '');
			
			// For new plans, we need to handle redirect differently
			if (isNewPlan) {
				// Create a hidden form for new plans to handle redirect properly
				const form = document.createElement('form');
				form.method = 'POST';
				form.action = '?/savePlan';
				form.style.display = 'none';
				
				// Add plan data
				const planInput = document.createElement('input');
				planInput.type = 'hidden';
				planInput.name = 'plan';
				planInput.value = JSON.stringify({
					elements: [],
					gridData: $gridData,
					points: $points,
					walls: $walls,
					tables: $tables,
					zonePoints: $zonePoints,
					zones: $zones
				});
				form.appendChild(planInput);
				
				// Add screenshot
				const screenshotInput = document.createElement('input');
				screenshotInput.type = 'hidden';
				screenshotInput.name = 'screenshot';
				screenshotInput.value = screenshot || '';
				form.appendChild(screenshotInput);
				
				// Add to document and submit (this will trigger redirect)
				document.body.appendChild(form);
				form.submit();
				return;
			} else {
				// For existing plans, use fetch for AJAX update
				const response = await fetch('?/savePlan', {
					method: 'POST',
					body: formData
				});
				
				const result = await response.json();
				
				if (response.ok && result.type === 'success') {
					showToastMessage('Plán bol úspešne uložený');
					if (isFromDialog) {
						showSaveDialog = false;
					}
				} else {
					const errorMsg = result.data?.message || 'Nepodarilo sa uložiť plán';
					if (isFromDialog) {
						saveError = errorMsg;
					} else {
						showToastMessage('Chyba pri ukladaní plánu: ' + errorMsg);
					}
				}
			}
		} catch (error) {
			console.error('Save error:', error);
			const errorMsg = 'Nastala chyba pri ukladaní plánu';
			if (isFromDialog) {
				saveError = errorMsg;
			} else {
				showToastMessage(errorMsg);
			}
		} finally {
			isSaving = false;
		}
	}
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
			onclick={handleSave}
			disabled={isSaving}
		>
			<Icon scale="medium" stroke={2} fill="none" forceCenter={true}>
				<Save />
			</Icon>
			{#if isSaving}
				Ukladá sa...
			{:else if isNewPlan}
				Uložiť
			{:else}
				Uložiť zmeny
			{/if}
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
		<p>Vytvoriť nový plán sály</p>
	{/snippet}
	
	<div class="p-6 space-y-4">
		{#if saveError}
			<div class="p-3 text-sm text-red-600 bg-red-100 border border-red-300 rounded">
				{saveError}
			</div>
		{/if}
		
		<div class="text-center space-y-2">
			<p class="text-text-main">Chcete vytvoriť nový plán pre túto sálu?</p>
			<p class="text-sm text-text-2">Po uložení budete presmerovaný do editora, kde môžete plán ďalej upravovať.</p>
		</div>
	</div>
	
	<div class="flex justify-between p-4 border-t border-border-main/30 bg-background-2">
		<Button 
			color="transparent" 
			onclick={() => {
				showSaveDialog = false;
				saveError = '';
			}}
			disabled={isSaving}
		>
			Zrušiť
		</Button>
		<Button 
			color="primary" 
			disabled={isSaving}
			onclick={() => savePlan(true)}
		>
			{#if isSaving}
				<svg class="w-4 h-4 mr-2 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
					<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
					<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v16a8 8 0 01-8-8z"></path>
				</svg>
				Vytvára sa...
			{:else}
				<Icon scale="small">
					<Save />
				</Icon>
				Vytvoriť plán
			{/if}
		</Button>
	</div>
</Dialog>

<!-- Toast Notification -->
{#if showToast}
	<div 
		class="fixed bottom-4 right-4 z-50 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-slide-in"
	>
		<Icon scale="small">
			<Check />
		</Icon>
		<span>{toastMessage}</span>
		<button 
			onclick={() => showToast = false}
			class="ml-2 text-white hover:text-green-200"
		>
			<Icon scale="small">
				<Cross />
			</Icon>
		</button>
	</div>
{/if}

<style lang="postcss">
	.barButton {
		@apply flex flex-row items-center h-full gap-1 px-1.5 py-1 rounded hover:bg-slate-300/60 place-items-center text-slate-600 disabled:bg-slate-200 bg-slate-200/70 disabled:text-slate-400;
	}
	
	@keyframes slide-in {
		from {
			transform: translateX(100%);
			opacity: 0;
		}
		to {
			transform: translateX(0);
			opacity: 1;
		}
	}
	
	.animate-slide-in {
		animation: slide-in 0.3s ease-out;
	}
</style>
