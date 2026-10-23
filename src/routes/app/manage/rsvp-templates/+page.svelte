<script lang="ts">
	import { enhance } from '$app/forms';
	import { t, getLocale } from '$lib/i18n.svelte';
	import { formatDate as fmtLocaleDate } from '$lib/format';
	import SectionHeader from '$lib/components/SectionHeader.svelte';
	import type { PageData, ActionData } from './$types';
	import type { RsvpConfig } from '$lib/db/index';

	interface Props { data: PageData; form: ActionData; }
	const { data, form }: Props = $props();

	let showCreate = $state(false);

	function formatDate(d: string) {
		return fmtLocaleDate(d, getLocale());
	}

	function fieldsCount(config: unknown): number {
		return ((config as RsvpConfig)?.fields ?? []).length;
	}
</script>

<svelte:head><title>{t.rsvpTemplates.title} – Hallify</title></svelte:head>

<div class="wrap page">
	<SectionHeader overline={t.rsvpTemplates.manage} title={t.rsvpTemplates.title} />

	<div class="page-actions">
		<button onclick={() => showCreate = !showCreate} class="btn-action">
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
				<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
			</svg>
			{t.rsvpTemplates.addTemplate}
		</button>
	</div>

	{#if showCreate}
		<section class="section section--lead">
			<div class="section-head">
				<h2>{t.rsvpTemplates.createTemplate}</h2>
			</div>
			{#if form?.error}
				<div class="alert-error">{form.error}</div>
			{/if}
			<form method="POST" action="?/create" use:enhance={() => {
				return async ({ result, update }) => {
					await update();
					if (result.type === 'redirect') showCreate = false;
				};
			}}>
				<div class="field-row">
					<div class="field">
						<label for="name">{t.rsvpTemplates.templateName} *</label>
						<input id="name" name="name" type="text" required
							placeholder={t.rsvpTemplates.templateNamePlaceholder} />
					</div>
					<div class="field">
						<label for="event_type">{t.rsvpTemplates.eventType}</label>
						<select id="event_type" name="event_type">
							<option value="">—</option>
							{#each Object.entries(t.eventTypes) as [key, label]}
								<option value={key}>{label}</option>
							{/each}
						</select>
					</div>
				</div>
				<div class="form-actions">
					<button type="button" onclick={() => showCreate = false} class="btn-outline">
						{t.common.cancel}
					</button>
					<button type="submit" class="btn-action">
						{t.rsvpTemplates.createTemplate}
					</button>
				</div>
			</form>
		</section>
	{/if}

	<!-- Template list: no cover image on a template, so hairline rows, not a media grid. -->
	<section class="section" class:section--lead={!showCreate}>
		<div class="section-head section-head--row">
			<h2>{t.rsvpTemplates.templateOverview}</h2>
			<span class="muted">{data.templates.length} {data.templates.length === 1 ? 'template' : 'templates'}</span>
		</div>

		<div class="row-head">
			<span>{t.common.name}</span>
			<span>{t.rsvpTemplates.eventType}</span>
			<span>{t.rsvpTemplates.fieldsCount}</span>
			<span>{t.common.created}</span>
			<span>{t.common.actions}</span>
		</div>

		<div class="row-list">
			{#each data.templates as tmpl}
				<div class="row-item tmpl-row">
					<span class="col-name">
						<a href="/app/manage/rsvp-templates/{tmpl.id}" class="row-link">{tmpl.name}</a>
					</span>
					<span class="muted">
						{#if tmpl.event_type}
							{(t.eventTypes as Record<string, string>)[tmpl.event_type] ?? tmpl.event_type}
						{:else}
							—
						{/if}
					</span>
					<span class="muted">{fieldsCount(tmpl.config)}</span>
					<span class="muted">{formatDate(tmpl.created_at)}</span>
					<span class="action-row">
						<a href="/app/manage/rsvp-templates/{tmpl.id}" class="btn-outline btn-sm">{t.common.edit}</a>
						<form method="POST" action="?/delete" use:enhance
							onsubmit={(e) => { if (!confirm(`${t.rsvpTemplates.confirmDelete} "${tmpl.name}"?`)) e.preventDefault(); }}>
							<input type="hidden" name="id" value={tmpl.id} />
							<button type="submit" class="btn-sm btn-danger">{t.common.delete}</button>
						</form>
					</span>
				</div>
			{/each}
			{#if data.templates.length === 0}
				<div class="card--inset empty-state">
					<span class="icon-tile" aria-hidden="true">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
					</span>
					<h3>{t.common.noData}</h3>
				</div>
			{/if}
		</div>
	</section>
</div>

<style>
	.page { padding: 28px 0; }
	.page-actions { display: flex; justify-content: flex-end; margin-bottom: 20px; }
	.field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
	.form-actions { display: flex; justify-content: flex-end; gap: 8px; }

	/* One column rhythm for the header strip and the rows beneath it. */
	.row-head,
	.tmpl-row {
		display: grid;
		grid-template-columns: minmax(180px, 2fr) minmax(120px, 1.2fr) 100px 140px auto;
		align-items: center;
		gap: 14px;
	}
	.row-head {
		padding: 0 0 8px;
		border-bottom: 1px solid var(--border);
		font-size: 11px; font-weight: 650;
		text-transform: uppercase; letter-spacing: 0.06em;
		color: var(--text-muted); white-space: nowrap;
	}
	.tmpl-row { font-size: 14px; line-height: 1.5; }
	.tmpl-row:hover { background: var(--bg-hover); }

	.muted { color: var(--text-muted); font-size: 13px; }
	.col-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
	.row-link { font-weight: 600; color: var(--text-base); text-decoration: none; }
	.row-link:hover { color: var(--accent-ink); }
	.action-row { display: flex; gap: 6px; align-items: center; justify-content: flex-end; }

	.empty-state { display: flex; align-items: center; gap: 16px; }
	.empty-state h3 { font-size: 14px; font-weight: 600; letter-spacing: -.03em; margin: 0; }

	.alert-error {
		background: var(--danger-dim);
		border: 1px solid color-mix(in srgb, var(--danger) 25%, transparent);
		color: var(--danger);
		border-radius: var(--radius-sm); padding: 10px 14px; font-size: 13px; margin-bottom: 14px;
	}

	@media (max-width: 900px) {
		.row-head { display: none; }
		.tmpl-row { grid-template-columns: 1fr auto; row-gap: 6px; }
	}
</style>
