import { describe, expect, it } from 'vitest';
import { createPointerKindDetector, type WheelSample } from './pointer-kind';

/** Defaults match a real WheelEvent: pixel mode, no modifier, no horizontal travel. */
const ev = (p: Partial<WheelSample>): WheelSample => ({
	deltaX: 0,
	deltaY: 0,
	deltaMode: 0,
	ctrlKey: false,
	...p
});

describe('pointer kind detection', () => {
	it('reads a notched wheel from a large round vertical step', () => {
		const d = createPointerKindDetector();
		// Chrome/Windows mouse wheel: ±100. Firefox often ±120 or ±3 lines.
		expect(d.classify(ev({ deltaY: 100 }), 0)).toBe('mouse');
		expect(d.classify(ev({ deltaY: -120 }), 50)).toBe('mouse');
	});

	it('reads lines or pages as a wheel even when the step is small', () => {
		const d = createPointerKindDetector('trackpad');
		expect(d.classify(ev({ deltaY: 3, deltaMode: 1 }), 0)).toBe('mouse');
	});

	it('reads a pinch as a trackpad', () => {
		const d = createPointerKindDetector();
		expect(d.classify(ev({ deltaY: 8, ctrlKey: true }), 0)).toBe('trackpad');
	});

	it('reads horizontal travel as a trackpad', () => {
		const d = createPointerKindDetector();
		expect(d.classify(ev({ deltaX: 4, deltaY: 120 }), 0)).toBe('trackpad');
	});

	it('reads a sub-pixel step as a trackpad', () => {
		const d = createPointerKindDetector();
		expect(d.classify(ev({ deltaY: 1.5 }), 0)).toBe('trackpad');
	});

	it('reads a slow finger drag as a trackpad', () => {
		const d = createPointerKindDetector();
		expect(d.classify(ev({ deltaY: 6 }), 0)).toBe('trackpad');
	});

	it('does not flip to mouse mid-gesture when a pad emits one round delta', () => {
		const d = createPointerKindDetector();
		// Momentum scrolling ramps up and can cross the notch threshold cleanly.
		expect(d.classify(ev({ deltaY: 2.25 }), 0)).toBe('trackpad');
		expect(d.classify(ev({ deltaY: 100 }), 16)).toBe('trackpad');
		expect(d.classify(ev({ deltaY: 240 }), 32)).toBe('trackpad');
	});

	it('picks up a mouse plugged in after a pause', () => {
		const d = createPointerKindDetector();
		expect(d.classify(ev({ deltaY: 3.5 }), 0)).toBe('trackpad');
		// Same session, long gap, then unmistakable wheel input.
		expect(d.classify(ev({ deltaY: 120 }), 5000)).toBe('mouse');
	});

	it('keeps the verdict while the wheel keeps turning', () => {
		const d = createPointerKindDetector();
		d.classify(ev({ deltaY: 100 }), 0);
		expect(d.kind).toBe('mouse');
		d.classify(ev({ deltaY: 100 }), 100);
		expect(d.kind).toBe('mouse');
	});

	it('ignores a zero-delta event rather than guessing from it', () => {
		const d = createPointerKindDetector('trackpad');
		expect(d.classify(ev({ deltaY: 0 }), 0)).toBe('trackpad');
	});
});
