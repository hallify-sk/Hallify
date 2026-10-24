/**
 * Where the AI assistant shows, decided in one place.
 *
 * Two switches govern it. The platform's (the `ai` platform setting, `enabled`) is
 * Hallify's own: off, the assistant does not exist for anyone — no widget, no link,
 * no page, no settings tab, no credits on billing or in a plan's feature list, no help
 * article, no `ai.use` permission to hand out. Only the platform settings toggle itself
 * stays, so it can be switched back on; the ledger and audit rows stay in the database.
 *
 * The organisation's (ai_accounts.enabled) is the venue's: off, its members see no
 * widget, link or assistant page. Whoever manages the organisation's settings still
 * sees Settings → AI, which is where it is switched on.
 *
 * Pure, so the rules are tested without a database (see ai-visibility.test.ts).
 */
export interface AiVisibilityInput {
	/** The platform switch. */
	platformEnabled: boolean;
	/** The organisation's switch (false when there is no organisation or no account row). */
	orgEnabled: boolean;
	/** OpenAI is configured on this deployment. */
	configured: boolean;
	/** A signed-in operator in an organisation, on the console (not a client, not a venue's public site). */
	member: boolean;
	/** A platform admin viewing the organisation without being a member ("view as"). */
	impersonated: boolean;
	/** Holds `ai.use`. */
	canUse: boolean;
	/** Holds `settings.manage`. */
	canManageSettings: boolean;
}

export interface AiVisibility {
	/** The assistant exists on the platform at all: plan feature lines, help, the permission. */
	available: boolean;
	/** The assistant page and the sidebar link to it, and the endpoints behind them. */
	page: boolean;
	/** The floating widget (and the buttons that open it). */
	widget: boolean;
	/** Settings → AI: the tab and its page. */
	settings: boolean;
	/** The organisation's credit balance on the billing page. */
	credits: boolean;
}

export const AI_HIDDEN: AiVisibility = { available: false, page: false, widget: false, settings: false, credits: false };

export function aiVisibility(i: AiVisibilityInput): AiVisibility {
	if (!i.platformEnabled) return AI_HIDDEN;
	const inOrg = i.member;
	const page = inOrg && i.orgEnabled && i.canUse;
	return {
		available: true,
		page,
		// The widget spends credits as the member, which a "view as" admin must not do,
		// and it has nothing to talk to without OpenAI.
		widget: page && i.configured && !i.impersonated,
		settings: inOrg && i.canManageSettings,
		credits: inOrg && i.orgEnabled
	};
}

/** Permissions that only mean something while the platform offers the assistant. */
export const AI_PERMISSIONS: readonly string[] = ['ai.use'];

/** Whether a permission editor leaves this permission out (it still posts its stored
 *  value, hidden, so saving a role does not quietly revoke it). */
export function permissionHidden(permission: string, aiAvailable: boolean): boolean {
	return !aiAvailable && AI_PERMISSIONS.includes(permission);
}
