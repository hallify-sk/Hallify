<script lang="ts">
	import Stage from "$lib/Stage.svelte";
	import TableList from "$lib/TableList.svelte";
	import Toolbar from "$lib/Toolbar.svelte";
	import { brush, modifyZones, rerender, stageData, tableList } from "$lib/stores/stage";
	import { theme } from "$lib/stores/theme.js";

	export let data;

	let width = 36;
	let height = 46;
	let squareSize = 30;
	let borderThickness = 10;
	let squaresPerMeter = 2;
	let tablesDB = data.tables;

	theme.set("light");

	stageData.set(data.stage.stage);
	tableList.set(data.stage.tables);

	let downloadStage: () => Promise<string>;

	let zoneEditing: boolean = false;

	// Watch for zoneEditing changes
	$: {
		if (zoneEditing) {
			modifyZones.set(zoneEditing);
		} else {
			modifyZones.set(zoneEditing);
		}
	}

	brush.set({ type: "grab", snapCoefficient: 0.5 });
</script>

<div class="grid place-items-center h-screen bg-background-200 ml-12" style="width: calc(100vw - 18rem)">
	{#key $rerender}
		<Stage
			bind:downloadStage
			grid={{ width, height, squareSize, squaresPerMeter, borderThicknessX: borderThickness, borderThicknessY: borderThickness }}
		/>
	{/key}
</div>

<TableList bind:tables={tablesDB} />
<Toolbar {downloadStage} bind:stageCategories={data.stageCategories} />

<style lang="postcss">
	:global(html) {
		@apply bg-slate-200;
	}
</style>
