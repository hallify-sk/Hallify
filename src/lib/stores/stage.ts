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
			max: number;
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
	squareSize: number;
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
		name: string;
		points: number[];
		fill?: string;
		stroke?: string;
		opacity?: number;
		strokeWidth?: number;
		dash?: Array<number>;
	}>;
}> = writable({
  "width": 750,
  "height": 1110,
  "squareSize": 30,
  "zones": [
    {
      "name": "zone 663ce6eb-dc61-4984-8d1f-66d238b731e8",
      "points": [
        630,
        840,
        750,
        840,
        750,
        90,
        630,
        90
      ],
      "fill": "#3fbe01",
      "stroke": "black",
      "strokeWidth": 0,
      "opacity": 0.2
    },
    {
      "name": "zone 29299379-47aa-490c-9d5c-40956f2a56c4",
      "points": [
        0,
        90,
        120,
        90,
        120,
        990,
        0,
        990
      ],
      "fill": "#3fbe01",
      "stroke": "black",
      "strokeWidth": 0,
      "opacity": 0.2
    },
    {
      "name": "zone aef1b37f-6bf1-41ca-9a03-c622d23de9cc",
      "points": [
        630,
        840,
        750,
        840,
        750,
        990,
        630,
        990
      ],
      "fill": "#b1700e",
      "stroke": "black",
      "strokeWidth": 0,
      "opacity": 0.2
    },
    {
      "name": "zone c6c50264-e7bc-4ad2-a9eb-a0c65577989e",
      "points": [
        330,
        30,
        330,
        0,
        420,
        0,
        420,
        30
      ],
      "fill": "#be017c",
      "stroke": "black",
      "strokeWidth": 0,
      "opacity": 0.8
    },
    {
      "name": "zone 47599fd2-931e-4630-9b90-cc1c3c171650",
      "points": [
        120,
        990,
        150,
        990,
        150,
        960,
        240,
        960,
        240,
        930,
        510,
        930,
        510,
        960,
        600,
        960,
        600,
        990,
        630,
        990,
        630,
        1110,
        120,
        1110
      ],
      "fill": "#b50b0b",
      "stroke": "black",
      "strokeWidth": 0,
      "opacity": 0.8
    }
  ],
  "collisionObjects": [
    {
      "name": "wall no-select e09d5103-b8d8-438f-b169-813097b15fb3",
      "points": [
        0,
        0,
        150,
        0,
        150,
        30,
        120,
        30,
        120,
        120,
        60,
        120,
        60,
        90,
        0,
        90
      ],
      "fill": "TBD",
      "stroke": "none",
      "strokeWidth": 0,
      "opacity": 0.2
    },
    {
      "name": "wall no-select beb329c9-2e26-4f08-8b23-824ff7d19af8",
      "points": [
        600,
        0,
        600,
        30,
        630,
        30,
        630,
        120,
        690,
        120,
        690,
        90,
        750,
        90,
        750,
        0
      ],
      "fill": "TBD",
      "stroke": "none",
      "strokeWidth": 0,
      "opacity": 0.2
    },
    {
      "name": "wall no-select 7ea163e7-2bc2-4fdc-bad6-1ffd005c330a",
      "points": [
        60,
        240,
        120,
        240,
        120,
        300,
        60,
        300
      ],
      "fill": "TBD",
      "stroke": "none",
      "strokeWidth": 0,
      "opacity": 0.2
    },
    {
      "name": "wall no-select 9cdb0374-8678-40a5-bb66-6eb192a3a660",
      "points": [
        60,
        420,
        120,
        420,
        120,
        480,
        60,
        480
      ],
      "fill": "TBD",
      "stroke": "none",
      "strokeWidth": 0,
      "opacity": 0.2
    },
    {
      "name": "wall no-select 366b1880-c453-4ef0-a18f-d57eede0dee1",
      "points": [
        60,
        600,
        120,
        600,
        120,
        660,
        60,
        660
      ],
      "fill": "TBD",
      "stroke": "none",
      "strokeWidth": 0,
      "opacity": 0.2
    },
    {
      "name": "wall no-select d0b977d1-9f3a-4df7-a757-411239b2d134",
      "points": [
        60,
        780,
        120,
        780,
        120,
        840,
        60,
        840
      ],
      "fill": "TBD",
      "stroke": "none",
      "strokeWidth": 0,
      "opacity": 0.2
    },
    {
      "name": "wall no-select 935ea68e-1836-4447-a499-6c3b06ae2278",
      "points": [
        150,
        1110,
        150,
        1080,
        120,
        1080,
        120,
        960,
        60,
        960,
        60,
        990,
        0,
        990,
        0,
        1110
      ],
      "fill": "TBD",
      "stroke": "none",
      "strokeWidth": 0,
      "opacity": 0.2
    },
    {
      "name": "wall no-select cc44a2f0-806d-466d-8af1-c05b7d0e71c7",
      "points": [
        750,
        1110,
        600,
        1110,
        600,
        1080,
        630,
        1080,
        630,
        960,
        690,
        960,
        690,
        990,
        750,
        990
      ],
      "fill": "TBD",
      "stroke": "none",
      "strokeWidth": 0,
      "opacity": 0.2
    },
    {
      "name": "wall no-select a8e09d64-a486-4bda-bcf1-6991a7b7d19c",
      "points": [
        630,
        840,
        690,
        840,
        690,
        780,
        630,
        780
      ],
      "fill": "TBD",
      "stroke": "none",
      "strokeWidth": 0,
      "opacity": 0.2
    },
    {
      "name": "wall no-select 8cc1874d-c1bd-4a0c-9bc5-39ac1720b623",
      "points": [
        630,
        660,
        690,
        660,
        690,
        600,
        630,
        600
      ],
      "fill": "TBD",
      "stroke": "none",
      "strokeWidth": 0,
      "opacity": 0.2
    },
    {
      "name": "wall no-select 7320235d-4370-4b40-8b16-2035f68ab63d",
      "points": [
        630,
        480,
        690,
        480,
        690,
        420,
        630,
        420
      ],
      "fill": "TBD",
      "stroke": "none",
      "strokeWidth": 0,
      "opacity": 0.2
    },
    {
      "name": "wall no-select 4fb25606-2f8a-4edb-a533-814961224c0b",
      "points": [
        630,
        300,
        690,
        300,
        690,
        240,
        630,
        240
      ],
      "fill": "TBD",
      "stroke": "none",
      "strokeWidth": 0,
      "opacity": 0.2
    }
  ],
  "scale": 0.75,
  "x": 57.5,
  "y": -10
});

export const brush: Writable<{
	type: string;
	color?: string;
	opacity?: number;
	stroke?: string;
	strokeWidth?: number;
    snapCoefficient: number;
}> = writable();
