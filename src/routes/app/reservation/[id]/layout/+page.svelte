<script lang="ts">
	import MapEditor from '$lib/MapEditor.svelte';
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { onMount, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { registerAssistantPage } from '$lib/assistant/page-hooks';
	import { LayoutSaver, guardUnsaved } from '$lib/editor/layout-saver.svelte';
	import { t } from '$lib/i18n.svelte';
	import { EVENT_TYPE_KEYS } from '$lib/eventTypes';
	import type { PageData } from './$types';

	interface Props { data: PageData; }
	const { data }: Props = $props();

	const numGuests = untrack(() => data.reservation.num_guests ?? null);

	// An AI assistant's seating plan, opened to look at before anything is saved.
	const draft = $derived(data.draft && !data.draft.stale ? data.draft : null);
	const plainLayout = $derived(`/app/reservation/${data.reservation.id}/layout`);

	// The layout the editor is built from. Taken once (and again when the editor is
	// rebuilt): a save reloads nothing here, and the editor must not reset mid-edit.
	let currentInitial = $state<unknown>(untrack(() => data.initialLayout ?? null));
	let editorKey = $state(0);

	// Autosave shortly after the last change — never for a draft: looking at one and
	// nudging a chair must not quietly save it. Saving a draft closes the proposal, and
	// the page then reloads as the plain editor.
	const saver = new LayoutSaver({
		action: '?/saveLayout',
		field: 'layoutJson',
		fields: () => (draft ? { proposalId: draft.id } : {}),
		autosave: () => !draft,
		failedMessage: () => t.editor.saveFailed,
		onResult: async (result) => {
			if (result.type === 'success' && draft) await leaveTo(plainLayout);
		}
	});
	guardUnsaved(saver, { leaveUnsaved: () => t.editor.leaveUnsaved, leaveFailed: () => t.editor.leaveSaveFailed });

	function rebuild(layout: unknown, opts: { dirty?: boolean; savedOnce?: boolean } = {}) {
		currentInitial = layout;
		saver.reset(opts);
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
	// showing (and saving) the old seating under the draft's banner.
	const draftKey = $derived(data.draft ? `${data.draft.id}:${data.draft.stale ? 'stale' : 'live'}` : '');
	let shownDraftKey = untrack(() => draftKey);
	$effect(() => {
		const key = draftKey;
		if (key === shownDraftKey) return;
		shownDraftKey = key;
		untrack(() => rebuild(data.initialLayout ?? null));
	});

	async function discardDraft() {
		if (!draft) return;
		await fetch(`/app/manage/assistant/proposals/${draft.id}`, {
			method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'discard' })
		});
		await leaveTo(plainLayout);
	}

	// The floating assistant can save seating for this event. This editor holds its
	// own copy of the layout, so: refuse that while edits here are unsaved (one would
	// overwrite the other), and reload the copy once the assistant's plan is saved —
	// otherwise the next autosave would quietly write the old seating back.
	onMount(() =>
		registerAssistantPage({
			blocker: () => (saver.dirty || saver.saving ? t.ai.errors.page_unsaved : null),
			afterApply: () => rebuild(data.initialLayout ?? null, { savedOnce: true })
		})
	);

	// ── Template picker + recommendation (by event type, then closest guest→seat match) ──
	let pickerOpen = $state(false);
	let tmplSearch = $state('');
	let selectedType = $state<string>('');
	let pickTemplateId = $state('');
	let pickerFormRef: HTMLFormElement | undefined = $state();
	let applying = $state(false);
	let tmplError = $state<string | null>(null);
	/** What applying a template did, with the layout from before it for "Undo". */
	let tmplNotice = $state<{ text: string; undo: string | null } | null>(null);

	const rankedTemplates = $derived.by(() => {
		const q = tmplSearch.trim().toLowerCase();
		const matches = data.templates.filter((tm) => {
			if (!q) return true;
			return tm.name.toLowerCase().includes(q) ||
				tm.eventTypes.some((k) => t.eventTypes[k].toLowerCase().includes(q));
		});
		return matches
			.map((tm) => ({
				tm,
				typeMatch: selectedType ? ((tm.eventTypes as string[]).includes(selectedType) ? 0 : 1) : 0,
				guestDiff: numGuests != null ? Math.abs(tm.seats - numGuests) : 0,
			}))
			.sort((a, b) => a.typeMatch - b.typeMatch || a.guestDiff - b.guestDiff || a.tm.name.localeCompare(b.tm.name));
	});

	const recommendedId = $derived.by(() => {
		const r = rankedTemplates;
		if (!r.length) return null;
		if (selectedType && r[0].typeMatch !== 0) return null;
		if (numGuests == null && !selectedType) return null;
		return r[0].tm.id;
	});

	function chooseTemplate(id: string) {
		pickTemplateId = id;
		pickerOpen = false;
		tmplSearch = '';
		pickerFormRef?.requestSubmit();
	}

	// Asks first, then sends the template id and the editor's current layout straight
	// in the form data. (The hidden input alone was read before Svelte had written the
	// new id into it, so the first click posted an empty id and failed silently.)
	const applyTemplate: SubmitFunction = ({ formData, cancel }) => {
		const tm = data.templates.find((x) => x.id === pickTemplateId);
		if (!tm || !confirm(t.myRes.applyTemplateConfirm(tm.name))) { cancel(); return; }
		const before = saver.json;
		saver.hold();
		formData.set('templateId', tm.id);
		formData.set('currentJson', before ?? '');
		applying = true;
		tmplError = null;
		return async ({ result }) => {
			applying = false;
			if (result.type === 'success' && result.data?.layout) {
				rebuild(result.data.layout, { savedOnce: true });
				tmplNotice = {
					text: t.myRes.templateApplied(tm.name, Number(result.data.reseated) || 0, Number(result.data.unseated) || 0),
					undo: before
				};
			} else {
				const err = result.type === 'failure' ? (result.data as { error?: unknown } | undefined)?.error : null;
				tmplError = typeof err === 'string' ? err : t.myRes.templateApplyFailed;
			}
		};
	};

	/** Put back the layout from before the template, and save it. */
	function undoTemplate() {
		const prev = tmplNotice?.undo;
		tmplNotice = null;
		if (!prev) return;
		try { rebuild(JSON.parse(prev), { dirty: true }); } catch { /* nothing to restore */ }
	}

	const errorText = $derived(tmplError ?? saver.error);
</script>

<svelte:head><title>{data.reservation.title} — {t.event.layoutEditorTitle} – Hallify</title></svelte:head>

<div class="layout-page fill-main">
	<div class="layout-toolbar">
		<a href="/app/reservation/{data.reservation.id}" class="btn-outline btn-sm">
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<polyline points="15 18 9 12 15 6"/>
			</svg>
			{t.event.backToDetail}
		</a>

		<h1>{data.reservation.title} — {t.event.layoutEditorTitle}</h1>

		<div class="toolbar-actions">
			{#if data.templates.length > 0 && !draft}
				<div class="tmpl-picker">
					<button type="button" class="btn-outline btn-sm" onclick={() => pickerOpen = !pickerOpen} disabled={applying}>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
						{t.halls.templates}
					</button>
					{#if pickerOpen}
						<button type="button" class="tmpl-backdrop" onclick={() => pickerOpen = false} aria-label={t.myRes.close}></button>
						<div class="card card--raised tmpl-dropdown">
							<input class="tmpl-search" type="text" bind:value={tmplSearch} placeholder={t.myRes.searchTemplates} />
							<div class="tmpl-typefilter">
								<button type="button" class="tf-chip" class:on={selectedType === ''} onclick={() => selectedType = ''}>{t.myRes.allTypes}</button>
								{#each EVENT_TYPE_KEYS as key}
									<button type="button" class="tf-chip" class:on={selectedType === key} onclick={() => selectedType = selectedType === key ? '' : key}>{t.eventTypes[key]}</button>
								{/each}
							</div>
							{#if numGuests != null}
								<p class="tmpl-guesthint">{t.myRes.bestFitFor} <strong>{numGuests}</strong> {t.myRes.guestsSuffix}</p>
							{/if}
							<div class="row-list tmpl-list">
								{#each rankedTemplates as { tm } (tm.id)}
									<button type="button" class="row-item tmpl-item" class:recommended={tm.id === recommendedId} onclick={() => chooseTemplate(tm.id)}>
										<span class="tmpl-item-top">
											<span class="tmpl-item-name">{tm.name}</span>
											{#if tm.id === recommendedId}<span class="tmpl-rec">{t.myRes.recommended}</span>{/if}
										</span>
										<span class="tmpl-item-meta">
											<span class="tmpl-seats">{tm.seats} {t.myRes.seatsSuffix}</span>
											{#each tm.eventTypes as key}<span class="tmpl-item-type">{t.eventTypes[key]}</span>{/each}
										</span>
									</button>
								{:else}
									<p class="tmpl-empty">{t.myRes.noMatches}</p>
								{/each}
							</div>
							<p class="tmpl-note">{t.myRes.applyTemplateNote}</p>
						</div>
					{/if}
				</div>
				<form method="POST" action="?/loadTemplate" bind:this={pickerFormRef} use:enhance={applyTemplate}>
					<input type="hidden" name="templateId" value={pickTemplateId} />
				</form>
			{/if}

			<button type="button" class="btn-outline btn-sm" onclick={() => window.dispatchEvent(new CustomEvent('hallify:assistant:open'))}>{t.editor.seatWithAi}</button>
			<span class="save-status save-{saver.state}">
				{#if saver.state === 'saving'}{t.myRes.saving}
				{:else if saver.state === 'dirty'}{t.myRes.unsavedChanges}
				{:else if saver.state === 'saved'}{t.myRes.allChangesSaved}{/if}
			</span>
			{#if draft}
				<button type="button" class="btn-outline btn-sm" onclick={discardDraft}>{t.ai.draftDiscard}</button>
			{/if}
			<button type="button" class="btn-action btn-sm" disabled={saver.json === null || saver.saving} onclick={() => saver.save({ force: true })}>
				{draft ? t.ai.draftSave : t.event.saveLayout}
			</button>
		</div>
	</div>

	{#if errorText}<div class="save-err" role="alert">{errorText}</div>{/if}
	{#if draft}
		<div class="draft-banner" role="status"><span class="draft-tag">AI</span>{t.ai.draftBanner}</div>
	{:else if data.draft?.stale}
		<div class="draft-banner draft-banner--stale" role="status">{t.ai.draftStale}</div>
	{/if}
	{#if tmplNotice}
		<div class="draft-banner" role="status">
			<span class="tmpl-notice-text">{tmplNotice.text}</span>
			{#if tmplNotice.undo}<button type="button" class="btn-outline btn-sm" onclick={undoTemplate}>{t.editor.undo}</button>{/if}
			<button type="button" class="notice-close" onclick={() => tmplNotice = null} aria-label={t.myRes.close}>✕</button>
		</div>
	{/if}

	<div class="editor-wrap">
		{#key editorKey}
			<MapEditor
				initialState={currentInitial}
				onchange={(json) => saver.change(json)}
				tableTypes={data.tableTypes}
				mode="event"
				saveState={saver.state}
				onSave={() => saver.save({ force: true })}
				saveLabel={draft ? t.ai.draftSave : t.event.saveLayout}
				autosave={!draft}
				printHref={`/app/reservation/${data.reservation.id}/manifest`}
				protectWallsZones={true}
				allowZones={true}
				lockFloors={true}
				tablesFromTypesOnly={true}
				allowGuests={true}
				lockedZoneIds={data.hallZoneIds}
			/>
		{/key}
	</div>
</div>

<style>
	.layout-page {
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow: hidden;
	}

	.layout-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px var(--page-gutter);
		border-bottom: 1px solid var(--border);
		background: var(--bg-panel);
		flex-shrink: 0;
		/* On a narrow screen the actions go to a second line instead of off-screen. */
		flex-wrap: wrap;
		gap: 8px 12px;
	}

	.layout-toolbar h1 {
		font-size: 15px;
		font-weight: 550;
		letter-spacing: -.045em;
		margin: 0;
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.layout-toolbar .toolbar-actions {
		display: flex;
		gap: 10px;
		align-items: center;
		flex-wrap: wrap;
	}

	.tmpl-notice-text { flex: 1; min-width: 0; }
	.notice-close {
		border: 0; background: none; color: var(--text-muted); cursor: pointer; font: inherit; font-size: 13px;
		padding: 2px 6px; border-radius: var(--radius-sm);
	}
	.notice-close:hover { background: var(--bg-hover); color: var(--text-base); }

	.editor-wrap {
		flex: 1;
		overflow: hidden;
		position: relative;
	}

	.save-status { font-size: 12px; font-weight: 600; min-width: 90px; text-align: right; }
	.save-status.save-saving { color: var(--text-muted); }
	.save-status.save-dirty  { color: var(--warning); }
	.draft-banner {
		display: flex; align-items: center; gap: 10px; flex-shrink: 0;
		padding: 9px 16px; font-size: 12.5px; line-height: 1.45;
		background: var(--accent-dim); color: var(--text-base);
		border-bottom: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
	}
	.draft-banner--stale { background: var(--warning-dim); }
	/* A save the server refused (e.g. more tables than the venue owns). */
	.save-err {
		flex-shrink: 0; padding: 9px 16px; font-size: 12.5px; line-height: 1.45;
		background: var(--danger-dim); color: var(--danger); font-weight: 550;
		border-bottom: 1px solid color-mix(in srgb, var(--danger) 25%, transparent);
	}
	.draft-tag {
		font-size: 10px; font-weight: 700; letter-spacing: .08em; padding: 2px 6px; border-radius: var(--radius-sm);
		background: var(--accent); color: var(--accent-contrast);
	}
	.save-status.save-saved  { color: var(--success); }
	.save-status.save-idle   { color: transparent; }

	/* Template picker — a popover, so it opts back into a floating surface. */
	.tmpl-picker { position: relative; }
	.tmpl-backdrop { position: fixed; inset: 0; z-index: 40; background: transparent; border: none; cursor: default; }
	.tmpl-dropdown {
		position: absolute; top: calc(100% + 6px); right: 0; z-index: 50; width: 320px;
		padding: 10px; display: flex; flex-direction: column; gap: 8px;
	}
	.tmpl-search {
		width: 100%; padding: 7px 10px; font-size: 13px; border-radius: var(--radius-sm);
		border: 1px solid var(--border); background: var(--bg-panel2); color: var(--text-base);
	}
	.tmpl-typefilter { display: flex; flex-wrap: wrap; gap: 4px; }
	.tf-chip {
		font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 3px;
		border: 1px solid var(--border); background: transparent; color: var(--text-muted); cursor: pointer;
		transition: background .15s, border-color .15s, color .15s;
	}
	.tf-chip:hover { border-color: var(--accent); background: var(--bg-hover); color: var(--text-base); }
	/* Pink is a fill, so the label on it is accent-contrast, never white. */
	.tf-chip.on { background: var(--accent); border-color: var(--accent); color: var(--accent-contrast); }
	.tmpl-guesthint { margin: 0; font-size: 11.5px; color: var(--text-muted); }
	.tmpl-guesthint strong { color: var(--text-base); }
	.tmpl-list { max-height: 280px; overflow-y: auto; }
	/* Hairline rows inside the popover: .row-item supplies the rule and the hover. */
	.tmpl-item {
		display: flex; flex-direction: column; align-items: stretch; gap: 3px;
		padding: 8px 10px; border-radius: var(--radius);
		background: transparent; cursor: pointer; color: var(--text-base);
	}
	.tmpl-item.recommended { background: var(--accent-dim); }
	.tmpl-item-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
	.tmpl-item-name { font-size: 13px; font-weight: 600; }
	.tmpl-rec {
		font-size: 10px; font-weight: 650; text-transform: uppercase; letter-spacing: .1em;
		color: var(--accent-contrast); background: var(--accent); padding: 2px 6px;
		border-radius: var(--radius-sm); flex-shrink: 0;
	}
	.tmpl-item-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; }
	.tmpl-seats { font-size: 11px; font-weight: 600; color: var(--text-muted); }
	.tmpl-item-type {
		font-size: 10px; font-weight: 650; color: var(--accent-ink); text-transform: uppercase; letter-spacing: .1em;
		background: var(--accent-dim); padding: 1px 5px; border-radius: var(--radius-sm);
	}
	.tmpl-empty { margin: 6px; font-size: 12.5px; color: var(--text-muted); text-align: center; }
	.tmpl-note { margin: 2px 2px 0; font-size: 11px; color: var(--text-muted); }
</style>
