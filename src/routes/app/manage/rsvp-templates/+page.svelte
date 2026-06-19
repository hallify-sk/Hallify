<script lang="ts">
	import { enhance } from '$app/forms';
	import { t } from '$lib/i18n.svelte';
	import SectionHeader from '$lib/components/SectionHeader.svelte';
	import type { PageData, ActionData } from './$types';
	import type { RsvpConfig } from '$lib/db/index';

	interface Props { data: PageData; form: ActionData; }
	const { data, form }: Props = $props();

	let showCreate = $state(false);

	function formatDate(d: Date | string) {
		return new Date(d).toLocaleDateString('sk-SK', { day: 'numeric', month: 'short', year: 'numeric' });
	}

	function fieldsCount(config: unknown): number {
		return ((config as RsvpConfig)?.fields ?? []).length;
	}
</script>

<svelte:head><title>{t.rsvpTemplates.title} – Hallify</title></svelte:head>

<div class="page">
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
		<div class="card create-card">
			<h2>{t.rsvpTemplates.createTemplate}</h2>
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
		</div>
	{/if}

	<div class="card table-section">
		<div class="table-header">
			<h2>{t.rsvpTemplates.templateOverview}</h2>
			<span class="muted">{data.templates.length} {data.templates.length === 1 ? 'template' : 'templates'}</span>
		</div>
		<div class="table-wrap">
			<table>
				<thead>
					<tr>
						<th>{t.common.name}</th>
						<th>{t.rsvpTemplates.eventType}</th>
						<th>{t.rsvpTemplates.fieldsCount}</th>
						<th>{t.common.created}</th>
						<th>{t.common.actions}</th>
					</tr>
				</thead>
				<tbody>
					{#each data.templates as tmpl}
						<tr>
							<td>
								<a href="/app/manage/rsvp-templates/{tmpl.id}" class="row-link">{tmpl.name}</a>
							</td>
							<td class="muted">
								{#if tmpl.event_type}
									{(t.eventTypes as Record<string, string>)[tmpl.event_type] ?? tmpl.event_type}
								{:else}
									—
								{/if}
							</td>
							<td class="muted">{fieldsCount(tmpl.config)}</td>
							<td class="muted">{formatDate(tmpl.created_at)}</td>
							<td>
								<div class="action-row">
									<a href="/app/manage/rsvp-templates/{tmpl.id}" class="btn-outline btn-sm">{t.common.edit}</a>
									<form method="POST" action="?/delete" use:enhance
										onsubmit={(e) => { if (!confirm(`${t.rsvpTemplates.confirmDelete} "${tmpl.name}"?`)) e.preventDefault(); }}>
										<input type="hidden" name="id" value={tmpl.id} />
										<button type="submit" class="btn-sm btn-danger">{t.common.delete}</button>
									</form>
								</div>
							</td>
						</tr>
					{/each}
					{#if data.templates.length === 0}
						<tr><td colspan="5" class="empty-cell">{t.common.noData}</td></tr>
					{/if}
				</tbody>
			</table>
		</div>
	</div>
</div>

<style>
	.page { padding: 28px 32px; }
	.page-actions { display: flex; justify-content: flex-end; margin-bottom: 20px; }
	.create-card { margin-bottom: 20px; }
	.create-card h2 { font-size: 15px; font-weight: 600; margin-bottom: 16px; }
	.field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
	.form-actions { display: flex; justify-content: flex-end; gap: 8px; }
	.table-section { margin-bottom: 20px; }
	.table-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
	.table-header h2 { font-size: 15px; font-weight: 600; }
	.table-wrap { overflow-x: auto; }
	table { width: 100%; border-collapse: collapse; }
	th {
		text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase;
		letter-spacing: 0.06em; color: var(--text-muted); padding: 10px 12px;
		background: var(--bg-panel2); border-bottom: 1px solid var(--border); white-space: nowrap;
	}
	th:first-child { border-radius: 8px 0 0 0; }
	th:last-child { border-radius: 0 8px 0 0; }
	td { padding: 12px; font-size: 14px; border-bottom: 1px solid var(--border); }
	tr:last-child td { border-bottom: none; }
	tr:hover td { background: var(--bg-panel2); }
	.muted { color: var(--text-muted); font-size: 13px; }
	.row-link { font-weight: 600; color: var(--text-base); text-decoration: none; }
	.row-link:hover { color: var(--accent); }
	.empty-cell { text-align: center; padding: 40px !important; color: var(--text-muted); }
	.action-row { display: flex; gap: 6px; align-items: center; }
	.alert-error {
		background: #fef2f2; border: 1px solid #fecaca; color: var(--danger);
		border-radius: 8px; padding: 10px 14px; font-size: 13px; margin-bottom: 14px;
	}
</style>
