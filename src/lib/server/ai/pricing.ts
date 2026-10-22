import { readPlatformSetting } from '$lib/server/platform-settings';
import { CREDITS_PER_EUR } from '$lib/ai-credits';

/**
 * What the assistant costs, from OpenAI's tokens to our credits.
 *
 *   10 credits = 1 EUR (CREDITS_PER_EUR), so 1 credit = 10 euro cents; balances are kept in
 *   milli-credits (mc). A charge is OpenAI's real cost × the platform markup,
 *   converted to euros and rounded UP to the next milli-credit.
 *
 * Prices are USD per 1M tokens, Standard tier, as listed on
 * https://developers.openai.com/api/docs/pricing on 2026-10-18. They change; when
 * they do, this table changes with them.
 */
export interface ModelPrice {
	input: number;
	cachedInput: number;
	output: number;
}

/**
 * The assistant runs on one model, at one reasoning effort, by decision — not a
 * platform setting. Medium is also the model's own default; it is stated here so a
 * change to OpenAI's default cannot quietly change our behaviour or our costs.
 * Reasoning tokens are billed as output.
 */
export const AI_MODEL = 'gpt-6.1-sol';
export const AI_REASONING_EFFORT = 'medium';

/** OpenAI's web search: $10 per 1,000 searches (developers.openai.com/api/docs/pricing,
 *  2026-10-18). The pages it reads are billed as ordinary input tokens. */
export const WEB_SEARCH_USD_MICRO = 10_000;

export const MODEL_PRICES: Record<string, ModelPrice> = {
	'gpt-6.1-sol': { input: 2.0, cachedInput: 0.1, output: 10.0 }
};

export interface AiPlatformSettings {
	/** Platform-wide off switch. Off = nobody can start a turn. */
	enabled: boolean;
	/** Always AI_MODEL; carried here so callers price and call with one value. */
	model: string;
	/** Multiplier on OpenAI's cost. 3 = we charge three times what it costs us. */
	markup: number;
	/** Euros per US dollar, for turning OpenAI's USD prices into credits. */
	usdToEur: number;
}

export const DEFAULT_AI: AiPlatformSettings = {
	enabled: true,
	model: AI_MODEL,
	markup: 3,
	usdToEur: 0.92
};

/** Normalised, so a partial or malformed stored row still yields usable values. */
export async function loadAiPlatform(db: App.Locals['db']): Promise<AiPlatformSettings> {
	const s = await readPlatformSetting<Partial<AiPlatformSettings>>(db, 'ai');
	const markup = Number(s?.markup);
	const rate = Number(s?.usdToEur);
	return {
		enabled: s?.enabled !== false,
		model: AI_MODEL,
		markup: Number.isFinite(markup) && markup >= 1 && markup <= 20 ? markup : DEFAULT_AI.markup,
		usdToEur: Number.isFinite(rate) && rate > 0.3 && rate < 3 ? rate : DEFAULT_AI.usdToEur
	};
}

export interface Usage {
	input_tokens: number;
	cached_tokens: number;
	output_tokens: number;
}

/** OpenAI's cost in micro-dollars. Price per 1M tokens × tokens is exactly µUSD. */
export function costUsdMicro(model: string, u: Usage): number {
	const p = MODEL_PRICES[model];
	if (!p) throw new Error(`No price for model ${model}`);
	const fresh = Math.max(0, u.input_tokens - u.cached_tokens);
	return Math.ceil(fresh * p.input + u.cached_tokens * p.cachedInput + u.output_tokens * p.output);
}

/** µUSD → milli-credits: × EUR/USD × markup × (CREDITS_PER_EUR × 1000 mc / 1e6 µ). */
export function toMilliCredits(usdMicro: number, s: AiPlatformSettings): number {
	return Math.ceil((usdMicro * s.usdToEur * s.markup * CREDITS_PER_EUR) / 1000);
}

/** The most a single model call could cost: every input token uncached and the
 *  full output budget used. Held before the call, the unused part refunded after. */
export function worstCaseMc(s: AiPlatformSettings, inputTokens: number, maxOutputTokens: number, searches = 0): number {
	return toMilliCredits(
		costUsdMicro(s.model, { input_tokens: inputTokens, cached_tokens: 0, output_tokens: maxOutputTokens }) +
			searches * WEB_SEARCH_USD_MICRO,
		s
	);
}

/** Rough token count for text we are about to send. English runs near 4 characters
 *  a token and Slovak lower, so this divides by 3 to err high. Only used to size
 *  the hold, never to bill. */
export function estimateTokens(text: string): number {
	return Math.ceil(text.length / 3);
}

/** For display: milli-credits as credits with at most one decimal. */
export function formatCredits(mc: number): string {
	const c = mc / 1000;
	return Number.isInteger(c) ? String(c) : c.toFixed(1);
}
