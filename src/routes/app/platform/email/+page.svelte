<script lang="ts">
	import { pageTitle } from '$lib/page-title';
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
		{ key: 'bookingReceived', label: t.platformMisc.tplBookingReceived, vars: 'title, hallName, date, statusInfo' },
		{ key: 'bookingConfirmed', label: t.platformMisc.tplBookingConfirmed, vars: 'title, hallName, date, statusInfo' },
		{ key: 'clientEdited', label: t.platformMisc.tplClientEdited, vars: 'title, changes' },
		{ key: 'clientCancelled', label: t.platformMisc.tplClientCancelled, vars: 'title, hallName, date' },
		{ key: 'venueChanged', label: t.platformMisc.tplVenueChanged, vars: 'title, changes' },
		{ key: 'eventReminder', label: t.platformMisc.tplEventReminder, vars: 'title, hallName, date' },
		{ key: 'paymentDetails', label: t.payment.tplLabel, vars: 'title, hallName, date' },
		{ key: 'feedbackRequest', label: t.feedback.tplLabel, vars: 'title, hallName, date, deadline' },
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
	let logFilter = $state<'all' | 'sent' | 'failed'>('all');
	const shownLog = $derived(logFilter === 'all' ? data.emailLog : data.emailLog.filter((e) => e.status === logFilter));

	const isDefault = (k: string) => (drafts[k] ?? '').trim() === ((data.defaults as Record<string, string>)[k] ?? '').trim();
	const resetOne = (k: string) => { drafts[k] = (data.defaults as Record<string, string>)[k as TplKey]; };

	// The preview runs in a sandboxed frame with no scripts: a template is HTML.
	const previewDoc = (k: string) => `<!doctype html><meta charset="utf-8"><body style="font-family:system-ui,sans-serif;font-size:14px;color:#202322;padding:12px;margin:0">${previewTemplate(drafts[k] ?? '')}</body>`;
</script>

<svelte:head><title>{pageTitle(t.platformMisc.emailTitle, t.platformOrgs.platformAdmin)}</title></svelte:head>

<div class="wrap page">
	<header class="page-header">
		<div>
			<p class="eyebrow">{t.platformOrgs.platformAdmin}</p>
			<h1 class="page-title">{t.platformMisc.emailTitle}</h1>
			<p class="page-lead">{t.platformMisc.emailIntro}</p>
		</div>
	</header>

	{#if form?.success && form?.section === 'templates'}
		<div class="alert-success" role="status">{t.platformMisc.templatesSaved}</div>
	{/if}

	<!-- Config -->
	<section class="section section--lead">
		<div class="section-head"><h2>{t.platformMisc.provider}</h2></div>
		<div class="row-list provider">
			<div class="row-item kv"><span class="k">{t.platformMisc.service}</span><span class="v">{data.config.provider} (HTTP API)</span></div>
			<div class="row-item kv"><span class="k">{t.platformMisc.sender}</span><span class="v">{data.config.fromName} &lt;{data.config.fromEmail}&gt;</span></div>
			<div class="row-item kv">
				<span class="k">{t.platformMisc.apiKey}</span>
				<span class="v">
					{#if data.config.configured}
						<span class="pf-tag" data-tone="success">{t.platformMisc.configured}</span>
					{:else}
						<span class="pf-tag" data-tone="danger">{t.platformMisc.notSetBrevo}</span>
					{/if}
				</span>
			</div>
			<div class="row-item kv">
				<span class="k">{t.platformMisc.recent}</span>
				<span class="v">
					<span class="stat-ok">{t.platformMisc.sentCount(data.stats.sent)}</span>
					<span class="stat-sep">·</span>
					<span class:stat-bad={data.stats.failed > 0}>{t.platformMisc.failedCount(data.stats.failed)}</span>
				</span>
			</div>
		</div>
	</section>

	<!-- Test -->
	<section class="section">
		<div class="section-head"><h2>{t.platformMisc.sendTestEmail}</h2></div>
		<form method="POST" action="?/testEmail" class="control-row test-form" use:enhance={() => {
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
			<button type="submit" class="btn-action btn-sm" disabled={testStatus.type === 'loading'}>
				{testStatus.type === 'loading' ? t.platformMisc.sending : t.platformMisc.sendTest}
			</button>
		</form>
		{#if testStatus.type === 'success'}<div class="alert-success test-result" role="status">{testStatus.message}</div>{/if}
		{#if testStatus.type === 'error'}<div class="alert-error test-result" role="alert">{testStatus.message}</div>{/if}
		{#if !data.config.configured}
			<p class="test-hint">{t.platformMisc.brevoHintPre}<code>BREVO_API_KEY</code>{t.platformMisc.brevoHintPost}</p>
		{/if}
	</section>

	<!-- Templates -->
	<section class="section">
		<div class="section-head">
			<h2>{t.platformMisc.emailTemplates}</h2>
			<p>{t.platformMisc.templatesHintPre}<code>{'{{variable}}'}</code>{t.platformMisc.templatesHintPost}</p>
		</div>
		<form method="POST" action="?/saveTemplates" use:enhance={() => async ({ update }) => { await update({ reset: false }); }}>
			{#each templateMeta as tpl}
				<div class="tpl-field">
					<div class="tpl-head">
						<label for="tpl-{tpl.key}">{tpl.label}</label>
						{#if !isDefault(tpl.key)}<span class="pf-tag" data-tone="accent">{t.platformMisc.tplCustomized}</span>{/if}
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
			<h2>{t.platformMisc.mailLog} <span class="total-badge">{data.emailLog.length}</span></h2>
		</div>
		{#if data.emailLog.length === 0}
			<div class="card--inset state-block">
				<span class="icon-tile" aria-hidden="true">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="22,6 12,13 2,6"/></svg>
				</span>
				<h3>{t.platformMisc.noEmailsSent}</h3>
			</div>
		{:else}
			<div class="chip-filters" role="group" aria-label={t.platformMisc.colStatus}>
				<button type="button" class="chip" aria-pressed={logFilter === 'all'} onclick={() => (logFilter = 'all')}>{t.platformExtra.auditAll} <span class="muted">{data.emailLog.length}</span></button>
				<button type="button" class="chip" aria-pressed={logFilter === 'sent'} onclick={() => (logFilter = 'sent')}>{t.platformMisc.emailStatus.sent} <span class="muted">{data.stats.sent}</span></button>
				<button type="button" class="chip" aria-pressed={logFilter === 'failed'} onclick={() => (logFilter = 'failed')}>{t.platformMisc.emailStatus.failed} <span class="muted">{data.stats.failed}</span></button>
			</div>
			<div class="table-scroll">
				<div class="row-list log-table" role="table" aria-label={t.platformMisc.mailLog}>
					<div role="row" class="row-item row-head log-row">
						<span role="columnheader">{t.platformMisc.colRecipient}</span><span role="columnheader">{t.platformMisc.colSubject}</span><span role="columnheader">{t.platformMisc.colTemplate}</span><span role="columnheader">{t.platformMisc.colStatus}</span><span role="columnheader">{t.platformMisc.colWhen}</span>
					</div>
					{#each shownLog as e (e.id)}
						<div role="row" class="row-item log-row">
							<span role="cell" class="ellipsis" title={e.recipient}>{e.recipient}</span>
							<span role="cell" class="ellipsis" title={e.subject}>{e.subject}</span>
							<span role="cell" class="mono muted ellipsis">{e.template ?? '—'}</span>
							<span role="cell">
								<span class="pf-tag" data-tone={e.status === 'sent' ? 'success' : e.status === 'failed' ? 'danger' : undefined} title={e.error ?? ''}>{(t.platformMisc.emailStatus as Record<string, string>)[e.status] ?? e.status}</span>
							</span>
							<span role="cell" class="muted nowrap">{fmtDate(e.created_at)}</span>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</section>
</div>

<style>
	.provider { max-width: 760px; }
	.stat-ok { color: var(--success); }
	.stat-bad { color: var(--danger); }
	.stat-sep { color: var(--text-subtle); margin: 0 6px; font-weight: 400; }

	/* Test form */
	.test-form { max-width: 520px; }
	.test-form input { flex: 1 1 220px; width: auto; min-width: 0; }
	.test-result { margin: 12px 0 0; max-width: 520px; }
	.test-hint { font-size: 12px; color: var(--text-muted); margin: 12px 0 0; line-height: 1.75; }
	code { font-family: ui-monospace, monospace; font-size: 11.5px; background: var(--bg-panel2); padding: 1px 5px; border-radius: var(--radius-sm); }

	/* Templates */
	.tpl-field { margin-bottom: 16px; }
	.tpl-field label { font-size: 12.5px; font-weight: 600; color: var(--text-base); margin: 0; }
	.tpl-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 4px; }
	.tpl-tools { margin-left: auto; display: flex; gap: 12px; }
	.link-btn { background: none; border: none; padding: 0; font: inherit; font-size: 12px; font-weight: 600; color: var(--accent-ink); cursor: pointer; }
	.link-btn:hover { text-decoration: underline; }
	.tpl-preview { display: block; width: 100%; height: 200px; margin-top: 8px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: #fff; }
	.tpl-vars { display: block; font-size: 10.5px; color: var(--text-muted); margin-bottom: 5px; font-family: ui-monospace, monospace; overflow-wrap: anywhere; }
	.tpl-field textarea { font-family: ui-monospace, monospace; font-size: 12px; line-height: 1.55; }
	.actions { margin-top: 4px; display: flex; justify-content: flex-end; }

	/* Log */
	.log-table { min-width: 720px; }
	.log-row { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1.7fr) minmax(0, 1fr) 100px 130px; gap: 14px; align-items: center; font-size: 12.5px; }
</style>
