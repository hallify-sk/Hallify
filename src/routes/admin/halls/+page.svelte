<script lang="ts">
	import { barGraphStyle } from '$lib/charts';
	import Dialog from '$lib/components/Dialog.svelte';
	import TextInput from '$lib/components/inputs/TextInput.svelte';
	import Icon from '$lib/icons/Icon.svelte';
	import Plus from '$lib/icons/Plus.svelte';

	import * as echarts from 'echarts';
	import { onMount } from 'svelte';
	import Switch from '$lib/components/inputs/Switch.svelte';
	import Tooltip from '$lib/components/Tooltip.svelte';
	import Combobox from '$lib/components/inputs/Combobox.svelte';

	// Create the echarts instance
	onMount(() => {
		var myChart = echarts.init(document.getElementById('chartWrapper'));
		// Draw the chart

		const styleOptions = barGraphStyle([
			'Sála 1',
			'Sála 2',
		]);

		myChart.setOption({
			...styleOptions,
			series: [
				{
					name: 'Rezervované udalosti',
					type: 'bar',
					data: [
						{
							value: 10,
							itemStyle: {
								color: '#3b82f6'
							}
						},
						{
							value: 17,
							itemStyle: {
								color: '#eab308'
							}
						}
					]
				}
			]
		});

		new ResizeObserver(() => myChart.resize()).observe(
			document.getElementById('chartWrapper') as HTMLElement
		);
	});

	let colorValue: string;

	$: if (colorValue) {
		console.log(colorValue);
	}

	let openEventDialog: () => void;
	let closeEventDialog: () => void;
	onMount(()=>{
		openEventDialog();
	})

	let hallError: {
		type: string,
		message: string
	} = {type: "", message: ""};

</script>

<div class="w-full min-h-screen bg-slate-200 py-6 px-4 md:px-24">
	<div class="max-w-7xl w-full mx-auto flex flex-row flex-wrap justify-between items-center">
		<div class="flex flex-col flex-nowrap">
			<p class="uppercase text-[0.65rem] text-slate-400">Prehľad</p>
			<p class="text-slate-700">Manažment sál</p>
		</div>
		<div class="flex flex-row flex-nowrap items-center">
			<button
				on:click={openEventDialog}
				class="flex flex-row gap-2 items-center bg-blue-500 hover:bg-blue-400 duration-150 text-slate-100 px-4 py-2 rounded border border-blue-600/30 text-sm"
			>
				<Icon scale="small">
					<Plus />
				</Icon>
				<p>Pridať sálu</p>
			</button>
		</div>
	</div>
	<div class="max-w-7xl w-full mx-auto flex flex-col gap-4 mt-4 items-start">
		<div class="flex flex-col sm:flex-row gap-4 w-full">
			<div
				class="border border-slate-400/30 w-full h-96 bg-slate-100 relative overflow-y-auto rounded flex flex-col"
			>
				<div class="p-4 border-b border-slate-400/30 bg-slate-100">
					<h2>Prehľad udalostí v sálach</h2>
				</div>
				<div class="overflow-y-auto h-full" id="chartWrapper"></div>
			</div>
			<div
				class="border border-slate-400/30 min-w-72 w-full sm:w-72 sm:h-96 bg-slate-100 flex flex-col rounded"
			>
				<div class="p-4 border-b border-slate-400/30">
					<h2>Naplánované udalosti</h2>
				</div>
				<div class="h-full block">
					
				</div>
			</div>
		</div>
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
			<div class="border border-slate-400/30 w-full bg-slate-100 p-4 flex flex-col">
				<h2 class="text-slate-500 text-sm">Počet sál</h2>
				<p class="text-3xl font-bold">2</p>
			</div>
			<div class="border border-slate-400/30 w-full bg-slate-100 p-4 flex flex-col">
				<h2 class="text-slate-500 text-sm">Naplánované udalosti</h2>
				<p class="text-3xl font-bold">24</p>
			</div>
			<div class="border border-slate-400/30 w-full bg-slate-100 p-4 flex flex-col">
				<h2 class="text-slate-500 text-sm">Udalosti</h2>
				<p class="text-3xl font-bold">24</p>
			</div>
			<div class="border border-slate-400/30 w-full bg-slate-100 p-4 flex flex-col">
				<h2 class="text-slate-500 text-sm">Udalosti</h2>
				<p class="text-3xl font-bold">24</p>
			</div>
		</div>
	</div>
</div>

<Dialog title="Nová sála" bind:handleOpen={openEventDialog} bind:handleClose={closeEventDialog}>
	<form class="w-full flex flex-col" action="">
		<div class="p-4 flex flex-col">
			<label for="name" class="text-sm text-slate-800">Názov</label>
			<TextInput name="name" id="name"/>
			<div class="w-full grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
				<div class="flex flex-col gap-2">
					<p class="text-sm text-slate-800">Plán sály</p>
					<div class="flex flex-row w-full gap-2">
						<button
							class="flex flex-row gap-2 items-center hover:bg-slate-200/50 duration-150 text-slate-500 px-4 py-2 rounded text-sm border border-slate-400/30 w-full"
						>
							<p>Použiť existujúci</p>
						</button>
						<button
							class="flex flex-row gap-2 items-center bg-blue-500 hover:bg-blue-400 duration-150 text-slate-100 px-4 py-2 rounded border border-blue-600/30 text-sm w-full"
						>
							<Icon scale="small">
								<Plus />
							</Icon>
							<p>Vytvoriť nový</p>
						</button>
					</div>
					<img src="https://placehold.co/1080x1080" class="rounded-md" alt="Plán sály" />
				</div>
				
				<div class="flex flex-col gap-2">
					<label for="color" class="text-sm text-slate-800">Farba v grafoch</label>
					<div class="flex flex-row flex-nowrap gap-2">
						<div
							class="border border-slate-400/30 aspect-square rounded"
							style="background: {colorValue};"
						></div>
						<Combobox
							bind:value={colorValue}
							placeholder="Názov farby / HEX kód"
							options={[
								{ value: '#3b82f6', name: 'Modrá' },
								{ value: '#8b5cf6', name: 'Fialová' }
							]}
						/>
					</div>
					<div class="flex flex-row gap-2 items-center">
						<Switch name="allow_reservations" id="allow_reservations" checked={true}/>
						<label for="allow_reservations" class="text-sm text-slate-800">Povoliť rezervácie v sále</label>
					</div>
					<div class="flex flex-row gap-2 items-center">
						<Switch name="allow_custom_placement" id="allow_custom_placement"/>
						<label for="allow_custom_placement" class="text-sm text-slate-800 flex flex-row items-center gap-2">Povoliť vlastné rozloženia
							<Tooltip>
								<p>Zapnutím tejto možnosti si uživatelia môžu vytvárať vlastné rozloženia stolov vo vašej sále. Ak je táto možnosť vypnutá, používatelia si môžu vyberať iba z vašich predom vytvorených rozložení.</p>
							</Tooltip>
						</label>
					</div>
					<div class="flex flex-row gap-2 items-center">
						<Switch name="force_placement" id="force_placement"/>
						<label for="force_placement" class="text-sm text-slate-800 flex flex-row items-center gap-2">
							Vynútiť rozloženie sály
							<Tooltip>
								<p>Ak je táto možnosť vypnutá, uživatelia si môžu rozloženie stolov dodatočne vyplniť neskôr, po vytvorení rezervácie.</p>
							</Tooltip>
						</label>
					</div>
				</div>
			</div>
		</div>
		<div class="bg-slate-200 p-4 w-full border-t border-slate-400/30 flex justify-between">
			<button
				on:click={closeEventDialog}
				class="flex flex-row gap-2 items-center hover:bg-slate-100/50 duration-150 text-slate-500 px-4 py-2 rounded text-sm"
			>
				<p>Zrušiť</p>
			</button>
			<button
				on:click={openEventDialog}
				class="flex flex-row gap-2 items-center bg-blue-500 hover:bg-blue-400 duration-150 text-slate-100 px-4 py-2 rounded border border-blue-600/30 text-sm"
			>
				<Icon scale="small">
					<Plus />
				</Icon>
				<p>Pridať sálu</p>
			</button>
		</div>
	</form>
</Dialog>

<style lang="postcss">
	.color-picker-radio {
		@apply w-full h-full rounded block p-1 border border-slate-400/30 cursor-pointer relative hover:bg-slate-200;
	}
	.color-picker-radio div {
		@apply w-full h-full rounded block;
	}
	:global(input[type='radio'] + .color-picker-radio svg) {
		@apply hidden;
	}
	:global(input[type='radio']:checked + .color-picker-radio svg) {
		@apply block absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-white;
	}
	.event-table-row {
		@apply border-t border-slate-400/30 hover:bg-slate-200;
	}
	.event-table-row-modify {
		@apply mx-2 border-slate-400/30 border w-8 h-8 flex justify-center items-center rounded duration-150 hover:bg-slate-300;
	}
	.event-table-long-text {
		@apply text-sm px-4 py-3 text-slate-600 max-w-40 overflow-ellipsis overflow-hidden whitespace-nowrap text-nowrap h-12;
	}
</style>
