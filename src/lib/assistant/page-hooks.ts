/**
 * What the open page lets the floating assistant know, and do.
 *
 * A page with its own working state (the seating editor keeps an unsaved copy of
 * the layout) registers here on mount:
 *   - `blocker()` returns a reason to hold off applying a change right now, e.g.
 *     unsaved edits that the change would collide with — or null to go ahead;
 *   - `afterApply()` runs once an applied change is saved and the page's data has
 *     been reloaded, so the page can rebuild its working copy from the fresh data.
 *
 * Only one page is open at a time; registering returns the function that unregisters.
 */
export interface AssistantPageHooks {
	blocker?: () => string | null;
	afterApply?: () => void;
}

let current: AssistantPageHooks | null = null;

export function registerAssistantPage(hooks: AssistantPageHooks): () => void {
	current = hooks;
	return () => {
		if (current === hooks) current = null;
	};
}

export function assistantPageHooks(): AssistantPageHooks | null {
	return current;
}

/**
 * A page resolved one of the assistant's proposals itself — an AI draft saved or
 * discarded in an editor — so the open panel reloads its cards; otherwise it went
 * on offering Apply and Discard on a draft already saved until the page reloaded.
 */
export const PROPOSALS_CHANGED_EVENT = 'hallify:assistant:proposals';

export function proposalsChanged(): void {
	if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(PROPOSALS_CHANGED_EVENT));
}
