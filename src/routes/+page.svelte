<script lang="ts">
	import Stage from "$lib/Stage.svelte";
    let width = 20;
    let height = 20;
    let squareSize = 30;
    let snapSize = 0.5;
    let borderThickness = 10;
    let color = "#fff";
    import { selectedName, stageData, tableList } from "$lib/stores/stage";
	import { onDestroy } from "svelte";

    const unsub = selectedName.subscribe((e) => {
        console.log(e);
    });

    onDestroy(() => {
        unsub();
    });

    tableList.set([
		{
			name: 'id',
			x: 8,
			y: 4,
            rotation: 0,
			chairs: {
				count: 2,
				left: true,
				right: true
			},
			table: {
				width: 2,
				height: 3
			}
		},
		{
			name: 'id2',
			x: 3,
			y: 3,
            rotation: 0,
			chairs: {
				count: 3,
				left: true,
				right: true
			},
			table: {
				width: 1,
				height: 4
			}
		}
	]);

    stageData.set({
        ...$stageData,
        uniqueObjects: [
            {
                name: "stage",
                points: [16 * squareSize, 4 * squareSize, 20 * squareSize, 3 * squareSize, 20 * squareSize, 8 * squareSize, 15 * squareSize, 8 * squareSize],
                fill: "cyan",
                stroke: 5,
            }
        ]
    });
    let chairs = 0;
    function findChairsAndReplace(){
        //Find chair count by using selectedName store value and tableList, replace value in tableList with new value
        $tableList.find((e) => {
            console.log($tableList);
            if(e.name == $selectedName){
                e.chairs.count = chairs;
            }
        });
    }

    selectedName.subscribe((e) => {
        $tableList.find((e) => {
            console.log($tableList);
            if(e.name == $selectedName){
                chairs = e.chairs.count;
            }
        });
    });
    
    let rerender = false;

    function rerenderStage(){
        rerender = !rerender;
    }

</script>
<div class="fixed top-0 left-0 flex flex-col">
    <input bind:value={width} type="number" placeholder="Width">
    <input bind:value={height} type="number" placeholder="Height">
    <input bind:value={squareSize} type="number" placeholder="Square size">
    <input bind:value={snapSize} step=0.1 min=0.1 type="number" placeholder="Square size">
    <input bind:value={borderThickness} step=10 type="number" placeholder="Square size">
    <input bind:value={color} type="color">
    <label>Object properties</label>
    <input bind:value={chairs} on:change={findChairsAndReplace} type="number"  placeholder="Chairs">
    <button on:click={rerenderStage}>Rerender</button>
</div>
<div class="grid place-items-center w-screen h-screen bg-slate-950">
    {#key rerender}
    <Stage grid={{width, height, squareSize, snapSize, color, borderThickness}}/>
    {/key}
</div>

<style lang="postcss">
    :global(html) {
        @apply bg-slate-200;
    }
</style>