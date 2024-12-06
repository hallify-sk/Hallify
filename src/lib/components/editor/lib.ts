export function constraintNumber(num: number, min: number, max: number) {
	const MIN = min ?? 1;
	const MAX = max ?? 20;
	return Math.min(Math.max(num, MIN), MAX);
}

export function snapToGrid(value: number, gridSize: number) {
	return Math.round(value / gridSize) * gridSize;
}