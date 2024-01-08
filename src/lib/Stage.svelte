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
		addChairHitbox,
		checkPolygonCollision,
		clamp,
		getClosestViablePosition,
		getCollisionPolygons,
		getMovablePolygons,
		pointsToObjectArray,
		pointsToRealPosition,
		rotatePoints
	} from './lib';
	import Konva from 'konva';
	import { selectedName, stageData, tableList } from './stores/stage';

	let gridLayer: any;
	let objectLayer: any;
	let tr: any;
	let stage: any;
	let groups: Array<Konva.Group> = [];
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

			var pos = {
				x: pointer.x - mousePointTo.x * newScale,
				y: pointer.y - mousePointTo.y * newScale
			};

			let newX = Math.min(pos.x, grid.borderThickness * grid.squareSize * newScale);
				let newY = Math.min(pos.y, grid.borderThickness * grid.squareSize * newScale);
				newX = Math.max(
					newX,
					-grid.width * grid.squareSize * newScale +
						stage.width() -
						grid.borderThickness * grid.squareSize * newScale
				);
				newY = Math.max(
					newY,
					-grid.height * grid.squareSize * newScale +
						stage.height() -
						grid.borderThickness * grid.squareSize * newScale
				);
			stage.position({ x: newX, y: newY });
			stageData.set({
				...$stageData,
				scale: newScale,
				x: newX, 
				y: newY,
			});
		});
		stage.on('click tap', function (e: any) {
			// if click on empty area - remove all selections
			if (e.target === stage) {
				tr.nodes([]);
				selectedName.set(null);
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
				if (e.target.parent.draggable()) {
					tr.nodes([e.target.parent]);
					selectedName.set(e.target.parent.name());
				} else {
					tr.nodes([e.target]);
					selectedName.set(e.target.name());
				}
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
	$: if (tr) {
		groups = getMovablePolygons(objectLayer);
	}
	let previewShape: any;
	function dragStart(e: any) {
		let shape = e.detail.currentTarget;
		// Create a clone of the shape
		previewShape = shape.clone();
		previewShape.name("preview");
		previewShape.draggable(false);

		// Make the clone semi-transparent
		previewShape.opacity(0.5);

		// Add the clone to the layer
		objectLayer.add(previewShape);
	}
	let isColliding = false;

	function dragMove(e: any) {
		//Group is used to calculate the position of the shape
		let group = e.detail.currentTarget;
		//Shape is used to determine collision
		let shape = e.detail.currentTarget.getChildren((node: Line) => node instanceof Konva.Line)[0];
		group.moveToTop();
		if (isColliding) {
			shape.fill('red');
		} else {
			shape.fill('white');
		}

		// Calculate the new position based on the grid size
		let newX =
			Math.round((group.x() + grid.squareSize * grid.snapSize) / grid.squareSize / grid.snapSize) *
			grid.squareSize *
			grid.snapSize;
		let newY =
			Math.round((group.y() + grid.squareSize * grid.snapSize) / grid.squareSize / grid.snapSize) *
			grid.squareSize *
			grid.snapSize;

		const objects = getMovablePolygons(objectLayer);
		objects.push(...getCollisionPolygons(objectLayer));
		console.log(objects);
		objects.forEach((group: any) => {
			let object = group.findOne((node: Line) => node instanceof Konva.Line);

			if (object && shape && object !== shape && object !== previewShape) {
				if (
					checkPolygonCollision(
						rotatePoints(
							addChairHitbox(
								pointsToObjectArray(pointsToRealPosition(shape.points(), {x: shape.parent.x() - shape.parent.offsetX(), y: shape.parent.y() - shape.parent.offsetY()})),
								grid.squareSize,
								1
							),
							{ x: shape.parent.x(), y: shape.parent.y() },
							shape.parent.rotation()
						),
						rotatePoints(
							addChairHitbox(
								pointsToObjectArray(
									pointsToRealPosition(object.points(), {x: object.parent.x() - object.parent.offsetX(), y: object.parent.y() - object.parent.offsetY()})
								),
								grid.squareSize,
								1
							),
							{ x: object.parent.x(), y: object.parent.y() },
							object.parent.rotation()
						)
					)
				) {
					isColliding = true;
				} else {
					isColliding = false;
					// Get the closest viable position

					let position = getClosestViablePosition(
						newX,
						newY,
						previewShape,
						getMovablePolygons(objectLayer)
							.filter((i: any) => i !== shape)
							.map((i: any) => i.findOne((node: Line) => node instanceof Konva.Line)),
						grid
					);

					// Update the preview shape's position

					previewShape.x(position?.x);
					previewShape.y(position?.y);
				}
			}
		});
	}

	function transformEnd(e: any) {
		let group = e.detail.currentTarget;
		console.log(group.position());
		//Doesnt work without timeout fsr
			tableList.set($tableList.map((e) => {
			if(e.name == group.name()){
				return {
					...e,
					rotation: group.rotation()
				}
			} else {
				return e;
			}
		}));
	}

	function dragEnd(e: any) {
		e.preventDefault();
		let group = e.detail.currentTarget;
		//Doesnt work without timeout fsr
		setTimeout(() => {
			group.position(previewShape.position());
			let shape = e.detail.currentTarget.getChildren((node: Line) => node instanceof Konva.Line)[0];
			shape.fill('white');
			tableList.set($tableList.map((e) => {
			if(e.name == group.name()){
				return {
					...e,
					x: group.x() / grid.squareSize,
					y: group.y() / grid.squareSize,
					rotation: group.rotation()
				}
			} else {
				return e;
			}
		}));
		}, 0);

		isColliding = false;
		previewShape.destroy();
		// Redraw the layer
		objectLayer.batchDraw();
		objectLayer.draw();
	}
</script>

{#if typeof window !== 'undefined'}
	<Stage
		bind:handle={stage}
		config={{
			width: 800,
			height: 800,
			draggable: true,
			scaleX: $stageData?.scale ? $stageData.scale : 1,
			scaleY: $stageData?.scale ? $stageData.scale : 1,
			x: $stageData?.x ? $stageData.x : 0,
			y: $stageData?.y ? $stageData.y : 0,
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
		<Layer>
			{#each $stageData.uniqueObjects as object}
				<Line config={{
					points: object.points,
					fill: object.fill,
					closed: true,
					opacity: 0.2
				}}/>
			{/each}
		</Layer>
		<Layer bind:handle={objectLayer}>
			<!--BORDERS-->
			
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
			{#each $tableList as table}
				<Group
					config={{
						draggable: true,
						name: table.name,
						x: (table.x || 0) * grid.squareSize,
						y: (table.y || 0) * grid.squareSize,
						rotation: table.rotation || 0,
						offsetX: (table.table.width * grid.squareSize) / 2,
						offsetY: (table.table.height * grid.squareSize) / 2
					}}
					on:dragstart={dragStart}
					on:dragmove={dragMove}
					on:dragend={dragEnd}
					on:transformend={transformEnd}
				>
					<Line
						config={{
							points: [
								0 * grid.squareSize,
								0,
								table.table.width * grid.squareSize,
								0,
								table.table.width * grid.squareSize,
								table.table.height * grid.squareSize,
								0 * grid.squareSize,
								table.table.height * grid.squareSize
							],
							fill: 'white',
							closed: true
						}}
					/>
					
					{#each Array(table.chairs.count) as _, i}
						<Rect
							config={{
								x: -1 * grid.squareSize + 0.1 * grid.squareSize,
								y:
									((table.table.height * grid.squareSize) / table.chairs.count) * i +
									(table.table.height * grid.squareSize) / (2 * table.chairs.count) -
									0.5 * grid.squareSize * 0.8,
								width: 0.8 * grid.squareSize,
								height: 0.8 * grid.squareSize,
								fill: 'gray'
							}}
						/>
						<Rect
							config={{
								x: table.table.width * grid.squareSize + 0.1 * grid.squareSize,
								y:
									((table.table.height * grid.squareSize) / table.chairs.count) * i +
									(table.table.height * grid.squareSize) / (2 * table.chairs.count) -
									0.5 * grid.squareSize * 0.8,
								width: 0.8 * grid.squareSize,
								height: 0.8 * grid.squareSize,
								fill: 'gray'
							}}
						/>
					{/each}
				</Group>
			{/each}
		</Layer>
	</Stage>
{/if}
