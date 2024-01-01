<script lang="ts">
	export let grid: {
		width: number;
		height: number;
		squareSize: number;
		snapSize: number;
		color: string;
		borderThickness: number;
	} = {
		width: 20,
		height: 20,
		squareSize: 30,
		snapSize: 1,
		color: '#fff',
		borderThickness: 100
	};

	import { onMount } from 'svelte';
	import { Stage, Layer, Line, Group, Transformer, Rect } from 'svelte-konva';
	import {
		checkPolygonCollision,
		clamp,
		getClosestViablePosition,
		getMovablePolygons,
		pointsToObjectArray,
		pointsToRealPosition,
		rotatePoints
	} from './lib';
	import Konva from 'konva';

	let gridLayer: any;
	let objectLayer: any;
	let tr: any;
	let stage: any;
	let borderOne: any;
	let borderTwo: any;
	let borderThree: any;
	let borderFour: any;
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
	let previewShape: any;
	function dragStart(e: any) {
		let shape = e.detail.currentTarget;
		// Create a clone of the shape
		previewShape = shape.clone();

		previewShape.draggable(false);

		// Make the clone semi-transparent
		previewShape.opacity(0.5);

		// Add the clone to the layer
		objectLayer.add(previewShape);
	}
	let isColliding = false;

	function dragMove(e: any) {
		let shape = e.detail.currentTarget;

		// Calculate the new position based on the grid size
		let newX =
			Math.round((shape.x() + grid.squareSize * grid.snapSize) / grid.squareSize / grid.snapSize) *
			grid.squareSize *
			grid.snapSize;
		let newY =
			Math.round((shape.y() + grid.squareSize * grid.snapSize) / grid.squareSize / grid.snapSize) *
			grid.squareSize *
			grid.snapSize;

		const objects = getMovablePolygons(objectLayer);

		objects.forEach((group: any) => {
			let object = group.findOne((node: Line) => node instanceof Konva.Line);
			let shapePolygon = shape.findOne((node: Line) => node instanceof Konva.Line);

			if (object && shapePolygon && object !== shapePolygon && object !== previewShape) {
				if (
					checkPolygonCollision(
						rotatePoints(
							pointsToObjectArray(
								pointsToRealPosition(shapePolygon.points(), shapePolygon.position())
							),
							{ x: shapePolygon.x(), y: shapePolygon.y() },
							shapePolygon.rotation()
						),
						rotatePoints(
							pointsToObjectArray(pointsToRealPosition(object.points(), object.position())),
							{ x: object.x(), y: object.y() },
							object.rotation()
						)
					)
				) {
					isColliding = true;
				} else {
					// Get the closest viable position
					let position = getClosestViablePosition(
						newX,
						newY,
						previewShape,
						getMovablePolygons(objectLayer).filter((i: any) => i !== shape),
						grid
					);

					// Update the preview shape's position
					previewShape.x(position?.x);
					previewShape.y(position?.y);
				}
			}
		});
	}

	function transform(e: any) {
		const rect = e.detail.currentTarget;
		const objects = getMovablePolygons(stage);
		//Loop over objects and check every object for collision
		objects.forEach((object: any) => {
			if (object !== rect) {
				if (
					checkPolygonCollision(
						rotatePoints(
							pointsToObjectArray(pointsToRealPosition(rect.points(), rect.position())),
							{ x: rect.x(), y: rect.y() },
							rect.rotation()
						),
						rotatePoints(
							pointsToObjectArray(pointsToRealPosition(object.points(), object.position())),
							{ x: object.x(), y: object.y() },
							object.rotation()
						)
					)
				) {
				}
			}
		});
	}
	function dragEnd(e: any) {
		let shape = e.detail.currentTarget;
		shape.x(previewShape.x());
		shape.y(previewShape.y());

		isColliding = false;
		previewShape.destroy();
		// Redraw the layer
		objectLayer.batchDraw();
		objectLayer.draw();
	}
	let n = 4;
</script>

{#if typeof window !== 'undefined'}
	<Stage
		bind:handle={stage}
		config={{
			width: 800,
			height: 800,
			draggable: true,
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
				return {
					x: newX,
					y: newY
				};
			}
		}}
	>
		<Layer>
			<Group bind:handle={gridLayer}>
				{#each Array(grid.height + 1) as _, y}
					<Line
						config={{
							points: [0, y * grid.squareSize, grid.width * grid.squareSize, y * grid.squareSize],
							stroke: grid.color,
							strokeWidth: 1
						}}
					/>
				{/each}
				{#each Array(grid.width + 1) as _, x}
					<Line
						config={{
							points: [x * grid.squareSize, 0, x * grid.squareSize, grid.height * grid.squareSize],
							stroke: grid.color,
							strokeWidth: 1
						}}
					/>
				{/each}
			</Group>
		</Layer>
		<Layer bind:handle={objectLayer}>
			<!--BORDERS-->
			<Rect
				bind:handle={borderOne}
				config={{
					x: -grid.borderThickness * grid.squareSize,
					y: -grid.borderThickness * grid.squareSize,
					width: 2 * grid.borderThickness * grid.squareSize + grid.width * grid.squareSize,
					height: grid.borderThickness * grid.squareSize,
					fill: 'black'
				}}
			/>
			<Rect
				config={{
					x: -grid.borderThickness * grid.squareSize,
					y: grid.height * grid.squareSize,
					width: 2 * grid.borderThickness * grid.squareSize + grid.width * grid.squareSize,
					height: grid.borderThickness * grid.squareSize,
					fill: 'black'
				}}
			/>
			<Rect
				config={{
					x: -grid.borderThickness * grid.squareSize,
					y: -grid.borderThickness * grid.squareSize,
					width: grid.borderThickness * grid.squareSize,
					height: grid.height * grid.squareSize + 2 * grid.borderThickness * grid.squareSize,
					fill: 'black'
				}}
			/>
			<Rect
				config={{
					x: grid.width * grid.squareSize,
					y: -grid.borderThickness * grid.squareSize,
					width: grid.borderThickness * grid.squareSize,
					height: grid.height * grid.squareSize + 2 * grid.borderThickness * grid.squareSize,
					fill: 'black'
				}}
			/>

			<!--END BORDERS-->
			<Transformer
				bind:handle={tr}
				config={{
					resizeEnabled: false,
					rotationSnaps: [0, 45, 90, 135, 180, 225, 270, 315],
					rotationSnapTolerance: 30
				}}
			/>
			<Group
				config={{ draggable: true }}
				on:dragstart={dragStart}
				on:dragmove={dragMove}
				on:dragend={dragEnd}
				on:transform={transform}
			>
				<Line
					config={{
						points: [
							1 * grid.squareSize,
							0,
							2 * grid.squareSize,
							0,
							2 * grid.squareSize,
							4 * grid.squareSize,
							1 * grid.squareSize,
							4 * grid.squareSize
						],
						fill: 'white',
						closed: true
					}}
				/>
				{#each Array(n) as _, i (i)}
					<Rect
						config={{
							x: (i < n / 2 ? 0 : 2) * grid.squareSize,
							y:
								2 * grid.squareSize +
								(i < n / 2 ? -1 : 1) *
									(0.5 * grid.squareSize +
										(i % Math.ceil(n / 2)) * ((4 * grid.squareSize) / (Math.ceil(n / 2) + 1))),
							width: grid.squareSize / 1.5,
							height: grid.squareSize / 1.5,
							fill: 'blue'
						}}
					/>
				{/each}
			</Group>
		</Layer>
	</Stage>
{/if}
