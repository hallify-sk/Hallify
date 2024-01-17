import Konva from "konva";

export function clamp(val: number, min: number, max: number): number {
    return Math.min(Math.max(val, min), max);
}
export function pointsToRealPosition(points: Array<number>, position: {x: number, y: number}){
    return points.map((v, i) => {
        return Math.round(i % 2 == 0 ? v + position.x : v + position.y);
    });
};
export function pointsToObjectArray(points: Array<number>){
    return points.map((_, i, a) => {
        return {x: a[i], y: a[i+1]} 
    }).filter((v, i, a) => {
        if(!(i % 2) && typeof a[i+1] !== "undefined") return true;
    });
};

export function addChairHitbox(points: Array<{x: number, y: number}>, squareSize: number, chairSize: number){
  //We take the points and add a buffer of 1 grid.squareSize to each side of the X axis
  //Indices 0, 3 are to the left, 1, 2 are to the right
  return points.map((v, i) => {
    if(i == 1 || i == 2){
      return {x: v.x + chairSize * squareSize, y: v.y}
    }else{
      return {x: v.x - chairSize * squareSize, y: v.y}
    }
  })
}

export function rotatePoints(points: Array<{x: number, y: number}>, originObject: {x: number, y: number}, angle: number){
    const a = angle * (Math.PI/180); // Convert to radians
    return points.map(point => {
        const rotatedX = Math.cos(a) * (point.x - originObject.x) - Math.sin(a) * (point.y - originObject.y) + originObject.x;
        const rotatedY = Math.sin(a) * (point.x - originObject.x) + Math.cos(a) * (point.y - originObject.y) + originObject.y;  
        return {x: Math.round(rotatedX), y: Math.round(rotatedY)};
    });
}

export function objectArrayToPoints(...points: { x: number; y: number; }[]){
  return [...points.map((v) => {
    return [v.x, v.y];
  })].flat();
}

export function checkPolygonCollision(polygon1: Array<{x: number, y: number}>, polygon2: Array<{x: number, y: number}>) {
  const polygons = [polygon1, polygon2];
  let minA, maxA, projected, i, i1, j, minB, maxB;

  for (i = 0; i < polygons.length; i++) {

    const polygon = polygons[i];
    for (i1 = 0; i1 < polygon.length; i1++) {

      const i2 = (i1 + 1) % polygon.length;
      const p1 = polygon[i1];
      const p2 = polygon[i2];

      const normal = { x: p2.y - p1.y, y: p1.x - p2.x };
      minA = maxA = undefined;
      for (j = 0; j < polygon1.length; j++) {
        projected = normal.x * polygon1[j].x + normal.y * polygon1[j].y;
        if (minA === undefined || projected < minA) {
          minA = projected;
        }
        if (maxA === undefined || projected > maxA) {
          maxA = projected;
        }
      }

      minB = maxB = undefined;
      for (j = 0; j < polygon2.length; j++) {
        projected = normal.x * polygon2[j].x + normal.y * polygon2[j].y;
        if (minB === undefined || projected < minB) {
          minB = projected;
        }
        if (maxB === undefined || projected > maxB) {
          maxB = projected;
        }
      }

      if (maxA < minB || maxB < minA) {
        return false;
      }
    }
  }
  return true;
};
  export function getMovablePolygons(layer: Konva.Layer) {
    return layer.getChildren((node) => node instanceof Konva.Group && node.draggable()) as Konva.Group[];
  }
  export function getCollisionPolygons(layer: Konva.Layer) {
    return layer.getChildren((node) => node instanceof Konva.Group && !node.draggable() && !(node instanceof Konva.Transformer) && node.name() !== "preview") as Konva.Group[];
  }
  export function getClosestViablePosition(x: number, y: number, shape: Konva.Line, objects: Konva.Line[], grid: {
    width: number;
    height: number;
    squareSize: number;
    snapSize: number;
    color: string;
}) {
    // Create an empty map for the grid cells
    const gridCells: Map<string, Konva.Line[]> = new Map();

    // Add each object to the grid cells
    for (const object of objects) {
      console.log(object);
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
                const collision = cellObjects.some((object: Konva.Line) => object !== shape && checkPolygonCollision(rotatePoints(pointsToObjectArray(pointsToRealPosition(shape.points(), shape.position())), {x: shape.x(), y: shape.y()}, shape.rotation()), rotatePoints(pointsToObjectArray(pointsToRealPosition(object.points(), object.position())), {x: object.x(), y: object.y()}, object.rotation())));

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