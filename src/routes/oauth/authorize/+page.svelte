<script lang="ts">
	import { pageTitle } from '$lib/page-title';
	import { t } from '$lib/i18n.svelte';
	import AuthShell from '$lib/components/AuthShell.svelte';
	import type { PageData, ActionData } from './$types';

	interface Props { data: PageData; form: ActionData; }
	const { data, form }: Props = $props();
</script>

<svelte:head>
	<title>{pageTitle(t.mcp.consentTitle)}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<AuthShell>
	{#if data.state === 'consent'}
		<div class="auth-header">
			<p class="eyebrow">{t.mcp.consentTitle}</p>
			<h1>{t.mcp.consentLead(data.client.name)}</h1>
			<p class="subtitle">{t.mcp.returnsTo} <strong class="host">{data.client.host}</strong></p>
			<p class="warn">{t.mcp.selfNamed}</p>
		</div>

		{#if form?.error}<div class="notice notice-error" role="alert">{form.error}</div>{/if}

		<div class="who">
			<span class="who-label">{t.mcp.signedInAs}</span>
			<span class="who-name">{data.user.name}</span>
			<span class="who-email">{data.user.email}</span>
		</div>

		<!-- Plain forms (no enhance): the approval ends in a redirect to the agent,
		     which the page's CSP form-action allows for this one origin. -->
		<form method="POST" action="?/approve" class="consent-form">
			{#each Object.entries(data.params) as [name, value] (name)}
				<input type="hidden" {name} {value} />
			{/each}

			<h2 class="block-title">{t.mcp.accessTitle}</h2>
			<ul class="access">
				<li>{t.mcp.accessRead}</li>
				{#if data.user.platformAdmin}<li>{t.mcp.accessPlatform}</li>{/if}
			</ul>

			{#if data.offerWrites}
				<div class="toggle-row">
					<label class="ui-switch">
						<input id="mcp-writes" type="checkbox" name="allow_writes" />
						<span class="ui-switch-track" aria-hidden="true"></span>
					</label>
					<label class="toggle-copy" for="mcp-writes">
						<strong>{t.mcp.allowChanges}</strong>
						<span>{t.mcp.allowChangesHint}</span>
					</label>
				</div>
			{/if}

			<h2 class="block-title">{t.mcp.orgsTitle}</h2>
			{#if data.orgs.length}
				<ul class="orgs">
					{#each data.orgs as org (org.name)}
						<li>
							<span class="org-name">{org.name}</span>
							<span class="org-state" class:ok={org.available}>{org.available ? t.mcp.orgAvailable : t.mcp.orgNeedsPlan}</span>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="hint">{t.mcp.noOrgs}</p>
			{/if}

			<div class="actions">
				<button type="submit" class="submit-btn">{t.mcp.approve}</button>
				<button type="submit" class="secondary-btn" formaction="?/deny">{t.mcp.deny}</button>
			</div>
			<p class="hint">{t.mcp.revokeLater}</p>
		</form>

		<form method="POST" action="/app/logout" class="auth-switch">
			<button type="submit" class="link-btn">{t.mcp.notYou}</button>
		</form>
	{:else}
		<div class="auth-header">
			<h1>{data.state === 'invalid' ? t.mcp.invalidTitle : t.mcp.consentTitle}</h1>
			{#if data.state === 'off'}
				<p class="subtitle">{t.mcp.consentOff}</p>
			{:else if data.state === 'client'}
				<p class="subtitle">{t.mcp.clientAccount}</p>
			{:else}
				<p class="subtitle">{t.mcp.invalidLead}</p>
				<p class="hint"><code>{data.reason}</code></p>
			{/if}
			{#if form?.error}<div class="notice notice-error" role="alert">{form.error}</div>{/if}
		</div>
	{/if}
</AuthShell>

<style>
	.auth-header { margin-bottom: 22px; }
	.eyebrow {
		font-size: 11px; font-weight: 650; letter-spacing: .08em; text-transform: uppercase;
		color: var(--text-muted); margin: 0 0 10px;
	}
	h1 {
		font-size: 24px; font-weight: 550; color: var(--text-base);
		letter-spacing: -0.035em; line-height: 1.2; margin: 0 0 10px; overflow-wrap: anywhere;
	}
	.subtitle { font-size: 14px; color: var(--text-muted); line-height: 1.7; margin: 0 0 6px; overflow-wrap: anywhere; }
	.host { color: var(--text-base); font-weight: 600; }
	.warn { font-size: 12px; color: var(--text-muted); line-height: 1.6; margin: 6px 0 0; }

	.who {
		display: grid; grid-template-columns: auto 1fr; column-gap: 10px; row-gap: 2px;
		padding: 12px 14px; border: 1px solid var(--border); border-radius: var(--radius-sm); margin-bottom: 20px;
	}
	.who-label { grid-row: span 2; font-size: 12px; color: var(--text-muted); align-self: center; }
	.who-name { font-size: 13px; font-weight: 600; color: var(--text-base); }
	.who-email { font-size: 12px; color: var(--text-muted); overflow-wrap: anywhere; }

	.consent-form { display: flex; flex-direction: column; }
	.block-title { font-size: 13px; font-weight: 650; color: var(--text-base); margin: 4px 0 8px; letter-spacing: 0; }
	.access { margin: 0 0 16px; padding-left: 18px; font-size: 13px; line-height: 1.6; color: var(--text-base); }
	.access li + li { margin-top: 6px; }

	.toggle-row { display: flex; align-items: flex-start; gap: 12px; margin: 0 0 20px; }
	.toggle-row .ui-switch { margin-top: 1px; }
	.toggle-copy { display: flex; flex-direction: column; gap: 3px; cursor: pointer; }
	.toggle-copy strong { font-size: 13px; font-weight: 600; }
	.toggle-copy span { font-size: 12px; font-weight: 400; color: var(--text-muted); line-height: 1.6; }

	.orgs { list-style: none; margin: 0 0 20px; padding: 0; border-top: 1px solid var(--border); }
	.orgs li {
		display: flex; justify-content: space-between; gap: 12px; align-items: baseline;
		padding: 9px 0; border-bottom: 1px solid var(--border); font-size: 13px;
	}
	.org-name { color: var(--text-base); overflow-wrap: anywhere; }
	.org-state { font-size: 12px; color: var(--text-muted); white-space: nowrap; }
	.org-state.ok { color: var(--success); }

	.actions { display: flex; flex-direction: column; gap: 10px; margin-top: 4px; }
	.hint { font-size: 12px; color: var(--text-muted); line-height: 1.6; margin: 12px 0 0; }
	code { font-size: 12px; overflow-wrap: anywhere; }

	.notice { padding: 10px 14px; border-radius: var(--radius-sm); font-size: 13px; font-weight: 500; margin-bottom: 18px; }
	.notice-error {
		background: var(--danger-dim); color: var(--danger);
		border: 1px solid color-mix(in srgb, var(--danger) 25%, transparent);
	}

	.submit-btn {
		width: 100%; padding: 12px; border-radius: var(--radius-sm);
		background: var(--accent); color: var(--accent-contrast);
		font-size: 14px; font-weight: 650; border: none; cursor: pointer; font-family: inherit;
		transition: transform .2s, background .2s;
	}
	.submit-btn:hover { background: var(--accent-hover); transform: translateY(-2px); }
	.secondary-btn {
		width: 100%; padding: 11px; border-radius: var(--radius-sm);
		background: transparent; color: var(--text-base); border: 1px solid var(--border);
		font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit;
	}
	.secondary-btn:hover { border-color: var(--accent); color: var(--accent-ink); }

	.auth-switch { text-align: center; margin-top: 24px; }
	.link-btn {
		background: none; border: none; padding: 0; cursor: pointer; font-family: inherit;
		font-size: 13px; color: var(--text-muted); text-decoration: underline;
	}
	.link-btn:hover { color: var(--accent-ink); }

	@media (prefers-reduced-motion: reduce) { .submit-btn:hover { transform: none; } }
</style>
