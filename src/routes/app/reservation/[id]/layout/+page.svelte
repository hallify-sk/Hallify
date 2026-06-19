<script lang="ts">
	import MapEditor from '$lib/MapEditor.svelte';
	import { enhance } from '$app/forms';
	import { t } from '$lib/i18n.svelte';
	import { EVENT_TYPE_KEYS } from '$lib/eventTypes';
	import type { PageData, ActionData } from './$types';

	interface Props { data: PageData; form: ActionData; }
	const { data }: Props = $props();

	const numGuests = data.reservation.num_guests ?? null;

	let currentInitial = $state<unknown>(data.initialLayout ?? null);
	let editorKey = $state(0);

	let layoutJson = $state<string | null>(currentInitial ? JSON.stringify(currentInitial) : null);
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

	// ── Template picker + recommendation (by event type, then closest guest→seat match) ──
	let pickerOpen = $state(false);
	let tmplSearch = $state('');
	let selectedType = $state<string>('');
	let pickTemplateId = $state('');
	let pickerFormRef: HTMLFormElement | undefined = $state();

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
</script>

<svelte:head><title>{data.reservation.title} — {t.event.layoutEditorTitle} – Hallify</title></svelte:head>

<div class="layout-page">
	<div class="layout-toolbar">
		<a href="/app/reservation/{data.reservation.id}" class="btn-outline btn-sm">
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<polyline points="15 18 9 12 15 6"/>
			</svg>
			{t.event.backToDetail}
		</a>

		<h1>{data.reservation.title} — {t.event.layoutEditorTitle}</h1>

		<div class="toolbar-actions">
			{#if data.templates.length > 0}
				<div class="tmpl-picker">
					<button type="button" class="btn-outline btn-sm" onclick={() => pickerOpen = !pickerOpen}>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
						{t.halls.templates}
					</button>
					{#if pickerOpen}
						<button type="button" class="tmpl-backdrop" onclick={() => pickerOpen = false} aria-label={t.myRes.close}></button>
						<div class="tmpl-dropdown">
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
							<div class="tmpl-list">
								{#each rankedTemplates as { tm } (tm.id)}
									<button type="button" class="tmpl-item" class:recommended={tm.id === recommendedId} onclick={() => chooseTemplate(tm.id)}>
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
				<form method="POST" action="?/loadTemplate" bind:this={pickerFormRef} use:enhance={() => {
					return async ({ result }) => {
						if (result.type === 'success' && result.data?.layout) {
							currentInitial = result.data.layout;
							layoutJson = JSON.stringify(result.data.layout);
							editorKey++;
							saveState = 'saved';
						}
					};
				}}>
					<input type="hidden" name="templateId" value={pickTemplateId} />
				</form>
			{/if}

			<span class="save-status save-{saveState}">
				{#if saveState === 'saving'}{t.myRes.saving}
				{:else if saveState === 'dirty'}{t.myRes.unsavedChanges}
				{:else if saveState === 'saved'}{t.myRes.allChangesSaved}{/if}
			</span>
			<form method="POST" action="?/saveLayout" bind:this={formRef} use:enhance={() => {
				saveState = 'saving';
				return async ({ update }) => { await update({ reset: false }); saveState = 'saved'; };
			}}>
				<input type="hidden" name="layoutJson" value={layoutJson ?? ''} />
				<button type="submit" class="btn-action btn-sm" disabled={!layoutJson}>
					{t.event.saveLayout}
				</button>
			</form>
		</div>
	</div>

	<div class="editor-wrap">
		{#key editorKey}
			<MapEditor
				initialState={currentInitial}
				onchange={onLayoutChange}
				tableTypes={data.tableTypes}
				hiddenTools={data.tableTypes.length ? ['wall', 'bounds'] : ['wall', 'bounds', 'table']}
				protectWallsZones={true}
				allowZones={true}
				lockFloors={true}
				tablesFromTypesOnly={true}
			/>
		{/key}
	</div>
</div>

<style>
	.layout-page {
		display: flex;
		flex-direction: column;
		height: 100vh;
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
	.save-status.save-dirty  { color: var(--warning, #b45309); }
	.save-status.save-saved  { color: var(--success, #16a34a); }
	.save-status.save-idle   { color: transparent; }

	/* Template picker */
	.tmpl-picker { position: relative; }
	.tmpl-backdrop { position: fixed; inset: 0; z-index: 40; background: transparent; border: none; cursor: default; }
	.tmpl-dropdown {
		position: absolute; top: calc(100% + 6px); right: 0; z-index: 50; width: 320px;
		background: var(--bg-panel); border: 1px solid var(--border); border-radius: 10px;
		box-shadow: 0 8px 28px rgba(0,0,0,.18); padding: 10px; display: flex; flex-direction: column; gap: 8px;
	}
	.tmpl-search {
		width: 100%; padding: 7px 10px; font-size: 13px; border-radius: 7px;
		border: 1px solid var(--border); background: var(--bg-base); color: var(--text-base);
	}
	.tmpl-typefilter { display: flex; flex-wrap: wrap; gap: 4px; }
	.tf-chip {
		font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 999px;
		border: 1px solid var(--border); background: transparent; color: var(--text-muted); cursor: pointer;
	}
	.tf-chip:hover { border-color: var(--accent); }
	.tf-chip.on { background: var(--accent); border-color: var(--accent); color: #fff; }
	.tmpl-guesthint { margin: 0; font-size: 11.5px; color: var(--text-muted); }
	.tmpl-guesthint strong { color: var(--text-base); }
	.tmpl-list { display: flex; flex-direction: column; gap: 2px; max-height: 280px; overflow-y: auto; }
	.tmpl-item {
		display: flex; flex-direction: column; gap: 3px;
		width: 100%; text-align: left; padding: 8px 10px; border: 1px solid transparent; border-radius: 7px;
		background: transparent; cursor: pointer; color: var(--text-base);
	}
	.tmpl-item:hover { background: var(--bg-hover); }
	.tmpl-item.recommended { border-color: color-mix(in srgb, var(--accent) 45%, var(--border)); background: var(--accent-dim); }
	.tmpl-item-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
	.tmpl-item-name { font-size: 13px; font-weight: 600; }
	.tmpl-rec {
		font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em;
		color: #fff; background: var(--accent); padding: 2px 6px; border-radius: 5px; flex-shrink: 0;
	}
	.tmpl-item-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; }
	.tmpl-seats { font-size: 11px; font-weight: 600; color: var(--text-muted); }
	.tmpl-item-type {
		font-size: 9.5px; font-weight: 700; color: var(--accent); text-transform: uppercase; letter-spacing: .04em;
		background: var(--accent-dim); padding: 1px 5px; border-radius: 4px;
	}
	.tmpl-empty { margin: 6px; font-size: 12.5px; color: var(--text-muted); text-align: center; }
	.tmpl-note { margin: 2px 2px 0; font-size: 11px; color: var(--text-muted); }
</style>
