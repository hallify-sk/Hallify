<script lang="ts">
	import { rerender } from '$lib/stores/stage';

    export let stageWidth: number = 30;
    export let stageHeight: number = 30;
    //export let squaresPerMeter: number = 2;

  </script>
  
  <div class="fixed right-0 top-0 w-40 bg-background-100 h-screen pt-12 px-1 flex flex-col overflow-y-auto gap-1">
    <input bind:value={stageWidth} type="range" min="20" max="100">
    <p>{stageWidth}</p>
    <input bind:value={stageHeight} type="range" min="20" max="100">
    <p>{stageHeight}</p>
  </div>