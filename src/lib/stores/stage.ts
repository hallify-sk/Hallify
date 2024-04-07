import type Konva from 'konva';
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
      radius: number;
      isRound: boolean;
		};
	}[]
> = writable([]);

export const currentTween: Writable<Konva.Tween> = writable();

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
  width: 1080,
  height: 1380,
  squareSize: 30,
  scale: 0.75,
  x: 0,
  y: 0,
  "collisionObjects": [
    {
      "fill": "TBD",
      "name": "wall no-select 61be2f35-ff99-4bf6-86a4-ae6358f4fa37",
      "opacity": 0.5,
      "points": [
        0,
        0,
        300,
        0,
        240,
        30,
        210,
        60,
        180,
        120,
        0,
        120
      ],
      "stroke": "none",
      "strokeWidth": 0
    },
    {
      "fill": "TBD",
      "name": "wall no-select c1dfde74-964f-4359-8408-61170f5c1bec",
      "opacity": 0.5,
      "points": [
        120,
        240,
        180,
        240,
        180,
        300,
        120,
        300
      ],
      "stroke": "none",
      "strokeWidth": 0
    },
    {
      "fill": "TBD",
      "name": "wall no-select daf4cf71-d16b-43a1-8d11-95ef671b40bf",
      "opacity": 0.5,
      "points": [
        120,
        420,
        180,
        420,
        180,
        480,
        120,
        480
      ],
      "stroke": "none",
      "strokeWidth": 0
    },
    {
      "fill": "TBD",
      "name": "wall no-select ba672077-b7ba-41fa-bf71-da537e247b41",
      "opacity": 0.5,
      "points": [
        120,
        600,
        180,
        600,
        180,
        660,
        120,
        660
      ],
      "stroke": "none",
      "strokeWidth": 0
    },
    {
      "fill": "TBD",
      "name": "wall no-select e4bf4523-e53b-4cb0-8abd-4c5023897dfe",
      "opacity": 0.5,
      "points": [
        120,
        780,
        180,
        780,
        180,
        840,
        120,
        840
      ],
      "stroke": "none",
      "strokeWidth": 0
    },
    {
      "fill": "TBD",
      "name": "wall no-select ccc548eb-d7ba-4147-bb35-052783824c7b",
      "opacity": 0.5,
      "points": [
        0,
        960,
        180,
        960,
        180,
        1020,
        120,
        1020,
        120,
        1380,
        0,
        1380
      ],
      "stroke": "none",
      "strokeWidth": 0
    },
    {
      "fill": "TBD",
      "name": "wall no-select f670a9c6-b39b-4ed5-8c43-1743545fabc7",
      "opacity": 0.5,
      "points": [
        1080,
        120,
        900,
        120,
        870,
        60,
        840,
        30,
        780,
        0,
        1080,
        0
      ],
      "stroke": "none",
      "strokeWidth": 0
    },
    {
      "fill": "TBD",
      "name": "wall no-select e3ada6a8-2a30-4be1-a34d-d93acf4ef49d",
      "opacity": 0.5,
      "points": [
        900,
        240,
        960,
        240,
        960,
        300,
        900,
        300
      ],
      "stroke": "none",
      "strokeWidth": 0
    },
    {
      "fill": "TBD",
      "name": "wall no-select 4849f9f0-b033-4a4d-b868-61e2d4a6311d",
      "opacity": 0.5,
      "points": [
        900,
        420,
        960,
        420,
        960,
        480,
        900,
        480
      ],
      "stroke": "none",
      "strokeWidth": 0
    },
    {
      "fill": "TBD",
      "name": "wall no-select e65d0f6a-1eac-4cb5-a326-6a0b8a812d3a",
      "opacity": 0.5,
      "points": [
        900,
        600,
        960,
        600,
        960,
        660,
        900,
        660
      ],
      "stroke": "none",
      "strokeWidth": 0
    },
    {
      "fill": "TBD",
      "name": "wall no-select c59e74dc-f0ee-49fe-b1cf-d9deb6642426",
      "opacity": 0.5,
      "points": [
        900,
        780,
        960,
        780,
        960,
        840,
        900,
        840
      ],
      "stroke": "none",
      "strokeWidth": 0
    },
    {
      "fill": "TBD",
      "name": "wall no-select d21f2cdb-b0d6-4718-912d-9a98fbc0ccf3",
      "opacity": 0.5,
      "points": [
        900,
        960,
        1080,
        960,
        1080,
        1380,
        960,
        1380,
        960,
        1020,
        900,
        1020
      ],
      "stroke": "none",
      "strokeWidth": 0
    },
    {
      "fill": "TBD",
      "name": "wall no-select e551dfc1-e614-477f-9f72-a72061c8838b",
      "opacity": 0.5,
      "points": [
        120,
        1020,
        240,
        1020,
        300,
        960,
        360,
        930,
        480,
        900,
        600,
        900,
        720,
        930,
        780,
        960,
        840,
        1020,
        960,
        1020,
        840,
        1020,
        780,
        960,
        720,
        930,
        600,
        900,
        480,
        900,
        360,
        930,
        300,
        960,
        240,
        1020
      ],
      "stroke": "none",
      "strokeWidth": 0
    }
  ],
  "zones": [
    {
      "fill": "#ff0000",
      "name": "zone 8269a4c3-9251-4afe-95d0-3340c03f9bf2",
      "opacity": 0.5,
      "points": [
        120,
        1020,
        240,
        1020,
        300,
        960,
        360,
        930,
        480,
        900,
        600,
        900,
        720,
        930,
        780,
        960,
        840,
        1020,
        960,
        1020,
        960,
        1380,
        120,
        1380
      ],
      "stroke": "black",
      "strokeWidth": 0
    },
    {
      "fill": "#ff8040",
      "name": "zone 412c0ad7-f3c6-4fe4-8a84-51b3ecf8c302",
      "opacity": 0.5,
      "points": [
        900,
        960,
        900,
        840,
        1080,
        840,
        1080,
        960
      ],
      "stroke": "black",
      "strokeWidth": 0
    },
    {
      "fill": "#ff80ff",
      "name": "zone a2ca66dd-3ed4-41bd-b2e1-02c42a367aec",
      "opacity": 0.5,
      "points": [
        0,
        120,
        180,
        120,
        180,
        960,
        0,
        960
      ],
      "stroke": "black",
      "strokeWidth": 0
    },
    {
      "fill": "#ff80ff",
      "name": "zone e8ce7d11-03b5-4e38-adf1-e64af2d4ef5a",
      "opacity": 0.5,
      "points": [
        900,
        120,
        1080,
        120,
        1080,
        840,
        900,
        840
      ],
      "stroke": "black",
      "strokeWidth": 0
    },
    {
      "fill": "#00ff00",
      "name": "zone 7441dea4-d087-4c61-839b-1313250d2ec9",
      "opacity": 0.5,
      "points": [
        600,
        0,
        600,
        30,
        480,
        30,
        480,
        0
      ],
      "stroke": "black",
      "strokeWidth": 0
    }
  ]
}
  /*{
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
}*/);

export const brush: Writable<{
	type: string;
	color?: string;
	opacity?: number;
	stroke?: string;
	strokeWidth?: number;
    snapCoefficient: number;
}> = writable();
