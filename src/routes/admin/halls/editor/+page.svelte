<script lang="ts">
	import type Editor from '$lib/components/Editor.svelte';
	import { onMount } from 'svelte';
	let MyCanvas: typeof Editor;

	onMount(async () => {
		// Dynamically import your canvas component encapsulating all svelte-konva functionality inside onMount()
		MyCanvas = (await import('$lib/components/Editor.svelte')).default;
	});
</script>

<svelte:component this={MyCanvas}></svelte:component>