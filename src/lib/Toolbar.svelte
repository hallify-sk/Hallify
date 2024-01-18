<script lang="ts">
	import { onDestroy } from 'svelte';
	import { brush, selectedName, tableList, rerender } from './stores/stage';

	let chairsLeft: number;
	let chairsRight: number;
	let maxChairs: number;

	const unsubscribe = selectedName.subscribe((e) => {
		$tableList.find((e) => {
			if (e.name == $selectedName) {
				chairsLeft = e.chairs.left;
				chairsRight = e.chairs.right;
				maxChairs = e.table.height;
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

<div class="fixed top-0 left-0 pl-12 w-screen h-12 bg-background-100 flex items-center">
	{#if $selectedName && $brush.type == 'grab'}
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="icon icon-tabler icon-tabler-armchair w-7 h-7 stroke-primary-400 mx-2"
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
		<p class="text-primary-400 pointer-events-none mr-2 font-semibold mb-0.5">L : 0</p>
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
			class="w-10 appearance-none bg-background-200 text-text-700 pl-4 rounded-md py-0.5"
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
			class="w-10 appearance-none bg-background-200 text-text-700 pl-4 rounded-md py-0.5"
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
</div>

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
</style>
