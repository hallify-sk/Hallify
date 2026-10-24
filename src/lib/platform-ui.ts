// Small presentation helpers shared by the platform-admin pages (/app/platform).

export type Tone = 'success' | 'warning' | 'danger' | 'accent' | undefined;

export const PLAN_ORDER = ['free', 'starter', 'professional', 'enterprise'] as const;

/** Paid plans read as accent, Free as neutral — the badge names the plan, the tint only separates paid from not. */
export const planTone = (plan: string | null | undefined): Tone => (plan && plan !== 'free' ? 'accent' : undefined);

/** Sort key for a plan id: Free, Starter, Professional, Enterprise, then anything unknown. */
export const planRank = (plan: string | null | undefined): number => {
	const i = (PLAN_ORDER as readonly string[]).indexOf(plan ?? 'free');
	return i === -1 ? PLAN_ORDER.length : i;
};
