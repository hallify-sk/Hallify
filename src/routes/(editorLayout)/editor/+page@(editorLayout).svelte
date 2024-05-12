<script lang="ts">
	export let data;
	import Brushes from '$lib/Brushes.svelte';
	import Stage from '$lib/Stage.svelte';
	import TableList from '$lib/TableList.svelte';
	import Toolbar from '$lib/Toolbar.svelte';
	let width = 36;
	let height = 46;
	let squareSize = 30;
	let snapSize = 1;
	let borderThickness = 10;
	let squaresPerMeter = 2;
	let color = '#fff';
	let tablesDB = data.tables as any;
	import { theme } from '$lib/stores/theme.js';

	theme.set('light');

	import { brush, modifyZones, rerender } from '$lib/stores/stage';
	import StageOop from '$lib/StageOOP.svelte';

	let downloadStage: () => Promise<string>;

	let zoneEditing: boolean = false;
	$: if (zoneEditing) {
		modifyZones.set(zoneEditing);
	} else {
		modifyZones.set(zoneEditing);
	}
	brush.set({ type: 'grab', snapCoefficient: 1 });

	for (let i = 0; i < 8+1; i++) {
		//+1 because we want it to return to original position;
		const alphaRad = ((2 * Math.PI) / 8) * i;
		const a = Math.sqrt(2 - 2 * Math.cos(alphaRad)) * 30;
		const height = (a / 30) * Math.sqrt(Math.pow(30, 2) - Math.pow(a, 2) / 4);
		const b = Math.sqrt(Math.pow(a, 2) - Math.pow(height, 2));
		console.log(`Step: ${i}`)
		console.log(a, b);
	}
</script>

<div
	class="grid place-items-center h-screen bg-background-200 ml-12"
	style="width: calc(100vw - 18rem)"
>
	{#key $rerender}
		<Stage
			bind:downloadStage
			grid={{ width, height, squareSize, snapSize, color, borderThickness, squaresPerMeter }}
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
