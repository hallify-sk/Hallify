export function clamp(val: number, min: number, max: number): number {
    return Math.min(Math.max(val, min), max);
}
export function pointsToRealPosition(points: Array<number>, position: {x: number, y: number}){
    console.log(position);
    return points.map((v, i) => {
        return i % 2 == 0 ? v + position.x : v + position.y;
    });
};
export function pointsToObjectArray(points: Array<number>){
    return points.map((_, i, a) => {
        return {x: a[i], y: a[i+1]} 
    }).filter((v, i, a) => {
        if(!(i % 2) && typeof a[i+1] !== "undefined") return true;
    });
};

export function rotatePoints(points: Array<{x: number, y: number}>, originObject: {x: number, y: number}, angle: number){
    const a = angle * (Math.PI/180); // Convert to radians
    return points.map(point => {
        const rotatedX = Math.cos(a) * (point.x - originObject.x) - Math.sin(a) * (point.y - originObject.y) + originObject.x;
        const rotatedY = Math.sin(a) * (point.x - originObject.x) + Math.cos(a) * (point.y - originObject.y) + originObject.y;  
        return {x: Math.round(rotatedX), y: Math.round(rotatedY)};
    });
}