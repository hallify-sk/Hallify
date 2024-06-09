<!--<script lang="ts">
	import type Konva from 'konva';
	import { onMount } from 'svelte';
    import {
		Stage,
		Layer,
		Line,
		Group,
		Transformer,
		Rect,
		Label,
		Tag,
		Text,
		Circle
	} from 'svelte-konva';
    
    class StageHandler{
        private readonly stage: Konva.Stage;
        
        constructor(stage: Konva.Stage){
            this.stage = stage;
        }

        public addLayer(layer: Konva.Layer){
            this.stage.add(layer);
        }
    };

    class Object{
        handleCollision(){
            console.log(stage);
            console.log("hi");
        }
    }

    class Table extends Object{
        handleCollision(){
            console.log("hello");
        }
    }

    class Wall extends Object{

    }

    class Zone extends Object{

    }

    class Layer{

    }

    const obj = new Object();
    const table = new Table();

    obj.handleCollision();
    table.handleCollision();

    let stage: Konva.Stage;

    onMount(() => {
        let stageHandler = new StageHandler(stage);
    });

</script>

{#if typeof window !== 'undefined'}
	<Stage
		bind:handle={stage}
		config={{
			width: 800,
			height: 800,
			draggable: true,
			scaleX: 1,
			scaleY: 1,
			x: 0,
			y: 0,
			dragBoundFunc: function (pos) {
				let scale = stage.scaleX(); // assuming stage is scaled uniformly in x and y directions
				let newX = Math.min(pos.x, grid.borderThickness * grid.squareSize * scale);
				let newY = Math.min(pos.y, grid.borderThickness * grid.squareSize * scale);
				newX = Math.max(
					newX,
					-grid.width * grid.squareSize * scale +
						stage.width() -
						grid.borderThickness * grid.squareSize * scale
				);
				newY = Math.max(
					newY,
					-grid.height * grid.squareSize * scale +
						stage.height() -
						grid.borderThickness * grid.squareSize * scale
				);
				stageData.set({
					...$stageData,
					scale: scale,
					x: newX,
					y: newY
				});
				return {
					x: newX,
					y: newY
				};
			}
		}}
	>

	</Stage>
{/if}
-->
