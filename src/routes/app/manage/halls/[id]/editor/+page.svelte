<script lang="ts">
	import { pageTitle } from '$lib/page-title';
	import { goto, invalidateAll } from '$app/navigation';
	import { t } from '$lib/i18n.svelte';
	import MapEditor from '$lib/MapEditor.svelte';
	import { onMount, untrack } from 'svelte';
	import { registerAssistantPage } from '$lib/assistant/page-hooks';
	import { LayoutSaver, guardUnsaved } from '$lib/editor/layout-saver.svelte';
	import type { PageData } from './$types';

	interface Props { data: PageData; }
	const { data }: Props = $props();

	// An AI assistant's proposed plan, opened here to look at before anything is saved.
	// Saving goes through the same action with the proposal attached, so the draft is
	// written only if the plan it was drawn on is still the one in place.
	const draft = $derived(data.draft && !data.draft.stale ? data.draft : null);
	const plainEditor = $derived(`/app/manage/halls/${data.hall.id}/editor`);
	// The plan the editor starts from. Taken once (and again when the editor is rebuilt):
	// a save reloads the page data, and the editor must not reset to it mid-drawing.
	let initialPlan = $state<unknown>(untrack(() => (data.draft && !data.draft.stale ? data.draft.state : data.hall.floorplan_json)));
	let editorKey = $state(0);
	/** The stored plan this editor's edits build on (see the server's conflict check). */
	let baseVersion = $state(untrack(() => data.floorplanVersion));
	/** Someone else saved this plan meanwhile: autosave stops until the user chooses. */
	let conflict = $state(false);
	let overwrite = false;

	// Autosave a moment after the last change. An AI draft is never saved on its own:
	// saving it is the user's decision (a step change does not save it either).
	const saver = new LayoutSaver({
		action: '?/saveFloorplan',
		field: 'floorplanJson',
		delay: 1000,
		fields: () => (draft ? { proposalId: draft.id } : { baseVersion, ...(overwrite ? { force: '1' } : {}) }),
		autosave: () => !draft && !conflict,
		failedMessage: () => t.editor.saveFailed,
		onResult: async (result) => {
			if (result.type === 'success') {
				const version = (result.data as { version?: unknown } | undefined)?.version;
				if (typeof version === 'string') baseVersion = version;
				// Saved: from here on it is the hall's plan, edited like any other.
				if (draft) await leaveTo(plainEditor);
			} else if (result.type === 'failure' && (result.data as { conflict?: unknown } | undefined)?.conflict) {
				conflict = true;
			}
		}
	});
	guardUnsaved(saver, { leaveUnsaved: () => t.editor.leaveUnsaved, leaveFailed: () => t.editor.leaveSaveFailed });

	function rebuildEditor() {
		initialPlan = draft ? draft.state : data.hall.floorplan_json;
		baseVersion = data.floorplanVersion;
		conflict = false;
		saver.reset();
		editorKey++;
	}

	/** Navigate on purpose (the draft was saved or discarded): no "unsaved" guard. */
	async function leaveTo(url: string) {
		saver.leaving = true;
		try { await goto(url, { replaceState: true, invalidateAll: true }); } finally { saver.leaving = false; }
	}

	// The assistant widget opens a draft here by client-side navigation (and saving
	// or discarding one navigates back). The page is not remounted then, so the
	// editor is rebuilt whenever the draft in the URL changes — otherwise it went on
	// showing the old plan under the draft's banner, and saved that.
	const draftKey = $derived(data.draft ? `${data.draft.id}:${data.draft.stale ? 'stale' : 'live'}` : '');
	let shownDraftKey = untrack(() => draftKey);
	$effect(() => {
		const key = draftKey;
		if (key === shownDraftKey) return;
		shownDraftKey = key;
		untrack(rebuildEditor);
	});

	let discarding = $state(false);
	async function discardDraft() {
		if (!draft) return;
		discarding = true;
		try {
			await fetch(`/app/manage/assistant/proposals/${draft.id}`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'discard' })
			});
		} finally {
			discarding = false;
		}
		await leaveTo(plainEditor);
	}

	/** The explicit save. A draft can be saved untouched; the server then writes the
	 *  proposal as it is. */
	function save() {
		void saver.save({ force: true, payload: draft && !saver.dirty ? '' : undefined });
	}

	/** After a conflict: take the newer plan from the server (this tab's edits go). */
	async function reloadNewer() {
		saver.leaving = true;
		try { await invalidateAll(); } finally { saver.leaving = false; }
		rebuildEditor();
	}
	/** After a conflict: keep this tab's plan and write it over the newer one. */
	async function overwriteNewer() {
		conflict = false;
		overwrite = true;
		try { await saver.save({ force: true }); } finally { overwrite = false; }
	}

	// The assistant can save a drawn plan for this hall. Refuse that over unsaved
	// drawing here; afterwards rebuild the editor from the saved plan, or the next
	// save from this page would quietly put the old walls back.
	onMount(() =>
		registerAssistantPage({
			blocker: () => (saver.dirty || saver.saving ? t.ai.errors.page_unsaved : null),
			afterApply: () => rebuildEditor()
		})
	);

	const saveLabel = $derived(draft ? t.ai.draftSave : `${t.common.save} ${t.halls.floorplan.toLowerCase()}`);
</script>

<svelte:head><title>{pageTitle(t.halls.floorplan, data.hall.name)}</title></svelte:head>

<div class="editor-page fill-main">
	<!-- Top bar -->
	<div class="editor-topbar">
		<a href="/app/manage/halls/{data.hall.id}" class="back-link">
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<polyline points="15 18 9 12 15 6"/>
			</svg>
			{data.hall.name}
		</a>
		<span class="topbar-title">{t.halls.floorplan}</span>
		<div class="topbar-actions">
			<span class="save-state save-{saver.state}">{saver.state === 'dirty' ? t.editor.unsaved : saver.state === 'saving' ? t.editor.saving : saver.state === 'saved' ? t.editor.saved : ''}</span>
			<button type="button" class="btn-outline btn-sm" onclick={() => window.dispatchEvent(new CustomEvent('hallify:assistant:open'))}>{t.editor.draftWithAi}</button>
			{#if draft}
				<button type="button" class="btn-outline btn-sm" onclick={discardDraft} disabled={discarding}>{t.ai.draftDiscard}</button>
			{/if}
			<button type="button" class="btn-action btn-sm" onclick={save} disabled={saver.saving || (!draft && saver.json === null)}>{saveLabel}</button>
		</div>
	</div>

	{#if draft}
		<div class="draft-banner" role="status">
			<span class="draft-tag">AI</span>
			{t.ai.draftBanner}
		</div>
	{:else if data.draft?.stale}
		<div class="draft-banner draft-banner--stale" role="status">{t.ai.draftStale}</div>
	{/if}
	{#if saver.error}
		<div class="draft-banner draft-banner--stale" role="alert">
			<span class="banner-text">{saver.error}</span>
			{#if conflict}
				<button type="button" class="btn-outline btn-sm" onclick={reloadNewer}>{t.editor.conflictReload}</button>
				<button type="button" class="btn-outline btn-sm" onclick={overwriteNewer}>{t.editor.conflictOverwrite}</button>
			{/if}
		</div>
	{/if}

	<!-- Editor fills remaining space -->
	<div class="editor-body">
		{#key editorKey}
			<MapEditor
				initialState={initialPlan}
				onchange={(json) => saver.change(json)}
				tableTypes={data.tableTypes}
				mode="room"
				saveState={saver.state}
				onSave={save}
				{saveLabel}
				autosave={!draft && !conflict}
				printHref={draft ? undefined : `/app/manage/halls/${data.hall.id}/editor/print`}
			/>
		{/key}
	</div>
</div>

<style>
	.editor-page {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		overflow: hidden;
	}

	.editor-topbar {
		display: flex;
		align-items: center;
		gap: 0;
		padding: 8px 16px;
		background: var(--bg-panel);
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
		z-index: 10;
		/* On a narrow screen the actions go to a second line instead of off-screen. */
		flex-wrap: wrap;
		row-gap: 8px;
	}
	.banner-text { flex: 1; min-width: 0; }

	.back-link {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 14px;
		font-weight: 600;
		letter-spacing: -.02em;
		color: var(--text-base);
		text-decoration: none;
		transition: color .15s;
	}

	/* The accent is a fill colour; text written in it must use --accent-ink. */
	.back-link:hover { color: var(--accent-ink); text-decoration: none; }

	.topbar-actions {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-left: auto;
		flex-wrap: wrap;
	}

	.topbar-title { font-size: 13px; font-weight: 600; color: var(--text-muted); margin-left: 14px; padding-left: 14px; border-left: 1px solid var(--border); }
	.save-state { font-size: 12px; font-weight: 600; min-width: 90px; text-align: right; }
	.save-state.save-saved { color: var(--success); }
	.save-state.save-dirty { color: var(--warning); }
	.save-state.save-saving { color: var(--text-muted); }

	.draft-banner {
		display: flex; align-items: center; gap: 10px; flex-shrink: 0;
		padding: 9px 16px; font-size: 12.5px; line-height: 1.45;
		background: var(--accent-dim); color: var(--text-base);
		border-bottom: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
	}
	.draft-banner--stale { background: var(--warning-dim); border-bottom-color: color-mix(in srgb, var(--warning) 30%, transparent); }
	.draft-tag {
		font-size: 10px; font-weight: 700; letter-spacing: .08em; padding: 2px 6px; border-radius: var(--radius-sm);
		background: var(--accent); color: var(--accent-contrast);
	}

	.editor-body {
		flex: 1;
		overflow: hidden;
	}
</style>
