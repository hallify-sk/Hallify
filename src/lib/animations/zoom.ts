import { sineInOut } from 'svelte/easing'
import { } from 'svelte/transition';

export function zoom(node: HTMLElement,
	{ delay = 0, duration = 1000, easing = sineInOut, opacity = 0, scale = 0.5 } = {}) {
	  return {
		delay,
		duration,
		easing,
		css: (t: number) => `
			transform: scale(${100 * scale + (t*100) * (1-scale)}%); opacity: ${t+opacity};
			`
	  }
}