import { sineInOut } from "svelte/easing";

/**
 * Defines a zoom transition effect for an HTML element.
 * @param node - The HTML element to apply the transition to.
 * @param options - The options for the transition effect.
 * @param options.delay - The delay before the transition starts (in milliseconds). Default is 0.
 * @param options.duration - The duration of the transition (in milliseconds). Default is 1000.
 * @param options.easing - The easing function for the transition. Default is sineInOut.
 * @param options.opacity - The opacity value to apply during the transition. Default is 0.
 * @param options.scale - The scale value to apply during the transition. Default is 0.5.
 * @returns An object with transition properties.
 */
export function zoom(
	node: HTMLElement,
	{
		delay = 0,
		duration = 1000,
		easing = sineInOut,
		opacity = 0,
		scale = 0.5
	}: {
		delay?: number;
		duration?: number;
		easing?: (t: number) => number;
		opacity?: number;
		scale?: number;
	} = {}
) {
	// Return an object with the transition properties
	return {
		delay,
		duration,
		easing,
		css: (t: number) => `
      transform: scale(${100 * scale + t * 100 * (1 - scale)}%);
      opacity: ${t + opacity};
    `
	};
}
