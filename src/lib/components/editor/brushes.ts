import Konva from 'konva';

import { type KonvaDragTransformEvent } from 'svelte-konva';
import {
	circleBounds,
	getCorners,
	pointsToVector2D,
	polyBounds,
	polyPoly,
	snapToGrid
} from '$lib/components/editor/lib';
import { registerClickEvent } from './events/click';
import type { Node, NodeConfig } from 'konva/lib/Node';
import { get, writable } from 'svelte/store';
import { points } from '$lib/util';

export interface BrushPlugin {
	readonly dragStart: (e: KonvaDragTransformEvent) => void;
	readonly dragMove: (e: KonvaDragTransformEvent) => void;
	readonly dragEnd: (e: KonvaDragTransformEvent) => void;
	readonly transformRotateStart: () => void;
	readonly transformRotate: () => void;
	readonly transformRotateEnd: () => void;
}

let stage: Konva.Stage;

export const selectedBrush = writable('cursor');

export function brushes(stageRef: Konva.Stage) {
	stage = stageRef;
	if (!stage.attrs.plugins) {
		stage.attrs.plugins = ['brushes'];
	} else {
		stage.attrs.plugins.push('brushes');
	}
	const uiLayer = stage.attrs.layers.uiLayer;
	const gridLayer = stage.attrs.layers.gridLayer;
	registerClickEvent(stage, stage.attrs.tr, { uiLayer, gridLayer });
	stage.attrs.brushes = {};
	stage.attrs.brushes.dragStart = dragStart;
	stage.attrs.brushes.dragMove = dragMove;
	stage.attrs.brushes.dragEnd = dragEnd;
	stage.attrs.brushes.transformRotateStart = transformRotateStart;
	stage.attrs.brushes.transformRotate = transformRotate;
	stage.attrs.brushes.transformRotateEnd = transformRotateEnd;
}

const dragStart = async (e: KonvaDragTransformEvent) => {
	const target = e.detail.target;
	console.log(e, target);
	target.moveTo(stage.attrs.layers.uiLayer);
	const clone = target.clone() as Konva.Group;
	target.moveToTop();
	clone.name('DragPreview');
	clone.position({
		x: target.x(),
		y: target.y()
	});
	clone.draggable(false);
	clone.opacity(0.5);
	stage.attrs.layers.uiLayer?.add(clone);
	clone.draw();
	return;
};

const dragMove = async (e: KonvaDragTransformEvent) => {
	if (!stage) return;
	console.log(e);
	const target = e.detail.target;
	target.moveTo(stage.attrs.layers.uiLayer);
	target.moveToTop();
	const clone = stage.attrs.layers.uiLayer?.findOne('.DragPreview');
	if (!clone) return;
	const objects: Node<NodeConfig>[] = stage.attrs.layers.collisionLayer?.children ?? [];
	const targetCorners = pointsToVector2D(getCorners(target, stage));

	let isColliding = false;

	const stageBounds = [
		0,
		0,
		stage.attrs.grid.gridWidth * stage.attrs.grid.gridSize,
		0,
		stage.attrs.grid.gridWidth * stage.attrs.grid.gridSize,
		stage.attrs.grid.gridHeight * stage.attrs.grid.gridSize,
		0,
		stage.attrs.grid.gridHeight * stage.attrs.grid.gridSize
	];
	if (target.attrs.keepInBounds) {
		isColliding = targetCorners.length
			? polyBounds(targetCorners, pointsToVector2D(stageBounds))
			: circleBounds(
					{ x: target.x(), y: target.y() },
					(target as Konva.Circle).radius(),
					pointsToVector2D(stageBounds)
				);
	}
	if (!isColliding && target.attrs.physics) {
		isColliding = objects
			.filter((i) => i !== target)
			.some((object) => {
				if (!stage) return;
				const objectCorners = pointsToVector2D(getCorners(object, stage));
				//Draw the collision points
				if (polyPoly(targetCorners, objectCorners)) {
					return true;
				} else {
					return false;
				}
			});
	}
	if (isColliding) {
		if (target instanceof Konva.Line || target instanceof Konva.Rect) {
			target.fill('red');
		} else if (target instanceof Konva.Group) {
			target.children.forEach((child) => {
				if (child instanceof Konva.Line || child instanceof Konva.Rect) child.fill('#ff0000');
			});
		}
	} else {
		if (target instanceof Konva.Line || target instanceof Konva.Rect) {
			target.fill(target.attrs.defaultFill);
		} else if (target instanceof Konva.Group) {
			target.children.forEach((child) => {
				if (child instanceof Konva.Line || child instanceof Konva.Rect)
					child.fill(child.attrs.defaultFill);
			});
		}
		clone.position({
			x: snapToGrid(target.x(), stage.attrs.grid.gridSize),
			y: snapToGrid(target.y(), stage.attrs.grid.gridSize)
		});
		if (get(points).some((point) => point.name === target.name())) {
			points.update((p) => {
				const index = p.findIndex((point) => point.name === target.name());
				p[index] = {
					x: snapToGrid(target.x(), stage.attrs.grid.gridSize),
					y: snapToGrid(target.y(), stage.attrs.grid.gridSize),
					name: target.name()
				};
				return p;
			});
		}
	}
	return;
};

const dragEnd = async (e: KonvaDragTransformEvent) => {
	const target = e.detail.target;
	target.moveToTop();
	const clone = stage.attrs.layers.uiLayer?.findOne('.DragPreview');
	setTimeout(() => {
		target.position(clone?.position() ?? { x: 0, y: 0 });
	}, 0);
	if (target instanceof Konva.Line || target instanceof Konva.Rect) {
		target.fill(target.attrs.defaultFill);
	} else if (target instanceof Konva.Group) {
		target.children.forEach((child) => {
			if (child instanceof Konva.Line || child instanceof Konva.Rect)
				child.fill(child.attrs.defaultFill);
		});
	}

	clone?.destroy();
	return;
};

const transformRotateStart = async (e: KonvaDragTransformEvent) => {
	const target = e.detail.target;
	target.moveTo(stage.attrs.layers.uiLayer);
	const clone = target.clone() as Konva.Group;
	target.moveToTop();
	clone.name('DragPreview');
	clone.rotation(target.rotation());
	clone.draggable(false);
	clone.opacity(0.5);
	stage.attrs.layers.uiLayer?.add(clone);
	clone.draw();
	return;
};

const transformRotate = async (e: KonvaDragTransformEvent) => {
	if (!stage) return;
	const target = e.detail.target;
	target.moveTo(stage.attrs.layers.uiLayer);
	target.moveToTop();
	const clone = stage.attrs.layers.uiLayer?.findOne('.DragPreview');
	if (!clone) return;
	const objects: Node<NodeConfig>[] = stage.attrs.layers.collisionLayer?.children ?? [];
	const targetCorners = pointsToVector2D(getCorners(target, stage));

	let isColliding = false;

	const stageBounds = [
		0,
		0,
		stage.attrs.grid.gridWidth * stage.attrs.grid.gridSize,
		0,
		stage.attrs.grid.gridWidth * stage.attrs.grid.gridSize,
		stage.attrs.grid.gridHeight * stage.attrs.grid.gridSize,
		0,
		stage.attrs.grid.gridHeight * stage.attrs.grid.gridSize
	];
	isColliding = polyBounds(targetCorners, pointsToVector2D(stageBounds));

	if (!isColliding) {
		isColliding = objects
			.filter((i) => i !== target)
			.some((object) => {
				if (!stage) return;
				const objectCorners = pointsToVector2D(getCorners(object, stage));
				//Draw the collision points
				if (polyPoly(targetCorners, objectCorners)) {
					return true;
				} else {
					return false;
				}
			});
	}
	if (isColliding) {
		if (target instanceof Konva.Line || target instanceof Konva.Rect) {
			target.fill('red');
		} else if (target instanceof Konva.Group) {
			target.children.forEach((child) => {
				if (child instanceof Konva.Line || child instanceof Konva.Rect) child.fill('#ff0000');
			});
		}
	} else {
		if (target instanceof Konva.Line || target instanceof Konva.Rect) {
			target.fill(target.attrs.defaultFill);
		} else if (target instanceof Konva.Group) {
			target.children.forEach((child) => {
				if (child instanceof Konva.Line || child instanceof Konva.Rect)
					child.fill(child.attrs.defaultFill);
			});
		}
		clone.rotation(target.rotation());
		clone.position({
			x: snapToGrid(target.x(), stage.attrs.grid.gridSize),
			y: snapToGrid(target.y(), stage.attrs.grid.gridSize)
		});
	}
	return;
};

const transformRotateEnd = async (e: KonvaDragTransformEvent) => {
	const target = e.detail.target;
	target.moveToTop();
	const clone = stage.attrs.layers.uiLayer?.findOne('.DragPreview');
	setTimeout(() => {
		target.rotation(clone?.rotation() ?? 0);
		target.position(clone?.position() ?? { x: 0, y: 0 });
	}, 0);
	if (target instanceof Konva.Line || target instanceof Konva.Rect) {
		target.fill(target.attrs.defaultFill);
	} else if (target instanceof Konva.Group) {
		target.children.forEach((child) => {
			if (child instanceof Konva.Line || child instanceof Konva.Rect)
				child.fill(child.attrs.defaultFill);
		});
	}
	target.moveTo(stage.attrs.layers.collisionLayer);
	clone?.destroy();
	return;
};
