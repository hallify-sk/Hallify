<script lang="ts">
	import { rerender, tableList, stageData } from '$lib/stores/stage';
	import { v4 as uuidv4 } from 'uuid';

	function addTable(
		name: string,
		rotation: number,
		chairs: { left: number; right: number; max: number },
		table: { width: number; height: number; radius: number; isRound: boolean }
	) {
		console.log(table);
		tableList.set(
			$tableList.concat({
				name,
				rotation,
				x: $stageData.width / $stageData.squareSize / 2,
				y: $stageData.height / $stageData.squareSize / 2,
				chairs,
				table
			})
		);
		rerenderStage();
		return;
	}

	function rerenderStage() {
		$rerender = !$rerender;
	}

	export let tables: Array<{
		collectionId: string;
		collectionName: string;
		created: string;
		height: number;
		id: string;
		maxChairsPerSide: number;
		name: string;
		updated: string;
		width: number;
		stageReferenceName: string;
		isRound?: boolean;
		radius?: number;
		count: number;
	}>;
</script>

<div
	class="fixed right-0 top-0 w-60 bg-background-100 h-screen pt-12 px-1 flex flex-col overflow-y-auto gap-1"
>
	{#if tables.length}
		{#each tables as table}
			<button
				class="bg-background-50 rounded-md block group relative"
				on:click={() => {
					if (
						$tableList &&
						$tableList.filter((i) => i.name.includes(table.stageReferenceName)).length ==
							table.count
					)
						return;
					addTable(
						`${table.stageReferenceName} ${uuidv4()}`,
						0,
						{
							left: table.maxChairsPerSide,
							max: table.maxChairsPerSide,
							right: table.isRound ? 0 : table.maxChairsPerSide
						},
						{ width: table.width, height: table.height, radius: table.radius || 0, isRound: table.isRound || false }
					);
				}}
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
						Ťukni pre pridanie
					</p>
				</div>
				<div class="p-2">
					<div class="flex flex-row content-between items-center">
						<h2 class="text-text-600 font-semibold text-lg">{table.name}</h2>
						<p
							class="float-right ml-auto {$tableList &&
							$tableList.filter((i) => i.name.includes(table.stageReferenceName)).length ==
								table.count
								? 'text-red-500'
								: 'text-text-400'}"
						>
							{table.count -
								($tableList
									? $tableList.filter((i) => i.name.includes(table.stageReferenceName)).length
									: 0)}/{table.count}
						</p>
					</div>
					<ul class="text-text-500 text-left">
						{#if table.isRound}
							<li>Polomer: {table.radius}m</li>
							<li>Max. stoličky: {table.maxChairsPerSide}</li>
						{:else}
							<li>Rozmery: {table.width} x {table.height}m</li>
							<li>Max. stoličky: {table.maxChairsPerSide}</li>
						{/if}
					</ul>
				</div>
			</button>
		{/each}
	{/if}
</div>
