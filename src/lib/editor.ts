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
    rotation?: number;
    constructor(x: number, y: number, rotation: number = 0) {
        this.x = x;
        this.y = y;
        this.rotation = rotation;
    }
    distance(target: Point2D) {
        return Math.sqrt(Math.pow(target.x - this.x, 2) + Math.pow(target.y - this.y, 2));
    }
};

export class Circle2D {
    x: number;
    y: number;
    radius: number;
    constructor(x: number, y: number, radius: number) {
        this.x = x;
        this.y = y;
        this.radius = radius;
    }
    get area(){
        return Math.PI * Math.pow(this.radius, 2);
    }
    get circumference(){
        return 2 * Math.PI * this.radius;
    }
    *pointsOnCircumference(points: number = 1, radiusOffset: number = 0){
        if (points < 1) throw new Error("Points must be greater than 0");
        for (let i = 0; i < points; i++){
            yield new Point2D(
                (this.radius + radiusOffset) *
					1 * //Grid size
					Math.cos((2 * Math.PI * i) / points),
					//(grid.squareSize / 2) * grid.squaresPerMeter,
				(this.radius + radiusOffset) *
				    1 *
					Math.sin((2 * Math.PI * i) / points),
					//(grid.squareSize / 2) * grid.squaresPerMeter,
                //this.x + (this.radius + radiusOffset) * Math.cos((i+degreeOffset) * Math.PI / 180),
                //this.y + (this.radius + radiusOffset) * Math.sin((i+degreeOffset) * Math.PI / 180),
                (i * 360) / points
            );
        }
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
        return Math.sqrt(
            Math.pow(
                this.destination.x - this.origin.x, 2
            ) + Math.pow(
                this.destination.y - this.origin.y, 2
            )
        );
    }
};

export class CollisionManager {
    //Returns objects that are in proximity to the target object
    static findProximity(target: Point2D, objects: Array<Point2D>, radius: number){
        return objects.filter(object => target.distance(object) <= radius);
    }
    static pointPoint(pointOne: Point2D, pointTwo: Point2D){
        return pointOne.distance(pointTwo) === 0;
    }
    static pointCircle(point: Point2D, circle: Circle2D){
        return point.distance(new Point2D(circle.x, circle.y)) <= circle.radius;
    }
    static circleCircle(circleOne: Circle2D, circleTwo: Circle2D){
        return new Point2D(circleOne.x, circleOne.y)
            .distance(new Point2D(circleTwo.x, circleTwo.y)) <= circleOne.radius + circleTwo.radius;
    }
};