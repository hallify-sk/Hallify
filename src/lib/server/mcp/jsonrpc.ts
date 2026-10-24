/**
 * The MCP wire protocol, for one stateless POST (Streamable HTTP, 2025-06-18).
 *
 * Each request carries one JSON-RPC message and gets one JSON answer; nothing is
 * kept between requests, so there are no sessions and no server-sent events.
 * Batches were removed from the protocol in 2025-06-18 and are refused.
 *
 * Tool failures are results with `isError: true` (the agent reads and recovers from
 * them); protocol mistakes — unknown method, unknown tool, bad params — are
 * JSON-RPC errors.
 */

export const SERVER_INFO = { name: 'hallify', title: 'Hallify', version: '1.0.0' };
export const LATEST_PROTOCOL = '2025-06-18';
export const SUPPORTED_PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26'];

export const RPC = {
	PARSE_ERROR: -32700,
	INVALID_REQUEST: -32600,
	METHOD_NOT_FOUND: -32601,
	INVALID_PARAMS: -32602,
	INTERNAL_ERROR: -32603
} as const;

export interface McpToolDescriptor {
	name: string;
	title: string;
	description: string;
	inputSchema: Record<string, unknown>;
	annotations: { title: string; readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean; openWorldHint: boolean };
}

export type ToolOutcome = { ok: true; data: unknown } | { ok: false; error: string; data?: unknown };

export interface McpHandlers {
	/** The tools this caller may see. */
	listTools(): Promise<McpToolDescriptor[]>;
	/** Run one; null when no such tool exists for this caller. */
	callTool(name: string, args: Record<string, unknown>): Promise<ToolOutcome | null>;
	instructions?: string;
}

type Id = string | number | null;
export type RpcResponse =
	| { jsonrpc: '2.0'; id: Id; result: unknown }
	| { jsonrpc: '2.0'; id: Id; error: { code: number; message: string; data?: unknown } };

/** What the HTTP layer sends back: a JSON body, or 202 with none (notifications). */
export type McpReply = { status: number; body: RpcResponse | null };

const error = (id: Id, code: number, message: string, data?: unknown): RpcResponse =>
	({ jsonrpc: '2.0', id, error: data === undefined ? { code, message } : { code, message, data } });

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const validId = (v: unknown): v is string | number => typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v));

/** The text an agent reads: JSON, pretty enough to be read, bounded. */
function render(data: unknown): string {
	const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
	return text.length > 200_000 ? `${text.slice(0, 200_000)}\n…(truncated)` : text;
}

export function toolResult(outcome: ToolOutcome) {
	if (!outcome.ok) {
		return { content: [{ type: 'text', text: outcome.error }], isError: true };
	}
	const structured = isObject(outcome.data) ? { structuredContent: outcome.data } : {};
	return { content: [{ type: 'text', text: render(outcome.data) }], ...structured, isError: false };
}

/** Parse a raw body and answer it. */
export async function handleMcpBody(raw: string, h: McpHandlers): Promise<McpReply> {
	let msg: unknown;
	try {
		msg = JSON.parse(raw);
	} catch {
		return { status: 400, body: error(null, RPC.PARSE_ERROR, 'Parse error: the body is not valid JSON.') };
	}
	return handleMcpMessage(msg, h);
}

export async function handleMcpMessage(msg: unknown, h: McpHandlers): Promise<McpReply> {
	if (Array.isArray(msg)) {
		return { status: 400, body: error(null, RPC.INVALID_REQUEST, 'Batches are not supported; send one message per request.') };
	}
	if (!isObject(msg) || msg.jsonrpc !== '2.0') {
		return { status: 400, body: error(null, RPC.INVALID_REQUEST, 'Invalid Request: expected a JSON-RPC 2.0 message.') };
	}

	// A response or a notification from the client: accepted, nothing to answer.
	const isResponse = !('method' in msg) && ('result' in msg || 'error' in msg);
	if (isResponse) return { status: 202, body: null };
	if (typeof msg.method !== 'string') {
		return { status: 400, body: error(validId(msg.id) ? msg.id : null, RPC.INVALID_REQUEST, 'Invalid Request: method must be a string.') };
	}
	if (!('id' in msg)) return { status: 202, body: null };
	if (!validId(msg.id)) {
		return { status: 400, body: error(null, RPC.INVALID_REQUEST, 'Invalid Request: id must be a string or a number.') };
	}

	const id = msg.id;
	const params = msg.params === undefined ? {} : msg.params;
	if (!isObject(params)) return { status: 200, body: error(id, RPC.INVALID_PARAMS, 'params must be an object.') };
	const ok = (result: unknown): McpReply => ({ status: 200, body: { jsonrpc: '2.0', id, result } });

	try {
		switch (msg.method) {
			case 'initialize': {
				const asked = typeof params.protocolVersion === 'string' ? params.protocolVersion : '';
				return ok({
					protocolVersion: SUPPORTED_PROTOCOLS.includes(asked) ? asked : LATEST_PROTOCOL,
					capabilities: { tools: { listChanged: false } },
					serverInfo: SERVER_INFO,
					...(h.instructions ? { instructions: h.instructions } : {})
				});
			}
			case 'ping':
				return ok({});
			case 'tools/list':
				return ok({ tools: await h.listTools() });
			case 'tools/call': {
				if (typeof params.name !== 'string' || !params.name) {
					return { status: 200, body: error(id, RPC.INVALID_PARAMS, 'tools/call needs a tool name.') };
				}
				const args = params.arguments === undefined || params.arguments === null ? {} : params.arguments;
				if (!isObject(args)) return { status: 200, body: error(id, RPC.INVALID_PARAMS, 'arguments must be an object.') };
				const outcome = await h.callTool(params.name, args);
				if (!outcome) return { status: 200, body: error(id, RPC.INVALID_PARAMS, `Unknown tool: ${params.name}`) };
				return ok(toolResult(outcome));
			}
			default:
				return { status: 200, body: error(id, RPC.METHOD_NOT_FOUND, `Method not found: ${msg.method}`) };
		}
	} catch (err) {
		console.error('MCP request failed:', err);
		return { status: 200, body: error(id, RPC.INTERNAL_ERROR, 'Internal error.') };
	}
}
