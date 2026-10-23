/**
 * Saving an editor's layout: autosave a moment after the last change, an explicit
 * save, and never losing the last edits on the way out.
 *
 * Shared by the hall's floor plan, the template editor and both event seating
 * editors. Each used to keep its own copy of this, and between them they marked a
 * freshly opened plan as unsaved (the editor reports its starting state once),
 * saved an assistant's draft on a step change, and dropped whatever was drawn in
 * the last second before a link was clicked or the tab closed.
 *
 * The save is a plain POST to the page's form action, read back with SvelteKit's
 * `deserialize`, so it can also run while the page is going away (`keepalive`).
 */
import { beforeNavigate, goto } from '$app/navigation';
import { deserialize } from '$app/forms';
import { onMount } from 'svelte';
import type { ActionResult } from '@sveltejs/kit';

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved';

export interface LayoutSaverOptions {
	/** The form action, e.g. '?/saveLayout'. */
	action: string;
	/** The form field the layout JSON travels in. */
	field: string;
	/** Further fields sent with every save (a proposal id, a version…). */
	fields?: () => Record<string, string | undefined>;
	/** False while saving must wait for the user (an AI draft, a conflict). */
	autosave?: () => boolean;
	/** Milliseconds after the last change. */
	delay?: number;
	/** Every result, after the saver has updated its own state. */
	onResult?: (result: ActionResult, sent: string) => void | Promise<void>;
	/** The message for a save that failed without one of its own. */
	failedMessage: () => string;
}

/** The layout JSON a keepalive request may still carry (browsers cap it at 64 kB). */
const KEEPALIVE_MAX = 60_000;

export class LayoutSaver {
	/** The editor's current layout, as it last reported it. */
	json = $state<string | null>(null);
	/** What the server holds, as far as this page knows. */
	saved = $state<string | null>(null);
	saving = $state(false);
	/** Why the last save failed, until one succeeds. */
	error = $state<string | null>(null);
	/** A save has gone through since the editor was (re)built. */
	savedOnce = $state(false);
	/** Set while the page navigates away on purpose (discarding a draft…). */
	leaving = false;

	#forceDirty = $state(false);
	#baselinePending = true;
	#timer: ReturnType<typeof setTimeout> | undefined;
	#inflight: Promise<boolean> | null = null;
	#opts: LayoutSaverOptions;

	constructor(opts: LayoutSaverOptions) {
		this.#opts = opts;
	}

	get dirty(): boolean {
		return this.json !== null && (this.#forceDirty || this.json !== this.saved);
	}

	get state(): SaveState {
		return this.saving ? 'saving' : this.dirty ? 'dirty' : this.savedOnce ? 'saved' : 'idle';
	}

	get autosaves(): boolean {
		return this.#opts.autosave?.() ?? true;
	}

	/** The editor reported a change. Its first report after a (re)build is where it
	 *  started, not an edit — unless `reset({ dirty: true })` said otherwise. */
	change(json: string): void {
		this.json = json;
		if (this.#baselinePending) {
			this.#baselinePending = false;
			if (!this.#forceDirty) { this.saved = json; return; }
		}
		this.#schedule();
	}

	/** The editor is about to be rebuilt. `dirty`: what it will show is not what the
	 *  server holds (an undo of a template), so it is saved like any edit. */
	reset(opts: { dirty?: boolean; savedOnce?: boolean } = {}): void {
		clearTimeout(this.#timer);
		this.#baselinePending = true;
		this.#forceDirty = !!opts.dirty;
		this.savedOnce = !!opts.savedOnce;
		this.error = null;
	}

	/** Drop a pending autosave (something else is about to write the layout). */
	hold(): void {
		clearTimeout(this.#timer);
	}

	#schedule(): void {
		clearTimeout(this.#timer);
		if (this.dirty && this.autosaves) this.#timer = setTimeout(() => void this.save(), this.#opts.delay ?? 900);
	}

	/** Save now. `payload` replaces the JSON sent (a draft saved untouched sends ''). */
	async save(opts: { keepalive?: boolean; force?: boolean; payload?: string } = {}): Promise<boolean> {
		clearTimeout(this.#timer);
		if (this.#inflight) {
			await this.#inflight;
			if (!opts.force && !this.dirty) return !this.error;
		}
		if (this.json === null || (!opts.force && !this.dirty)) return true;
		const run = this.#post(opts);
		this.#inflight = run;
		try {
			return await run;
		} finally {
			if (this.#inflight === run) this.#inflight = null;
		}
	}

	async #post(opts: { keepalive?: boolean; payload?: string }): Promise<boolean> {
		const sent = this.json ?? '';
		const body = new FormData();
		body.set(this.#opts.field, opts.payload ?? sent);
		for (const [k, v] of Object.entries(this.#opts.fields?.() ?? {})) if (v !== undefined) body.set(k, v);
		this.saving = true;
		let result: ActionResult;
		try {
			const res = await fetch(this.#opts.action, {
				method: 'POST',
				body,
				headers: { accept: 'application/json', 'x-sveltekit-action': 'true' },
				cache: 'no-store',
				keepalive: !!opts.keepalive && sent.length < KEEPALIVE_MAX
			});
			result = deserialize(await res.text());
		} catch (e) {
			result = { type: 'error', status: 0, error: e };
		} finally {
			this.saving = false;
		}
		const ok = result.type === 'success' || result.type === 'redirect';
		if (ok) {
			this.saved = sent;
			this.#forceDirty = false;
			this.savedOnce = true;
			this.error = null;
		} else {
			const data = result.type === 'failure' ? (result.data as { error?: unknown } | undefined) : undefined;
			this.error = typeof data?.error === 'string' ? data.error : this.#opts.failedMessage();
		}
		await this.#opts.onResult?.(result, sent);
		// Edited while that save was in flight: save again.
		if (ok) this.#schedule();
		return ok;
	}

	/** Wait for a save in flight, then save what is left. */
	async flush(): Promise<boolean> {
		if (this.#inflight) await this.#inflight;
		return this.dirty ? this.save() : !this.error;
	}
}

/**
 * Keep the last edits when the page is left.
 *
 * - A link or back inside the app: the navigation waits for the save, then goes
 *   on. If the save fails, the person is asked whether to leave anyway.
 * - Closing or reloading the tab: the browser's "leave site?" prompt, and the save
 *   is sent as a keepalive request so it still arrives if they leave.
 * - Where saving is the user's call (an AI draft), they are asked before going.
 *
 * Call during component initialisation.
 */
export function guardUnsaved(saver: LayoutSaver, messages: { leaveUnsaved: () => string; leaveFailed: () => string }): void {
	let passing = false;
	beforeNavigate((nav) => {
		if (passing || saver.leaving || nav.willUnload) return;
		if (!saver.dirty && !saver.saving) return;
		if (!saver.autosaves) {
			if (!confirm(messages.leaveUnsaved())) nav.cancel();
			return;
		}
		nav.cancel();
		const to = nav.to?.url;
		void saver.flush().then((ok) => {
			if (!to) return;
			if (!ok && !confirm(messages.leaveFailed())) return;
			passing = true;
			void goto(to).finally(() => { passing = false; });
		});
	});

	onMount(() => {
		const onBeforeUnload = (e: BeforeUnloadEvent) => {
			if (saver.leaving || (!saver.dirty && !saver.saving)) return;
			e.preventDefault();
			e.returnValue = '';
			if (saver.dirty && saver.autosaves) void saver.save({ keepalive: true });
		};
		window.addEventListener('beforeunload', onBeforeUnload);
		return () => window.removeEventListener('beforeunload', onBeforeUnload);
	});
}
