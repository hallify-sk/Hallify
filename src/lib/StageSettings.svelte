<script lang="ts">
	import { rerender, stageData } from "./stores/stage";

	export let stageWidth: number = 30;
	export let stageHeight: number = 30;
	//export let squaresPerMeter: number = 2;
	function resetStage() {
		stageWidth = 20;
		stageHeight = 20;
		stageData.set({
			squareSize: 30,
			scale: 0.75,
			width: 20,
			height: 20,
			x: 0,
			y: 0,
			collisionObjects: [],
			zones: []
		});
		rerender.set(!$rerender);
	}

	$: if (stageWidth) {
		stageData.update((data) => {
			if (!data?.width) return data;
			data.width = stageWidth;
			return data;
		});
	}
	$: if (stageHeight) {
		stageData.update((data) => {
			if (!data?.height) return data;
			data.height = stageHeight;
			return data;
		});
	}
</script>

<div class="fixed right-0 top-0 w-40 bg-background-100 h-screen pt-12 px-1 flex flex-col overflow-y-auto gap-1">
	<input bind:value={stageWidth} type="range" min="20" max="100" />
	<p>{stageWidth}</p>
	<input bind:value={stageHeight} type="range" min="20" max="100" />
	<p>{stageHeight}</p>
	<button on:click={resetStage}>Vymazať</button>
</div>
