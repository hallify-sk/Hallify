<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';
	import { t, getLocale } from '$lib/i18n.svelte';
	import { formatDateTime } from '$lib/format';
	import { previewTemplate } from '$lib/email-template-overrides';

	interface Props { data: PageData; form: ActionData; }
	const { data, form }: Props = $props();

	let testStatus = $state<{ type: 'idle' | 'loading' | 'success' | 'error'; message?: string }>({ type: 'idle' });

	const templateMeta = $derived([
		{ key: 'newReservation', label: t.platformMisc.tplNewReservation, vars: 'title, userName, hallName, date' },
		{ key: 'guestMessage', label: t.platformMisc.tplGuestMessage, vars: 'senderName, subject, message' },
		{ key: 'guestCancel', label: t.platformMisc.tplGuestCancel, vars: 'guestName, title, hallName, date' },
		{ key: 'guestEdit', label: t.platformMisc.tplGuestEdit, vars: 'guestName, title, hallName, date' },
		{ key: 'statusChange', label: t.platformMisc.tplStatusChange, vars: 'title, status' },
		{ key: 'hallCancellation', label: t.platformMisc.tplHallCancellation, vars: 'title, hallName, date, message' },
		{ key: 'newMessage', label: t.platformMisc.tplNewMessage, vars: 'senderName, subject' },
		{ key: 'passwordReset', label: t.platformMisc.tplPasswordReset, vars: 'resetUrl' },
		{ key: 'testEmail', label: t.platformMisc.tplTestEmail, vars: '' },
	] as const);

	const fmtDate = (d: string) => formatDateTime(d, getLocale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

	// The editable text of each template, seeded from what is in effect (an emptied
	// stored template shows the default it now falls back to) and re-seeded after a save.
	type TplKey = keyof typeof data.defaults;
	const seed = () => Object.fromEntries(
		Object.keys(data.defaults).map((k) => [k, (data.templates as Record<string, string>)[k] || (data.defaults as Record<string, string>)[k]])
	) as Record<string, string>;
	let drafts = $state<Record<string, string>>(seed());
	$effect(() => { drafts = seed(); });
	let previewKey = $state<string | null>(null);

	const isDefault = (k: string) => (drafts[k] ?? '').trim() === ((data.defaults as Record<string, string>)[k] ?? '').trim();
	const resetOne = (k: string) => { drafts[k] = (data.defaults as Record<string, string>)[k as TplKey]; };

	// The preview runs in a sandboxed frame with no scripts: a template is HTML.
	const previewDoc = (k: string) => `<!doctype html><meta charset="utf-8"><body style="font-family:system-ui,sans-serif;font-size:14px;color:#202322;padding:12px;margin:0">${previewTemplate(drafts[k] ?? '')}</body>`;
</script>

<svelte:head><title>Email – Platform – Hallify</title></svelte:head>

<div class="wrap page">
	<section class="section section--lead">
		<div class="section-head">
			<p class="eyebrow">{t.platformOrgs.platformAdmin}</p>
			<h1>{t.platformMisc.emailTitle}</h1>
			<p>{t.platformMisc.emailIntro}</p>
		</div>

		{#if form?.success && form?.section === 'templates'}
			<div class="alert-success">{t.platformMisc.templatesSaved}</div>
		{/if}
	</section>

	<!-- Config -->
	<section class="section">
		<div class="section-head">
			<p class="eyebrow">{t.platformMisc.emailTitle}</p>
			<h2>{t.platformMisc.provider}</h2>
		</div>
		<div class="row-list">
			<div class="row-item kv">
				<span class="k">{t.platformMisc.service}</span><span class="v">{data.config.provider} (HTTP API)</span>
			</div>
			<div class="row-item kv">
				<span class="k">{t.platformMisc.sender}</span><span class="v">{data.config.fromName} &lt;{data.config.fromEmail}&gt;</span>
			</div>
			<div class="row-item kv">
				<span class="k">{t.platformMisc.apiKey}</span>
				<span class="v">
					{#if data.config.configured}
						<span class="badge badge-ok"><span class="dot dot-ok"></span> {t.platformMisc.configured}</span>
					{:else}
						<span class="badge badge-bad"><span class="dot dot-bad"></span> {t.platformMisc.notSetBrevo}</span>
					{/if}
				</span>
			</div>
			<div class="row-item kv">
				<span class="k">{t.platformMisc.recent}</span>
				<span class="v">
					<span class="stat-ok">{data.stats.sent} {t.platformMisc.sentCount}</span>
					<span class="stat-sep">·</span>
					<span class="stat-bad">{data.stats.failed} {t.platformMisc.failedCount}</span>
				</span>
			</div>
		</div>
	</section>

	<!-- Test -->
	<section class="section">
		<div class="section-head">
			<p class="eyebrow">{t.platformMisc.emailTitle}</p>
			<h2>{t.platformMisc.sendTestEmail}</h2>
		</div>
		<form method="POST" action="?/testEmail" class="test-form" use:enhance={() => {
			testStatus = { type: 'loading' };
			return async ({ result, update }) => {
				if (result.type === 'success') {
					testStatus = { type: 'success', message: t.platformMisc.testEmailSent };
				} else if (result.type === 'failure') {
					const err = (result.data as Record<string, string> | undefined)?.error ?? t.platformMisc.unknownError;
					testStatus = { type: 'error', message: err };
				} else {
					testStatus = { type: 'error', message: t.platformMisc.failedToSend };
				}
				await update({ reset: false });
			};
		}}>
			<input name="testEmail" type="email" placeholder="you@example.com" aria-label={t.platformMisc.testEmailRecipient} required />
			<button type="submit" class="btn-action" disabled={testStatus.type === 'loading'}>
				{testStatus.type === 'loading' ? t.platformMisc.sending : t.platformMisc.sendTest}
			</button>
		</form>
		{#if testStatus.type === 'success'}<div class="test-result test-ok">{testStatus.message}</div>{/if}
		{#if testStatus.type === 'error'}<div class="test-result test-err">{testStatus.message}</div>{/if}
		{#if !data.config.configured}
			<p class="test-hint">{t.platformMisc.brevoHintPre}<code>BREVO_API_KEY</code>{t.platformMisc.brevoHintPost}</p>
		{/if}
	</section>

	<!-- Templates -->
	<section class="section">
		<div class="section-head">
			<p class="eyebrow">{t.platformMisc.emailTitle}</p>
			<h2>{t.platformMisc.emailTemplates}</h2>
			<p>{t.platformMisc.templatesHintPre}<code>{'{{variable}}'}</code>{t.platformMisc.templatesHintPost}</p>
		</div>
		<form method="POST" action="?/saveTemplates" use:enhance={() => async ({ update }) => { await update({ reset: false }); }}>
			{#each templateMeta as tpl}
				<div class="tpl-field">
					<div class="tpl-head">
						<label for="tpl-{tpl.key}">{tpl.label}</label>
						{#if !isDefault(tpl.key)}<span class="tpl-badge">{t.platformMisc.tplCustomized}</span>{/if}
						<span class="tpl-tools">
							<button type="button" class="link-btn" aria-expanded={previewKey === tpl.key} onclick={() => (previewKey = previewKey === tpl.key ? null : tpl.key)}>{previewKey === tpl.key ? t.platformMisc.tplHidePreview : t.platformMisc.tplPreview}</button>
							{#if !isDefault(tpl.key)}<button type="button" class="link-btn" onclick={() => resetOne(tpl.key)}>{t.platformMisc.tplReset}</button>{/if}
						</span>
					</div>
					{#if tpl.vars}<span class="tpl-vars">{t.platformMisc.variablesLabel} {tpl.vars}</span>{/if}
					<textarea id="tpl-{tpl.key}" name="tpl_{tpl.key}" rows="3" bind:value={drafts[tpl.key]}></textarea>
					{#if !drafts[tpl.key]?.trim()}<span class="tpl-vars">{t.platformMisc.tplEmptyUsesDefault}</span>{/if}
					{#if previewKey === tpl.key}
						<iframe class="tpl-preview" title={`${t.platformMisc.tplPreview}: ${tpl.label}`} sandbox="" srcdoc={previewDoc(tpl.key)}></iframe>
					{/if}
				</div>
			{/each}
			<div class="actions"><button type="submit" class="btn-action">{t.platformMisc.saveTemplates}</button></div>
		</form>
	</section>

	<!-- Log -->
	<section class="section">
		<div class="section-head">
			<p class="eyebrow">{t.platformMisc.emailTitle}</p>
			<h2>{t.platformMisc.mailLog} <span class="count">{data.emailLog.length}</span></h2>
		</div>
		{#if data.emailLog.length === 0}
			<div class="card--inset empty-state">
				<div class="icon-tile">
					<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="22,6 12,13 2,6"/></svg>
				</div>
				<p class="empty">{t.platformMisc.noEmailsSent}</p>
			</div>
		{:else}
			<div class="log-wrap">
				<div class="row-list log" role="table">
					<div role="row" class="row-item row-head">
						<span role="columnheader">{t.platformMisc.colRecipient}</span><span role="columnheader">{t.platformMisc.colSubject}</span><span role="columnheader">{t.platformMisc.colTemplate}</span><span role="columnheader">{t.platformMisc.colStatus}</span><span role="columnheader">{t.platformMisc.colWhen}</span>
					</div>
					{#each data.emailLog as e (e.id)}
						<div role="row" class="row-item">
							<span role="cell" class="td-email" title={e.recipient}>{e.recipient}</span>
							<span role="cell">{e.subject}</span>
							<span role="cell"><span class="tpl-badge">{e.template ?? '-'}</span></span>
							<span role="cell">
								<span class="dot" class:dot-ok={e.status === 'sent'} class:dot-bad={e.status === 'failed'}></span>
								<span class="status-txt" title={e.error ?? ''}>{e.status}</span>
							</span>
							<span role="cell" class="td-date">{fmtDate(e.created_at)}</span>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</section>
</div>

<style>
	.page { padding-block: 24px; }
	h1 { font-size: var(--display-size); font-weight: 550; color: var(--text-base); letter-spacing: -.055em; line-height: 1.08; margin: 0; }
	.count {
		font-size: 11px; font-weight: 650; color: var(--text-muted);
		background: var(--bg-panel2); border: 1px solid var(--border);
		border-radius: 3px; padding: 0 7px; text-transform: none; letter-spacing: 0;
	}

	/* Provider key/values on hairline rows */
	.kv { gap: 12px; padding: 8px 0; font-size: 13px; }
	.k { width: 78px; flex-shrink: 0; color: var(--text-muted); font-weight: 600; font-size: 12px; }
	.v { color: var(--text-base); min-width: 0; word-break: break-word; }
	.badge { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; }
	.badge-ok { color: var(--success); }
	.badge-bad { color: var(--danger); }
	.stat-ok { color: var(--success); font-weight: 600; }
	.stat-bad { color: var(--text-muted); }
	.stat-sep { color: var(--text-subtle); margin: 0 6px; }

	.dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: var(--text-subtle); }
	.dot-ok { background: var(--success); }
	.dot-bad { background: var(--danger); }

	/* Test form */
	.test-form { display: flex; gap: 8px; max-width: 520px; }
	.test-form input {
		flex: 1; min-width: 0; height: 38px; box-sizing: border-box; padding: 0 13px;
		border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-panel2);
		font-size: 13px; color: var(--text-base); font-family: inherit; outline: none;
		transition: border-color .15s, box-shadow .15s;
	}
	.test-form input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
	.test-result { margin-top: 10px; padding: 8px 12px; border-radius: var(--radius-sm); font-size: 12.5px; font-weight: 500; }
	.test-ok { color: var(--success); background: var(--success-dim); }
	.test-err { color: var(--danger); background: var(--danger-dim); }
	.test-hint { font-size: 12px; color: var(--text-muted); margin: 12px 0 0; line-height: 1.75; }
	code { font-family: ui-monospace, monospace; font-size: 11.5px; background: var(--bg-panel2); padding: 1px 5px; border-radius: var(--radius-sm); }

	/* Templates */
	.tpl-field { margin-bottom: 14px; }
	.tpl-field label { display: block; font-size: 12.5px; font-weight: 600; color: var(--text-base); margin-bottom: 4px; }
	.tpl-head { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
	.tpl-badge { font-size: 10px; font-weight: 650; text-transform: uppercase; letter-spacing: .06em; padding: 1px 7px; border-radius: 3px; background: var(--accent-dim); color: var(--accent-ink); }
	.tpl-tools { margin-left: auto; display: flex; gap: 12px; }
	.link-btn { background: none; border: none; padding: 0; font: inherit; font-size: 12px; color: var(--accent-ink); cursor: pointer; }
	.link-btn:hover { text-decoration: underline; }
	.tpl-preview { display: block; width: 100%; height: 200px; margin-top: 8px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: #fff; }
	.tpl-vars { display: block; font-size: 10.5px; color: var(--text-subtle); margin-bottom: 5px; font-family: ui-monospace, monospace; }
	.tpl-field textarea {
		width: 100%; box-sizing: border-box; font-family: ui-monospace, monospace; font-size: 12px;
		padding: 9px 13px; border: 1px solid var(--border); border-radius: var(--radius-sm);
		background: var(--bg-panel2); color: var(--text-base); resize: vertical; line-height: 1.55;
		transition: border-color .15s, box-shadow .15s;
	}
	.tpl-field textarea:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }

	.actions { margin-top: 4px; }
	.btn-action {
		padding: 10px 20px; border-radius: var(--radius-sm); font-size: 13px; font-weight: 650;
		background: var(--accent); color: var(--accent-contrast); border: none; cursor: pointer; font-family: inherit;
		transition: transform .2s, background .2s;
	}
	.btn-action:hover { background: var(--accent-hover); transform: translateY(-2px); }
	.btn-action:active { transform: translateY(0); }
	.btn-action:disabled { opacity: .5; cursor: default; transform: none; }

	/* Log */
	.empty-state { display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; }
	.empty { font-size: 13px; color: var(--text-muted); margin: 0; }
	.log-wrap { overflow-x: auto; }
	.log .row-item { display: grid; grid-template-columns: minmax(0,1.3fr) minmax(0,1.6fr) minmax(0,.9fr) minmax(0,.8fr) minmax(0,.9fr); gap: 12px; align-items: center; font-size: 12px; padding: 9px 0; }
	.row-head {
		font-size: 10px; font-weight: 650; color: var(--text-muted);
		text-transform: uppercase; letter-spacing: .13em; white-space: nowrap;
		border-bottom-color: var(--border);
	}
	.td-email { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
	.td-date { white-space: nowrap; color: var(--text-muted); font-variant-numeric: tabular-nums; }
	.status-txt { text-transform: capitalize; }
	.tpl-badge { font-size: 10.5px; padding: 2px 6px; border-radius: var(--radius-sm); background: var(--bg-panel2); color: var(--text-muted); font-family: ui-monospace, monospace; }

	.alert-success {
		padding: 10px 14px; border-radius: var(--radius-sm); font-size: 13px; font-weight: 500; margin-top: 16px;
		color: var(--success);
		background: var(--success-dim);
		border: 1px solid color-mix(in srgb, var(--success) 25%, transparent);
	}

	@media (prefers-reduced-motion: reduce) {
		.btn-action:hover { transform: none; }
	}

	@media (max-width: 860px) {
		.log .row-item { grid-template-columns: 1fr 1fr; row-gap: 6px; }
		.row-head { display: none; }
	}
</style>
