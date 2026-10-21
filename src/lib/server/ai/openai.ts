import { env } from '$env/dynamic/private';

/**
 * The one place that talks to OpenAI (the Responses API, over fetch — no SDK, so
 * nothing extra in the Worker bundle).
 *
 * `store: false`: OpenAI keeps nothing between calls. The conversation lives in
 * ai_items and is replayed each turn, which also means a member deleting a thread
 * really deletes it. Reasoning is requested back in encrypted form so it can be
 * replayed with the tool results it led to.
 *
 * OPENAI_BASE_URL exists for local testing against a stand-in server; production
 * leaves it unset.
 */

export type InputItem = Record<string, unknown>;

export interface FunctionTool {
	type: 'function';
	name: string;
	description: string;
	parameters: Record<string, unknown>;
	strict?: boolean;
}

/** A tool OpenAI runs itself (web search), as opposed to one of ours. */
export interface HostedTool {
	type: 'web_search';
	user_location?: { type: 'approximate'; country?: string };
}

export interface ResponseResult {
	output: InputItem[];
	text: string;
	calls: { call_id: string; name: string; arguments: string }[];
	usage: { input_tokens: number; cached_tokens: number; output_tokens: number };
	/** Web searches OpenAI ran during this call — billed per search, on top of tokens. */
	webSearches: number;
	status: string;
}

export class AiNotConfigured extends Error {}

export function aiConfigured(): boolean {
	return !!env.OPENAI_API_KEY;
}

export async function createResponse(opts: {
	model: string;
	instructions: string;
	input: InputItem[];
	tools: (FunctionTool | HostedTool)[];
	maxOutputTokens: number;
	reasoningEffort: string;
	user?: string;
}): Promise<ResponseResult> {
	const key = env.OPENAI_API_KEY;
	if (!key) throw new AiNotConfigured('OPENAI_API_KEY is not configured');
	const base = (env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');

	const res = await fetch(`${base}/responses`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
		body: JSON.stringify({
			model: opts.model,
			instructions: opts.instructions,
			input: opts.input,
			tools: opts.tools,
			max_output_tokens: opts.maxOutputTokens,
			store: false,
			include: ['reasoning.encrypted_content'],
			parallel_tool_calls: false,
			reasoning: { effort: opts.reasoningEffort },
			// A stable, non-identifying id for OpenAI's abuse monitoring. Never an email.
			...(opts.user ? { safety_identifier: opts.user } : {})
		})
	});

	if (!res.ok) {
		const body = await res.text().catch(() => '');
		throw new Error(`OpenAI ${res.status}: ${body.slice(0, 500)}`);
	}
	const data = (await res.json()) as {
		output?: InputItem[];
		status?: string;
		usage?: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } };
	};

	const output = data.output ?? [];
	let text = '';
	let webSearches = 0;
	const calls: ResponseResult['calls'] = [];
	for (const item of output) {
		if (item.type === 'web_search_call') webSearches++;
		if (item.type === 'message' && Array.isArray(item.content)) {
			for (const part of item.content as { type: string; text?: string }[]) {
				if (part.type === 'output_text' && part.text) text += part.text;
			}
		} else if (item.type === 'function_call') {
			calls.push({ call_id: String(item.call_id), name: String(item.name), arguments: String(item.arguments ?? '{}') });
		}
	}

	return {
		output,
		text,
		calls,
		webSearches,
		status: data.status ?? 'completed',
		usage: {
			input_tokens: data.usage?.input_tokens ?? 0,
			cached_tokens: data.usage?.input_tokens_details?.cached_tokens ?? 0,
			output_tokens: data.usage?.output_tokens ?? 0
		}
	};
}
