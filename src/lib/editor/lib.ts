import Konva from "konva"; // 2D canvas JS framework

export type Grid = {
	/**
	 * Width of the grid.
	 */
	width: number;
	/**
	 * Height of the grid.
	 */
	height: number;
	/**
	 * Size of each square in the grid.
	 */
	squareSize: number;
	/**
	 * Thickness of the border along the X axis.
	 */
	borderThicknessX: number;
	/**
	 * Thickness of the border along the Y axis.
	 */
	borderThicknessY: number;
	/**
	 * Number of squares per meter for scaling purposes.
	 */
	squaresPerMeter: number;
};

/**
 * Calculates the midpoint between two points.
 * @param param0 - The coordinates of the first point [x1, y1].
 * @param param1 - The coordinates of the second point [x2, y2].
 * @returns The coordinates of the midpoint.
 */
export const midpoint = ([x1, y1]: number[], [x2, y2]: number[]) => [(x1 + x2) / 2, (y1 + y2) / 2];

/**
 * Clamps a value between a minimum and a maximum.
 * @param val - The value to clamp.
 * @param min - The minimum allowed value.
 * @param max - The maximum allowed value.
 * @returns The clamped value.
 */
export function clamp(val: number, min: number, max: number): number {
	return Math.min(Math.max(val, min), max);
}

/**
 * Converts an array of points to real positions based on a given position.
 * @param points - The array of points.
 * @param position - The position object { x, y }.
 * @returns An array of real positions.
 */
export function pointsToRealPosition(points: number[], position: { x: number; y: number }) {
	return points.map((v, i) => (i % 2 === 0 ? v + position.x : v + position.y));
}

/**
 * Converts an array of points to an array of objects with x and y properties.
 * @param points - The array of points.
 * @returns An array of objects with x and y properties.
 */
export function pointsToObjectArray(points: number[]) {
	return points.reduce(
		(acc, curr, i, a) => {
			if (i % 2 === 0 && a[i + 1] !== undefined) {
				acc.push({ x: curr, y: a[i + 1] });
			}
			return acc;
		},
		[] as { x: number; y: number }[]
	);
}

/**
 * Adds chair hitbox based on given parameters.
 * @param points - The points defining the shape of the hitbox.
 * @param squareSize - The size of each square in the grid.
 * @param squaresPerMeter - The number of squares per meter for scaling purposes.
 * @param chairSize - The size of the chair.
 * @param left - Indicates if the chair is on the left side.
 * @param right - Indicates if the chair is on the right side.
 * @returns The hitbox points with adjusted positions.
 */
export function addChairHitbox(
	points: { x: number; y: number }[],
	squareSize: number,
	squaresPerMeter: number,
	chairSize: number,
	left?: boolean,
	right?: boolean
) {
	return points.map((v, i) => {
		if (i === 1 || i === 2) {
			return right ? { x: v.x + chairSize * squareSize * squaresPerMeter, y: v.y } : v;
		} else {
			return left ? { x: v.x - chairSize * squareSize * squaresPerMeter, y: v.y } : v;
		}
	});
}

/**
 * Rotates points around an origin object by a given angle.
 * @param points - The points to rotate.
 * @param originObject - The origin of rotation { x, y }.
 * @param angle - The rotation angle in degrees.
 * @returns The rotated points.
 */
export function rotatePoints(points: { x: number; y: number }[], originObject: { x: number; y: number }, angle: number) {
	const radians = (angle * Math.PI) / 180;
	return points.map((point) => {
		const rotatedX = Math.cos(radians) * (point.x - originObject.x) - Math.sin(radians) * (point.y - originObject.y) + originObject.x;
		const rotatedY = Math.sin(radians) * (point.x - originObject.x) + Math.cos(radians) * (point.y - originObject.y) + originObject.y;
		return { x: Math.round(rotatedX), y: Math.round(rotatedY) };
	});
}

/**
 * Converts an array of objects with x and y properties to a flat array of points.
 * @param points - The array of objects with x and y properties.
 * @returns The flat array of points.
 */
export function objectArrayToPoints(...points: { x: number; y: number }[]) {
	return points.flatMap(({ x, y }) => [x, y]);
}

/**
 * Counts the total number of chairs in a table list.
 * @param tableList - The list of tables with chair configurations.
 * @returns The total number of chairs.
 */
export function countTotalChairs(
	tableList: {
		name: string;
		rotation: number;
		x?: number;
		y?: number;
		chairs: {
			left: number;
			right: number;
			max: number;
		};
		table: {
			width: number;
			height: number;
		};
	}[]
) {
	return tableList.reduce((acc, table) => acc + table.chairs.left + table.chairs.right, 0);
}

/**
 * Checks if a point is within a circle.
 * @param x - The x-coordinate of the point.
 * @param y - The y-coordinate of the point.
 * @param cx - The x-coordinate of the circle center.
 * @param cy - The y-coordinate of the circle center.
 * @param r - The radius of the circle.
 * @returns True if the point is inside the circle, otherwise false.
 */
function pointCircle(x: number, y: number, cx: number, cy: number, r: number) {
	const distX = x - cx;
	const distY = y - cy;
	const distance = Math.sqrt(distX ** 2 + distY ** 2);
	return distance <= r;
}

/**
 * Checks if a point is on a line.
 * @param x1 - The x-coordinate of the first point of the line.
 * @param y1 - The y-coordinate of the first point of the line.
 * @param x2 - The x-coordinate of the second point of the line.
 * @param y2 - The y-coordinate of the second point of the line.
 * @param px - The x-coordinate of the point to check.
 * @param py - The y-coordinate of the point to check.
 * @returns True if the point is on the line, otherwise false.
 */
function linePoint(x1: number, y1: number, x2: number, y2: number, px: number, py: number) {
	const d1 = getDistanceFromPoint(px, py, x1, y1);
	const d2 = getDistanceFromPoint(px, py, x2, y2);
	const lineLen = getDistanceFromPoint(x1, y1, x2, y2);
	const buffer = 0.1;
	return d1 + d2 >= lineLen - buffer && d1 + d2 <= lineLen + buffer;
}

/**
 * Calculates the distance between two points.
 * @param px - The x-coordinate of the first point.
 * @param py - The y-coordinate of the first point.
 * @param x - The x-coordinate of the second point.
 * @param y - The y-coordinate of the second point.
 * @returns The distance between the points.
 */
function getDistanceFromPoint(px: number, py: number, x: number, y: number) {
	const distX = px - x;
	const distY = py - y;
	return Math.sqrt(distX ** 2 + distY ** 2);
}

/**
 * Checks if two circles collide.
 * @param circleOne - The first circle.
 * @param circleTwo - The second circle.
 * @returns True if the circles collide, otherwise false.
 */
export function checkCircleCollision(circleOne: { x: number; y: number; radius: number }, circleTwo: { x: number; y: number; radius: number }) {
	const distX = circleOne.x - circleTwo.x;
	const distY = circleOne.y - circleTwo.y;
	const distance = Math.sqrt(distX ** 2 + distY ** 2);
	return distance <= circleOne.radius + circleTwo.radius;
}

/**
 * Checks if a polygon collides with a circle.
 * @param polygon - The polygon points.
 * @param circle - The circle.
 * @returns True if the polygon collides with the circle, otherwise false.
 */
export function checkPolygonCircleCollision(polygon: { x: number; y: number }[], circle: { x: number; y: number; radius: number }) {
	// check if any polygon vertex is inside the circle
	if (
		polygon.some((_, i) => {
			const nextIndex = (i + 1) % polygon.length;
			const pointOne = polygon[i];
			const pointTwo = polygon[nextIndex];
			const insideOne = pointCircle(pointOne.x, pointOne.y, circle.x, circle.y, circle.radius);
			const insideTwo = pointCircle(pointTwo.x, pointTwo.y, circle.x, circle.y, circle.radius);
			if (insideOne || insideTwo) return true;

			// check if circle is inside the polygon
			const distX = pointOne.x - pointTwo.x;
			const distY = pointOne.y - pointTwo.y;
			const len = Math.sqrt(distX ** 2 + distY ** 2);
			const dot = ((circle.x - pointOne.x) * (pointTwo.x - pointOne.x) + (circle.y - pointOne.y) * (pointTwo.y - pointOne.y)) / len ** 2;

			const closestX = pointOne.x + dot * (pointTwo.x - pointOne.x);
			const closestY = pointOne.y + dot * (pointTwo.y - pointOne.y);

			const onSegment = linePoint(pointOne.x, pointOne.y, pointTwo.x, pointTwo.y, closestX, closestY);
			if (!onSegment) return false;

			const distToClosestX = closestX - circle.x;
			const distToClosestY = closestY - circle.y;
			const distance = Math.sqrt(distToClosestX ** 2 + distToClosestY ** 2);

			return distance <= circle.radius;
		})
	) {
		return true;
	}

	// check if the circle's center is inside the polygon
	return polyPoint(polygon, circle.x, circle.y);
}

/**
 * Checks if two polygons collide.
 * @param polygon1 - The points of the first polygon.
 * @param polygon2 - The points of the second polygon.
 * @returns True if the polygons collide, otherwise false.
 */
export function checkPolygonCollision(polygon1: { x: number; y: number }[], polygon2: { x: number; y: number }[]) {
	for (let i = 0; i < polygon1.length; i++) {
		const nextIndex = (i + 1) % polygon1.length;
		const pointOne = polygon1[i];
		const pointTwo = polygon1[nextIndex];

		// check if any point of polygon2 is inside polygon1
		if (polyPoint(polygon1, polygon2[0].x, polygon2[0].y)) return true;
		// check if any point of polygon1 is inside polygon2
		if (polyPoint(polygon2, polygon1[0].x, polygon1[0].y)) return true;

		// check if any edges intersect
		if (
			polygon2.some((_, j, a) => {
				const nextUIndex = (j + 1) % a.length;
				const pointThree = a[j];
				const pointFour = a[nextUIndex];

				const uA =
					((pointFour.x - pointThree.x) * (pointOne.y - pointThree.y) - (pointFour.y - pointThree.y) * (pointOne.x - pointThree.x)) /
					((pointFour.y - pointThree.y) * (pointTwo.x - pointOne.x) - (pointFour.x - pointThree.x) * (pointTwo.y - pointOne.y));
				const uB =
					((pointTwo.x - pointOne.x) * (pointOne.y - pointThree.y) - (pointTwo.y - pointOne.y) * (pointOne.x - pointThree.x)) /
					((pointFour.y - pointThree.y) * (pointTwo.x - pointOne.x) - (pointFour.x - pointThree.x) * (pointTwo.y - pointOne.y));

				return uA >= 0 && uA <= 1 && uB >= 0 && uB <= 1;
			})
		) {
			return true;
		}
	}
	return false;
}

/**
 * Checks if a point is inside a polygon.
 * @param vertices - The vertices of the polygon.
 * @param px - The x-coordinate of the point.
 * @param py - The y-coordinate of the point.
 * @returns True if the point is inside the polygon, otherwise false.
 */
function polyPoint(vertices: { x: number; y: number }[], px: number, py: number): boolean {
	let collision = false;
	vertices.forEach((vc, current) => {
		const next = (current + 1) % vertices.length;
		const vn = vertices[next];

		if (((vc.y > py && vn.y < py) || (vc.y < py && vn.y > py)) && px < ((vn.x - vc.x) * (py - vc.y)) / (vn.y - vc.y) + vc.x) {
			collision = !collision;
		}
	});
	return collision;
}

/**
 * Retrieves all draggable polygons in a given layer.
 * @param layer - The Konva.Layer to search.
 * @returns An array of draggable polygons.
 */
export function getMovablePolygons(layer: Konva.Layer) {
	return layer.getChildren((node) => node instanceof Konva.Group && node.draggable()) as Konva.Group[];
}

/**
 * Retrieves all non-draggable polygons in a given layer, excluding transformers (draggable) and preview nodes.
 * @param layer - The Konva.Layer to search.
 * @returns An array of non-draggable polygons.
 */
export function getCollisionPolygons(layer: Konva.Layer) {
	return layer.getChildren(
		(node) => node instanceof Konva.Group && !node.draggable() && !(node instanceof Konva.Transformer) && node.name() !== "preview"
	) as Konva.Group[];
}

/**
 * Finds the closest viable position within a grid, avoiding collisions.
 * @param x - The x-coordinate of the starting position.
 * @param y - The y-coordinate of the starting position.
 * @param shape - The shape to check collisions for.
 * @param objects - The objects to avoid collision with.
 * @param grid - The grid configuration.
 * @returns The closest viable position.
 */
export function getClosestViablePosition(x: number, y: number, shape: Konva.Line, objects: Konva.Line[], grid: Grid) {
	const gridCells: Map<string, Konva.Line[]> = new Map();

	// Group objects by their grid cell
	objects.forEach((object) => {
		const cellX = Math.floor(object.x() / grid.squareSize);
		const cellY = Math.floor(object.y() / grid.squareSize);
		const key = `${cellX},${cellY}`;

		if (!gridCells.has(key)) {
			gridCells.set(key, []);
		}

		gridCells.get(key)!.push(object);
	});

	let step = 1;

	// Outward spiral pattern to find the closest viable position - reference to algorithms.txt -> line 1
	while (step < 1000) {
		for (let i = -step; i <= step; i++) {
			for (let j = -step; j <= step; j++) {
				if (i !== -step && i !== step && j !== -step && j !== step) {
					continue;
				}

				const checkX = x + i * grid.squareSize;
				const checkY = y + j * grid.squareSize;

				shape.x(checkX);
				shape.y(checkY);

				const cellX = Math.floor(checkX / grid.squareSize);
				const cellY = Math.floor(checkY / grid.squareSize);
				const key = `${cellX},${cellY}`;
				const cellObjects = gridCells.get(key) || [];

				const collision = cellObjects.some(
					(object) =>
						object !== shape &&
						checkPolygonCollision(
							rotatePoints(
								pointsToObjectArray(pointsToRealPosition(shape.points(), shape.position())),
								{ x: shape.x(), y: shape.y() },
								shape.rotation()
							),
							rotatePoints(
								pointsToObjectArray(pointsToRealPosition(object.points(), object.position())),
								{ x: object.x(), y: object.y() },
								object.rotation()
							)
						)
				);

				if (!collision) {
					return { x: checkX, y: checkY };
				}
			}
		}
		step++;
	}
}

/**
 * Converts a data URI to a Blob.
 * @param dataURI - The data URI to convert.
 * @returns The Blob object.
 */
export function dataURItoBlob(dataURI: string) {
	const byteString = atob(dataURI.split(",")[1]);
	const mimeString = dataURI.split(",")[0].split(":")[1].split(";")[0];
	const ab = new ArrayBuffer(byteString.length);
	const ia = new Uint8Array(ab);

	for (let i = 0; i < byteString.length; i++) {
		ia[i] = byteString.charCodeAt(i);
	}

	return new Blob([ab], { type: mimeString });
}
