/**
 * Tell a notched mouse wheel from a trackpad, from the wheel events alone.
 *
 * The browser does not say which device produced a `wheel` event, so this reads the
 * shape of the event instead. It matters because the two want opposite things from
 * the same gesture:
 *
 *   * A trackpad has a two-finger scroll (pan) AND a pinch (zoom), so scrolling the
 *     map should move it, exactly as dragging a map does.
 *   * A mouse has only the wheel. If the wheel pans, there is no way to zoom at all
 *     — which is the bug this exists to fix.
 *
 * The signals, strongest first:
 *
 *   ctrlKey        A pinch arrives as ctrl+wheel. Only a precision surface does this.
 *   deltaMode      Firefox reports whole LINES for a notched wheel, pixels for a pad.
 *   deltaX         A purely vertical device cannot produce horizontal scroll.
 *   fractional Y   Continuous surfaces emit sub-pixel deltas; a notch does not.
 *   small |Y|      A notch is a big discrete jump; a slow finger drag is a few px.
 *   large, round Y Notches land on 100 / 120 / 240 and similar round multiples.
 *
 * Trackpad evidence is POSITIVE evidence, so the verdict latches once seen: a pad can
 * happen to emit one clean integer delta, but a wheel cannot emit a fractional one or
 * a horizontal component. Without latching, one unlucky event would flip a trackpad
 * user into zoom mode mid-gesture.
 *
 * The verdict resets after a long idle gap, so plugging a mouse into a laptop and
 * using it is picked up without a reload.
 */
export type PointerKind = 'mouse' | 'trackpad';

/** A wheel event is almost certainly a notched wheel above this magnitude. */
const NOTCH_MIN = 100;

/** Below this, a delta is finer than any notch produces. */
const FINE_MAX = 40;

/** Forget the latched verdict after this long with no wheel input. */
const IDLE_RESET_MS = 2000;

export interface WheelSample {
	deltaX: number;
	deltaY: number;
	deltaMode: number;
	ctrlKey: boolean;
}

export interface PointerKindDetector {
	/** Classify one wheel event, updating the latched verdict. */
	classify(event: WheelSample, now: number): PointerKind;
	/** The latched verdict without observing anything new. */
	readonly kind: PointerKind;
}

export function createPointerKindDetector(initial: PointerKind = 'mouse'): PointerKindDetector {
	let latched: PointerKind = initial;
	let settled = false;
	let lastSeen = -Infinity;

	return {
		get kind() {
			return latched;
		},
		classify(event: WheelSample, now: number): PointerKind {
			if (now - lastSeen > IDLE_RESET_MS) settled = false;
			lastSeen = now;

			// A pinch. Unambiguous, and it does not change what a later scroll means,
			// so it settles the verdict too.
			if (event.ctrlKey) {
				latched = 'trackpad';
				settled = true;
				return latched;
			}

			// Lines or pages rather than pixels: a notched wheel.
			if (event.deltaMode !== 0) {
				latched = 'mouse';
				settled = true;
				return latched;
			}

			const ay = Math.abs(event.deltaY);

			// Horizontal travel, or a sub-pixel step: only a continuous surface does this.
			if (event.deltaX !== 0 || (ay > 0 && !Number.isInteger(event.deltaY))) {
				latched = 'trackpad';
				settled = true;
				return latched;
			}

			// A finger moving slowly. A notch never produces a step this small.
			if (ay > 0 && ay < FINE_MAX) {
				latched = 'trackpad';
				settled = true;
				return latched;
			}

			// A big, round step with no horizontal component: a notch. This is weaker
			// evidence than the above — a fast flick can look like it — so it does not
			// override a verdict already settled on trackpad within this gesture.
			if (!settled && ay >= NOTCH_MIN) {
				latched = 'mouse';
			}

			return latched;
		}
	};
}
