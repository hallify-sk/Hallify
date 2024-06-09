<script lang="ts">
	import Brushes from "$lib/Brushes.svelte";
	import Stage from "$lib/Stage.svelte";
	import TableList from "$lib/TableList.svelte";
	import Toolbar from "$lib/Toolbar.svelte";
	import { theme } from "$lib/stores/theme.js";
	import { brush, modifyZones, rerender } from "$lib/stores/stage";

	export let data;

	let width = 36;
	let height = 46;
	let squareSize = 30;
	let borderThickness = 10;
	let squaresPerMeter = 2;

	let tablesDB = data.tables;

	theme.set("light");

	/** Function to download the stage. */
	let downloadStage: () => Promise<string>;

	let zoneEditing: boolean = false;

	/** Update zone modification status based on zoneEditing flag. */
	$: if (zoneEditing) {
		modifyZones.set(zoneEditing);
	} else {
		modifyZones.set(zoneEditing);
	}

	brush.set({ type: "grab", snapCoefficient: 1 });
</script>

<div class="grid place-items-center h-screen bg-background-200 ml-12" style="width: calc(100vw - 18rem)">
	{#key $rerender}
		<Stage bind:downloadStage grid={{ width, height, squareSize, borderThicknessY: borderThickness, borderThicknessX: borderThickness, squaresPerMeter }} />
	{/key}
</div>
<TableList bind:tables={tablesDB} />
<Toolbar {downloadStage} bind:stageCategories={data.stageCategories} />
<Brushes />

<style lang="postcss">
	:global(html) {
		@apply bg-slate-200;
	}
</style>
