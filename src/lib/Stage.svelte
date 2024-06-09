<script lang="ts">
	export let canvas = {
		height: 1000,
		width: 1000
	};
	export let grid: Grid = {
		width: 20,
		height: 20,
		squareSize: 30,
		borderThicknessX: 100,
		borderThicknessY: 100,
		squaresPerMeter: 2
	};
	console.log(grid);
	import { v4 as uuidv4 } from "uuid";
	import { onDestroy, onMount } from "svelte";
	import { Stage, Layer, Line, Group, Transformer, Rect, Circle, type KonvaDragTransformEvent } from "svelte-konva";
	import {
		addChairHitbox,
		checkPolygonCollision,
		clamp,
		getCollisionPolygons,
		getMovablePolygons,
		objectArrayToPoints,
		pointsToObjectArray,
		pointsToRealPosition,
		rotatePoints,
		checkPolygonCircleCollision,
		checkCircleCollision,
		type Grid,
		midpoint
	} from "./editor/lib";
	import Konva from "konva";
	import { brush, currentTween, modifyZones, rerender, selectedName, stageData, tableList } from "./stores/stage";
	import { theme } from "./stores/theme";
	let uiLayer: Konva.Layer;
	let gridLayer: Konva.Layer;
	let objectLayer: Konva.Layer;
	let zoneLayer: Konva.Layer;
	let background: Konva.Rect;
	let tr: Konva.Transformer;
	let stage: Konva.Stage;
	$: if (gridLayer) gridLayer.cache();
	$: if (grid && (grid.width || grid.height) && gridLayer) setTimeout(() => gridLayer.cache());
	const scaleBy = 1.2;
	let points: Array<{ x: number; y: number; ref: Konva.Circle; index: number }> = [];
	let rulerPoints: Array<{ point: { x: number; y: number }; ref: Konva.Circle }> = [];
	let rulerLine: Konva.Line;
	let rulerText: Konva.Text;
	let circles: Konva.Circle[] = [];
	let pointsHistory: Array<Array<{ x: number; y: number; ref: Konva.Circle; index: number }>> = [];
	let circlesHistory: Array<Konva.Circle[]> = [];
	let drawPreviewShape: Konva.Line;

	onMount(() => {
		stage.on("wheel", (e) => {
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

			let newX = Math.min(pos.x, grid.borderThicknessX * grid.squareSize * newScale);
			let newY = Math.min(pos.y, grid.borderThicknessY * grid.squareSize * newScale);
			newX = Math.max(newX, -grid.width * grid.squareSize * newScale + stage.width() - grid.borderThicknessX * grid.squareSize * newScale);
			newY = Math.max(newY, -grid.height * grid.squareSize * newScale + stage.height() - grid.borderThicknessY * grid.squareSize * newScale);
			stage.position({ x: newX, y: newY });
			stageData.set({
				...$stageData,
				scale: newScale,
				x: newX,
				y: newY
			});
		});
		window.addEventListener("keydown", (e) => {
			if (e.code == "Delete" || e.code == "Backspace") {
				switch ($brush.type) {
					case "grab":
						{
							tr.nodes().forEach((e) => {
								//Make sure the tableName and UUID of the table is the same. Name format: "tableName UUID". Then, remove from tablelist
								tableList.set(
									$tableList.filter((i) => {
										console.log(i.name.split(" ")[1]);
										console.log(e.name().split(" ")[1]);
										console.log(i.name.split(" ")[1] == e.name().split(" ")[1]);
										return i.name.split(" ")[1] !== e.name().split(" ")[1];
									})
								);
							});
							tr.nodes([]);
						}
						break;
					case "ruler": {
						rulerPoints = [];
						uiLayer.children.forEach((e) => {
							console.log(e);
							if (e.name().includes("ruler")) {
								e?.destroy();
							}
						});
					}
				}
			} else if (e.code == "KeyZ" && e.ctrlKey) {
				if (pointsHistory.length > 0 && circlesHistory.length > 0) {
					uiLayer.children.filter((i) => i.name().includes("wallPreview")).forEach((i) => i.destroy());
					let previewZone: Konva.Line;
					points = pointsHistory.pop() as unknown as { x: number; y: number; ref: Konva.Circle; index: number }[];
					circles = circlesHistory.pop() as unknown as Konva.Circle[];

					// Remove all circles from the stage
					uiLayer.removeChildren();

					// Re-render the circles
					circles.forEach((nCircle, i) => {
						const circle = new Konva.Circle({
							x: nCircle.x(),
							y: nCircle.y(),
							radius: nCircle.radius(),
							fill: nCircle.fill(),
							stroke: nCircle.stroke(),
							strokeWidth: nCircle.strokeWidth(),
							draggable: true
						});

						circle.addEventListener("dragstart", () => {
							// Create a clone of the shape
							previewShape = circle.clone();
							previewShape.name("preview");
							previewShape.draggable(false);

							// Make the clone semi-transparent
							previewShape.opacity(0.5);

							// Add the clone to the layer
							uiLayer.add(previewShape);
						});
						circle.addEventListener("dragmove", () => {
							let replacedPoint = points.find((i) => i.ref.name() == circle.name());
							points = points.filter((i) => i.ref.name() != circle.name());
							uiLayer.children.filter((i) => i.name().includes("wallPreview")).forEach((i) => i.destroy());
							previewZone?.remove();
							let newX =
								$brush.snapCoefficient == 0
									? circle.x() + circle.offsetX()
									: Math.round(
											(circle.x() +
												(circle.offsetX() - ($brush.snapCoefficient / 2) * grid.squareSize * grid.squaresPerMeter) +
												(grid.squareSize * grid.squaresPerMeter * $brush.snapCoefficient) / 2) /
												(((grid.squareSize * $brush.snapCoefficient) / 2) * grid.squaresPerMeter)
										) *
										(((grid.squareSize * $brush.snapCoefficient) / 2) * grid.squaresPerMeter);
							let newY =
								$brush.snapCoefficient == 0
									? circle.y() + circle.offsetY()
									: Math.round(
											(circle.y() +
												(circle.offsetY() - ($brush.snapCoefficient / 2) * grid.squareSize * grid.squaresPerMeter) +
												(grid.squareSize * grid.squaresPerMeter * $brush.snapCoefficient) / 2) /
												(((grid.squareSize * $brush.snapCoefficient) / 2) * grid.squaresPerMeter)
										) *
										(((grid.squareSize * $brush.snapCoefficient) / 2) * grid.squaresPerMeter);
							//If there was no collision, continue in calculating new viable position
							// Update the preview shape's position
							points.push({ x: newX, y: newY, ref: circle, index: replacedPoint?.index || 0 });
							if (points.length > 1) {
								console.log(points);
								previewZone = new Konva.Line({
									name: "wallPreview" + uuidv4(),
									//Sort by index so the points are in order
									points: points.sort((a, b) => a.index - b.index).flatMap((point) => [point.x, point.y]),
									fill: $brush.color || "blue",
									stroke: $brush.stroke || "black",
									strokeWidth: $brush.strokeWidth || 0,
									opacity: 0.2,
									closed: true
								});
								uiLayer.add(previewZone);
								previewZone.moveToBottom();
							}

							previewShape.x(newX || 0);
							previewShape.y(newY || 0);
						});
						circle.addEventListener("dragend", (e) => {
							e.preventDefault();
							setTimeout(() => {
								circle.position(previewShape.position());
								previewShape.destroy();
							}, 0);
							objectLayer.batchDraw();
							objectLayer.draw();
						});

						uiLayer.add(circle);
						if (i == 0) {
							circle.on("mouseenter", () => {
								stage.container().style.cursor = "pointer";
							});
							circle.on("mouseleave", () => {
								stage.container().style.cursor = "default";
							});
							circle.addEventListener("click", () => {
								if ($brush.type == "zone") {
									createZone();
								} else if ($brush.type == "wall") {
									createWall();
								}
							});
						}
					});

					previewZone = new Konva.Line({
						name: "wallPreview" + uuidv4(),
						points: points.flatMap((point) => [point.x, point.y]),
						fill: $brush.color || "blue",
						stroke: $brush.stroke || "black",
						strokeWidth: $brush.strokeWidth || 0,
						opacity: 0.2,
						closed: true
					});
					uiLayer.add(previewZone);
					previewZone.moveToBottom();
					drawPreviewShape = previewZone;

					// Draw the layer
					uiLayer.draw();
				}
			}
		});
		stage.on("click tap", function (e) {
			let previewZone: Konva.Line;

			const { offsetX, offsetY } = e.evt;
			const zoomLevel = stage.scaleX();
			const stageX = stage.x();
			const stageY = stage.y();

			const point: { x: number; y: number } = {
				x:
					$brush.snapCoefficient == 0
						? Math.round((offsetX - stageX) / zoomLevel)
						: Math.round((offsetX - stageX) / zoomLevel / (grid.squareSize * $brush.snapCoefficient)) *
							grid.squareSize *
							$brush.snapCoefficient,
				y:
					$brush.snapCoefficient == 0
						? Math.round((offsetY - stageY) / zoomLevel)
						: Math.round((offsetY - stageY) / zoomLevel / (grid.squareSize * $brush.snapCoefficient)) *
							grid.squareSize *
							$brush.snapCoefficient
			};
			switch ($brush.type) {
				case "grab":
					{
						//Default brush behaviour
						if (e.target === stage) {
							tr.nodes([]);
							selectedName.set(null);
							return;
						}
						if (
							e.target.parent?.name().split(" ").includes("wall") ||
							e.target.parent?.name().split(" ").includes("no-select") ||
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
				case "zone":
					if (point.x >= 0 && point.x <= grid.width * grid.squareSize && point.y >= 0 && point.y <= grid.height * grid.squareSize) {
						uiLayer.children.filter((i) => i.name().includes("zonePreview")).forEach((i) => i.destroy());
						pointsHistory.push([...points]);
						circlesHistory.push([...circles]);

						// Create a new circle at the point and add it to the stage
						const circle = new Konva.Circle({
							name: "no-select zonePoint" + uuidv4(),
							x: point.x,
							y: point.y,
							radius: 5,
							fill: points.length == 0 ? themes[$theme].secondary[600] : themes[$theme].secondary[400],
							draggable: true
						});
						points.push({ ...point, ref: circle, index: points.length });
						circle.addEventListener("dragstart", () => {
							// Create a clone of the shape
							previewShape = circle.clone();
							previewShape.name("preview");
							previewShape.draggable(false);

							// Make the clone semi-transparent
							previewShape.opacity(0.5);

							// Add the clone to the layer
							uiLayer.add(previewShape);
						});
						circle.addEventListener("dragmove", () => {
							let replacedPoint = points.find((i) => i.ref.name() == circle.name());
							if (!replacedPoint) return;
							points = points.filter((i) => i.ref.name() != circle.name());
							uiLayer.children.filter((i) => i.name().includes("zonePreview")).forEach((i) => i.destroy());
							previewZone?.remove();
							let newX =
								$brush.snapCoefficient == 0
									? circle.x() + circle.offsetX()
									: Math.round(
											(circle.x() +
												(circle.offsetX() - ($brush.snapCoefficient / 2) * grid.squareSize * grid.squaresPerMeter) +
												(grid.squareSize * grid.squaresPerMeter * $brush.snapCoefficient) / 2) /
												(((grid.squareSize * $brush.snapCoefficient) / 2) * grid.squaresPerMeter)
										) *
										(((grid.squareSize * $brush.snapCoefficient) / 2) * grid.squaresPerMeter);
							let newY =
								$brush.snapCoefficient == 0
									? circle.y() + circle.offsetY()
									: Math.round(
											(circle.y() +
												(circle.offsetY() - ($brush.snapCoefficient / 2) * grid.squareSize * grid.squaresPerMeter) +
												(grid.squareSize * grid.squaresPerMeter * $brush.snapCoefficient) / 2) /
												(((grid.squareSize * $brush.snapCoefficient) / 2) * grid.squaresPerMeter)
										) *
										(((grid.squareSize * $brush.snapCoefficient) / 2) * grid.squaresPerMeter);
							//If there was no collision, continue in calculating new viable position
							// Update the preview shape's position
							points.push({ x: newX, y: newY, ref: circle, index: replacedPoint.index });
							if (points.length > 1) {
								console.log(points);
								previewZone = new Konva.Line({
									name: "zonePreview" + uuidv4(),
									//Sort by index so the points are in order
									points: points.sort((a, b) => a.index - b.index).flatMap((point) => [point.x, point.y]),
									fill: $brush.color || "blue",
									stroke: $brush.stroke || "black",
									strokeWidth: $brush.strokeWidth || 0,
									opacity: 0.2,
									closed: true
								});
								uiLayer.add(previewZone);
								previewZone.moveToBottom();
							}

							previewShape.x(newX || 0);
							previewShape.y(newY || 0);
						});
						circle.addEventListener("dragend", (e) => {
							e.preventDefault();
							setTimeout(() => {
								circle.position(previewShape.position());
								previewShape.destroy();
							}, 0);
							objectLayer.batchDraw();
							objectLayer.draw();
							pointsHistory.push([...points]);
							circlesHistory.push([...circles]);
						});
						if (points.length == 1) {
							circle.on("mouseenter", () => {
								stage.container().style.cursor = "pointer";
							});
							circle.on("mouseleave", () => {
								stage.container().style.cursor = "default";
							});
							circle.addEventListener("click", () => {
								createZone();
							});
						}
						uiLayer.add(circle);
						circles.push(circle);
						previewZone = new Konva.Line({
							name: "zonePreview" + uuidv4(),
							//Sort points so left most point is first, then clockwise
							points: points.sort((a, b) => a.index - b.index).flatMap((point) => [point.x, point.y]),
							fill: $brush.color || "blue",
							stroke: $brush.stroke || "black",
							strokeWidth: $brush.strokeWidth || 0,
							opacity: 0.2,
							closed: true
						});
						uiLayer.add(previewZone);
						drawPreviewShape = previewZone;
						previewZone.moveToBottom();
						circles.forEach((circle) => {
							circle.moveToTop();
						});
						uiLayer.draw();
					}
					break;
				case "wall":
					{
						if (point.x >= 0 && point.x <= grid.width * grid.squareSize && point.y >= 0 && point.y <= grid.height * grid.squareSize) {
							uiLayer.children.filter((i) => i.name().includes("wallPreview")).forEach((i) => i.destroy());
							pointsHistory.push([...points]);
							circlesHistory.push([...circles]);

							// Create a new circle at the point and add it to the stage
							const circle = new Konva.Circle({
								name: "no-select wallPoint" + uuidv4(),
								x: point.x,
								y: point.y,
								radius: 5,
								fill: points.length == 0 ? themes[$theme].secondary[600] : themes[$theme].secondary[400],
								draggable: true
							});
							points.push({ ...point, ref: circle, index: points.length });
							circle.addEventListener("dragstart", () => {
								// Create a clone of the shape
								previewShape = circle.clone();
								previewShape.name("preview");
								previewShape.draggable(false);

								// Make the clone semi-transparent
								previewShape.opacity(0.5);

								// Add the clone to the layer
								uiLayer.add(previewShape);

								console.log(JSON.stringify(pointsHistory), JSON.stringify(circlesHistory));
							});
							circle.addEventListener("dragmove", () => {
								let replacedPoint = points.find((i) => i.ref.name() == circle.name());
								if (!replacedPoint) return;
								points = points.filter((i) => i.ref.name() != circle.name());
								uiLayer.children.filter((i) => i.name().includes("wallPreview")).forEach((i) => i.destroy());
								previewZone?.remove();
								let newX =
									$brush.snapCoefficient == 0
										? circle.x() + circle.offsetX()
										: Math.round(
												(circle.x() +
													(circle.offsetX() - ($brush.snapCoefficient / 2) * grid.squareSize * grid.squaresPerMeter) +
													(grid.squareSize * grid.squaresPerMeter * $brush.snapCoefficient) / 2) /
													(((grid.squareSize * $brush.snapCoefficient) / 2) * grid.squaresPerMeter)
											) *
											(((grid.squareSize * $brush.snapCoefficient) / 2) * grid.squaresPerMeter);
								let newY =
									$brush.snapCoefficient == 0
										? circle.y() + circle.offsetY()
										: Math.round(
												(circle.y() +
													(circle.offsetY() - ($brush.snapCoefficient / 2) * grid.squareSize * grid.squaresPerMeter) +
													(grid.squareSize * grid.squaresPerMeter * $brush.snapCoefficient) / 2) /
													(((grid.squareSize * $brush.snapCoefficient) / 2) * grid.squaresPerMeter)
											) *
											(((grid.squareSize * $brush.snapCoefficient) / 2) * grid.squaresPerMeter);
								//If there was no collision, continue in calculating new viable position
								// Update the preview shape's position
								points.push({ x: newX, y: newY, ref: circle, index: replacedPoint.index });
								if (points.length > 1) {
									previewZone = new Konva.Line({
										name: "wallPreview" + uuidv4(),
										//Sort by index so the points are in order
										points: points.sort((a, b) => a.index - b.index).flatMap((point) => [point.x, point.y]),
										fill: $brush.color || "blue",
										stroke: $brush.stroke || "black",
										strokeWidth: $brush.strokeWidth || 0,
										opacity: 0.2,
										closed: true
									});
									uiLayer.add(previewZone);
									previewZone.moveToBottom();
								}

								previewShape.x(newX || 0);
								previewShape.y(newY || 0);
							});
							circle.addEventListener("dragend", (e) => {
								e.preventDefault();
								setTimeout(() => {
									circle.position(previewShape.position());
									previewShape.destroy();
								}, 0);
								objectLayer.batchDraw();
								objectLayer.draw();
								pointsHistory.push([...points]);
								circlesHistory.push([...circles]);
								console.log(JSON.stringify(pointsHistory), JSON.stringify(circlesHistory));
							});
							if (points.length == 1) {
								circle.on("mouseenter", () => {
									stage.container().style.cursor = "pointer";
								});
								circle.on("mouseleave", () => {
									stage.container().style.cursor = "default";
								});
								circle.addEventListener("click", () => {
									createWall();
								});
							}
							uiLayer.add(circle);
							circles.push(circle);
							previewZone = new Konva.Line({
								name: "wallPreview" + uuidv4(),
								//Sort points so left most point is first, then clockwise
								points: points.sort((a, b) => a.index - b.index).flatMap((point) => [point.x, point.y]),
								fill: $brush.color || "blue",
								stroke: $brush.stroke || "black",
								strokeWidth: $brush.strokeWidth || 0,
								opacity: 0.2,
								closed: true
							});
							uiLayer.add(previewZone);
							drawPreviewShape = previewZone;
							previewZone.moveToBottom();
							circles.forEach((circle) => {
								circle.moveToTop();
							});
							uiLayer.draw();
						}
					}
					break;
				case "ruler": {
					if (rulerPoints.length == 2) return;
					if (point.x >= 0 && point.x <= grid.width * grid.squareSize && point.y >= 0 && point.y <= grid.height * grid.squareSize) {
						drawPreviewShape?.destroy();
						// Create a new circle at the point and add it to the stage
						const circle = new Konva.Circle({
							draggable: true,
							name: "ruler " + uuidv4(),
							x: point.x,
							y: point.y,
							radius: 5,
							fill: themes[$theme].accent[700]
						});
						rulerPoints.push({ point, ref: circle });
						circle.addEventListener("dragstart", () => {
							// Create a clone of the shape
							previewShape = circle.clone();
							previewShape.name("preview");
							previewShape.draggable(false);

							// Make the clone semi-transparent
							previewShape.opacity(0.5);

							// Add the clone to the layer
							uiLayer.add(previewShape);
						});
						circle.addEventListener("dragmove", () => {
							rulerPoints = rulerPoints.filter((i) => i.ref.name() != circle.name());
							rulerLine?.remove();
							rulerText?.remove();
							let newX =
								$brush.snapCoefficient == 0
									? circle.x() + circle.offsetX()
									: Math.round(
											(circle.x() +
												(circle.offsetX() - ($brush.snapCoefficient / 2) * grid.squareSize * grid.squaresPerMeter) +
												(grid.squareSize * grid.squaresPerMeter * $brush.snapCoefficient) / 2) /
												(((grid.squareSize * $brush.snapCoefficient) / 2) * grid.squaresPerMeter)
										) *
										(((grid.squareSize * $brush.snapCoefficient) / 2) * grid.squaresPerMeter);
							let newY =
								$brush.snapCoefficient == 0
									? circle.y() + circle.offsetY()
									: Math.round(
											(circle.y() +
												(circle.offsetY() - ($brush.snapCoefficient / 2) * grid.squareSize * grid.squaresPerMeter) +
												(grid.squareSize * grid.squaresPerMeter * $brush.snapCoefficient) / 2) /
												(((grid.squareSize * $brush.snapCoefficient) / 2) * grid.squaresPerMeter)
										) *
										(((grid.squareSize * $brush.snapCoefficient) / 2) * grid.squaresPerMeter);
							//If there was no collision, continue in calculating new viable position
							// Update the preview shape's position
							rulerPoints.push({ point: { x: newX, y: newY }, ref: circle });
							if (rulerPoints[1]) {
								const textPos = midpoint(
									[rulerPoints[0].point.x, rulerPoints[0].point.y],
									[rulerPoints[1].point.x, rulerPoints[1].point.y]
								);
								rulerText = new Konva.Text({
									name: "ruler " + uuidv4(),
									x: textPos[0],
									y: textPos[1],
									text:
										(
											distanceBetweenPoints(
												{ x: rulerPoints[0].point.x, y: rulerPoints[0].point.y },
												{ x: rulerPoints[1].point.x, y: rulerPoints[1].point.y }
											) /
											grid.squaresPerMeter /
											grid.squareSize
										).toFixed(2) + "m",
									fill: "white",
									stroke: "black",
									strokeWidth: 0.5,
									fontSize: 24,
									fontFamily: "Poppins",
									align: "center"
								});
								rulerText.setPosition({
									x: textPos[0] - rulerText.width() / 2,
									y: textPos[1] - rulerText.height() / 2
								});
								uiLayer.add(rulerText);
							}

							previewShape.x(newX || 0);
							previewShape.y(newY || 0);

							rulerLine = new Konva.Line({
								name: "ruler " + uuidv4(),
								points: rulerPoints.flatMap((point) => [point.point.x, point.point.y]),
								stroke: $brush.stroke || "black",
								strokeWidth: $brush.strokeWidth || 2,
								opacity: 0.2,
								closed: true
							});
							uiLayer.add(rulerLine);
							rulerLine.moveToTop();
							rulerText?.moveToTop();
							rulerPoints.forEach((point) => {
								point.ref.moveToTop();
							});
						});
						circle.addEventListener("dragend", (e) => {
							e.preventDefault();
							setTimeout(() => {
								circle.position(previewShape.position());
								previewShape.destroy();
							}, 0);
							objectLayer.batchDraw();
							objectLayer.draw();
						});

						uiLayer.add(circle);
						rulerLine = new Konva.Line({
							name: "ruler " + uuidv4(),
							points: rulerPoints.flatMap((point) => [point.point.x, point.point.y]),
							fill: $brush.color || "blue",
							stroke: $brush.stroke || "black",
							strokeWidth: $brush.strokeWidth || 2,
							opacity: 0.2,
							closed: true
						});
						if (rulerPoints[1]) {
							const textPos = midpoint(
								[rulerPoints[0].point.x, rulerPoints[0].point.y],
								[rulerPoints[1].point.x, rulerPoints[1].point.y]
							);
							rulerText = new Konva.Text({
								name: "ruler " + uuidv4(),
								x: textPos[0],
								y: textPos[1],
								text:
									(
										distanceBetweenPoints(
											{ x: rulerPoints[0].point.x, y: rulerPoints[0].point.y },
											{ x: rulerPoints[1].point.x, y: rulerPoints[1].point.y }
										) /
										grid.squaresPerMeter /
										grid.squareSize
									).toFixed(2) + "m",
								fill: "white",
								stroke: "black",
								strokeWidth: 0.5,
								fontSize: 24,
								fontFamily: "Poppins",
								align: "center"
							});
							rulerText.setPosition({
								x: textPos[0] - rulerText.width() / 2,
								y: textPos[1] - rulerText.height() / 2
							});
							uiLayer.add(rulerText);
						}
						uiLayer.add(rulerLine);
						rulerLine.moveToTop();
						rulerText?.moveToTop();
						rulerPoints.forEach((circle) => {
							circle.ref.moveToTop();
						});
						uiLayer.draw();
					}
					break;
				}
			}
		});
	});
	onDestroy(() => {
		unsubscribeBrush();
	});

	const unsubscribeBrush = brush.subscribe(() => {
		switch ($brush.type) {
			case "grab":
				{
					// Remove all circles from the stage
					if (uiLayer) {
						points = [];
						circles = [];
						uiLayer.children
							.filter((i) => !i.name().includes("ruler"))
							.forEach((c) => {
								c.remove();
							});
					}
					if (!objectLayer) return;
					objectLayer.children
						.filter((i) => !i.hasName("wall"))
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

	let previewShape: Konva.Line;
	function dragStart(e: KonvaDragTransformEvent) {
		let shape = e.detail.currentTarget as Konva.Line | Konva.Circle;
		if ($brush.type != "grab") return;
		// Create a clone of the shape
		previewShape = shape.clone();
		previewShape.name("preview");
		previewShape.draggable(false);

		//Animate scaling down to 0.9 with BackEaseOut using Konva.Tween
		const tween = new Konva.Tween({
			node: shape,
			scaleX: 0.8,
			scaleY: 0.8,
			duration: 0.1,
			easing: Konva.Easings.BackEaseOut
		});

		currentTween.set(tween);

		tween.play();

		// Make the clone semi-transparent
		previewShape.opacity(0.5);

		// Add the clone to the layer
		objectLayer.add(previewShape);
	}

	function dragMove(e: KonvaDragTransformEvent) {
		//Group is used to calculate the position of the shape
		let g = e.detail.currentTarget as Konva.Group;
		if ($brush.type != "grab") return;
		//Shape is used to determine collision
		let shape: Konva.Group | Konva.Shape = g.getChildren((node) => node instanceof Konva.Line)[0];
		if (!shape) {
			shape = g.getChildren((node) => node instanceof Konva.Circle)?.[0];
		}
		g.moveToTop();
		// Calculate the new position based on the grid size
		let newX =
			$brush.snapCoefficient == 0
				? g.x() + g.offsetX()
				: Math.round(
						(g.x() +
							(g.offsetX() - ($brush.snapCoefficient / 2) * grid.squareSize * grid.squaresPerMeter) +
							(grid.squareSize * grid.squaresPerMeter * $brush.snapCoefficient) / 2) /
							(((grid.squareSize * $brush.snapCoefficient) / 2) * grid.squaresPerMeter)
					) *
					(((grid.squareSize * $brush.snapCoefficient) / 2) * grid.squaresPerMeter);
		let newY =
			$brush.snapCoefficient == 0
				? g.y() + g.offsetY()
				: Math.round(
						(g.y() +
							(g.offsetY() - ($brush.snapCoefficient / 2) * grid.squareSize * grid.squaresPerMeter) +
							(grid.squareSize * grid.squaresPerMeter * $brush.snapCoefficient) / 2) /
							(((grid.squareSize * $brush.snapCoefficient) / 2) * grid.squaresPerMeter)
					) *
					(((grid.squareSize * $brush.snapCoefficient) / 2) * grid.squaresPerMeter);
		let objects = getMovablePolygons(objectLayer);
		objects.push(...getCollisionPolygons(objectLayer));
		objects = objects.filter((i) => i !== undefined);
		//Detect if there is collision anywhere
		let isColliding = objects.find((group: Konva.Group) => {
			let object: Konva.Line | Konva.Circle = group.findOne((node: Line) => node instanceof Konva.Line) as Konva.Line;
			if (!object) object = group.findOne((node: Circle) => node instanceof Konva.Circle) as Konva.Circle;

			if (object && shape && object !== shape) {
				// && object !== previewShape
				let shapeRef = $tableList.find((i) => i.name == g.name());
				let shapeHitbox;
				if ((shapeRef?.chairs.left && shapeRef.chairs.left > 0) || (shapeRef?.chairs.right && shapeRef.chairs.right > 0)) {
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
				if ((objectRef?.chairs.left && objectRef.chairs.left > 0) || (objectRef?.chairs.right && objectRef.chairs.right > 0)) {
					if (object instanceof Konva.Line) {
						objectHitbox = addChairHitbox(
							pointsToObjectArray(
								pointsToRealPosition(object.points(), {
									x: (object.parent?.x() || 0) - (object.parent?.draggable() ? object.parent.offsetX() : 0),
									y: (object.parent?.y() || 0) - (object.parent?.draggable() ? object.parent.offsetY() : 0)
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
							objectHitbox = pointsToObjectArray(pointsToRealPosition(object.points(), { x: group.x(), y: group.y() }));
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
							rotatePoints(shapeHitbox, { x: shape.parent?.x() || 0, y: shape.parent?.y() || 0 }, shape.parent?.rotation() || 0),
							rotatePoints(objectHitbox, { x: object.parent?.x() || 0, y: object.parent?.y() || 0 }, object.parent?.rotation() || 0)
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
										grid.squareSize *
										grid.squaresPerMeter
								},
								{
									x: object.parent?.x() || 0,
									y: object.parent?.y() || 0,
									radius:
										((objectRef?.table.radius || 0) + (objectRef?.chairs?.left == 0 ? 0 : 0.5)) *
										grid.squareSize *
										grid.squaresPerMeter
								}
							)
						) {
							return true;
						}
					}
					//Check PolyCircle collision
					if (shapeHitbox) {
						console.log("SHAPE HITBOX");
						if (
							checkPolygonCircleCollision(
								rotatePoints(shapeHitbox, { x: shape.parent?.x() || 0, y: shape.parent?.y() || 0 }, shape.parent?.rotation() || 0),
								{
									x: object.parent?.x() || 0,
									y: object.parent?.y() || 0,
									radius:
										((objectRef?.table.radius || 0) + (objectRef?.chairs?.left == 0 ? 0 : 0.5)) *
										grid.squareSize *
										grid.squaresPerMeter
								}
							)
						) {
							return true;
						}
					} else if (objectHitbox) {
						console.log("OBJECT HITBOX");
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
										grid.squareSize *
										grid.squaresPerMeter
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
			let position = { x: newX, y: newY };

			// Update the preview shape's position

			previewShape.x(position?.x || 0);
			previewShape.y(position?.y || 0);

			if (shape instanceof Konva.Shape) {
				shape.fill(themes?.[$theme]?.primary?.[500]);
			}
			shape.parent
				?.getChildren((child) => child instanceof Konva.Rect)
				.forEach((child) => {
					(child as Konva.Rect | Konva.Line).fill(themes?.[$theme]?.primary?.[400]);
				});
		} else {
			if (shape instanceof Konva.Shape) {
				shape.fill("#9f6060");
			}
			shape.parent
				?.getChildren((child) => child instanceof Konva.Rect)
				.forEach((child) => {
					(child as Konva.Rect | Konva.Line).fill("#b38080");
				});
		}
	}

	function transformEnd(e: KonvaDragTransformEvent) {
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

	function nonCollisionDragMove(e: KonvaDragTransformEvent) {
		//Shape is used to determine collision and position
		let g = e.detail.currentTarget as Konva.Group;
		console.log(e);
		let shape: Konva.Group | Konva.Shape = g.getChildren((node) => node instanceof Konva.Line)[0];
		if (!shape) {
			shape = g.getChildren((node) => node instanceof Konva.Circle)?.[0];
		}
		// Calculate the new position based on the grid size
		let newX =
			Math.round(
				(shape.x() +
					(shape.offsetX() - $brush.snapCoefficient * grid.squareSize * grid.squaresPerMeter) +
					grid.squareSize * grid.squaresPerMeter * $brush.snapCoefficient) /
					(grid.squareSize * $brush.snapCoefficient * grid.squaresPerMeter)
			) *
			(grid.squareSize * $brush.snapCoefficient * grid.squaresPerMeter);
		let newY =
			Math.round(
				(shape.y() +
					(shape.offsetY() - $brush.snapCoefficient * grid.squareSize * grid.squaresPerMeter) +
					grid.squareSize * grid.squaresPerMeter * $brush.snapCoefficient) /
					(grid.squareSize * $brush.snapCoefficient * grid.squaresPerMeter)
			) *
			(grid.squareSize * $brush.snapCoefficient * grid.squaresPerMeter);
		//If there was no collision, continue in calculating new viable position
		let position = { x: newX, y: newY };

		// Update the preview shape's position

		previewShape.x(position?.x || 0);
		previewShape.y(position?.y || 0);

		if (shape instanceof Konva.Shape) {
			shape.fill(themes?.[$theme]?.primary?.[500]);
		}

		shape.parent
			?.getChildren((child) => child instanceof Konva.Rect)
			.forEach((child) => {
				(child as Konva.Rect | Konva.Line).fill(themes?.[$theme]?.primary?.[400]);
			});
	}

	function nonCollisionDragEnd(e: KonvaDragTransformEvent) {
		let shape = e.detail.currentTarget;
		e.preventDefault();
		setTimeout(() => {
			shape.position(previewShape.position());
			previewShape.destroy();
		}, 0);
		objectLayer.batchDraw();
		objectLayer.draw();
	}

	function dragEnd(e: KonvaDragTransformEvent) {
		e.preventDefault();
		if ($brush.type != "grab") return;
		let group = e.detail.currentTarget as Konva.Group;
		//Doesnt work without timeout fsr

		//reverse the tween set
		$currentTween.reverse();

		setTimeout(() => {
			group.position(previewShape.position());
			let shape = group.getChildren((node) => node instanceof Konva.Line)?.[0];
			if (!shape) shape = group.getChildren((node) => node instanceof Konva.Circle)?.[0];

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
				name: "zone ".concat(uuidv4()),
				points: points.flatMap((point) => [point.x, point.y]),
				fill: $brush.color || "blue",
				stroke: $brush.stroke || "black",
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
				name: "wall no-select ".concat(uuidv4()),
				points: points.flatMap((point) => [point.x, point.y]),
				fill: "TBD",
				stroke: $brush.stroke || "none",
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

	import themes from "$lib/themes.json";
	import { distanceBetweenPoints } from "chart.js/helpers";
</script>

{#if typeof window !== "undefined"}
	<Stage
		bind:handle={stage}
		config={{
			width: canvas.width,
			height: canvas.height,
			draggable: true,
			scaleX: $stageData?.scale ? $stageData.scale : 1,
			scaleY: $stageData?.scale ? $stageData.scale : 1,
			x: $stageData?.x ? $stageData.x : Math.round(canvas.width / 4),
			y: $stageData?.y ? $stageData.y : 0,
			dragBoundFunc: function (pos) {
				let scale = stage.scaleX(); // assuming stage is scaled uniformly in x and y directions
				let newX = Math.min(pos.x, grid.borderThicknessX * grid.squareSize * scale);
				let newY = Math.min(pos.y, grid.borderThicknessY * grid.squareSize * scale);
				newX = Math.max(newX, -grid.width * grid.squareSize * scale + stage.width() - grid.borderThicknessX * grid.squareSize * scale);
				newY = Math.max(newY, -grid.height * grid.squareSize * scale + stage.height() - grid.borderThicknessY * grid.squareSize * scale);
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
				<!-- eslint-disable-next-line @typescript-eslint/no-unused-vars -->
				{#each Array(grid.height + 1) as _, y}
					<Line
						config={{
							points: [0, y * grid.squareSize, grid.width * grid.squareSize, y * grid.squareSize],
							stroke: themes?.[$theme]?.background?.[300],
							strokeWidth: 1
						}}
					/>
				{/each}
				<!-- eslint-disable-next-line @typescript-eslint/no-unused-vars -->
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
						name: "zone ".concat(object.name),
						points: object.points,
						fill: object.fill,
						closed: true,
						opacity: object.opacity || 1,
						stroke: object.stroke || "",
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
					x: -grid.borderThicknessX * grid.squareSize,
					y: -grid.borderThicknessY * grid.squareSize,
					name: "wall top"
				}}
			>
				<Line
					config={{
						points: objectArrayToPoints(
							{ x: 0, y: 0 },
							{
								x: 2 * grid.borderThicknessX * grid.squareSize + grid.width * grid.squareSize,
								y: 0
							},
							{
								x: 2 * grid.borderThicknessX * grid.squareSize + grid.width * grid.squareSize,
								y: grid.borderThicknessY * grid.squareSize
							},
							{ x: 0, y: grid.borderThicknessY * grid.squareSize }
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
					x: -grid.borderThicknessX * grid.squareSize,
					y: grid.height * grid.squareSize,
					name: "wall bottom"
				}}
			>
				<Line
					config={{
						points: objectArrayToPoints(
							{ x: 0, y: 0 },
							{
								x: 2 * grid.borderThicknessX * grid.squareSize + grid.width * grid.squareSize,
								y: 0
							},
							{
								x: 2 * grid.borderThicknessX * grid.squareSize + grid.width * grid.squareSize,
								y: grid.borderThicknessY * grid.squareSize
							},
							{ x: 0, y: grid.borderThicknessY * grid.squareSize }
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
					x: -grid.borderThicknessX * grid.squareSize,
					y: -grid.borderThicknessY * grid.squareSize,
					name: "wall left"
				}}
			>
				<Line
					config={{
						points: objectArrayToPoints(
							{ x: 0, y: 0 },
							{ x: grid.borderThicknessX * grid.squareSize, y: 0 },
							{
								x: grid.borderThicknessX * grid.squareSize,
								y: grid.height * grid.squareSize + 2 * grid.borderThicknessY * grid.squareSize
							},
							{
								x: 0,
								y: grid.height * grid.squareSize + 2 * grid.borderThicknessY * grid.squareSize
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
					y: -grid.borderThicknessY * grid.squareSize,
					name: "wall right"
				}}
			>
				<Line
					config={{
						points: objectArrayToPoints(
							{ x: 0, y: 0 },
							{ x: grid.borderThicknessX * grid.squareSize, y: 0 },
							{
								x: grid.borderThicknessX * grid.squareSize,
								y: grid.height * grid.squareSize + 2 * grid.borderThicknessY * grid.squareSize
							},
							{
								x: 0,
								y: grid.height * grid.squareSize + 2 * grid.borderThicknessY * grid.squareSize
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
									object.fill?.replace("TBD", $theme == "dark" ? themes[$theme].background[50] : themes[$theme].background[700]) ||
									"black",
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
								offsetX: (grid.squareSize * grid.squaresPerMeter) / 2,
								offsetY: (grid.squareSize * grid.squaresPerMeter) / 2
							}}
							on:dragstart={dragStart}
							on:dragmove={dragMove}
							on:dragend={dragEnd}
							on:transformend={transformEnd}
						>
							<Circle
								config={{
									x: (grid.squareSize * grid.squaresPerMeter) / 2,
									y: (grid.squareSize / 2) * grid.squaresPerMeter,
									radius: table.table.radius * grid.squareSize * grid.squaresPerMeter,
									fill: themes?.[$theme]?.primary?.[500]
								}}
							/>
							<!-- eslint-disable-next-line @typescript-eslint/no-unused-vars -->
							{#each Array(table.chairs.left) as _, i}
								<Rect
									config={{
										x:
											(table.table.radius * grid.squaresPerMeter + 0.25 * grid.squaresPerMeter) *
												grid.squareSize *
												Math.cos((2 * Math.PI * i) / table.chairs.left) +
											(grid.squareSize / 2) * grid.squaresPerMeter,
										y:
											(table.table.radius * grid.squaresPerMeter + 0.25 * grid.squaresPerMeter) *
												grid.squareSize *
												Math.sin((2 * Math.PI * i) / table.chairs.left) +
											(grid.squareSize / 2) * grid.squaresPerMeter,
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
								offsetX: (grid.squareSize * grid.squaresPerMeter) / 2,
								offsetY: (grid.squareSize * grid.squaresPerMeter) / 2
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
							<!-- eslint-disable-next-line @typescript-eslint/no-unused-vars -->
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
							<!-- eslint-disable-next-line @typescript-eslint/no-unused-vars -->
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
