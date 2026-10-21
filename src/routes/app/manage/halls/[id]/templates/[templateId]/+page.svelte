<script lang="ts">
	import MapEditor from '$lib/MapEditor.svelte';
	import { enhance } from '$app/forms';
	import { t } from '$lib/i18n.svelte';
	import { EVENT_TYPE_KEYS, parseEventTypes } from '$lib/eventTypes';
	import type { PageData, ActionData } from './$types';

	interface Props { data: PageData; form: ActionData; }
	const { data, form }: Props = $props();

	const initialLayout = data.template.layout_json ?? null;

	let layoutJson = $state<string | null>(initialLayout ? JSON.stringify(initialLayout) : null);
	let saveState = $state<'idle' | 'dirty' | 'saving' | 'saved'>('idle');
	let formRef: HTMLFormElement | undefined = $state();
	let autoTimer: ReturnType<typeof setTimeout> | undefined;

	// Autosave: debounce a save shortly after the last meaningful change.
	function onLayoutChange(json: string) {
		layoutJson = json;
		saveState = 'dirty';
		clearTimeout(autoTimer);
		autoTimer = setTimeout(() => formRef?.requestSubmit(), 900);
	}

	// ── Edit details (name + event types) ──
	let metaOpen  = $state(false);
	let metaName  = $state('');
	let metaTypes = $state<Set<string>>(new Set());
	function openMeta() {
		metaName = data.template.name;
		metaTypes = new Set(parseEventTypes(data.template.event_type as string | null));
		metaOpen = true;
	}
	function toggleMetaType(k: string) {
		const s = new Set(metaTypes);
		s.has(k) ? s.delete(k) : s.add(k);
		metaTypes = s;
	}
</script>

<svelte:head><title>{data.template.name} — {t.halls.templates} – Hallify</title></svelte:head>

<div class="layout-page fill-main">
	<div class="layout-toolbar">
		<a href="/app/manage/halls/{data.hallId}" class="btn-outline btn-sm">
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<polyline points="15 18 9 12 15 6"/>
			</svg>
			{data.template.hall_name}
		</a>

		<h1>{data.template.name}</h1>

		<div class="toolbar-actions">
			<button type="button" class="btn-outline btn-sm" onclick={openMeta}>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
				{t.hallAdmin.editDetails}
			</button>
			<span class="save-status save-{saveState}">
				{#if saveState === 'saving'}{t.hallAdmin.saving}
				{:else if saveState === 'dirty'}{t.hallAdmin.unsavedChanges}
				{:else if saveState === 'saved'}{t.hallAdmin.allChangesSaved}{/if}
			</span>
			<form method="POST" action="?/saveLayout" bind:this={formRef} use:enhance={() => {
				saveState = 'saving';
				return async ({ update, result }) => { await update({ reset: false }); saveState = result.type === 'success' ? 'saved' : 'dirty'; };
			}}>
				<input type="hidden" name="layoutJson" value={layoutJson ?? ''} />
				<button type="submit" class="btn-action btn-sm" disabled={!layoutJson}>
					{t.common.save}
				</button>
			</form>
		</div>
	</div>
	{#if form?.error}<div class="save-err" role="alert">{form.error}</div>{/if}

	<div class="editor-wrap">
		<MapEditor
			initialState={initialLayout}
			onchange={onLayoutChange}
			tableTypes={data.tableTypes}
			mode="template"
			{saveState}
			onSave={() => formRef?.requestSubmit()}
			saveLabel={t.common.save}
			protectWallsZones={true}
			allowZones={true}
			lockFloors={true}
			tablesFromTypesOnly={true}
		/>
	</div>
</div>

{#if metaOpen}
	<div class="meta-backdrop" onmousedown={(e) => { if (e.target === e.currentTarget) metaOpen = false; }} role="presentation">
		<div class="meta-dialog" role="dialog">
			<div class="meta-header">
				<h2>{t.hallAdmin.templateDetails}</h2>
				<button class="meta-close" type="button" onclick={() => metaOpen = false} aria-label={t.hallAdmin.close}>
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
				</button>
			</div>
			<form method="POST" action="?/updateMeta" use:enhance={() => async ({ result, update }) => {
				await update({ reset: false });
				if (result.type === 'success') metaOpen = false;
			}}>
				{#if form?.metaError}<div class="meta-err">{form.metaError}</div>{/if}
				<div class="meta-field">
					<label for="meta-name">{t.common.name}</label>
					<input id="meta-name" name="name" bind:value={metaName} placeholder={t.hallAdmin.templateNamePlaceholder} required />
				</div>
				<div class="meta-field">
					<span class="meta-label">{t.hallAdmin.eventTypes}</span>
					<div class="meta-chips">
						{#each EVENT_TYPE_KEYS as key}
							<button type="button" class="meta-chip" class:on={metaTypes.has(key)} onclick={() => toggleMetaType(key)}>
								{t.eventTypes[key]}
							</button>
						{/each}
					</div>
					{#each [...metaTypes] as key}<input type="hidden" name="eventTypes" value={key} />{/each}
				</div>
				<div class="meta-actions">
					<button type="button" class="btn-outline btn-sm" onclick={() => metaOpen = false}>{t.common.cancel}</button>
					<button type="submit" class="btn-action btn-sm" disabled={!metaName.trim()}>{t.hallAdmin.saveDetails}</button>
				</div>
			</form>
		</div>
	</div>
{/if}

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
		padding: 10px 20px;
		border-bottom: 1px solid var(--border);
		background: var(--bg-panel);
		flex-shrink: 0;
	}

	.layout-toolbar h1 {
		font-size: 15px;
		font-weight: 600;
		letter-spacing: -0.03em;
		margin: 0;
	}

	.layout-toolbar .toolbar-actions {
		display: flex;
		gap: 10px;
		align-items: center;
	}

	.editor-wrap {
		flex: 1;
		overflow: hidden;
		position: relative;
	}

	.save-status { font-size: 12px; font-weight: 600; min-width: 90px; text-align: right; }
	.save-status.save-saving { color: var(--text-muted); }
	.save-status.save-dirty  { color: var(--warning); }
	.save-status.save-saved  { color: var(--success); }
	.save-status.save-idle   { color: transparent; }

	/* Edit-details dialog */
	.meta-backdrop {
		position: fixed; inset: 0; z-index: 100; background: rgba(0,0,0,.45);
		backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center;
	}
	.meta-dialog {
		width: 440px; max-width: calc(100vw - 32px);
		background: var(--bg-panel); border: 1px solid var(--border); border-radius: var(--radius-lg);
		box-shadow: var(--shadow);
	}
	.meta-header {
		display: flex; align-items: center; justify-content: space-between;
		padding: 18px 22px 14px; border-bottom: 1px solid var(--border);
	}
	.meta-header h2 {
		font-size: 15px; font-weight: 600; letter-spacing: -0.03em; color: var(--text-base); margin: 0;
	}
	.meta-close {
		width: 28px; height: 28px; border-radius: var(--radius-sm); border: none; background: none;
		color: var(--text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center;
	}
	.meta-close:hover { background: var(--bg-hover); }
	.meta-dialog form { padding: 18px 22px 20px; display: flex; flex-direction: column; gap: 16px; }
	/* A save the server refused (e.g. more tables than the venue owns). */
	.save-err {
		flex-shrink: 0; padding: 9px 16px; font-size: 12.5px; line-height: 1.45;
		background: var(--danger-dim); color: var(--danger); font-weight: 550;
		border-bottom: 1px solid color-mix(in srgb, var(--danger) 25%, transparent);
	}
	.meta-err {
		font-size: 12.5px; color: var(--danger); background: var(--danger-dim);
		border: 1px solid color-mix(in srgb, var(--danger) 25%, transparent);
		border-radius: var(--radius-sm); padding: 8px 12px;
	}
	.meta-field { display: flex; flex-direction: column; gap: 6px; }
	/* A form-control label, not a section overline: it keeps the muted micro-label
	   treatment the rest of the app's forms use. The accent-ink eyebrow is reserved
	   for group overlines (see .meta-label below). */
	.meta-field label {
		font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .12em;
		color: var(--text-muted);
	}
	/* The uppercase overline above the event-type chips — the eyebrow motif. */
	.meta-label {
		font-size: 10px; font-weight: 650; text-transform: uppercase; letter-spacing: .13em;
		line-height: 1.7; color: var(--text-muted);
	}
	.meta-field input {
		padding: 9px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm);
		background: var(--bg-panel2); font-size: 13px; color: var(--text-base);
		font-family: inherit; outline: none; transition: border-color .15s, box-shadow .15s;
	}
	.meta-field input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
	.meta-chips { display: flex; flex-wrap: wrap; gap: 6px; }
	.meta-chip {
		font-size: 12px; font-weight: 600; padding: 6px 12px; border-radius: 3px;
		border: 1px solid var(--border); background: transparent;
		color: var(--text-muted); cursor: pointer;
		transition: background .15s, border-color .15s, color .15s;
	}
	.meta-chip:hover { border-color: var(--accent); background: var(--bg-hover); color: var(--text-base); }
	/* A selected filter chip inverts to ink, matching the .chip.active primitive in
	   app.css and the landing page's occasion filter. */
	.meta-chip.on {
		background: var(--text-base); border-color: var(--text-base); color: var(--bg-panel);
	}
	.meta-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 2px; }
</style>
