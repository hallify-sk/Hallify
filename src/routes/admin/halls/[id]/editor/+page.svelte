<script lang="ts">
	import type Editor from '$lib/components/Editor.svelte';
	import { tables } from '$lib/components/editor/lib.js';
	import { points, walls, zonePoints, zones } from '$lib/util.js';
	import { onMount } from 'svelte';
	let MyCanvas: typeof Editor;

	export let data;

	console.log(data);

	let gridWidth = data.hall?.planData?.data?.gridData?.width || 20;
	let gridHeight = data.hall?.planData?.data?.gridData?.height || 20;


	onMount(async () => {
		// Dynamically import your canvas component encapsulating all svelte-konva functionality inside onMount()
		MyCanvas = (await import('$lib/components/Editor.svelte')).default;
		if (data.hall?.plan) {
			// If the hall has a plan, set the initial state of the canvas
			points.set(data.hall.planData.data.points);
			walls.set(data.hall.planData.data.walls);
			tables.set(data.hall.planData.data.tables);
			zonePoints.set(data.hall.planData.data.zonePoints);
			zones.set(data.hall.planData.data.zones);
		}
	});
</script>

<svelte:component bind:gridWidth={gridWidth} bind:gridHeight={gridHeight} this={MyCanvas}></svelte:component>
