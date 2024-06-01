<script lang="ts">
	export let data;
	import Brushes from '$lib/Brushes.svelte';
	import Stage from '$lib/Stage.svelte';
	import Toolbar from '$lib/Toolbar.svelte';
	let width = 36;
	let height = 46;
	let squareSize = 30;
	let squaresPerMeter = 2;
	import { theme } from '$lib/stores/theme.js';

	let canvasHeight: number;
	let canvasWidth: number;

	theme.set('light');

	import { brush, modifyZones, rerender } from '$lib/stores/stage';
	import StageOop from '$lib/StageOOP.svelte';
	import { onMount, tick } from 'svelte';
	import StageSettings from '$lib/StageSettings.svelte';
	import TableList from '$lib/TableList.svelte';

	let downloadStage: () => Promise<string>;

	let zoneEditing: boolean = false;
	$: if (zoneEditing) {
		modifyZones.set(zoneEditing);
	} else {
		modifyZones.set(zoneEditing);
	}
	brush.set({ type: 'grab', snapCoefficient: 1 });

	let borderThicknessX: number = 10;
	let borderThicknessY: number = 10;

	onMount(async () => {
		borderThicknessX = Math.floor((canvasWidth || 1) / 75);
		borderThicknessY = Math.floor((canvasHeight || 1) / 75);
		await tick();
		rerender.set(!$rerender);
		window.onresize = () => {
			borderThicknessX = Math.floor((canvasWidth || 1) / 75);
			borderThicknessY = Math.floor((canvasHeight || 1) / 75);
			console.log(borderThicknessY);
			rerender.set(!$rerender);
		}
 	})
</script>

<div
	class="h-screen bg-background-200 w-screen flex justify-stretch items-stretch"
>
	<div class="mt-12 w-full px-12 grid place-items-center" bind:clientWidth={canvasWidth} bind:clientHeight={canvasHeight}>
		{#key $rerender}
		<Stage
		bind:downloadStage
		canvas={{height: canvasHeight, width: canvasWidth-100}}
		grid={{ width, height, squareSize, borderThicknessX, borderThicknessY, squaresPerMeter }}
	/>
{/key}
	</div>
</div>
<StageSettings bind:stageWidth={width} bind:stageHeight={height} bind:square={squareSize}/>
<TableList tables={data.tables}/>
<Toolbar {downloadStage} bind:stageCategories={data.stageCategories} />
<Brushes />

<style lang="postcss">
	:global(html) {
		@apply bg-slate-200;
	}
</style>
