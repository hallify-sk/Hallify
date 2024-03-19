import Konva from 'konva';

export function clamp(val: number, min: number, max: number): number {
	return Math.min(Math.max(val, min), max);
}
export function pointsToRealPosition(points: Array<number>, position: { x: number; y: number }) {
	return points.map((v, i) => {
		return Math.round(i % 2 == 0 ? v + position.x : v + position.y);
	});
}
export function pointsToObjectArray(points: Array<number>) {
	return points
		.map((_, i, a) => {
			return { x: a[i], y: a[i + 1] };
		})
		.filter((v, i, a) => {
			if (!(i % 2) && typeof a[i + 1] !== 'undefined') return true;
		});
}

export function addChairHitbox(
	points: Array<{ x: number; y: number }>,
	squareSize: number,
	chairSize: number,
	left: boolean | undefined,
	right: boolean | undefined
) {
	//We take the points and add a buffer of 1 grid.squareSize to each side of the X axis
	//Indices 0, 3 are to the left, 1, 2 are to the right
	return points.map((v, i) => {
		if (i == 1 || i == 2) {
			if (right) return { x: v.x + chairSize * squareSize, y: v.y };
			else return { x: v.x, y: v.y };
		} else {
			if (left) return { x: v.x - chairSize * squareSize, y: v.y };
			else return { x: v.x, y: v.y };
		}
	});
}

export function rotatePoints(
	points: Array<{ x: number; y: number }>,
	originObject: { x: number; y: number },
	angle: number
) {
	const a = angle * (Math.PI / 180); // Convert to radians
	return points.map((point) => {
		const rotatedX =
			Math.cos(a) * (point.x - originObject.x) -
			Math.sin(a) * (point.y - originObject.y) +
			originObject.x;
		const rotatedY =
			Math.sin(a) * (point.x - originObject.x) +
			Math.cos(a) * (point.y - originObject.y) +
			originObject.y;
		return { x: Math.round(rotatedX), y: Math.round(rotatedY) };
	});
}

export function objectArrayToPoints(...points: { x: number; y: number }[]) {
	return [
		...points.map((v) => {
			return [v.x, v.y];
		})
	].flat();
}

export function countTotalChairs(
	tableList: {
		name: string;
		rotation: number;
		x?: number | undefined;
		y?: number | undefined;
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
	return tableList.reduce((acc, table) => {
		return acc + table.chairs.left + table.chairs.right;
	}, 0);
}

function pointCircle(x: number, y: number, cx: number, cy: number, r: number){
	const distX = x - cx;
	const distY = y - cy;
	const distance = Math.sqrt( distX**2 + distY**2);

	if(distance <= r){
		return true;
	}
	return false;
}

function linePoint(x1: number, y1: number, x2: number, y2: number, px: number, py: number){
	const d1 = getDistanceFromPoint(px, py, x1, y1);
	const d2 = getDistanceFromPoint(px, py, x2, y2);

	const lineLen = getDistanceFromPoint(x1, y1, x2, y2);

	const buffer = 0.1;

	if (d1+d2 >= lineLen-buffer && d1+d2 <= lineLen+buffer){
		return true;
	}
	return false;
}

function getDistanceFromPoint(px: number, py: number, x: number, y: number){
	const distX = px - x;
	const distY = py - y;

	return Math.sqrt( distX**2 + distY**2 );
}

export function checkCircleCollision(circleOne: {x: number, y: number, radius: number}, circleTwo: {x: number, y: number, radius: number}){
	const distX = circleOne.x - circleTwo.x;
	const distY = circleOne.y - circleTwo.y;

	const distance = Math.sqrt((distX**2) + (distY**2));

	if(distance <= circleOne.radius+circleTwo.radius){
		return true;
	}
	return false;
}

export function checkPolygonCircleCollision(
	polygon: Array<{ x: number; y: number }>,
	circle: { x: number; y: number, radius: number }
) {
	if(polygon.some((_, i) => {
		let nextIndex = i + 1;
		if(nextIndex === polygon.length) nextIndex = 0;

		const pointOne = polygon[i];
		const pointTwo = polygon[nextIndex];

		const insideOne = pointCircle(pointOne.x, pointOne.y, circle.x, circle.y, circle.radius);
		const insideTwo = pointCircle(pointTwo.x, pointTwo.y, circle.x, circle.y, circle.radius);
	
		if(insideOne || insideTwo) return true;

		let distX = pointOne.x - pointTwo.x;
		let distY = pointOne.y - pointTwo.y;
		const len = Math.sqrt( distX**2 + distY**2 );

		const dot = ( ((circle.x-pointOne.x)*(pointTwo.x-pointOne.x)) + ((circle.y-pointOne.y)*(pointTwo.y-pointOne.y))) / len**2;
		
		const closestX = pointOne.x + (dot * (pointTwo.x-pointOne.x));
		const closestY = pointOne.y + (dot * (pointTwo.y-pointOne.y));

		const onSegment = linePoint(pointOne.x, pointOne.y, pointTwo.x, pointTwo.y, closestX, closestY);
		if(!onSegment) return false;

		distX = closestX - circle.x;
		distY = closestY - circle.y;

		const distance = Math.sqrt( distX**2 + distY**2);

		if(distance <= circle.radius){
			return true;
		}
		return false;
	})){
		return true;
	};
	return false;
}

export function checkPolygonCollision(
	polygon1: Array<{ x: number; y: number }>,
	polygon2: Array<{ x: number; y: number }>
) {
	//Get a line
	let nextIndex: number = 0;
	for (let i = 0; i < polygon1.length; i++) {
		nextIndex = i + 1;
		if (nextIndex === polygon1.length) nextIndex = 0;

		let nextUIndex: number = 0;

		const pointOne = polygon1[i];
		const pointTwo = polygon1[nextIndex];

		if (
			polygon2.some((_, i, a) => {
				// http://www.jeffreythompson.org/collision-detection/line-line.php
				nextUIndex = i + 1;
				if (nextUIndex === a.length) nextUIndex = 0;
				const pointThree = a[i];
				const pointFour = a[nextUIndex];
				const uA =
					((pointFour.x - pointThree.x) * (pointOne.y - pointThree.y) -
						(pointFour.y - pointThree.y) * (pointOne.x - pointThree.x)) /
					((pointFour.y - pointThree.y) * (pointTwo.x - pointOne.x) -
						(pointFour.x - pointThree.x) * (pointTwo.y - pointOne.y));
				const uB =
					((pointTwo.x - pointOne.x) * (pointOne.y - pointThree.y) -
						(pointTwo.y - pointOne.y) * (pointOne.x - pointThree.x)) /
					((pointFour.y - pointThree.y) * (pointTwo.x - pointOne.x) -
						(pointFour.x - pointThree.x) * (pointTwo.y - pointOne.y));

				// if uA and uB are between 0-1, lines are colliding
				if (uA >= 0 && uA <= 1 && uB >= 0 && uB <= 1) {
					return true;
				}
				return false;
			})
		) {
			return true;
		}
	}
}

// export function checkPolygonCollision(polygon1: Array<{x: number, y: number}>, polygon2: Array<{x: number, y: number}>) {
//   const polygons = [polygon1, polygon2];
//   console.log(polygons);
//   let minA, maxA, projected, i, i1, j, minB, maxB;

//   for (i = 0; i < polygons.length; i++) {

//     const polygon = polygons[i];
//     for (i1 = 0; i1 < polygon.length; i1++) {

//       const i2 = (i1 + 1) % polygon.length;
//       const p1 = polygon[i1];
//       const p2 = polygon[i2];

//       const normal = { x: p2.y - p1.y, y: p1.x - p2.x };
//       minA = maxA = undefined;
//       for (j = 0; j < polygon1.length; j++) {
//         projected = normal.x * polygon1[j].x + normal.y * polygon1[j].y;
//         if (minA === undefined || projected < minA) {
//           minA = projected;
//         }
//         if (maxA === undefined || projected > maxA) {
//           maxA = projected;
//         }
//       }

//       minB = maxB = undefined;
//       for (j = 0; j < polygon2.length; j++) {
//         projected = normal.x * polygon2[j].x + normal.y * polygon2[j].y;
//         if (minB === undefined || projected < minB) {
//           minB = projected;
//         }
//         if (maxB === undefined || projected > maxB) {
//           maxB = projected;
//         }
//       }

//       if (maxA < minB || maxB < minA) {
//         return false;
//       }
//     }
//   }
//   return true;
// };
export function getMovablePolygons(layer: Konva.Layer) {
	return layer.getChildren(
		(node) => node instanceof Konva.Group && node.draggable()
	) as Konva.Group[];
}
export function getCollisionPolygons(layer: Konva.Layer) {
	return layer.getChildren(
		(node) =>
			node instanceof Konva.Group &&
			!node.draggable() &&
			!(node instanceof Konva.Transformer) &&
			node.name() !== 'preview'
	) as Konva.Group[];
}
export function getClosestViablePosition(
	x: number,
	y: number,
	shape: Konva.Line,
	objects: Konva.Line[],
	grid: {
		width: number;
		height: number;
		squareSize: number;
		snapSize: number;
		color: string;
	}
) {
	// Create an empty map for the grid cells
	const gridCells: Map<string, Konva.Line[]> = new Map();

	// Add each object to the grid cells
	for (const object of objects) {
		const cellX = Math.floor(object.x() / grid.squareSize);
		const cellY = Math.floor(object.y() / grid.squareSize);
		const key = `${cellX},${cellY}`;

		if (!gridCells.has(key)) {
			gridCells.set(key, []);
		}

		gridCells.get(key)!.push(object);
	}

	let step = 1;
	// eslint-disable-next-line no-constant-condition
	while (step < 1000) {
		for (let i = -step; i <= step; i++) {
			for (let j = -step; j <= step; j++) {
				if (i !== -step && i !== step && j !== -step && j !== step) {
					// Skip positions that are not on the current step of the spiral
					continue;
				}

				// Calculate the position to check
				const checkX = x + i * grid.squareSize * grid.snapSize;
				const checkY = y + j * grid.squareSize * grid.snapSize;

				// Update the shape's position
				shape.x(checkX);
				shape.y(checkY);

				// Get the objects in the same grid cell
				const cellX = Math.floor(checkX / grid.squareSize);
				const cellY = Math.floor(checkY / grid.squareSize);
				const key = `${cellX},${cellY}`;
				const cellObjects = gridCells.get(key) || [];

				// Check for collisions
				const collision = cellObjects.some(
					(object: Konva.Line) =>
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
					// If there's no collision, return the position as the closest viable position
					return { x: checkX, y: checkY };
				}
			}
		}

		// If all positions result in a collision, increase the step of the spiral
		step++;
	}
}

export function dataURItoBlob(dataURI: string) {
	// convert base64 to raw binary data held in a string
	// doesn't handle URLEncoded DataURIs - see SO answer #6850276 for code that does this
	const byteString = atob(dataURI.split(',')[1]);

	// separate out the mime component
	const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];

	// write the bytes of the string to an ArrayBuffer
	const ab = new ArrayBuffer(byteString.length);

	// create a view into the buffer
	const ia = new Uint8Array(ab);

	// set the bytes of the buffer to the correct values
	for (let i = 0; i < byteString.length; i++) {
		ia[i] = byteString.charCodeAt(i);
	}

	// write the ArrayBuffer to a blob, and you're done
	const blob = new Blob([ab], { type: mimeString });
	return blob;
}
