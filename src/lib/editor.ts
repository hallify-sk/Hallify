import { writable } from "svelte/store";

export const stage = writable({
    width: 900,
    height: 900,
    grid: {
        size: 30,
        color: "#ccc",
    }
});

export class Point2D {
    x: number;
    y: number;
    constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
    }
};

export class Vector2D {
    origin: Point2D;
    destination: Point2D;
    constructor(origin: Point2D, destination: Point2D) {
        this.origin = origin;
        this.destination = destination;
    }
    get length() {
        return Math.sqrt(Math.pow(this.destination.x - this.origin.x, 2) + Math.pow(this.destination.y - this.origin.y, 2));
    }
};

export class CollisionManager {
    static checkCollision(a: Vector2D, b: Vector2D) {
        return a.origin.x < b.destination.x && a.destination.x > b.origin.x && a.origin.y < b.destination.y && a.destination.y > b.origin.y;
    }
}