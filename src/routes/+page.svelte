<script>
	import Stage from "$lib/Stage.svelte";
    let width = 40;
    let height = 40;
    let squareSize = 30;
    let snapSize = 1;
</script>

<div class="grid place-items-center w-screen h-screen">
    <input bind:value={width} type="number" placeholder="Width">
    <input bind:value={height} type="number" placeholder="Height">
    <input bind:value={squareSize} type="number" placeholder="Square size">
    <input bind:value={snapSize} step=0.1 min=0.1 type="number" placeholder="Square size">
    <Stage grid={{width, height, squareSize, snapSize}}/>
</div>

<style lang="postcss">
    :global(html) {
        @apply bg-slate-200;
    }
</style>