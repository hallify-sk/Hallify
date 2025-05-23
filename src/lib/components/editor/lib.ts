import type { Node, NodeConfig } from 'konva/lib/Node';
import Konva from 'konva';
import type { Vector2d } from 'konva/lib/types';
import { writable, type Writable } from 'svelte/store';
import type { Stage } from 'svelte-konva';

export function constraintNumber(num: number, min: number, max: number) {
	const MIN = min ?? 1;
	const MAX = max ?? 20;
	return Math.min(Math.max(num, MIN), MAX);
}

export function snapToGrid(value: number, gridSize: number) {
	return Math.round(value / gridSize) * gridSize;
}

export function getCorners(element: Node<NodeConfig>, stage: Konva.Stage): number[] {
	const points: number[] = [];
	if (element && element instanceof Konva.Group) {
		const box = element.getClientRect({ relativeTo: element });
		const corners = [
			{ x: box.x + 2, y: box.y + 2 },
			{ x: box.x - 2 + box.width, y: box.y + 2 },
			{ x: box.x - 2 + box.width, y: box.y + box.height - 2 },
			{ x: box.x + 2, y: box.y + box.height - 2 }
		];
		corners.forEach((corner) => {
			const transformedCorner = element.getAbsoluteTransform().point(corner);
			const stageTransform = stage?.getAbsoluteTransform().copy().invert();
			const adjustedCorner = stageTransform?.point(transformedCorner);
			if (adjustedCorner) points.push(adjustedCorner.x, adjustedCorner.y);
		});
	} else if (element && element instanceof Konva.Line) {
		const point = element.points();
		for (let i = 0; i < point.length; i += 2) {
			points.push(...[point[i], point[i + 1]]);
		}
	}
	return points;
}

export function pointsToVector2D(points: number[]): Vector2d[] {
	const vectors: Array<Vector2d> = [];
	for (let i = 0; i < points.length; i += 2) {
		vectors.push({ x: points[i], y: points[i + 1] });
	}
	return vectors;
}

export function circleBounds(p1: Vector2d, radius: number, bounds: Vector2d[]): boolean {
	const minX = Math.min(...bounds.map((p) => p.x));
	const maxX = Math.max(...bounds.map((p) => p.x));
	const minY = Math.min(...bounds.map((p) => p.y));
	const maxY = Math.max(...bounds.map((p) => p.y));

	if (p1.x - radius < minX || p1.x - radius > maxX) return true;
	if (p1.y - radius < minY || p1.y - radius > maxY) return true;
	return false;
}

export function polyBounds(p1: Vector2d[], bounds: Vector2d[]): boolean {
	for (const point of p1) {
		let inside = false;
		for (let i = 0, j = bounds.length - 1; i < bounds.length; j = i++) {
			const xi = bounds[i].x,
				yi = bounds[i].y;
			const xj = bounds[j].x,
				yj = bounds[j].y;

			const intersect =
				yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
			if (intersect) inside = !inside;
		}
		if (!inside) return true;
	}
	return false;
}

export function polyPoly(p1: Vector2d[], p2: Vector2d[]): boolean {
	let next = 0;
	for (let current = 0; current < p1.length; current++) {
		next = current + 1;
		if (next === p1.length) next = 0;

		const vc = p1[current];
		const vn = p1[next];

		let collision = polyLine(p2, vc.x, vc.y, vn.x, vn.y);
		if (collision) return true;

		collision = polyPoint(p2, p1[0].x, p1[0].y);
		if (collision) return true;
	}

	return false;
}

export function polyLine(
	vertices: Vector2d[],
	x1: number,
	y1: number,
	x2: number,
	y2: number
): boolean {
	let next = 0;
	for (let current = 0; current < vertices.length; current++) {
		next = current + 1;
		if (next === vertices.length) next = 0;

		const x3 = vertices[current].x;
		const y3 = vertices[current].y;
		const x4 = vertices[next].x;
		const y4 = vertices[next].y;

		const hit = lineLine(x1, y1, x2, y2, x3, y3, x4, y4);
		if (hit) {
			return true;
		}
	}
	return false;
}

export function lineLine(
	x1: number,
	y1: number,
	x2: number,
	y2: number,
	x3: number,
	y3: number,
	x4: number,
	y4: number
): boolean {
	const uA =
		((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) /
		((y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1));
	const uB =
		((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) /
		((y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1));

	if (uA >= 0 && uA <= 1 && uB >= 0 && uB <= 1) {
		return true;
	}
	return false;
}

export function polyPoint(vertices: Vector2d[], px: number, py: number): boolean {
	let collision = false;

	let next = 0;
	for (let current = 0; current < vertices.length; current++) {
		next = current + 1;
		if (next == vertices.length) next = 0;

		const vc = vertices[current]; // c for "current"
		const vn = vertices[next]; // n for "next"

		// compare position, flip 'collision' variable
		// back and forth
		if (
			((vc.y > py && vn.y < py) || (vc.y < py && vn.y > py)) &&
			px < ((vn.x - vc.x) * (py - vc.y)) / (vn.y - vc.y) + vc.x
		) {
			collision = !collision;
		}
	}
	return collision;
}

export function registerPlugin(
	plugin: (stage: Konva.Stage) => void,
	stage: Konva.Stage,
	name: string
) {
	plugins.update((p) => {
		p.push({ name, attrs: {} });
		return p;
	});
	plugin(stage);
}

export interface StageAttrs {
	//Undefined only before mounting; After mounting it's safe to assume everything is defined.
	tr?: Konva.Transformer;
	layers: {
		[key: string]: Konva.Layer | undefined;
		uiLayer?: Konva.Layer;
		gridLayer?: Konva.Layer;
		collisionLayer?: Konva.Layer;
	};
	grid: {
		gridSize: number;
		gridWidth: number;
		gridHeight: number;
	};
	plugins: string[];
	[key: string]: unknown;
}

interface namedVector2d extends Vector2d {
	name: string;
}

interface zoneVector2d extends namedVector2d {
	color: string;
}

export interface HistoryState {
	gridData: { width: number; height: number };
	points: namedVector2d[];
	zonePoints: zoneVector2d[];
	walls: { points: number[]; name: string }[];
	zones: { points: number[]; name: string; color: string }[];
	tables: Table[];
	// Add other state properties as needed
}

const MAX_HISTORY = 50; // Limit history to prevent memory issues
let historyIndex = -1;
export const history: HistoryState[] = [];

history.push({
	gridData: { width: 20, height: 20 },
	points: [],
	zonePoints: [],
	walls: [],
	zones: [],
	tables: []
});
historyIndex = 1;

export function pushHistory(state: HistoryState) {
	// Create deep copy of state to prevent reference issues
	const newState = {
		gridData: { width: state.gridData.width, height: state.gridData.height },
		points: JSON.parse(JSON.stringify(state.points)),
		zonePoints: JSON.parse(JSON.stringify(state.zonePoints)),
		walls: JSON.parse(JSON.stringify(state.walls)),
		zones: JSON.parse(JSON.stringify(state.zones)),
		tables: JSON.parse(JSON.stringify(state.tables))
	};

	// Remove any future states if we're in the middle of the history
	if (historyIndex < history.length - 1) {
		history.splice(historyIndex + 1);
	}

	// Add new state
	history.push(newState);

	// Remove oldest state if we exceed MAX_HISTORY, but never remove initial state
	if (history.length > MAX_HISTORY) {
		history.splice(1, 1); // Remove second element, keep initial state
		historyIndex--; // Adjust index since we removed an element
	}

	historyIndex = history.length - 1;
}

export function undo(): HistoryState | null {
	if (historyIndex > 0) {
		historyIndex--;
		return JSON.parse(JSON.stringify(history[historyIndex]));
	}
	return null;
}

export function redo(): HistoryState | null {
	if (historyIndex < history.length - 1) {
		historyIndex++;
		return JSON.parse(JSON.stringify(history[historyIndex]));
	}
	return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const plugins: Writable<{ name: string; attrs: { [key: string]: any } }[]> = writable([]);

export interface TableChairs {
	left: string[];
	right: string[];
}

export interface Table {
	shape: 'rect'; // Currently only rect is used, but could be expanded for other shapes
	name: string;
	rotation: number;
	x: number;
	y: number;
	chairs: TableChairs;
}

export const tables: Writable<Table[]> = writable([]);

export const gridData: Writable<{ width: number; height: number }> = writable({
	width: 20,
	height: 20
});

let stage: ReturnType<typeof Stage>;

export function setStage(s: ReturnType<typeof Stage>) {
	stage = s;
}

export function screenshotStage() {
	// Ensure the stage exists
	if (!stage) return;

	// Get the stage handle
	const stageHandle = stage.node;
	if (!stageHandle) return;

	// Save the current stage position and scale
	const originalPosition = stageHandle.position();
	const originalScale = stageHandle.scale();
	const originalSize = stageHandle.size();

	// Reset the stage scale to normal
	stageHandle.scale({ x: 1, y: 1 });

	// Calculate the stage dimensions
	const stageWidth = stageHandle.attrs.grid.gridWidth * stageHandle.attrs.grid.gridSize;
	const stageHeight = stageHandle.attrs.grid.gridHeight * stageHandle.attrs.grid.gridSize;

	// Determine the larger dimension and calculate the scaling factor
	const maxDimension = Math.max(stageWidth, stageHeight);
	const scaleFactor = Math.min(800 / maxDimension, 1); // Cap at 800px

	// Create a square canvas of 800x800
	stageHandle.size({
		width: 800,
		height: 800
	});

	// Calculate center position to ensure content is centered in the square
	// We need to offset the stage position to center the content
	const offsetX = (800 - stageWidth * scaleFactor) / 2;
	const offsetY = (800 - stageHeight * scaleFactor) / 2;

	// Position the stage to center the content
	stageHandle.position({ x: offsetX, y: offsetY });

	// Scale the stage appropriately
	stageHandle.scale({ x: scaleFactor, y: scaleFactor });

	// Capture the stage as a data URL
	const dataURL = stageHandle.toDataURL({
		width: 800,
		height: 800
	});

	// Restore the original stage position, scale, and size
	stageHandle.position(originalPosition);
	stageHandle.scale(originalScale);
	stageHandle.size({ width: originalSize.width, height: originalSize.height });
	// Return the captured data URL
	return dataURL;
}
