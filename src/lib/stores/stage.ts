import { writable, type Writable } from "svelte/store";

export const selectedName: Writable<string | null> = writable(null);

export const tableList: Writable<{
    name: string;
    rotation: number;
    x?: number;
    y?: number;
    chairs: {
        count: number,
        left?: boolean,
        right?: boolean
    },
    table: {
        width: number,
        height: number
    }
}[]> = writable();

export const stageData: Writable<{
    scale: number;
    x: number;
    y: number;
    uniqueObjects: [
        {
            name: string;
            points: number[];
            fill: string;
            stroke?: string;
            opacity?: number;
            strokeWidth?: number;
            dash?: Array<number>;
        }
    ],
    collisionObjects: [
        {
            x: number;
            y: number;
            name: string;
            points: number[];
            fill?: string;
            stroke?: string
            opacity?: number
            strokeWidth?: number;
            dash?: Array<number>
        }
    ]
}> = writable();