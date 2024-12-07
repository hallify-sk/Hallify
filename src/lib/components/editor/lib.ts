import type { Node, NodeConfig } from 'konva/lib/Node';
import Konva from 'konva';
import type { Vector2d } from 'konva/lib/types';

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
            { x: box.x, y: box.y },
            { x: box.x + box.width, y: box.y },
            { x: box.x + box.width, y: box.y + box.height },
            { x: box.x, y: box.y + box.height }
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
        vectors.push({x: points[i], y: points[i + 1]});
    }
    return vectors;
}

export function polyBounds(p1: Vector2d[], bounds: Vector2d[]): boolean {
    for (const point of p1) {
        let inside = false;
        for (let i = 0, j = bounds.length - 1; i < bounds.length; j = i++) {
            const xi = bounds[i].x, yi = bounds[i].y;
            const xj = bounds[j].x, yj = bounds[j].y;

            const intersect = ((yi > point.y) !== (yj > point.y)) &&
                (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
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

        collision = polyPoint(p1, p2[0].x, p2[0].y);
        if (collision) return true;
    }

    return false;
}

export function polyLine(vertices: Vector2d[], x1: number, y1: number, x2: number, y2: number): boolean {
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

export function lineLine(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number): boolean {
    const uA = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / ((y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1));
    const uB = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / ((y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1));

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
        if (next === vertices.length) next = 0;

        const vc = vertices[current];
        const vn = vertices[next];

        if (((vc.y > py && vn.y < py) || (vc.y < py && vn.y > py)) &&
            (px < (vn.x - vc.x) * (py - vc.y) / (vn.y - vc.y) + vc.x)) {
            collision = !collision;
        }
    }
    return collision;
}