<script lang="ts">
	import MapEditor from '$lib/MapEditor.svelte';
	import { enhance } from '$app/forms';
	import { t } from '$lib/i18n';
	import type { PageData, ActionData } from './$types';

	interface Props { data: PageData; form: ActionData; }
	const { data, form }: Props = $props();

	const initialLayout = data.reservation.layout_json ?? data.reservation.hall_floorplan_json ?? null;

	let layoutJson = $state<string | null>(initialLayout ? JSON.stringify(initialLayout) : null);
	let saved = $state(false);

	function onLayoutChange(json: string) {
		layoutJson = json;
		saved = false;
	}

	$effect(() => {
		if (form?.success) {
			saved = true;
			setTimeout(() => (saved = false), 3000);
		}
	});
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
			{#if saved}
				<span class="saved-indicator">{t.event.saveLayout} &#10003;</span>
			{/if}
			<form method="POST" use:enhance>
				<input type="hidden" name="layoutJson" value={layoutJson ?? ''} />
				<button type="submit" class="btn-action btn-sm" disabled={!layoutJson}>
					{t.event.saveLayout}
				</button>
			</form>
		</div>
	</div>

	<div class="editor-wrap">
		<MapEditor
			initialState={initialLayout}
			onchange={onLayoutChange}
			tableTypes={data.tableTypes}
			hiddenTools={['wall', 'zone', 'bounds']}
			protectWallsZones={true}
		/>
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

	.saved-indicator {
		font-size: 12px;
		color: var(--success);
		font-weight: 600;
	}
</style>
