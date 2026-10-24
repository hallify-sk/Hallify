import { describe, expect, it } from 'vitest';
import { aiVisibility, AI_HIDDEN, permissionHidden, type AiVisibilityInput } from './ai-visibility';
import { planFeatureList } from './plan-features';
import { PLANS } from './plans';
import { sk } from './i18n';
import { articlesFor, getArticle } from './knowledgebase';

const base: AiVisibilityInput = {
	platformEnabled: true,
	orgEnabled: true,
	configured: true,
	member: true,
	impersonated: false,
	canUse: true,
	canManageSettings: true
};
const v = (o: Partial<AiVisibilityInput> = {}) => aiVisibility({ ...base, ...o });

describe('AI visibility: the platform switch', () => {
	it('everything shows when the platform, the organisation and the member all allow it', () => {
		expect(v()).toEqual({ available: true, page: true, widget: true, settings: true, credits: true });
	});

	it('off on the platform: nothing shows, to anyone, whatever else holds', () => {
		expect(v({ platformEnabled: false })).toEqual(AI_HIDDEN);
		expect(v({ platformEnabled: false, canManageSettings: true, orgEnabled: true })).toEqual(AI_HIDDEN);
	});

	it('the platform switch alone decides `available` (plan lines, help, permission)', () => {
		expect(v({ member: false, orgEnabled: false, canUse: false }).available).toBe(true);
		expect(v({ platformEnabled: false }).available).toBe(false);
	});
});

describe('AI visibility: the organisation switch', () => {
	it('off: no page, link or widget, and no credits on billing', () => {
		const r = v({ orgEnabled: false });
		expect(r.page).toBe(false);
		expect(r.widget).toBe(false);
		expect(r.credits).toBe(false);
	});

	it('off: whoever manages settings still gets Settings → AI, to switch it on', () => {
		expect(v({ orgEnabled: false }).settings).toBe(true);
		expect(v({ orgEnabled: false, canManageSettings: false }).settings).toBe(false);
	});
});

describe('AI visibility: the member', () => {
	it('without ai.use: no page or widget, the rest as before', () => {
		const r = v({ canUse: false });
		expect(r.page).toBe(false);
		expect(r.widget).toBe(false);
		expect(r.settings).toBe(true);
	});

	it('a client, a visitor or a venue site: nothing of the organisation', () => {
		const r = v({ member: false });
		expect(r).toEqual({ available: true, page: false, widget: false, settings: false, credits: false });
	});

	it('"view as" keeps the page but not the widget, which would spend as the member', () => {
		const r = v({ impersonated: true });
		expect(r.page).toBe(true);
		expect(r.widget).toBe(false);
	});

	it('without OpenAI configured: the page explains, the widget stays away', () => {
		const r = v({ configured: false });
		expect(r.page).toBe(true);
		expect(r.widget).toBe(false);
	});
});

describe('surfaces that follow the platform switch', () => {
	it('the permission editors leave out ai.use only while the platform has it off', () => {
		expect(permissionHidden('ai.use', false)).toBe(true);
		expect(permissionHidden('ai.use', true)).toBe(false);
		expect(permissionHidden('halls.manage', false)).toBe(false);
	});

	it("a plan's feature list drops the AI credits line while off", () => {
		const f = sk.accountPages.planFeatures;
		const credits = f.aiCredits(PLANS.starter.limits.aiCreditsMonthly);
		expect(planFeatureList(PLANS.starter, f)).toContain(credits);
		expect(planFeatureList(PLANS.starter, f, { ai: true })).toContain(credits);
		const off = planFeatureList(PLANS.starter, f, { ai: false });
		expect(off).not.toContain(credits);
		expect(off.some((line) => /AI|kredit/i.test(line))).toBe(false);
	});

	it('the help centre drops the assistant article while off', () => {
		expect(articlesFor('sk').some((a) => a.slug === 'ai-assistant')).toBe(true);
		expect(articlesFor('en', { ai: false }).some((a) => a.slug === 'ai-assistant')).toBe(false);
		expect(getArticle('ai-assistant', 'sk', { ai: false })).toBeUndefined();
		expect(getArticle('ai-assistant', 'sk', { ai: true })).toBeDefined();
	});
});
