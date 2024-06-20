<script lang="ts">
	import { stage, Point2D, Vector2D } from "$lib/editor";
	import { Stage, Layer, Rect } from "svelte-konva";

    let pos = new Point2D(0, 0);
    let pos2 = new Point2D(4, 5);
    const vector = new Vector2D(pos, pos2);
    console.log(vector.length);

</script>

<Stage config={{ width: $stage.width, height: $stage.height, draggable: true }}>
    <!--UI layer-->
	<Layer>
        <Rect
            config={{x: 0, y: 0, width: $stage.width, height: $stage.height, fill: "red", draggable: false}}
            />
    </Layer>
    <!--Non-collision objects layer-->
    <!--Collision objects layer-->
</Stage>
