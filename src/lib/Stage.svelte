<script lang="ts">
	export let grid: { width: number; height: number; squareSize: number, snapSize: number } = {
		width: 20,
		height: 20,
		squareSize: 30,
		snapSize: 1
	};

	import { onMount } from 'svelte';
	import { Stage, Layer, Line, Rect, Group, Transformer } from 'svelte-konva';
	import { clamp, pointsToObjectArray, pointsToRealPosition, rotatePoints } from './lib';

	let gridLayer: any;
	let objectLayer: any;
	let tr: any;
	let stage: any;
	$: if (gridLayer) gridLayer.cache();
	$: if (grid && (grid.width || grid.height) && gridLayer) setTimeout(() => gridLayer.cache());

	const scaleBy = 1.2;
	onMount(() => {
		stage.on('wheel', (e: any) => {
			e.evt.preventDefault();
			const oldScale = stage.scaleX();
			var pointer = stage.getPointerPosition();
			var mousePointTo = {
				x: (pointer.x - stage.x()) / oldScale,
				y: (pointer.y - stage.y()) / oldScale
			};
			// how to scale? Zoom in? Or zoom out?
			let direction = e.evt.deltaY > 0 ? -1 : 1;
			// when we zoom on trackpad, e.evt.ctrlKey is true
			// in that case lets revert direction
			if (e.evt.ctrlKey) {
				direction = -direction;
			}
			var newScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy;
			newScale = clamp(newScale, 0.75, 3);
			stage.scale({ x: newScale, y: newScale });
			var newPos = {
				x: pointer.x - mousePointTo.x * newScale,
				y: pointer.y - mousePointTo.y * newScale
			};
			stage.position(newPos);
		});
		stage.on('click tap', function (e: any) {
			// if click on empty area - remove all selections
			if (e.target === stage) {
				tr.nodes([]);
				return;
			}
			// do nothing if clicked NOT on our rectangles
			//if (!e.target.hasName('transformable')) return;
			// do we pressed shift or ctrl?
			const metaPressed = e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey;
			const isSelected = tr.nodes().indexOf(e.target) >= 0;
			if (!metaPressed && !isSelected) {
				// if no key pressed and the node is not selected
				// select just one
				tr.nodes([e.target]);
			} else if (metaPressed && isSelected) {
				// if we pressed keys and node was selected
				// we need to remove it from selection:
				const nodes = tr.nodes().slice(); // use slice to have new copy of array
				// remove node from array
				nodes.splice(nodes.indexOf(e.target), 1);
				tr.nodes(nodes);
			} else if (metaPressed && !isSelected) {
				// add the node into selection
				const nodes = tr.nodes().concat([e.target]);
				tr.nodes(nodes);
			}
		});
	});
	function transform(e: any){
		const rect = e.detail.currentTarget;
		console.log(rotatePoints(pointsToObjectArray(pointsToRealPosition(rect.points(), rect.position())), {x: rect.x(), y: rect.y()}, rect.rotation()));
	}
	function dragEnd(e: any) {
		const rect = e.detail.currentTarget;
		rect.position({
			x: Math.round(rect.x() / grid.squareSize / grid.snapSize) * grid.squareSize * grid.snapSize,
			y: Math.round(rect.y() / grid.squareSize / grid.snapSize) * grid.squareSize * grid.snapSize
		});
		console.log(rect.points());
		console.log(pointsToRealPosition(rect.points(), rect.position()));
	}
</script>

{#if typeof window !== 'undefined'}
	<Stage bind:handle={stage} config={{ width: 800, height: 800, draggable: true }}>
		<Layer>
			<Group bind:handle={gridLayer}>
				{#each Array(grid.height + 1) as _, y}
					{#each Array(grid.width + 1) as _, x}
						<Rect
							config={{
								x: x * grid.squareSize,
								y: y * grid.squareSize,
								width: grid.squareSize,
								height: grid.squareSize,
								stroke: '#ddd',
								strokeWidth: 1,
								fill: 'black'
							}}
						/>
					{/each}
				{/each}
			</Group>
		</Layer>
		<Layer bind:handle={objectLayer}>
			<Transformer
				bind:handle={tr}
				config={{
					resizeEnabled: false,
					rotationSnaps: [0, 45, 90, 135, 180, 225, 270, 315],
					rotationSnapTolerance: 30
				}}
			/>
			<Line
				config={{
					points: [
						0,
						0,
						2 * grid.squareSize,
						0,
						2 * grid.squareSize,
						4 * grid.squareSize,
						0,
						4 * grid.squareSize
					],
					fill: 'white',
					closed: true,
					draggable: true
				}}
				on:dragmove={transform}
				on:dragend={dragEnd}
				on:transform={transform}
			/>
		</Layer>
	</Stage>
{/if}
