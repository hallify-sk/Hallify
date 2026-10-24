<script lang="ts">
	import { pageTitle } from '$lib/page-title';
	import { enhance } from '$app/forms';
	import { t, getLocale } from '$lib/i18n.svelte';
	import { formatDate, timeAgo } from '$lib/format';
	import { confirmFirst } from '$lib/forms';
	import type { PageData, ActionData } from './$types';

	interface Props { data: PageData; form: ActionData; }
	const { data, form }: Props = $props();
</script>

<svelte:head><title>{pageTitle(t.mcp.connectionsTitle)}</title></svelte:head>

<div class="wrap connections-wrap">
	<section class="section section--lead">
		<a class="back" href="/app/profile">← {t.mcp.backToProfile}</a>
		<div class="section-head">
			<h1>{t.mcp.connectionsTitle}</h1>
			<p>{t.mcp.connectionsLead}</p>
		</div>

		<div class="server">
			<span class="server-label">{t.mcp.serverUrl}</span>
			<code class="server-url">{data.serverUrl}</code>
			<a class="server-help" href="/app/manage/help/connect-ai-assistant">{t.mcp.howTo}</a>
		</div>
	</section>

	<section class="section">
		{#if form && 'revoked' in form && form.revoked}<div class="alert-success" role="status">{t.mcp.revoked}</div>{/if}
		{#if form && 'error' in form && form.error}<div class="alert-error" role="alert">{form.error}</div>{/if}

		{#if data.connections.length}
			<div class="row-list">
				{#each data.connections as c (c.id)}
					<div class="row-item conn">
						<div class="conn-main">
							<strong class="conn-name">{c.client_name}</strong>
							<span class="conn-meta">
								{#if c.redirect_host}{c.redirect_host} · {/if}
								<span class="access" class:write={c.writes}>{c.writes ? t.mcp.accessReadWrite : t.mcp.accessReadOnly}</span>
							</span>
							<span class="conn-meta">
								{t.mcp.connected} {formatDate(c.created_at, getLocale())} ·
								{t.mcp.lastUsed}: {c.last_used_at ? timeAgo(c.last_used_at, getLocale()) : t.mcp.neverUsed}
							</span>
						</div>
						<form method="POST" action="?/revoke" use:enhance={confirmFirst(() => t.mcp.confirmRevoke)}>
							<input type="hidden" name="id" value={c.id} />
							<button type="submit" class="btn-danger">{t.mcp.revoke}</button>
						</form>
					</div>
				{/each}
			</div>
		{:else}
			<p class="empty">{t.mcp.connectionsNone}</p>
		{/if}
	</section>
</div>

<style>
	.connections-wrap { --page-max: 900px; }
	.back { display: inline-block; font-size: 12px; color: var(--text-muted); margin-bottom: 14px; }
	h1 { font-size: var(--display-size); font-weight: 550; letter-spacing: -0.055em; margin: 0 0 8px; }

	.server {
		display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px;
		padding: 12px 14px; border: 1px solid var(--border); border-radius: var(--radius-sm); margin-top: 6px;
	}
	.server-label { font-size: 12px; font-weight: 600; color: var(--text-muted); }
	.server-url {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; color: var(--text-base);
		user-select: all; overflow-wrap: anywhere; min-width: 0;
	}
	.server-help { font-size: 12px; margin-left: auto; }

	.conn { justify-content: space-between; flex-wrap: wrap; }
	.conn-main { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1 1 260px; }
	.conn-name { font-size: 14px; font-weight: 600; color: var(--text-base); overflow-wrap: anywhere; }
	.conn-meta { font-size: 12px; color: var(--text-muted); overflow-wrap: anywhere; }
	.access { font-weight: 600; }
	.access.write { color: var(--warning, var(--accent-ink)); }
	.empty { font-size: 13px; color: var(--text-muted); margin: 0; }

	@media (max-width: 560px) {
		.server-help { margin-left: 0; }
	}
</style>
