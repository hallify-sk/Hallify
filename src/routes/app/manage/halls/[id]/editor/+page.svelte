<script lang="ts">
	import { enhance } from '$app/forms';
	import { t } from '$lib/i18n';
	import MapEditor from '$lib/MapEditor.svelte';
	import type { PageData, ActionData } from './$types';

	interface Props { data: PageData; form: ActionData; }
	const { data, form }: Props = $props();

	let floorplanJson = $state('');
	let templateName = $state('');
	let templateEventType = $state('');
	let showSaveTemplate = $state(false);

	const EVENT_TYPES_MAP: Record<string, string> = {
		Wedding: t.eventTypes.wedding,
		Ball: t.eventTypes.ball,
		Conference: t.eventTypes.conference,
		Birthday: t.eventTypes.birthday,
		Other: t.eventTypes.other,
	};

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
			{#if floorplanJson}
				<button onclick={() => showSaveTemplate = !showSaveTemplate} class="btn-outline btn-sm">
					{t.halls.templates}…
				</button>
			{/if}
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

	{#if showSaveTemplate}
		<div class="template-save-bar">
			<form method="POST" action="?/saveTemplate" use:enhance
				onsubmit={() => { showSaveTemplate = false; templateName = ''; }}>
				<input type="hidden" name="layoutJson" value={floorplanJson} />
				<input name="templateName" type="text" bind:value={templateName}
					placeholder={t.common.name} style="width:200px" required />
				<select name="eventType" bind:value={templateEventType} style="width:160px">
					<option value="">{t.createEvent.eventType}</option>
					{#each Object.entries(EVENT_TYPES_MAP) as [key, label]}
						<option value={key}>{label}</option>
					{/each}
				</select>
				<button type="submit" class="btn-action btn-sm" disabled={!templateName}>{t.common.save}</button>
				<button type="button" onclick={() => showSaveTemplate = false} class="btn-outline btn-sm">{t.common.cancel}</button>
			</form>
			{#if form?.templateError}
				<span class="error-msg">{form.templateError}</span>
			{/if}
		</div>
	{/if}

	<!-- Editor fills remaining space -->
	<div class="editor-body">
		<MapEditor
			initialState={data.hall.floorplan_json}
			onchange={onFloorplanChange}
			tableTypes={data.tableTypes}
			hiddenTools={['table']}
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
		color: var(--text-base);
		text-decoration: none;
	}

	.back-link:hover { color: var(--accent); text-decoration: none; }

	.topbar-actions {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.template-save-bar {
		padding: 8px 16px;
		border-bottom: 1px solid var(--border);
		background: var(--bg-panel2);
		flex-shrink: 0;
	}

	.template-save-bar form {
		display: flex;
		gap: 8px;
		align-items: center;
		flex-wrap: wrap;
	}

	.success-msg { font-size: 12px; color: var(--success); font-weight: 600; }
	.error-msg { font-size: 12px; color: var(--danger); }

	.editor-body {
		flex: 1;
		overflow: hidden;
	}
</style>
