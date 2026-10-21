<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n.svelte';
	import MapEditor from '$lib/MapEditor.svelte';
	import { onMount, untrack } from 'svelte';
	import { registerAssistantPage } from '$lib/assistant/page-hooks';
	import type { PageData, ActionData } from './$types';

	interface Props { data: PageData; form: ActionData; }
	const { data, form }: Props = $props();

	let floorplanJson = $state('');
	let saving = $state(false);
	let formRef: HTMLFormElement | undefined = $state();
	/** What was last saved (or loaded), so unsaved drawing can be told apart. */
	let savedJson = $state('');
	let editorKey = $state(0);
	/** The JSON that went out with the save in flight, so edits made meanwhile stay unsaved. */
	let submittedJson = '';
	let autoTimer: ReturnType<typeof setTimeout> | undefined;

	// An AI assistant's proposed plan, opened here to look at before anything is saved.
	// Saving goes through the same action with the proposal attached, so the draft is
	// written only if the plan it was drawn on is still the one in place.
	const draft = $derived(data.draft && !data.draft.stale ? data.draft : null);
	const plainEditor = $derived(`/app/manage/halls/${data.hall.id}/editor`);
	// The plan the editor starts from. Taken once (and again when the editor is rebuilt):
	// a save reloads the page data, and the editor must not reset to it mid-drawing.
	let initialPlan = $state<unknown>(untrack(() => (data.draft && !data.draft.stale ? data.draft.state : data.hall.floorplan_json)));
	function rebuildEditor() {
		clearTimeout(autoTimer);
		initialPlan = draft ? draft.state : data.hall.floorplan_json;
		floorplanJson = '';
		savedJson = '';
		editorKey++;
	}
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
		await goto(plainEditor, { replaceState: true, invalidateAll: true });
		rebuildEditor();
	}

	const saveState = $derived<'idle' | 'dirty' | 'saving' | 'saved'>(
		saving ? 'saving' : floorplanJson && savedJson && floorplanJson !== savedJson ? 'dirty' : form?.success || (savedJson && floorplanJson === savedJson && !draft) ? 'saved' : 'idle'
	);

	function onFloorplanChange(json: string) {
		floorplanJson = json;
		if (!savedJson) { savedJson = json; return; } // the editor reports its starting state once
		// Autosave a moment after the last change. An AI draft is never saved on its own:
		// saving it is the user's decision.
		clearTimeout(autoTimer);
		if (!draft && json !== savedJson) autoTimer = setTimeout(save, 1000);
	}
	function save() {
		clearTimeout(autoTimer);
		if (saving || (!draft && (!floorplanJson || floorplanJson === savedJson))) return;
		formRef?.requestSubmit();
	}
	// Warn before leaving with an edit that has not reached the server.
	function onBeforeUnload(e: BeforeUnloadEvent) {
		if (floorplanJson && floorplanJson !== savedJson) { e.preventDefault(); save(); }
	}

	// The assistant can save a drawn plan for this hall. Refuse that over unsaved
	// drawing here; afterwards rebuild the editor from the saved plan, or the next
	// save from this page would quietly put the old walls back.
	onMount(() =>
		registerAssistantPage({
			blocker: () => (floorplanJson && floorplanJson !== savedJson ? t.ai.errors.page_unsaved : null),
			afterApply: () => rebuildEditor()
		})
	);
</script>

<svelte:window onbeforeunload={onBeforeUnload} />
<svelte:head><title>{t.halls.floorplan} – {data.hall.name} – Hallify</title></svelte:head>

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
			<span class="save-state save-{saveState}">{saveState === 'dirty' ? t.editor.unsaved : saveState === 'saving' ? t.editor.saving : saveState === 'saved' ? t.editor.saved : ''}</span>
			<button type="button" class="btn-outline btn-sm" onclick={() => window.dispatchEvent(new CustomEvent('hallify:assistant:open'))}>{t.editor.draftWithAi}</button>
			{#if draft}
				<button type="button" class="btn-outline btn-sm" onclick={discardDraft} disabled={discarding}>{t.ai.draftDiscard}</button>
			{/if}
			<form method="POST" action="?/saveFloorplan" bind:this={formRef} use:enhance={() => { saving = true; submittedJson = floorplanJson; return async ({ update, result }) => {
				await update({ reset: false });
				saving = false;
				if (result.type === 'success') {
					savedJson = submittedJson;
					if (draft) {
						// Saved: from here on it is the hall's plan, edited like any other.
						await goto(plainEditor, { replaceState: true, invalidateAll: true });
						rebuildEditor();
					} else if (floorplanJson !== savedJson) {
						// Edited while the save was in flight: save again.
						autoTimer = setTimeout(save, 600);
					}
				}
			}; }}>
				<input type="hidden" name="floorplanJson" value={floorplanJson} />
				{#if draft}<input type="hidden" name="proposalId" value={draft.id} />{/if}
				<!-- A draft can be saved untouched; the server then writes the proposal as it is. -->
				<button type="submit" class="btn-action btn-sm" disabled={!draft && !floorplanJson}>
					{draft ? t.ai.draftSave : `${t.common.save} ${t.halls.floorplan.toLowerCase()}`}
				</button>
			</form>
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
	{#if form?.error}<div class="draft-banner draft-banner--stale" role="alert">{form.error}</div>{/if}

	<!-- Editor fills remaining space -->
	<div class="editor-body">
		{#key editorKey}
			<MapEditor
				initialState={initialPlan}
				onchange={onFloorplanChange}
				tableTypes={data.tableTypes}
				mode="room"
				{saveState}
				onSave={save}
				saveLabel={draft ? t.ai.draftSave : `${t.common.save} ${t.halls.floorplan.toLowerCase()}`}
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
	}

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
