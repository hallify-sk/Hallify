<script lang="ts">
	import { enhance } from '$app/forms';
	import { t } from '$lib/i18n.svelte';
	import MapEditor from '$lib/MapEditor.svelte';
	import type { PageData, ActionData } from './$types';

	interface Props { data: PageData; form: ActionData; }
	const { data, form }: Props = $props();

	let floorplanJson = $state('');

	function onFloorplanChange(json: string) {
		floorplanJson = json;
	}
</script>

<svelte:head><title>{t.halls.floorplan} – {data.hall.name} – Hallify</title></svelte:head>

<div class="editor-page">
	<!-- Top bar -->
	<div class="editor-topbar">
		<a href="/app/manage/halls/{data.hall.id}" class="back-link">
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<polyline points="15 18 9 12 15 6"/>
			</svg>
			{data.hall.name}
		</a>
		<div class="topbar-actions">
			<form method="POST" action="?/saveFloorplan" use:enhance>
				<input type="hidden" name="floorplanJson" value={floorplanJson} />
				<button type="submit" class="btn-action btn-sm" disabled={!floorplanJson}>
					{t.common.save} {t.halls.floorplan.toLowerCase()}
				</button>
			</form>
			{#if form?.success}
				<span class="success-msg">✓</span>
			{/if}
		</div>
	</div>

	<!-- Editor fills remaining space -->
	<div class="editor-body">
		<MapEditor
			initialState={data.hall.floorplan_json}
			onchange={onFloorplanChange}
			tableTypes={data.tableTypes}
			hiddenTools={['table', 'chair']}
		/>
	</div>
</div>

<style>
	.editor-page {
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow: hidden;
	}

	.editor-topbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
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
	}

	.success-msg { font-size: 12px; color: var(--success); font-weight: 600; }

	.editor-body {
		flex: 1;
		overflow: hidden;
	}
</style>
