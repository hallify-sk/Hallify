<script lang="ts">
	import type Editor from '$lib/components/Editor.svelte';
	import { tables, type HistoryState } from '$lib/components/editor/lib.js';
	import Navbar from '$lib/components/Navbar.svelte';
	import NavbarAdmin from '$lib/components/NavbarAdmin.svelte';
	import { points, walls, zonePoints, zones } from '$lib/util.js';
	import { onMount } from 'svelte';
	let MyCanvas: typeof Editor;

	// Define the expected shape of plan data for type safety

	type Plan = {
		data?: HistoryState;
	};

	export let data: { plan?: Plan };

	console.log(data);

	// Fix: Access plan data from the separate plan object
	let gridWidth = data.plan?.data?.gridData?.width || 20;
	let gridHeight = data.plan?.data?.gridData?.height || 20;

	onMount(async () => {
		// Dynamically import your canvas component encapsulating all svelte-konva functionality inside onMount()
		MyCanvas = (await import('$lib/components/Editor.svelte')).default;

		// Fix: Check if plan exists and access data correctly
		if (data.plan?.data) {
			// If the hall has a plan, set the initial state of the canvas
			points.set(data.plan.data.points);
			walls.set(data.plan.data.walls);
			tables.set(data.plan.data.tables);
			zonePoints.set(data.plan.data.zonePoints);
			zones.set(data.plan.data.zones);
		}
	});
</script>

<Navbar permission={data.permission} user={data.user} />

<svelte:component userMode={true} this={MyCanvas} bind:gridWidth bind:gridHeight></svelte:component>
