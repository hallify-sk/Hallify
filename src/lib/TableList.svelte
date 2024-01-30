<script lang="ts">
	import { rerender, tableList, stageData } from '$lib/stores/stage';
	import { v4 as uuidv4 } from 'uuid';

	function addTable(
		name: string,
		rotation: number,
		chairs: { left: number; right: number; max: number;},
		table: { width: number; height: number }
	){
		tableList.set($tableList.concat({ name, rotation, x: $stageData.width / $stageData.squareSize / 2, y: $stageData.height / $stageData.squareSize / 2, chairs, table }));
        console.log($stageData.width / 2, $stageData.height / 2);
		rerenderStage();
        return;
	}

	function rerenderStage() {
		$rerender = !$rerender;
	}
</script>

<div
	class="fixed right-0 top-0 w-60 bg-background-100 h-screen pt-12 px-1 flex flex-col overflow-y-auto gap-1"
>
	<button
		class="bg-background-50 rounded-md block group relative"
		on:click={()=>{addTable(
			`test ${uuidv4()}`,
			0,
			{ left: 2, max: 2, right: 2 },
			{ width: 2, height: 2.4 }
		)}}
	>
		<div
			class="w-full h-full rounded-md bg-black/80 group-hover:grid hidden absolute place-items-center"
		>
			<p class="text-text-200 flex flex-row gap-1">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="1.5"
					stroke="currentColor"
					class="w-6 h-6"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M15.042 21.672 13.684 16.6m0 0-2.51 2.225.569-9.47 5.227 7.917-3.286-.672ZM12 2.25V4.5m5.834.166-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243-1.59-1.59"
					/>
				</svg>
				Click to Add
			</p>
		</div>
		<div class="p-2">
			<div class="flex flex-row content-between items-center">
				<h2 class="text-text-600 font-semibold text-lg">Stôl pre štyroch</h2>
				<p class="float-right ml-auto text-text-400">24/24</p>
			</div>
			<ul class="text-text-500 text-left">
				<li>Rozmery: 1 x 1.2m</li>
				<li>Max. stoličky: 4</li>
			</ul>
		</div>
	</button>
    <button
		class="bg-background-50 rounded-md block group relative"
		on:click={()=>{addTable(
			`test2 ${uuidv4()}`,
			0,
			{ left: 2, max: 6, right: 2 },
			{ width: 3, height: 6 }
		)}}
	>
		<div
			class="w-full h-full rounded-md bg-black/80 group-hover:grid hidden absolute place-items-center"
		>
			<p class="text-text-200 flex flex-row gap-1">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="1.5"
					stroke="currentColor"
					class="w-6 h-6"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M15.042 21.672 13.684 16.6m0 0-2.51 2.225.569-9.47 5.227 7.917-3.286-.672ZM12 2.25V4.5m5.834.166-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243-1.59-1.59"
					/>
				</svg>
				Click to Add
			</p>
		</div>
		<div class="p-2">
			<div class="flex flex-row content-between items-center">
				<h2 class="text-text-600 font-semibold text-lg">Stôl pre štyroch</h2>
				<p class="float-right ml-auto text-text-400">24/24</p>
			</div>
			<ul class="text-text-500 text-left">
				<li>Rozmery: 1 x 1.2m</li>
				<li>Max. stoličky: 4</li>
			</ul>
		</div>
	</button>
</div>
