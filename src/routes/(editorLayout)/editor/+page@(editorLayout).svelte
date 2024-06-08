<script lang="ts">
	import Brushes from '$lib/Brushes.svelte';
	import Stage from '$lib/Stage.svelte';
	import TableList from '$lib/TableList.svelte';
	import Toolbar from '$lib/Toolbar.svelte';
	/** Object containing data passed to the component. */
	export let data;

	/** Width of the stage. */
	let width = 36;

	/** Height of the stage. */
	let height = 46;

	/** Size of each square on the stage. */
	let squareSize = 30;

	/** Snap size for grid snapping. */
	let snapSize = 1;

	/** Thickness of the stage border. */
	let borderThickness = 10;

	/** Number of squares per meter on the stage. */
	let squaresPerMeter = 2;

	/** Default color for the stage. */
	let color = '#fff';

	/** Tables data obtained from the data object. */
	let tablesDB = data.tables as any;

	/**
	 * Theme setting for the component.
	 * @type {import("$lib/stores/theme.js").Theme}
	 */
	import { theme } from '$lib/stores/theme.js';

	/** Set the theme to light. */
	theme.set('light');

	/** Stores for managing brush, zone modification, and rerendering. */
	import { brush, modifyZones, rerender } from '$lib/stores/stage';

	/** Function to download the stage. */
	let downloadStage: () => Promise<string>;

	/** Flag indicating whether zone editing is active. */
	let zoneEditing: boolean = false;

	/** Update zone modification status based on zoneEditing flag. */
	$: if (zoneEditing) {
		modifyZones.set(zoneEditing);
	} else {
		modifyZones.set(zoneEditing);
	}

	/** Set the brush type and snap coefficient. */
	brush.set({ type: 'grab', snapCoefficient: 1 });

	/** Calculate positions for stage elements. */
	for (let i = 0; i < 8 + 1; i++) {
		//+1 because we want it to return to the original position;
		const alphaRad = ((2 * Math.PI) / 8) * i;
		const a = Math.sqrt(2 - 2 * Math.cos(alphaRad)) * 30;
		const height = (a / 30) * Math.sqrt(Math.pow(30, 2) - Math.pow(a, 2) / 4);
		const b = Math.sqrt(Math.pow(a, 2) - Math.pow(height, 2));
	}
</script>

<div
	class="grid place-items-center h-screen bg-background-200 ml-12"
	style="width: calc(100vw - 18rem)"
>
	{#key $rerender}
		<Stage
			bind:downloadStage
			grid={{ width, height, squareSize, borderThickness, squaresPerMeter }}
		/>
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
