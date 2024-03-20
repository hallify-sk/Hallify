<script lang="ts">
	export let grid: {
		width: number;
		height: number;
		squareSize: number;
		snapSize: number;
		color: string;
		borderThickness: number;
		squaresPerMeter: number
	} = {
		width: 20,
		height: 20,
		squareSize: 30,
		snapSize: 1,
		color: '#fff',
		borderThickness: 100,
		squaresPerMeter: 2
	};
	import { v4 as uuidv4 } from 'uuid';
	import { onDestroy, onMount } from 'svelte';
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
	import {
		addChairHitbox,
		checkPolygonCollision,
		clamp,
		dataURItoBlob,
		getClosestViablePosition,
		getCollisionPolygons,
		getMovablePolygons,
		objectArrayToPoints,
		pointsToObjectArray,
		pointsToRealPosition,
		rotatePoints,
		countTotalChairs,
		checkPolygonCircleCollision,
		checkCircleCollision
	} from './editor/lib';
	import Konva from 'konva';
	import { brush, modifyZones, rerender, selectedName, stageData, tableList } from './stores/stage';
	import { theme } from './stores/theme';
	let uiLayer: Konva.Layer;
	let gridLayer: Konva.Layer;
	let objectLayer: Konva.Layer;
	let zoneLayer: Konva.Layer;
	let background: Konva.Rect;
	let tr: Konva.Transformer;
	let stage: Konva.Stage;
	let groups: Array<Konva.Group> = [];
	$: if (gridLayer) gridLayer.cache();
	$: if (grid && (grid.width || grid.height) && gridLayer) setTimeout(() => gridLayer.cache());
	const scaleBy = 1.2;
	let points: any[] = [];
	let circles: Konva.Circle[] = [];
	let pointsHistory: Array<any[]> = [];
	let circlesHistory: Array<Konva.Circle[]> = [];
	let drawPreviewShape: Konva.Line;

	onMount(() => {
		stage.on('wheel', (e: any) => {
			e.evt.preventDefault();
			const oldScale = stage.scaleX();
			var pointer = stage.getPointerPosition();
			var mousePointTo = {
				x: ((pointer?.x || 0) - stage.x()) / oldScale,
				y: ((pointer?.y || 0) - stage.y()) / oldScale
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
				x: (pointer?.x || 0) - mousePointTo.x * newScale,
				y: (pointer?.y || 0) - mousePointTo.y * newScale
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
				y: newY
			});
		});
		window.addEventListener('keydown', (e) => {
			if (e.code == 'Delete') {
				tr.nodes().forEach((e) => {
					stageData.set({
						...$stageData,
						zones: $stageData.zones.filter((i) => i.name !== e.name())
					});
					e.remove();
					//Make sure the tableName and UUID of the table is the same. Name format: "tableName UUID". Then, remove from tablelist
					tableList.set(
						$tableList.filter((i) => {
							console.log(i.name.split(' ')[1]);
							console.log(e.name().split(' ')[1]);
							console.log(i.name.split(' ')[1] == e.name().split(' ')[1]);
							return i.name.split(' ')[1] !== e.name().split(' ')[1];
						})
					);
					console.log($tableList);
					console.log(e.name());
					console.log($tableList.find((i: any) => i.name !== e.name()));
					//e.remove();
				});
				tr.nodes([]);
			} else if (e.code == 'KeyZ' && e.ctrlKey) {
				if (pointsHistory.length > 0 && circlesHistory.length > 0) {
					points = pointsHistory.pop() as any[];
					circles = circlesHistory.pop() as any[];

					// Remove all circles from the stage
					uiLayer.removeChildren();

					// Re-render the circles
					circles.forEach((circle, i) => {
						const newCircle = new Konva.Circle({
							x: circle.x(),
							y: circle.y(),
							radius: circle.radius(),
							fill: circle.fill(),
							stroke: circle.stroke(),
							strokeWidth: circle.strokeWidth()
						});

						uiLayer.add(newCircle);
						if (i == 0) {
							newCircle.on('mouseenter', () => {
								stage.container().style.cursor = 'pointer';
							});
							newCircle.on('mouseleave', () => {
								stage.container().style.cursor = 'default';
							});
							newCircle.addEventListener('click', () => {
								if ($brush.type == 'zone') {
									createZone();
								} else if ($brush.type == 'wall') {
									createWall();
								}
							});
						}
					});

					const previewZone = new Konva.Line({
						points: points.flatMap((point) => [point.x, point.y]),
						fill: $brush.color || 'blue',
						stroke: $brush.stroke || 'black',
						strokeWidth: $brush.strokeWidth || 0,
						opacity: 0.2,
						closed: true
					});
					uiLayer.add(previewZone);
					drawPreviewShape = previewZone;

					// Draw the layer
					uiLayer.draw();
				}
			}
		});
		stage.on('click tap', function (e) {
			switch ($brush.type) {
				case 'grab':
					{
						//Default brush behaviour
						if (e.target === stage) {
							tr.nodes([]);
							selectedName.set(null);
							return;
						}
						if (
							e.target.parent?.name().split(' ').includes('wall') ||
							e.target.parent?.name().split(' ').includes('no-select') ||
							(e.target.parent?.getLayer() == zoneLayer && !$modifyZones) ||
							e.target == background
						) {
							tr.nodes([]);
							selectedName.set(null);
							return;
						}

						const isSelected = tr.nodes().indexOf(e.target) >= 0;

						if (!isSelected) {
							if (e.target.parent?.draggable()) {
								tr.nodes([e.target.parent]);
								selectedName.set(e.target.parent.name());
							} else {
								tr.nodes([e.target]);
								selectedName.set(e.target.name());
							}
						} else if (isSelected) {
							const nodes = tr.nodes().slice();
							nodes.splice(nodes.indexOf(e.target), 1);
							tr.nodes(nodes);
						}
					}
					break;
				case 'zone':
					{
						const { offsetX, offsetY } = e.evt;
						const zoomLevel = stage.scaleX();
						const stageX = stage.x();
						const stageY = stage.y();
						const point = {
							x:
								Math.round(
									(offsetX - stageX) / zoomLevel / (grid.squareSize * $brush.snapCoefficient)
								) *
								grid.squareSize *
								$brush.snapCoefficient,
							y:
								Math.round(
									(offsetY - stageY) / zoomLevel / (grid.squareSize * $brush.snapCoefficient)
								) *
								grid.squareSize *
								$brush.snapCoefficient
						};

						if (
							point.x >= 0 &&
							point.x <= grid.width * grid.squareSize &&
							point.y >= 0 &&
							point.y <= grid.height * grid.squareSize
						) {
							drawPreviewShape?.destroy();
							pointsHistory.push([...points]);
							circlesHistory.push([...circles]);
							points.push(point);
							// Create a new circle at the point and add it to the stage
							const circle = new Konva.Circle({
								name: 'no-select ' + uuidv4(),
								x: point.x,
								y: point.y,
								radius: 5,
								fill: points.length == 1 ? themes[$theme].accent[600] : themes[$theme].accent[400]
							});
							if (points.length == 1) {
								circle.on('mouseenter', () => {
									stage.container().style.cursor = 'pointer';
								});
								circle.on('mouseleave', () => {
									stage.container().style.cursor = 'default';
								});
								circle.addEventListener('click', () => {
									createZone();
								});
							}
							uiLayer.add(circle);
							circles.push(circle);
							const previewZone = new Konva.Line({
								points: points.flatMap((point) => [point.x, point.y]),
								fill: $brush.color || 'blue',
								stroke: $brush.stroke || 'black',
								strokeWidth: $brush.strokeWidth || 0,
								opacity: 0.2,
								closed: true
							});
							uiLayer.add(previewZone);
							drawPreviewShape = previewZone;
							circles.forEach((circle) => {
								circle.moveToTop();
							});
							uiLayer.draw();
						}
					}
					break;
				case 'wall':
					{
						const { offsetX, offsetY } = e.evt;
						const zoomLevel = stage.scaleX();
						const stageX = stage.x();
						const stageY = stage.y();
						const point = {
							x:
								Math.round(
									(offsetX - stageX) / zoomLevel / (grid.squareSize * $brush.snapCoefficient)
								) *
								grid.squareSize *
								$brush.snapCoefficient,
							y:
								Math.round(
									(offsetY - stageY) / zoomLevel / (grid.squareSize * $brush.snapCoefficient)
								) *
								grid.squareSize *
								$brush.snapCoefficient
						};

						if (
							point.x >= 0 &&
							point.x <= grid.width * grid.squareSize &&
							point.y >= 0 &&
							point.y <= grid.height * grid.squareSize
						) {
							drawPreviewShape?.destroy();
							pointsHistory.push([...points]);
							circlesHistory.push([...circles]);
							points.push(point);
							// Create a new circle at the point and add it to the stage
							const circle = new Konva.Circle({
								name: 'no-select ' + uuidv4(),
								x: point.x,
								y: point.y,
								radius: 5,
								fill: points.length == 1 ? themes[$theme].accent[600] : themes[$theme].accent[400]
							});
							if (points.length == 1) {
								circle.on('mouseenter', () => {
									stage.container().style.cursor = 'pointer';
								});
								circle.on('mouseleave', () => {
									stage.container().style.cursor = 'default';
								});
								circle.addEventListener('click', () => {
									createWall();
								});
							}
							uiLayer.add(circle);
							circles.push(circle);
							const previewZone = new Konva.Line({
								points: points.flatMap((point) => [point.x, point.y]),
								fill: $brush.color || 'blue',
								stroke: $brush.stroke || 'black',
								strokeWidth: $brush.strokeWidth || 0,
								opacity: 0.2,
								closed: true
							});
							uiLayer.add(previewZone);
							drawPreviewShape = previewZone;
							circles.forEach((circle) => {
								circle.moveToTop();
							});
							uiLayer.draw();
						}
					}
					break;
			}
		});
	});
	onDestroy(() => {
		unsubscribeBrush();
	});
	$: if (tr) {
		groups = getMovablePolygons(objectLayer);
	}

	const unsubscribeBrush = brush.subscribe(() => {
		switch ($brush.type) {
			case 'grab':
				{
					if (!objectLayer) return;
					objectLayer.children
						.filter((i) => !i.hasName('wall'))
						.forEach((child) => {
							child.draggable(true);
						});
				}
				break;
			default:
				{
					if (!objectLayer) return;
					objectLayer.children.forEach((child) => {
						child.draggable(false);
					});
				}
				break;
		}
	});

	let previewShape: Konva.Group;
	function dragStart(e: any) {
		let shape = e.detail.currentTarget;
		if ($brush.type != 'grab') return;
		// Create a clone of the shape
		previewShape = shape.clone();
		previewShape.name('preview');
		previewShape.draggable(false);

		// Make the clone semi-transparent
		previewShape.opacity(0.5);

		// Add the clone to the layer
		objectLayer.add(previewShape);
	}

	function dragMove(e: any) {
		//Group is used to calculate the position of the shape
		let g = e.detail.currentTarget;
		if ($brush.type != 'grab') return;
		//Shape is used to determine collision
		let shape: Konva.Line | Konva.Circle = e.detail.currentTarget.getChildren(
			(node: Line) => node instanceof Konva.Line
		)[0];
		if (!shape) {
			shape = e.detail.currentTarget.getChildren(
				(node: Circle) => node instanceof Konva.Circle
			)?.[0];
		}
		g.moveToTop();
		// Calculate the new position based on the grid size
		let newX =
			Math.round(
				(g.x() + grid.squareSize * grid.squaresPerMeter * $brush.snapCoefficient) /
					(grid.squareSize * $brush.snapCoefficient * grid.squaresPerMeter)
			) * (grid.squareSize * $brush.snapCoefficient * grid.squaresPerMeter)
				
		let newY =
			Math.round(
				(g.y() + grid.squareSize * grid.squaresPerMeter * $brush.snapCoefficient) /
					(grid.squareSize * $brush.snapCoefficient * grid.squaresPerMeter)
			) * (grid.squareSize * $brush.snapCoefficient * grid.squaresPerMeter)

		let objects = getMovablePolygons(objectLayer);
		objects.push(...getCollisionPolygons(objectLayer));
		objects = objects.filter((i) => i !== undefined);
		//Detect if there is collision anywhere
		let isColliding = objects.find((group: any) => {
			let object: Konva.Line | Konva.Circle = group.findOne(
				(node: Line) => node instanceof Konva.Line
			);
			if (!object) object = group.findOne((node: Circle) => node instanceof Konva.Circle);

			if (object && shape && object !== shape) {
				// && object !== previewShape
				let shapeRef = $tableList.find((i) => i.name == g.name());
				let shapeHitbox;
				if (
					(shapeRef?.chairs.left && shapeRef.chairs.left > 0) ||
					(shapeRef?.chairs.right && shapeRef.chairs.right > 0)
				) {
					if (shape instanceof Konva.Line) {
						shapeHitbox = addChairHitbox(
							pointsToObjectArray(
								pointsToRealPosition(shape.points(), {
									x: g.x() - (g.draggable() ? g.offsetX() : 0),
									y: g.y() - (g.draggable() ? g.offsetY() : 0)
								})
							),
							grid.squareSize,
							grid.squaresPerMeter,
							0.45,
							shapeRef.chairs.left != 0,
							shapeRef.chairs.right != 0
						);
					}
				} else {
					if (shape instanceof Konva.Line) {
						shapeHitbox = pointsToObjectArray(
							pointsToRealPosition(shape.points(), {
								x: g.x() - (g.draggable() ? g.offsetX() : 0),
								y: g.y() - (g.draggable() ? g.offsetY() : 0)
							})
						);
					}
				}
				let objectRef = $tableList.find((i) => i.name == group.name());
				let objectHitbox;
				if (
					(objectRef?.chairs.left && objectRef.chairs.left > 0) ||
					(objectRef?.chairs.right && objectRef.chairs.right > 0)
				) {
					if (object instanceof Konva.Line) {
						objectHitbox = addChairHitbox(
							pointsToObjectArray(
								pointsToRealPosition(object.points(), {
									x:
										(object.parent?.x() || 0) -
										(object.parent?.draggable() ? object.parent.offsetX() : 0),
									y:
										(object.parent?.y() || 0) -
										(object.parent?.draggable() ? object.parent.offsetY() : 0)
								})
							),
							grid.squareSize,
							grid.squaresPerMeter,
							0.45,
							objectRef.chairs.left != 0,
							objectRef.chairs.right != 0
						);
					}
				} else {
					if (object instanceof Konva.Line) {
						if (!objectRef) {
							objectHitbox = pointsToObjectArray(
								pointsToRealPosition(object.points(), { x: group.x(), y: group.y() })
							);
						} else {
							objectHitbox = pointsToObjectArray(
								pointsToRealPosition(object.points(), {
									x: (object.parent?.x() || 0) - (object.parent?.offsetX() || 0),
									y: (object.parent?.y() || 0) - (object.parent?.offsetY() || 0)
								})
							);
						}
					}
				}
				if (shapeHitbox && objectHitbox) {
					if (
						checkPolygonCollision(
							rotatePoints(
								shapeHitbox,
								{ x: shape.parent?.x() || 0, y: shape.parent?.y() || 0 },
								shape.parent?.rotation() || 0
							),
							rotatePoints(
								objectHitbox,
								{ x: object.parent?.x() || 0, y: object.parent?.y() || 0 },
								object.parent?.rotation() || 0
							)
						)
					) {
						return true;
					} else {
						return false;
					}
				} else {
					if (!shapeHitbox && !objectHitbox) {
						if (
							checkCircleCollision(
								{
									x: shape.parent?.x() || 0,
									y: shape.parent?.y() || 0,
									radius:
										((shapeRef?.table.radius || 0) + (shapeRef?.chairs?.left == 0 ? 0 : 0.5)) *
										grid.squareSize * grid.squaresPerMeter
								},
								{
									x: object.parent?.x() || 0,
									y: object.parent?.y() || 0,
									radius:
										((objectRef?.table.radius || 0) + (objectRef?.chairs?.left == 0 ? 0 : 0.5)) *
										grid.squareSize * grid.squaresPerMeter
								}
							)
						) {
							return true;
						}
					}
					//Check PolyCircle collision
					if (shapeHitbox) {
						console.log("SHAPE HITBOX")
						if (
							checkPolygonCircleCollision(
								rotatePoints(
									shapeHitbox,
									{ x: shape.parent?.x() || 0, y: shape.parent?.y() || 0 },
									shape.parent?.rotation() || 0
								),
								{
									x: object.parent?.x() || 0,
									y: object.parent?.y() || 0,
									radius:
										((objectRef?.table.radius || 0) + (objectRef?.chairs?.left == 0 ? 0 : 0.5)) *
										grid.squareSize * grid.squaresPerMeter
								}
							)
						) {
							return true;
						}
					} else if (objectHitbox) {
						console.log("OBJECT HITBOX")
						if (
							checkPolygonCircleCollision(
								rotatePoints(
									objectHitbox,
									{ x: object.parent?.x() || 0, y: object.parent?.y() || 0 },
									object.parent?.rotation() || 0
								),
								{
									x: shape.parent?.x() || 0,
									y: shape.parent?.y() || 0,
									radius:
										((shapeRef?.table.radius || 0) + (shapeRef?.chairs?.left == 0 ? 0 : 0.5)) *
										grid.squareSize * grid.squaresPerMeter
								}
							)
						) {
							return true;
						}
					}
				}
			}
		});
		//If there was no collision, continue in calculating new viable position
		if (!isColliding) {
			let position = getClosestViablePosition(
				newX,
				newY,
				previewShape,
				getMovablePolygons(objectLayer)
					.filter((i: any) => i !== shape && i !== previewShape)
					.map((i: any) => i.findOne((node: Line) => node instanceof Konva.Line))
					.filter((i) => i),
				grid
			);

			// Update the preview shape's position

			previewShape.x(position?.x || 0);
			previewShape.y(position?.y || 0);
			shape.fill(themes?.[$theme]?.primary?.[500]);
			shape.parent
				?.getChildren((child) => child instanceof Konva.Rect)
				.forEach((child) => {
					(child as Konva.Rect | Konva.Line).fill(themes?.[$theme]?.primary?.[400]);
				});
		} else {
			shape.fill('#9f6060');
			shape.parent
				?.getChildren((child) => child instanceof Konva.Rect)
				.forEach((child) => {
					(child as Konva.Rect | Konva.Line).fill('#b38080');
				});
		}
	}

	function transformEnd(e: any) {
		let group = e.detail.currentTarget;
		//Doesnt work without timeout fsr
		tableList.set(
			$tableList.map((e) => {
				if (e.name == group.name()) {
					return {
						...e,
						rotation: group.rotation()
					};
				} else {
					return e;
				}
			})
		);
	}

	function nonCollisionDragMove(e: any) {
		//Shape is used to determine collision and position
		let shape: Konva.Line = e.detail.currentTarget;
		// Calculate the new position based on the grid size
		let newX =
			Math.round(
				(shape.x() + grid.squareSize * grid.squaresPerMeter * $brush.snapCoefficient) /
					grid.squareSize /
					$brush.snapCoefficient
			) *
			grid.squareSize *
			$brush.snapCoefficient;
		let newY =
			Math.round(
				(shape.y() + grid.squareSize * grid.squaresPerMeter * $brush.snapCoefficient) /
					grid.squareSize /
					$brush.snapCoefficient / grid.squaresPerMeter
			) *
			grid.squareSize * grid.squaresPerMeter *
			$brush.snapCoefficient;
		//If there was no collision, continue in calculating new viable position
		let position = getClosestViablePosition(
			newX,
			newY,
			previewShape,
			getMovablePolygons(objectLayer)
				.filter((i: any) => i !== shape && i !== previewShape)
				.map((i: any) => i.findOne((node: Line) => node instanceof Konva.Line)),
			grid
		);

		// Update the preview shape's position

		previewShape.x(position?.x || 0);
		previewShape.y(position?.y || 0);
		shape.fill(themes?.[$theme]?.primary?.[500]);
		shape.parent
			?.getChildren((child) => child instanceof Konva.Rect)
			.forEach((child) => {
				(child as Konva.Rect | Konva.Line).fill(themes?.[$theme]?.primary?.[400]);
			});
	}

	function nonCollisionDragEnd(e: any) {
		let shape = e.detail.currentTarget;
		e.preventDefault();
		setTimeout(() => {
			shape.position(previewShape.position());
			previewShape.destroy();
		}, 0);
		objectLayer.batchDraw();
		objectLayer.draw();
	}

	function dragEnd(e: any) {
		e.preventDefault();
		if ($brush.type != 'grab') return;
		let group = e.detail.currentTarget;
		//Doesnt work without timeout fsr
		setTimeout(() => {
			group.position(previewShape.position());
			let shape = e.detail.currentTarget.getChildren(
				(node: Line) => node instanceof Konva.Line
			)?.[0];
			if (!shape)
				shape = e.detail.currentTarget.getChildren(
					(node: Circle) => node instanceof Konva.Circle
				)?.[0];
			shape.fill('white');
			tableList.set(
				$tableList.map((e) => {
					if (e.name == group.name()) {
						return {
							...e,
							x: group.x() / grid.squareSize,
							y: group.y() / grid.squareSize,
							rotation: group.rotation()
						};
					} else {
						return e;
					}
				})
			);
		}, 0);
		previewShape.destroy();
		// Redraw the layer
		objectLayer.batchDraw();
		objectLayer.draw();
	}
	export async function downloadStage(): Promise<string> {
		const gridWidth = grid.width * grid.squareSize;
		const gridHeight = grid.height * grid.squareSize;

		// Save the current position and scale
		const oldX = stage.x();
		const oldY = stage.y();
		const oldScaleX = stage.scaleX();
		const oldScaleY = stage.scaleY();

		// Calculate the scale such that the entire stage fits into the view
		stage.scaleX(1);
		stage.scaleY(1);

		// Set the position to 0,0
		stage.x(0);
		stage.y(0);
		const url = stage.toDataURL({
			x: 0,
			y: 0,
			width: gridWidth,
			height: gridHeight
		});

		// Restore the old scale and position
		stage.scaleX(oldScaleX);
		stage.scaleY(oldScaleY);
		stage.x(oldX);
		stage.y(oldY);
		return url;
	}

	function createZone() {
		drawPreviewShape?.destroy();
		if (points.length > 1) {
			$stageData.zones.push({
				name: 'zone '.concat(uuidv4()),
				points: points.flatMap((point) => [point.x, point.y]),
				fill: $brush.color || 'blue',
				stroke: $brush.stroke || 'black',
				strokeWidth: $brush.strokeWidth || 0,
				opacity: 0.5
			});
		}
		points = [];
		// Remove all circles from the stage and clear the array
		for (const circle of circles) {
			circle.remove();
		}
		circles = [];
		rerenderStage();
	}

	function createWall() {
		drawPreviewShape?.destroy();
		if (points.length > 1) {
			$stageData.collisionObjects.push({
				name: 'wall no-select '.concat(uuidv4()),
				points: points.flatMap((point) => [point.x, point.y]),
				fill: 'TBD',
				stroke: $brush.stroke || 'none',
				strokeWidth: $brush.strokeWidth || 0,
				opacity: 0.5
			});
		}
		points = [];
		// Remove all circles from the stage and clear the array
		for (const circle of circles) {
			circle.remove();
		}
		circles = [];
		rerenderStage();
	}

	function rerenderStage() {
		$rerender = !$rerender;
	}

	import themes from '$lib/themes.json';
	import { sequence } from '@sveltejs/kit/hooks';
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
				<Rect
					bind:handle={background}
					config={{
						x: 0,
						y: 0,
						width: grid.width * grid.squareSize,
						height: grid.height * grid.squareSize,
						fill: themes?.[$theme]?.background?.[200]
					}}
				/>
				{#each Array(grid.height + 1) as _, y}
					<Line
						config={{
							points: [0, y * grid.squareSize, grid.width * grid.squareSize, y * grid.squareSize],
							stroke: themes?.[$theme]?.background?.[300],
							strokeWidth: 1
						}}
					/>
				{/each}
				{#each Array(grid.width + 1) as _, x}
					<Line
						config={{
							points: [x * grid.squareSize, 0, x * grid.squareSize, grid.height * grid.squareSize],
							stroke: themes?.[$theme]?.background?.[300],
							strokeWidth: 1
						}}
					/>
				{/each}
			</Group>
		</Layer>
		<Layer bind:handle={zoneLayer}>
			{#each $stageData.zones as object}
				<Line
					on:dragstart={dragStart}
					on:dragmove={nonCollisionDragMove}
					on:dragend={nonCollisionDragEnd}
					config={{
						name: 'zone '.concat(object.name),
						points: object.points,
						fill: object.fill,
						closed: true,
						opacity: object.opacity || 1,
						stroke: object.stroke || '',
						strokeWidth: object.strokeWidth || 0,
						dash: object.dash || [0]
					}}
				/>
			{/each}
		</Layer>
		<Layer bind:handle={objectLayer}>
			<!--BORDERS-->
			<Group
				config={{
					x: -grid.borderThickness * grid.squareSize,
					y: -grid.borderThickness * grid.squareSize,
					name: 'wall top'
				}}
			>
				<Line
					config={{
						points: objectArrayToPoints(
							{ x: 0, y: 0 },
							{
								x: 2 * grid.borderThickness * grid.squareSize + grid.width * grid.squareSize,
								y: 0
							},
							{
								x: 2 * grid.borderThickness * grid.squareSize + grid.width * grid.squareSize,
								y: grid.borderThickness * grid.squareSize
							},
							{ x: 0, y: grid.borderThickness * grid.squareSize }
						),
						closed: true,
						x: 0,
						y: 0,
						fill: themes?.[$theme]?.background?.[100]
					}}
				/>
			</Group>
			<Group
				config={{
					x: -grid.borderThickness * grid.squareSize,
					y: grid.height * grid.squareSize,
					name: 'wall bottom'
				}}
			>
				<Line
					config={{
						points: objectArrayToPoints(
							{ x: 0, y: 0 },
							{
								x: 2 * grid.borderThickness * grid.squareSize + grid.width * grid.squareSize,
								y: 0
							},
							{
								x: 2 * grid.borderThickness * grid.squareSize + grid.width * grid.squareSize,
								y: grid.borderThickness * grid.squareSize
							},
							{ x: 0, y: grid.borderThickness * grid.squareSize }
						),
						closed: true,
						x: 0,
						y: 0,
						fill: themes?.[$theme]?.background?.[100]
					}}
				/>
			</Group>
			<Group
				config={{
					x: -grid.borderThickness * grid.squareSize,
					y: -grid.borderThickness * grid.squareSize,
					name: 'wall left'
				}}
			>
				<Line
					config={{
						points: objectArrayToPoints(
							{ x: 0, y: 0 },
							{ x: grid.borderThickness * grid.squareSize, y: 0 },
							{
								x: grid.borderThickness * grid.squareSize,
								y: grid.height * grid.squareSize + 2 * grid.borderThickness * grid.squareSize
							},
							{
								x: 0,
								y: grid.height * grid.squareSize + 2 * grid.borderThickness * grid.squareSize
							}
						),
						closed: true,
						x: 0,
						y: 0,
						fill: themes?.[$theme]?.background?.[100]
					}}
				/>
			</Group>
			<Group
				config={{
					x: grid.width * grid.squareSize,
					y: -grid.borderThickness * grid.squareSize,
					name: 'wall right'
				}}
			>
				<Line
					config={{
						points: objectArrayToPoints(
							{ x: 0, y: 0 },
							{ x: grid.borderThickness * grid.squareSize, y: 0 },
							{
								x: grid.borderThickness * grid.squareSize,
								y: grid.height * grid.squareSize + 2 * grid.borderThickness * grid.squareSize
							},
							{
								x: 0,
								y: grid.height * grid.squareSize + 2 * grid.borderThickness * grid.squareSize
							}
						),
						closed: true,
						x: 0,
						y: 0,
						fill: themes?.[$theme]?.background?.[100]
					}}
				/>
			</Group>

			<!--END BORDERS-->

			<!--START COLLISION OBJECTS-->
			{#if $stageData.collisionObjects?.length}
				{#each $stageData.collisionObjects as object}
					<Group
						config={{
							//x: object.x,
							//y: object.y,
							name: object.name
						}}
					>
						<Line
							config={{
								points: object.points,
								fill:
									object.fill?.replace(
										'TBD',
										$theme == 'dark'
											? themes[$theme].background[50]
											: themes[$theme].background[700]
									) || 'black',
								stroke: object.stroke,
								strokeWidth: object.strokeWidth || 0,
								dash: object.dash,
								closed: true
							}}
						/>
					</Group>
				{/each}
			{/if}
			<!--END COLLISION OBJECTS-->
			<Transformer
				bind:handle={tr}
				config={{
					resizeEnabled: false,
					rotationSnaps: [0, 45, 90, 135, 180, 225, 270, 315],
					rotationSnapTolerance: 30
				}}
			/>
			{#if $tableList}
				{#each $tableList as table}
					{#if table.table.isRound}
						<Group
							config={{
								draggable: true,
								name: table.name,
								x: (table.x || 0) * grid.squareSize,
								y: (table.y || 0) * grid.squareSize,
								offsetX: grid.squareSize * grid.squaresPerMeter / 2,
								offsetY: grid.squareSize * grid.squaresPerMeter / 2
							}}
							on:dragstart={dragStart}
							on:dragmove={dragMove}
							on:dragend={dragEnd}
							on:transformend={transformEnd}
						>
							<Circle
								config={{
									x: grid.squareSize * grid.squaresPerMeter / 2,
									y: grid.squareSize / 2 * grid.squaresPerMeter,
									radius: table.table.radius * grid.squareSize * grid.squaresPerMeter,
									fill: themes?.[$theme]?.primary?.[500]
								}}
							/>
							{#each Array(table.chairs.left) as _, i}
								<Rect
									config={{
										x:
											(table.table.radius * grid.squaresPerMeter + (0.25 * grid.squaresPerMeter)) *
												grid.squareSize *
												Math.cos((2 * Math.PI * i) / table.chairs.left) +
											grid.squareSize / 2 * grid.squaresPerMeter,
										y:
											(table.table.radius * grid.squaresPerMeter + (0.25 * grid.squaresPerMeter)) *
												grid.squareSize *
												Math.sin((2 * Math.PI * i) / table.chairs.left) +
											grid.squareSize / 2 * grid.squaresPerMeter,
										width: 0.4 * grid.squareSize * grid.squaresPerMeter,
										height: 0.4 * grid.squareSize * grid.squaresPerMeter,
										rotation: (i * 360) / table.chairs.left,
										fill: themes?.[$theme]?.primary?.[400],
										offsetX: (grid.squareSize * grid.squaresPerMeter * 0.4) / 2,
										offsetY: (grid.squareSize * grid.squaresPerMeter * 0.4) / 2,
										cornerRadius: 4
									}}
								/>
							{/each}
						</Group>
					{:else}
						<Group
							config={{
								draggable: true,
								name: table.name,
								x: (table.x || 0) * grid.squareSize,
								y: (table.y || 0) * grid.squareSize,
								rotation: table.rotation || 0,
								offsetX: grid.squareSize * grid.squaresPerMeter / 2,
								offsetY: grid.squareSize * grid.squaresPerMeter / 2
							}}
							on:dragstart={dragStart}
							on:dragmove={dragMove}
							on:dragend={dragEnd}
							on:transformend={transformEnd}
						>
							<Line
								config={{
									points: [
										0,
										0,
										table.table.width * grid.squareSize * grid.squaresPerMeter,
										0,
										table.table.width * grid.squareSize * grid.squaresPerMeter,
										table.table.height * grid.squareSize * grid.squaresPerMeter,
										0,
										table.table.height * grid.squareSize * grid.squaresPerMeter
									],
									fill: themes?.[$theme]?.primary?.[500],
									closed: true
								}}
							/>

							{#each Array(table.chairs.left) as _, i}
								<Rect
									config={{
										x: -1 * grid.squareSize * grid.squaresPerMeter + 0.55 * grid.squareSize * grid.squaresPerMeter,
										y:
											((table.table.height * grid.squareSize * grid.squaresPerMeter) / table.chairs.left) * i +
											(table.table.height * grid.squareSize * grid.squaresPerMeter) / (2 * table.chairs.left) -
											0.5 * grid.squareSize * grid.squaresPerMeter * 0.4,
										width: 0.4 * grid.squareSize * grid.squaresPerMeter,
										height: 0.4 * grid.squareSize * grid.squaresPerMeter,
										fill: themes?.[$theme]?.primary?.[400],
										cornerRadius: 4
									}}
								/>
							{/each}
							{#each Array(table.chairs.right) as _, i}
								<Rect
									config={{
										x: table.table.width * grid.squareSize * grid.squaresPerMeter + 0.05 * grid.squareSize * grid.squaresPerMeter,
										y:
											((table.table.height * grid.squareSize * grid.squaresPerMeter) / table.chairs.right) * i +
											(table.table.height * grid.squareSize * grid.squaresPerMeter) / (2 * table.chairs.right) -
											0.5 * grid.squareSize * grid.squaresPerMeter * 0.4,
										width: 0.4 * grid.squareSize * grid.squaresPerMeter,
										height: 0.4 * grid.squareSize * grid.squaresPerMeter,
										fill: themes?.[$theme]?.primary?.[400],
										cornerRadius: 4
									}}
								/>
							{/each}
						</Group>
					{/if}
				{/each}
			{/if}
		</Layer>
		<Layer bind:handle={uiLayer} />
	</Stage>
{/if}
