<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';
	import { t } from '$lib/i18n.svelte';

	interface Props { data: PageData; form: ActionData; }
	const { data, form }: Props = $props();

	let testStatus = $state<{ type: 'idle' | 'loading' | 'success' | 'error'; message?: string }>({ type: 'idle' });

	const templateMeta = $derived([
		{ key: 'newReservation', label: t.platformMisc.tplNewReservation, vars: 'title, userName, hallName, date' },
		{ key: 'guestMessage', label: t.platformMisc.tplGuestMessage, vars: 'senderName, subject, message' },
		{ key: 'guestCancel', label: t.platformMisc.tplGuestCancel, vars: 'guestName, title, hallName, date' },
		{ key: 'guestEdit', label: t.platformMisc.tplGuestEdit, vars: 'guestName, title, hallName, date' },
		{ key: 'statusChange', label: t.platformMisc.tplStatusChange, vars: 'title, status' },
		{ key: 'newMessage', label: t.platformMisc.tplNewMessage, vars: 'senderName, subject' },
		{ key: 'passwordReset', label: t.platformMisc.tplPasswordReset, vars: 'resetUrl' },
		{ key: 'testEmail', label: t.platformMisc.tplTestEmail, vars: '' },
	] as const);

	function fmtDate(d: string) {
		return new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
	}
</script>

<svelte:head><title>Email – Platform – Hallify</title></svelte:head>

<div class="page">
	<div class="page-header">
		<h1 class="page-title">{t.platformMisc.emailTitle}</h1>
	</div>
	<p class="intro">{t.platformMisc.emailIntro}</p>

	{#if form?.success && form?.section === 'templates'}
		<div class="alert-success">{t.platformMisc.templatesSaved}</div>
	{/if}

	<!-- Config + test -->
	<div class="two-col">
		<div class="card">
			<h3>{t.platformMisc.provider}</h3>
			<div class="kv">
				<span class="k">{t.platformMisc.service}</span><span class="v">{data.config.provider} (HTTP API)</span>
			</div>
			<div class="kv">
				<span class="k">{t.platformMisc.sender}</span><span class="v">{data.config.fromName} &lt;{data.config.fromEmail}&gt;</span>
			</div>
			<div class="kv">
				<span class="k">{t.platformMisc.apiKey}</span>
				<span class="v">
					{#if data.config.configured}
						<span class="badge badge-ok"><span class="dot dot-ok"></span> {t.platformMisc.configured}</span>
					{:else}
						<span class="badge badge-bad"><span class="dot dot-bad"></span> {t.platformMisc.notSetBrevo}</span>
					{/if}
				</span>
			</div>
			<div class="kv">
				<span class="k">{t.platformMisc.recent}</span>
				<span class="v">
					<span class="stat-ok">{data.stats.sent} {t.platformMisc.sentCount}</span>
					<span class="stat-sep">·</span>
					<span class="stat-bad">{data.stats.failed} {t.platformMisc.failedCount}</span>
				</span>
			</div>
		</div>

		<div class="card">
			<h3>{t.platformMisc.sendTestEmail}</h3>
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
				<input name="testEmail" type="email" placeholder="you@example.com" required />
				<button type="submit" class="btn-action" disabled={testStatus.type === 'loading'}>
					{testStatus.type === 'loading' ? t.platformMisc.sending : t.platformMisc.sendTest}
				</button>
			</form>
			{#if testStatus.type === 'success'}<div class="test-result test-ok">{testStatus.message}</div>{/if}
			{#if testStatus.type === 'error'}<div class="test-result test-err">{testStatus.message}</div>{/if}
			{#if !data.config.configured}
				<p class="test-hint">{t.platformMisc.brevoHintPre}<code>BREVO_API_KEY</code>{t.platformMisc.brevoHintPost}</p>
			{/if}
		</div>
	</div>

	<!-- Templates -->
	<div class="card">
		<h3>{t.platformMisc.emailTemplates}</h3>
		<p class="card-hint">{t.platformMisc.templatesHintPre}<code>{'{{variable}}'}</code>{t.platformMisc.templatesHintPost}</p>
		<form method="POST" action="?/saveTemplates" use:enhance={() => async ({ update }) => { await update({ reset: false }); }}>
			{#each templateMeta as tpl}
				<div class="tpl-field">
					<label for="tpl-{tpl.key}">{tpl.label}</label>
					{#if tpl.vars}<span class="tpl-vars">{t.platformMisc.variablesLabel} {tpl.vars}</span>{/if}
					<textarea id="tpl-{tpl.key}" name="tpl_{tpl.key}" rows="3">{data.templates[tpl.key] ?? ''}</textarea>
				</div>
			{/each}
			<div class="actions"><button type="submit" class="btn-action">{t.platformMisc.saveTemplates}</button></div>
		</form>
	</div>

	<!-- Log -->
	<div class="card">
		<h3>{t.platformMisc.mailLog} <span class="count">{data.emailLog.length}</span></h3>
		{#if data.emailLog.length === 0}
			<p class="empty">{t.platformMisc.noEmailsSent}</p>
		{:else}
			<div class="log-wrap">
				<table class="log">
					<thead>
						<tr><th>{t.platformMisc.colRecipient}</th><th>{t.platformMisc.colSubject}</th><th>{t.platformMisc.colTemplate}</th><th>{t.platformMisc.colStatus}</th><th>{t.platformMisc.colWhen}</th></tr>
					</thead>
					<tbody>
						{#each data.emailLog as e (e.id)}
							<tr>
								<td class="td-email" title={e.recipient}>{e.recipient}</td>
								<td>{e.subject}</td>
								<td><span class="tpl-badge">{e.template ?? '-'}</span></td>
								<td>
									<span class="dot" class:dot-ok={e.status === 'sent'} class:dot-bad={e.status === 'failed'}></span>
									<span class="status-txt" title={e.error ?? ''}>{e.status}</span>
								</td>
								<td class="td-date">{fmtDate(e.created_at)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
</div>

<style>
	.page { padding: 24px 28px; }
	.page-header { margin-bottom: 4px; }
	.page-title { font-size: 18px; font-weight: 800; color: var(--text-base); letter-spacing: -.025em; margin: 0; }
	.intro { font-size: 13px; color: var(--text-muted); margin: 0 0 20px; }

	.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; margin-bottom: 16px; }

	.card {
		background: var(--bg-panel); border: 1px solid var(--border);
		border-radius: 12px; padding: 20px; margin-bottom: 16px;
	}
	.card h3 {
		font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em;
		color: var(--text-muted); margin: 0 0 14px;
		display: flex; align-items: center; gap: 8px;
	}
	.count {
		font-size: 11px; font-weight: 700; color: var(--text-muted);
		background: var(--bg-panel2, var(--bg-base)); border: 1px solid var(--border);
		border-radius: 99px; padding: 0 7px; text-transform: none; letter-spacing: 0;
	}

	/* Provider key/values */
	.kv { display: flex; align-items: center; gap: 12px; padding: 7px 0; border-bottom: 1px solid var(--border-subtle, var(--border)); font-size: 13px; }
	.kv:last-child { border-bottom: none; }
	.k { width: 78px; flex-shrink: 0; color: var(--text-subtle); font-weight: 600; font-size: 12px; }
	.v { color: var(--text-base); min-width: 0; word-break: break-word; }
	.badge { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; }
	.badge-ok { color: var(--success, #16a34a); }
	.badge-bad { color: var(--danger, #dc2626); }
	.stat-ok { color: var(--success, #16a34a); font-weight: 600; }
	.stat-bad { color: var(--text-muted); }
	.stat-sep { color: var(--text-subtle); margin: 0 6px; }

	.dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: var(--text-subtle); }
	.dot-ok { background: var(--success, #22c55e); }
	.dot-bad { background: var(--danger, #ef4444); }

	/* Test form */
	.test-form { display: flex; gap: 8px; }
	.test-form input {
		flex: 1; min-width: 0; height: 38px; box-sizing: border-box; padding: 0 11px;
		border: 1px solid var(--border); border-radius: 8px; background: var(--bg-panel2, var(--bg-base));
		font-size: 13px; color: var(--text-base); font-family: inherit; outline: none;
	}
	.test-form input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 12%, transparent); }
	.test-result { margin-top: 10px; padding: 8px 12px; border-radius: 8px; font-size: 12.5px; font-weight: 500; }
	.test-ok { color: var(--success, #16a34a); background: color-mix(in srgb, var(--success, #22c55e) 12%, transparent); }
	.test-err { color: var(--danger, #dc2626); background: color-mix(in srgb, var(--danger, #ef4444) 10%, transparent); }
	.test-hint { font-size: 12px; color: var(--text-muted); margin: 12px 0 0; line-height: 1.5; }
	code { font-family: ui-monospace, monospace; font-size: 11.5px; background: var(--bg-panel2, var(--bg-base)); padding: 1px 5px; border-radius: 4px; }

	/* Templates */
	.card-hint { font-size: 12px; color: var(--text-muted); margin: -8px 0 14px; }
	.tpl-field { margin-bottom: 14px; }
	.tpl-field label { display: block; font-size: 12.5px; font-weight: 600; color: var(--text-base); margin-bottom: 4px; }
	.tpl-vars { display: block; font-size: 10.5px; color: var(--text-subtle); margin-bottom: 5px; font-family: ui-monospace, monospace; }
	.tpl-field textarea {
		width: 100%; box-sizing: border-box; font-family: ui-monospace, monospace; font-size: 12px;
		padding: 9px 11px; border: 1px solid var(--border); border-radius: 8px;
		background: var(--bg-panel2, var(--bg-base)); color: var(--text-base); resize: vertical; line-height: 1.55;
	}
	.tpl-field textarea:focus { outline: none; border-color: var(--accent); }

	.actions { margin-top: 4px; }
	.btn-action {
		padding: 9px 20px; border-radius: 8px; font-size: 13px; font-weight: 600;
		background: var(--accent); color: #fff; border: none; cursor: pointer; font-family: inherit;
	}
	.btn-action:hover { opacity: .9; }
	.btn-action:disabled { opacity: .5; cursor: default; }

	/* Log */
	.empty { font-size: 13px; color: var(--text-muted); text-align: center; padding: 24px 0; }
	.log-wrap { overflow-x: auto; }
	.log { width: 100%; border-collapse: collapse; font-size: 12px; }
	.log th {
		text-align: left; padding: 8px 10px; font-size: 11px; font-weight: 700;
		color: var(--text-subtle); text-transform: uppercase; letter-spacing: .03em;
		border-bottom: 1px solid var(--border); white-space: nowrap;
	}
	.log td { padding: 7px 10px; border-bottom: 1px solid var(--border-subtle, var(--border)); color: var(--text-base); }
	.log tbody tr:hover { background: var(--bg-panel2, var(--bg-base)); }
	.td-email { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
	.td-date { white-space: nowrap; color: var(--text-muted); font-variant-numeric: tabular-nums; }
	.status-txt { text-transform: capitalize; }
	.tpl-badge { font-size: 10.5px; padding: 2px 6px; border-radius: 5px; background: var(--bg-panel2, var(--bg-base)); color: var(--text-muted); font-family: ui-monospace, monospace; }

	.alert-success {
		padding: 10px 14px; border-radius: 9px; font-size: 13px; font-weight: 500; margin-bottom: 16px;
		color: var(--success, #16a34a);
		background: color-mix(in srgb, var(--success, #22c55e) 12%, transparent);
		border: 1px solid color-mix(in srgb, var(--success, #22c55e) 28%, transparent);
	}

	@media (max-width: 860px) {
		.two-col { grid-template-columns: 1fr; }
	}
</style>
