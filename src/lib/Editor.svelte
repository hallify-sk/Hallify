<script lang="ts">
	import { stage, Point2D, Vector2D, Circle2D } from "$lib/editor";
	import { Stage, Layer, Rect, Circle } from "svelte-konva";

	let circle = new Circle2D(0, 0, 100); // Create a circle with center at (0,0) and radius 1

	let points = circle.pointsOnCircumference(4, -10);
</script>

<Stage config={{ width: $stage.width, height: $stage.height, draggable: true }}>
	<!--UI layer-->
	<Layer>
		<Rect config={{ x: 0, y: 0, width: $stage.width, height: $stage.height, fill: "red", draggable: false }} />
	</Layer>
	<!--Non-collision objects layer-->
	<Layer>
		{#each points as point}
			<Rect config={{ x: point.x, y: point.y, offsetX: 2.5, offsetY: 2.5, width: 5, height: 5, fill: "blue", draggable: true, rotation: point.rotation }} />
		{/each}
        <Circle config={{ x: circle.x, y: circle.y, radius: circle.radius, fill: "transparent", stroke: "black", strokeWidth: 1 }} />
	</Layer>
	<!--Collision objects layer-->
</Stage>
