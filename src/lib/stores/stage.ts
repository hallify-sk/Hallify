import { writable, type Writable } from 'svelte/store';

export const selectedName: Writable<string | null> = writable(null);

export const rerender: Writable<boolean> = writable(false);

export const modifyZones: Writable<boolean> = writable(false);

export const tableList: Writable<
	{
		name: string;
		rotation: number;
		x?: number;
		y?: number;
		chairs: {
			left: number;
			right: number;
		};
		table: {
			width: number;
			height: number;
		};
	}[]
> = writable();

export const stageData: Writable<{
	scale: number;
	x: number;
	y: number;
	width: number;
	height: number;
	zones: Array<{
		name: string;
		points: number[];
		fill: string;
		stroke?: string;
		opacity?: number;
		strokeWidth?: number;
		dash?: Array<number>;
	}>;
	collisionObjects: Array<{
		x: number;
		y: number;
		name: string;
		points: number[];
		fill?: string;
		stroke?: string;
		opacity?: number;
		strokeWidth?: number;
		dash?: Array<number>;
	}>;
}> = writable();

export const brush: Writable<{
	type: string;
	color?: string;
	opacity?: number;
	stroke?: string;
	strokeWidth?: number;
    snapCoefficient: number;
}> = writable();
