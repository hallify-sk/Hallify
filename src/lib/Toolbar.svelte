<script lang="ts">
	import { onDestroy } from 'svelte';
	import { brush, selectedName, tableList, rerender, stageData } from './stores/stage';
	import { applyAction, enhance } from '$app/forms';
	import { countTotalChairs, dataURItoBlob } from './editor/lib';
	import Popup from './Popup.svelte';

	export let downloadStage: () => Promise<string>;

	export let stageCategories: Array<any> = [];
	let openPopup: () => void;
	let closePopup: () => void;

	let chairsLeft: number;
	let chairsRight: number;
	let maxChairs: number;

	const unsubscribe = selectedName.subscribe((e) => {
		if (!$tableList) return;
		$tableList.find((e) => {
			if (e.name == $selectedName) {
				chairsLeft = e.chairs.left;
				chairsRight = e.table.isRound ? 0 : e.chairs.right;
				maxChairs = e.chairs.max;
			}
		});
	});
	function recountChairs() {
		//Find chair count by using selectedName store value and tableList, replace value in tableList with new value
		$tableList.find((e) => {
			if (e.name == $selectedName) {
				chairsLeft = Math.max(Math.min(chairsLeft, maxChairs), 0) ?? 0;
				e.chairs.left = chairsLeft;
				chairsRight = Math.max(Math.min(chairsRight, maxChairs), 0) ?? 0;
				if(e.table.isRound) chairsRight = 0;
				e.chairs.right = chairsRight;
				setTimeout(() => {
					rerenderStage();
				});
			}
		});
	}

	onDestroy(() => {
		unsubscribe?.();
	});

	function rerenderStage() {
		$rerender = !$rerender;
	}
</script>

<div class="fixed top-0 left-0 pl-12 w-screen h-12 bg-background-100 flex items-center border-background-200 border-b">
	<svg
		xmlns="http://www.w3.org/2000/svg"
		class="icon icon-tabler icon-tabler-magnet stroke-primary-400 w-7 h-7 mx-2"
		viewBox="0 0 24 24"
		stroke-width="1.5"
		fill="none"
		stroke-linecap="round"
		stroke-linejoin="round"
	>
		<path stroke="none" d="M0 0h24v24H0z" fill="none" />
		<path
			d="M4 13v-8a2 2 0 0 1 2 -2h1a2 2 0 0 1 2 2v8a2 2 0 0 0 6 0v-8a2 2 0 0 1 2 -2h1a2 2 0 0 1 2 2v8a8 8 0 0 1 -16 0"
		/>
		<path d="M4 8l5 0" />
		<path d="M15 8l4 0" />
	</svg>
	<p class="text-primary-400 pointer-events-none mr-2 font-semibold mb-0.5">0</p>
	<input
		bind:value={$brush.snapCoefficient}
		class="w-32 bg-transparent appearance-none cursor-pointer mr-2"
		type="range"
		min="0.25"
		step="0.25"
		max="1"
	/>
	<p class="text-primary-400 pointer-events-none mr-2 font-semibold mb-0.5">1</p>
	<input
		min="0.25"
		max="1"
		on:blur={() => {
			$brush.snapCoefficient = Math.max(Math.min($brush.snapCoefficient, 1), 0.25) ?? 0;
		}}
		type="number"
		class="w-10 appearance-none bg-background-200 text-text-700 rounded-md py-0.5 text-center"
		on:keydown={(e) => {
			if (e.code == 'Enter') {
				e.preventDefault();
				$brush.snapCoefficient = Math.max(Math.min($brush.snapCoefficient, 1), 0.25) ?? 0;
				e.currentTarget.blur();
			}
		}}
		bind:value={$brush.snapCoefficient}
	/>
	<span class="border-r border-primary-200 mx-3 block w-1 h-10"></span>
	{#if $selectedName && $brush.type == 'grab'}
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="icon icon-tabler icon-tabler-armchair w-7 h-7 stroke-primary-400 mr-2"
			viewBox="0 0 24 24"
			stroke-width="1.5"
			stroke="currentColor"
			fill="none"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<path stroke="none" d="M0 0h24v24H0z" fill="none" />
			<path
				d="M5 11a2 2 0 0 1 2 2v2h10v-2a2 2 0 1 1 4 0v4a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-4a2 2 0 0 1 2 -2z"
			/>
			<path d="M5 11v-5a3 3 0 0 1 3 -3h8a3 3 0 0 1 3 3v5" />
			<path d="M6 19v2" />
			<path d="M18 19v2" />
		</svg>
		{#if $tableList.find((e) => e.name == $selectedName)?.table.isRound}
		<p class="text-primary-400 pointer-events-none mr-2 font-semibold mb-0.5">S : 0</p>
		{:else}
		<p class="text-primary-400 pointer-events-none mr-2 font-semibold mb-0.5">L : 0</p>
		{/if}
		<input
			bind:value={chairsLeft}
			class="w-32 bg-transparent appearance-none cursor-pointer mr-2"
			type="range"
			min="0"
			max={maxChairs}
			on:change={recountChairs}
		/>
		<p class="text-primary-400 pointer-events-none mr-2 font-semibold mb-0.5">{maxChairs}</p>
		<input
			min="0"
			max={maxChairs}
			type="number"
			class="w-10 appearance-none bg-background-200 text-text-700 text-center rounded-md py-0.5"
			on:blur={recountChairs}
			on:keydown={(e) => {
				if (e.code == 'Enter') {
					e.preventDefault();
					recountChairs();
					e.currentTarget.blur();
				}
			}}
			bind:value={chairsLeft}
		/>
		{#if !$tableList.find((e) => e.name == $selectedName)?.table.isRound}
		<p class="text-primary-400 pointer-events-none ml-4 mr-2 font-semibold mb-0.5">P : 0</p>
		<input
			bind:value={chairsRight}
			class="w-32 bg-transparent appearance-none cursor-pointer mr-2"
			type="range"
			min="0"
			max={maxChairs}
			on:change={recountChairs}
		/>
		<p class="text-primary-400 pointer-events-none mr-2 font-semibold mb-0.5">{maxChairs}</p>
		<input
			min="0"
			max={maxChairs}
			type="number"
			class="w-10 appearance-none bg-background-200 text-text-700 text-center rounded-md py-0.5"
			on:blur={recountChairs}
			on:keydown={(e) => {
				if (e.code == 'Enter') {
					e.preventDefault();
					recountChairs();
					e.currentTarget.blur();
				}
			}}
			bind:value={chairsRight}
		/>
		{/if}
	{/if}
	{#if $brush.type == 'zone'}
		<p class="text-primary-400 pointer-events-none mr-2 font-semibold mb-0.5">výplň:</p>
		<input type="color" class="mr-4" bind:value={$brush.color} />
		<p class="text-primary-400 pointer-events-none mr-2 font-semibold mb-0.5">okraj:</p>
		<input type="color" class="mr-1" bind:value={$brush.stroke} />
		<input
			min="0"
			max="20"
			type="number"
			class="w-10 appearance-none bg-background-200 text-text-700 text-center rounded-md py-0.5"
			bind:value={$brush.strokeWidth}
		/>
	{/if}

	<button
		on:click={openPopup}
		type="submit"
		class="ml-auto mr-2 px-4 py-1 rounded-md flex flex-row gap-2 hover:bg-background-200"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="icon icon-tabler icon-tabler-device-floppy stroke-primary-400 ml-auto w-7 h-7"
			width="24"
			height="24"
			viewBox="0 0 24 24"
			stroke-width="2"
			stroke="currentColor"
			fill="none"
			stroke-linecap="round"
			stroke-linejoin="round"
			><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path
				d="M6 4h10l4 4v10a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2"
			/><path d="M12 14m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M14 4l0 4l-6 0l0 -4" /></svg
		>
		<p class="text-primary-700">Save</p>
	</button>
</div>

<Popup bind:openPopup bind:closePopup>
	<h2 class="text-text-700 text-xl mb-4">Uložiť rozloženie</h2>
	<form
		action="/editor/?/saveStage"
		class="flex flex-col"
		use:enhance={async ({ formData }) => {
			console.log("sent");
			formData.set('stage', JSON.stringify($stageData));
			formData.set('tables', JSON.stringify($tableList));
			formData.set('chairCount', `${countTotalChairs($tableList)}`);
			formData.set('image', dataURItoBlob(await downloadStage()));
			return async ({ result }) => {
				if(result.type == 'success'){
					closePopup();
				}
				await applyAction(result);
			};
		}}
		method="POST"
	>
		<fieldset class="relative text-input">
			<input
				placeholder=""
				type="text"
				required={true}
				id="name"
				name="name"
				class="w-80 appearance-none bg-background-100 text-text-600 text-left rounded-md pb-0.5 pt-5 px-2 peer"
			/>
			<label
				for="name"
				class="absolute top-0.5 left-1 text-text-400 text-sm peer-focus:top-0.5 peer-focus:left-1 peer-focus:text-text-400 peer-focus:text-sm peer-placeholder-shown:top-2.5 peer-placeholder-shown:left-1 peer-placeholder-shown:text-text-500 peer-placeholder-shown:text-base pointer-events-none ml-1 duration-75"
				>Názov rozloženia</label
			>
		</fieldset>
		<fieldset class="mt-3 flex flex-row max-w-xs gap-1 flex-wrap">
			{#each stageCategories as category}
				<fieldset>
					<input class="hidden peer" type="checkbox" id={category.id} name={category.id} />
					<label
						class="px-4 py-2 bg-background-100 hover:bg-background-200 peer-checked:bg-primary-500 peer-checked:hover:bg-primary-600 peer-checked:text-text-50 text-700 rounded-md cursor-pointer block"
						for={category.id}>{category.name}</label
					>
				</fieldset>
			{/each}
		</fieldset>
		<div class="ml-auto">
			<button
				type="reset"
				on:click={closePopup}
				class="px-4 py-2 bg-background-100 hover:bg-background-200 rounded-md text-text-900 mt-3"
				>Zrušiť</button
			>
			<button
				type="submit"
			class="px-4 py-2 bg-background-700 hover:bg-primary-600 rounded-md text-text-50 mt-3"
				>Uložiť</button
			>
		</div>
	</form>
</Popup>

<style lang="postcss">
	input[type='range']::-webkit-slider-runnable-track {
		@apply bg-primary-300 block h-1 rounded-full;
	}
	input[type='range']::-moz-range-track {
		@apply bg-primary-300 block h-1 rounded-full;
	}
	input[type='range']::-webkit-slider-thumb {
		@apply appearance-none h-3 w-3 bg-primary-500 rounded-full border-none;
		margin-top: calc((0.25rem / 2) - (0.75rem / 2));
	}
	input[type='range']::-moz-range-thumb {
		@apply appearance-none h-3 w-3 bg-primary-500 rounded-full border-none;
	}
	input[type='number'] {
		-moz-appearance: textfield;
		appearance: textfield;
		@apply m-0;
	}
	input[type='number']::-webkit-inner-spin-button,
	input[type='number']::-webkit-outer-spin-button {
		@apply appearance-none m-0;
	}
	input[type='color'] {
		@apply appearance-none w-10 h-8 bg-transparent border-none cursor-pointer;
	}
	input[type='color']::-webkit-color-swatch {
		@apply rounded-md border-none;
	}
	input[type='color']::-moz-color-swatch {
		@apply rounded-md border-none;
	}
</style>
