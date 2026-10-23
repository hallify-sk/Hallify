<script lang="ts">
	import { venueTitle } from '$lib/page-title';
	import MapEditor from '$lib/MapEditor.svelte';
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { untrack } from 'svelte';
	import { LayoutSaver, guardUnsaved } from '$lib/editor/layout-saver.svelte';
	import { t } from '$lib/i18n.svelte';
	import { dialog } from '$lib/actions/dialog';
	import { EVENT_TYPE_KEYS } from '$lib/eventTypes';
	import type { PageData } from './$types';

	interface Props { data: PageData; }
	const { data }: Props = $props();

	const numGuests = untrack(() => data.reservation.numGuests);

	let currentInitial = $state<unknown>(untrack(() => data.initialLayout ?? null));
	let editorKey = $state(0);

	// Autosave shortly after the last change; the last edits are saved (or the
	// browser asks) on the way out.
	const saver = new LayoutSaver({ action: '?/saveLayout', field: 'layoutJson', failedMessage: () => t.editor.saveFailed });
	guardUnsaved(saver, { leaveUnsaved: () => t.editor.leaveUnsaved, leaveFailed: () => t.editor.leaveSaveFailed });

	function rebuild(layout: unknown, opts: { dirty?: boolean; savedOnce?: boolean } = {}) {
		currentInitial = layout;
		saver.reset(opts);
		editorKey++;
	}

	// ── Template picker + recommendation ──
	// Customers are recommended layouts by (1) event type, then (2) the template whose
	// seat count is closest to the reservation's guest count ("closest match wins").
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

	// The single best pick — only flagged when we ranked on a real signal.
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
					// Where the venue fixes the tables, the previous arrangement could not be
					// saved back, so there is nothing to undo to.
					undo: data.tablesLocked ? null : before
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

<svelte:head><title>{venueTitle(data.domainOrg?.name, data.reservation.title, t.event.tableLayout)}</title></svelte:head>

<div class="layout-page">
	<div class="layout-toolbar">
		<a href="/halls/my-reservations/{data.reservation.id}" class="btn-outline btn-sm">
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
			{t.myRes.backToEvent}
		</a>

		<h1>{data.reservation.title} — {t.event.tableLayout}</h1>

		<div class="toolbar-actions">
			{#if data.templates.length > 0}
				<div class="tmpl-picker">
					<button type="button" class="btn-outline btn-sm" onclick={() => pickerOpen = !pickerOpen} disabled={applying}>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
						{t.myRes.startFromTemplate}
					</button>
					{#if pickerOpen}
						<button type="button" class="tmpl-backdrop" onclick={() => pickerOpen = false} aria-label={t.myRes.close}></button>
						<div class="tmpl-dropdown" role="dialog" aria-label={t.myRes.startFromTemplate} use:dialog={{ onclose: () => (pickerOpen = false) }}>
							<input class="tmpl-search" type="text" bind:value={tmplSearch} placeholder={t.myRes.searchTemplates} aria-label={t.myRes.searchTemplates} />
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
											<span class="tmpl-seats">{tm.seats} {t.units.seats(tm.seats)}</span>
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

			<span class="save-status save-{saver.state}">
				{#if saver.state === 'saving'}{t.myRes.saving}
				{:else if saver.state === 'dirty'}{t.myRes.unsavedChanges}
				{:else if saver.state === 'saved'}{t.myRes.allChangesSaved}{/if}
			</span>
			<button type="button" class="btn-action btn-sm" disabled={saver.json === null || saver.saving} onclick={() => saver.save({ force: true })}>{t.event.saveLayout}</button>
		</div>
	</div>
	{#if errorText}<div class="save-err" role="alert">{errorText}</div>{/if}
	{#if tmplNotice}
		<div class="tmpl-notice" role="status">
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
				mode={data.tablesLocked ? 'seating' : 'event'}
				saveState={saver.state}
				onSave={() => saver.save({ force: true })}
				saveLabel={t.event.saveLayout}
				printHref={`/halls/my-reservations/${data.reservation.id}/manifest`}
				protectWallsZones={true}
				allowZones={true}
				lockFloors={true}
				tablesFromTypesOnly={true}
				allowGuests={true}
				lockTables={data.tablesLocked}
				lockedZoneIds={data.hallZoneIds}
				audience="client"
			/>
		{/key}
	</div>
</div>

<style>
	/* The venue site pads its main column for reading pages (30px 28px 48px). A
	   100vh editor inside that padding ran 78px past the bottom of the window, so the
	   step buttons ("Ďalej") were cut off. The editor takes the padding back and is
	   exactly one window tall. */
	.layout-page {
		display: flex; flex-direction: column; overflow: hidden;
		margin: -30px -28px -48px; height: 100vh; height: 100dvh;
	}
	@container b-shell (max-width: 760px) {
		/* The site's rail becomes a bar above; the editor shows its small-screen view. */
		.layout-page { margin: -22px -18px -40px; height: auto; min-height: 70vh; }
	}
	.layout-toolbar {
		display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px 12px;
		padding: 10px 20px; border-bottom: 1px solid var(--border); background: var(--bg-panel); flex-shrink: 0;
	}
	.layout-toolbar h1 { font-size: 15px; font-weight: 550; letter-spacing: -.03em; margin: 0; min-width: 0; overflow-wrap: anywhere; }
	.toolbar-actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
	.tmpl-notice {
		display: flex; align-items: center; gap: 10px; flex-shrink: 0;
		padding: 9px 16px; font-size: 12.5px; line-height: 1.45;
		background: var(--accent-dim); color: var(--text-base);
		border-bottom: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
	}
	.tmpl-notice-text { flex: 1; min-width: 0; }
	.notice-close {
		border: 0; background: none; color: var(--text-muted); cursor: pointer; font: inherit; font-size: 13px;
		padding: 2px 6px; border-radius: var(--radius-sm);
	}
	.notice-close:hover { background: var(--bg-hover); color: var(--text-base); }
	.editor-wrap { flex: 1; overflow: hidden; position: relative; }
	/* A save the server refused (e.g. more tables than the venue owns). */
	.save-err {
		flex-shrink: 0; padding: 9px 16px; font-size: 12.5px; line-height: 1.45;
		background: var(--danger-dim); color: var(--danger); font-weight: 550;
		border-bottom: 1px solid color-mix(in srgb, var(--danger) 25%, transparent);
	}
	.save-status { font-size: 12px; font-weight: 600; min-width: 90px; text-align: right; }
	.save-status.save-saving { color: var(--text-muted); }
	.save-status.save-dirty  { color: var(--warning); }
	.save-status.save-saved  { color: var(--success); }
	.save-status.save-idle   { color: transparent; }

	/* Template picker */
	.tmpl-picker { position: relative; }
	.tmpl-backdrop { position: fixed; inset: 0; z-index: 40; background: transparent; border: none; cursor: default; }
	/* A genuinely floating popover, so it keeps a shadow rather than a hairline. */
	.tmpl-dropdown {
		position: absolute; top: calc(100% + 6px); right: 0; z-index: 50; width: 320px;
		background: var(--bg-panel); border: 1px solid var(--border); border-radius: var(--radius-lg);
		box-shadow: var(--shadow); padding: 12px; display: flex; flex-direction: column; gap: 9px;
	}
	.tmpl-search {
		width: 100%; padding: 8px 12px; font-size: 13px; border-radius: var(--radius-sm);
		border: 1px solid var(--border); background: var(--bg-panel2); color: var(--text-base);
		outline: none; transition: border-color .15s, box-shadow .15s;
	}
	.tmpl-search:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
	.tmpl-typefilter { display: flex; flex-wrap: wrap; gap: 4px; }
	.tf-chip {
		font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 3px;
		border: 1px solid var(--border); background: transparent; color: var(--text-muted); cursor: pointer;
		transition: background .15s, border-color .15s, color .15s;
	}
	.tf-chip:hover { border-color: var(--accent); color: var(--text-base); }
	/* Selected chip sits ON the accent fill, so its label takes --accent-contrast. */
	.tf-chip.on { background: var(--accent); border-color: var(--accent); color: var(--accent-contrast); }
	.tmpl-guesthint { margin: 0; font-size: 11.5px; color: var(--text-muted); }
	/* <strong> would otherwise take the UA bold (700 in Chrome, bolder/900 in
	   Firefox), which the type scale forbids. */
	.tmpl-guesthint strong { color: var(--text-base); font-weight: 650; }
	.tmpl-list { display: flex; flex-direction: column; gap: 2px; max-height: 280px; overflow-y: auto; }
	.tmpl-item {
		display: flex; flex-direction: column; gap: 4px;
		width: 100%; text-align: left; padding: 9px 11px; border: 1px solid transparent; border-radius: var(--radius);
		background: transparent; cursor: pointer; color: var(--text-base);
		transition: background .15s, border-color .15s;
	}
	.tmpl-item:hover { background: var(--bg-hover); }
	.tmpl-item.recommended { border-color: color-mix(in srgb, var(--accent) 45%, var(--border)); background: var(--accent-dim); }
	.tmpl-item-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
	.tmpl-item-name { font-size: 13px; font-weight: 600; letter-spacing: -.03em; }
	/* Badge ON the accent fill → --accent-contrast. */
	.tmpl-rec {
		font-size: 9.5px; font-weight: 650; text-transform: uppercase; letter-spacing: .08em;
		color: var(--accent-contrast); background: var(--accent); padding: 2px 7px; border-radius: var(--radius-sm); flex-shrink: 0;
	}
	.tmpl-item-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; }
	.tmpl-seats { font-size: 11px; font-weight: 600; color: var(--text-muted); }
	/* Badge on the accent tint → --accent-ink. */
	.tmpl-item-type {
		font-size: 9.5px; font-weight: 650; color: var(--accent-ink); text-transform: uppercase; letter-spacing: .08em;
		background: var(--accent-dim); padding: 1px 6px; border-radius: var(--radius-sm);
	}
	/* A recommended row is itself filled with --accent-dim, so the badge's own
	   --accent-dim background disappears into it. Lift it onto the panel surface. */
	.tmpl-item.recommended .tmpl-item-type { background: var(--bg-panel); }
	.tmpl-empty { margin: 6px; font-size: 12.5px; color: var(--text-muted); text-align: center; }
	.tmpl-note { margin: 2px 2px 0; font-size: 11px; color: var(--text-muted); }
</style>
