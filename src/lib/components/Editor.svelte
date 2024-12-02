<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { Stage, Layer, Rect, Line } from 'svelte-konva';
	import Konva from 'konva';

	let rectangle: Konva.Rect;

	onMount(async () => {
		// Wait for dom update so the rectangle handle becomes defined
		await tick();

		const json = rectangle.toJSON();
		window.alert(`Rectangle as JSON: ${json}`);
	});

    const {
        gridSize = $bindable(30)
    }: {
        gridSize: number
    } = $props();
</script>

<Stage config={{ width: 800, height: 800, pixelRatio: 1 }}>
    <!--Griddy-->
	<Layer config={{ draggable: true }}>
		{#each Array(41) as xGrid, index}
			<Line
                config={{
                    points: [index * 20, 0, index * 20, 800],
                    stroke: 'black',
                    strokeWidth: 1,
                    listening: false
                }}
            />
		{/each}
		{#each Array(41) as yGrid, index}
            <Line
                config={{
                    points: [0, index * 20, 800, index * 20],
                    stroke: 'black',
                    strokeWidth: 1,
                    listening: false
                }}
            />
        {/each}
		<Rect
			config={{ x: 100, y: 100, width: 400, height: 200, fill: 'blue' }}
			bind:handle={rectangle}
		/>
	</Layer>
</Stage>
