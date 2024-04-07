import { sineInOut } from 'svelte/easing';

// Used in the calendar component to transition between month view and year view

// Define the zoom function
export function zoom(
  node: HTMLElement,
  {
    delay = 0,
    duration = 1000,
    easing = sineInOut,
    opacity = 0,
    scale = 0.5
  } = {}
) {
  // Return an object with the transition properties
  return {
    delay,
    duration,
    easing,
    css: (t: number) => `
      transform: scale(${100 * scale + (t * 100) * (1 - scale)}%);
      opacity: ${t + opacity};
    `
  };
}