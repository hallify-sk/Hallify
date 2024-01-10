<script lang="ts">
    export let data;
    console.log(data);
	import { applyAction, enhance } from "$app/forms";
	import Stage from "$lib/Stage.svelte";
    let width = 20;
    let height = 20;
    let squareSize = 30;
    let snapSize = 0.5;
    let borderThickness = 10;
    let color = "#fff";
    import { selectedName, stageData, tableList } from "$lib/stores/stage";

    tableList.set(data.stage.tables);

    stageData.set(data.stage.stage);
    let chairs = 0;
    function findChairsAndReplace(){
        //Find chair count by using selectedName store value and tableList, replace value in tableList with new value
        $tableList.find((e) => {
            if(e.name == $selectedName){
                e.chairs.count = chairs;
            }
        });
    };

    selectedName.subscribe((e) => {
        $tableList.find((e) => {
            if(e.name == $selectedName){
                chairs = e.chairs.count;
            }
        });
    });
    
    let rerender = false;

    function rerenderStage(){
        rerender = !rerender;
    }

    let downloadStage: () => Promise<Blob>;

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
    <form use:enhance={async ({formData}) => {
            formData.set("stage", JSON.stringify($stageData));
            formData.set("tables", JSON.stringify($tableList));
            formData.set("image", await downloadStage());
        return async ({result}) => {
            await applyAction(result);
        }
    }} method="POST">
        <button type="submit" class="text-white">Save</button>
    </form>
</div>
<div class="grid place-items-center w-screen h-screen bg-slate-950">
    {#key rerender}
    <Stage bind:downloadStage={downloadStage} grid={{width, height, squareSize, snapSize, color, borderThickness}}/>
    {/key}
</div>

<style lang="postcss">
    :global(html) {
        @apply bg-slate-200;
    }
</style>