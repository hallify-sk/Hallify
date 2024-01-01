<script>
	import Stage from "$lib/Stage.svelte";
    let width = 40;
    let height = 40;
    let squareSize = 30;
    let snapSize = 1;
    let borderThickness = 10;
    let color = "#fff";
</script>
<div class="fixed top-0 left-0 flex flex-col">
    <input bind:value={width} type="number" placeholder="Width">
    <input bind:value={height} type="number" placeholder="Height">
    <input bind:value={squareSize} type="number" placeholder="Square size">
    <input bind:value={snapSize} step=0.1 min=0.1 type="number" placeholder="Square size">
    <input bind:value={borderThickness} step=10 type="number" placeholder="Square size">
    <input bind:value={color} type="color">
</div>
<div class="grid place-items-center w-screen h-screen bg-slate-950">
    <Stage grid={{width, height, squareSize, snapSize, color, borderThickness}}/>
</div>

<style lang="postcss">
    :global(html) {
        @apply bg-slate-200;
    }
</style>