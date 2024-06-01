<script lang="ts">
	import { rerender, tableList, stageData } from '$lib/stores/stage';
	import { v4 as uuidv4 } from 'uuid';
  
	// Function to add a table
	function addTable(
	  name: string,
	  rotation: number,
	  chairs: { left: number; right: number; max: number },
	  table: { width: number; height: number; radius: number; isRound: boolean }
	) {
	  tableList.update(tables => [
		...tables,
		{
		  name,
		  rotation,
		  x: $stageData.width / $stageData.squareSize / 2,
		  y: $stageData.height / $stageData.squareSize / 2,
		  chairs,
		  table
		}
	  ]);
	  rerenderStage();
	}
  
	// Function to rerender the stage
	function rerenderStage() {
	  rerender.update(value => !value);
	}

    export let stageWidth: number = 30;
    export let stageHeight: number = 30;
    export let square: number = 30;

  </script>
  
  <div class="fixed right-60 top-0 w-60 bg-background-100 h-screen pt-12 px-1 flex flex-col overflow-y-auto gap-1">
    <input bind:value={stageWidth} type="range" min="20" max="100">
    <p>{stageWidth}</p>
    <input bind:value={stageHeight} type="range" min="20" max="100">
    <p>{stageHeight}</p>
    <input bind:value={square} type="range" min="20" max="100">
    <p>{square}</p>
  </div>