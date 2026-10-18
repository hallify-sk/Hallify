/**
 * The first few minutes of a new organisation.
 *
 * Registering used to drop an operator on an empty dashboard with no venue, no
 * public site and no idea what to do next — the point at which most of them
 * would simply leave. This walks them to the one thing that makes the product
 * work for them (a venue that exists), tells them what their plan does and does
 * not include, and offers to do the rest for them.
 *
 * The flow is RESUMABLE and SKIPPABLE by design. Someone who closes the tab
 * halfway through has not failed anything, and someone who knows what they are
 * doing should not be made to click through five screens to reach the console.
 */

export const ONBOARDING_STEPS = ['venue', 'details', 'plan', 'help', 'done'] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export interface OnboardingState {
	/** Furthest step reached, so a resumed flow does not start over. */
	step: OnboardingStep;
	/** Finished or skipped — either way, stop showing it. */
	completed: boolean;
	/** The venue created during the flow, if one was. */
	hallId: string | null;
}

export const DEFAULT_ONBOARDING: OnboardingState = {
	step: 'venue',
	completed: false,
	hallId: null
};

const STEP_SET = new Set<string>(ONBOARDING_STEPS);

/** Tolerates a malformed or partial stored row rather than throwing on it. */
export function resolveOnboarding(stored: unknown): OnboardingState {
	const raw = (stored ?? {}) as Partial<OnboardingState>;
	return {
		step: STEP_SET.has(raw.step as string) ? (raw.step as OnboardingStep) : 'venue',
		completed: raw.completed === true,
		hallId: typeof raw.hallId === 'string' ? raw.hallId : null
	};
}

export function stepIndex(step: OnboardingStep): number {
	const i = ONBOARDING_STEPS.indexOf(step);
	return i === -1 ? 0 : i;
}

/** Never moves backwards: re-entering an earlier screen must not lose progress. */
export function furthest(a: OnboardingStep, b: OnboardingStep): OnboardingStep {
	return stepIndex(a) >= stepIndex(b) ? a : b;
}

export function nextStep(step: OnboardingStep): OnboardingStep {
	return ONBOARDING_STEPS[Math.min(stepIndex(step) + 1, ONBOARDING_STEPS.length - 1)];
}

/**
 * How long a new organisation keeps being offered the flow it abandoned.
 *
 * After this it stops asking. An operator who has been running for a month and
 * never finished the wizard has made their choice, and a prompt that never goes
 * away stops being help and becomes furniture.
 */
export const ONBOARDING_PROMPT_DAYS = 30;
