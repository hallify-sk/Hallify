<script lang="ts">
    export let data;
	import Brushes from "$lib/Brushes.svelte";
	import Stage from "$lib/Stage.svelte";
	import TableList from "$lib/TableList.svelte";
	import Toolbar from "$lib/Toolbar.svelte";
    let width = 25;
    let height = 37;
    let squareSize = 30;
    let snapSize = 0.5;
    let borderThickness = 10;
    let color = "#fff";
    let tablesDB = data.tables as any;
	import { theme } from "$lib/stores/theme.js";
    theme.set("light");

    import { brush, modifyZones, rerender } from "$lib/stores/stage";

    let downloadStage: () => Promise<string>;

    let zoneEditing: boolean = false;
    $: if(zoneEditing){
        modifyZones.set(zoneEditing);
    }else{
        modifyZones.set(zoneEditing);
    }
    brush.set({type: "grab", snapCoefficient: 0.5});
</script>
<div class="grid place-items-center h-screen bg-background-200 ml-12" style="width: calc(100vw - 18rem)">
    {#key $rerender}
    <Stage bind:downloadStage={downloadStage} grid={{width, height, squareSize, snapSize, color, borderThickness}}/>
    {/key}
</div>
<TableList bind:tables={tablesDB}/>
<Toolbar downloadStage={downloadStage} bind:stageCategories={data.stageCategories}/>
<Brushes/>

<style lang="postcss">
    :global(html) {
        @apply bg-slate-200;
    }
</style>