<script lang="ts">
	import { enhance } from '$app/forms';
	import { t } from '$lib/i18n';
	import SectionHeader from '$lib/components/SectionHeader.svelte';
	import type { PageData, ActionData } from './$types';

	interface Props { data: PageData; form: ActionData; }
	const { data, form }: Props = $props();

	const smtp = $derived((data.settings.smtp ?? {}) as Record<string, string | number | boolean>);
	const notifications = $derived((data.settings.email_notifications ?? {}) as Record<string, boolean>);
	const templates = $derived(data.templates);
	const emailLog = $derived(data.emailLog);

	let testStatus = $state<{ type: 'idle' | 'loading' | 'success' | 'error'; message?: string }>({ type: 'idle' });

	const defaultTemplates: Record<string, string> = {
		newReservation: `<h2>New Reservation</h2>\n<p><b>{{userName}}</b> created a new reservation <b>{{title}}</b> at <b>{{hallName}}</b> on <b>{{date}}</b>.</p>`,
		statusChange: `<h2>Reservation Status Updated</h2>\n<p>Your reservation <b>{{title}}</b> has been updated to: <b>{{status}}</b>.</p>`,
		newMessage: `<h2>New Message</h2>\n<p><b>{{senderName}}</b> sent a message in ticket <b>{{subject}}</b>.</p>`,
		passwordReset: `<h2>Password Reset</h2>\n<p>You requested a password reset. Click the link below:</p>\n<p><a href="{{resetUrl}}">{{resetUrl}}</a></p>\n<p>This link expires in 1 hour.</p>`,
		testEmail: `<h2>Hallify SMTP Test</h2>\n<p>If you can read this, your SMTP settings are working correctly.</p>`,
	};

	const templateVars: Record<string, string> = {
		newReservation: 'userName, title, hallName, date',
		statusChange: 'title, status',
		newMessage: 'senderName, subject',
		passwordReset: 'resetUrl',
		testEmail: '',
	};
</script>

<svelte:head><title>{t.settings.tabEmail} – {t.settings.title} – Hallify</title></svelte:head>

<div class="page">
<SectionHeader overline={t.settings.manage} title={t.settings.tabEmail} />

{#if form?.success && !form?.testOk}
	<div class="alert-success">{t.settings.saved}</div>
{/if}
{#if form?.error && testStatus.type !== 'error'}
	<div class="alert-error">{form.error}</div>
{/if}

<!-- SMTP + Notifications -->
<div class="two-col">
	<div class="card s-card">
		<h3>{t.settings.smtp}</h3>
		<form method="POST" action="?/saveSmtp" use:enhance={() => { return async ({ update }) => { await update({ reset: false }); }; }}>
			<div class="field-row">
				<div class="field">
					<label for="smtp-host">{t.settings.smtpHost}</label>
					<input id="smtp-host" name="host" type="text" value={smtp.host ?? ''} placeholder="smtp.gmail.com" />
				</div>
				<div class="field">
					<label for="smtp-port">{t.settings.smtpPort}</label>
					<input id="smtp-port" name="port" type="number" value={smtp.port ?? 587} />
				</div>
			</div>
			<div class="field-row">
				<div class="field">
					<label for="smtp-user">{t.settings.smtpUser}</label>
					<input id="smtp-user" name="user" type="text" value={smtp.user ?? ''} />
				</div>
				<div class="field">
					<label for="smtp-pass">{t.settings.smtpPass}</label>
					<input id="smtp-pass" name="pass" type="password" value={smtp.pass ?? ''} />
				</div>
			</div>
			<div class="field-row">
				<div class="field">
					<label for="smtp-from">{t.settings.smtpFrom}</label>
					<input id="smtp-from" name="fromEmail" type="email" value={smtp.fromEmail ?? ''} placeholder="noreply@example.com" />
				</div>
				<div class="field">
					<label for="smtp-name">{t.settings.smtpFromName}</label>
					<input id="smtp-name" name="fromName" type="text" value={smtp.fromName ?? 'Hallify'} />
				</div>
			</div>
			<div class="field check-field">
				<label>
					<input name="secure" type="checkbox" checked={smtp.secure === true} />
					{t.settings.smtpSecure}
				</label>
			</div>
			<div class="form-actions">
				<button type="submit" class="btn-action">{t.common.save}</button>
			</div>
		</form>

		<div class="test-section">
			<form method="POST" action="?/testSmtp" class="test-form" use:enhance={() => {
				testStatus = { type: 'loading' };
				return async ({ result, update }) => {
					if (result.type === 'success') {
						testStatus = { type: 'success', message: t.settings.smtpTestSuccess };
					} else if (result.type === 'failure') {
						const err = (result.data as Record<string, string> | undefined)?.error ?? 'Unknown error';
						testStatus = { type: 'error', message: `${t.settings.smtpTestFail}: ${err}` };
					} else {
						testStatus = { type: 'error', message: t.settings.smtpTestFail };
					}
					await update({ reset: false });
				};
			}}>
				<input name="testEmail" type="email" placeholder="test@example.com" required />
				<button type="submit" class="btn-outline" disabled={testStatus.type === 'loading'}>
					{#if testStatus.type === 'loading'}
						Sending…
					{:else}
						{t.settings.smtpTest}
					{/if}
				</button>
			</form>
			{#if testStatus.type === 'success'}
				<div class="test-result test-ok">{testStatus.message}</div>
			{/if}
			{#if testStatus.type === 'error'}
				<div class="test-result test-err">{testStatus.message}</div>
			{/if}
		</div>
	</div>

	<div class="card s-card">
		<h3>{t.settings.emailNotifications}</h3>
		<form method="POST" action="?/saveNotifications" use:enhance={() => { return async ({ update }) => { await update({ reset: false }); }; }}>
			<div class="field check-field">
				<label>
					<input name="newReservation" type="checkbox" checked={notifications.newReservation === true} />
					{t.settings.notifyNewReservation}
				</label>
			</div>
			<div class="field check-field">
				<label>
					<input name="statusChange" type="checkbox" checked={notifications.statusChange === true} />
					{t.settings.notifyStatusChange}
				</label>
			</div>
			<div class="field check-field">
				<label>
					<input name="newMessage" type="checkbox" checked={notifications.newMessage === true} />
					{t.settings.notifyNewMessage}
				</label>
			</div>
			<div class="form-actions">
				<button type="submit" class="btn-action">{t.common.save}</button>
			</div>
		</form>
	</div>
</div>

<!-- Email Templates -->
<div class="card tpl-card">
	<h3>{t.settings.emailTemplates}</h3>
	<p class="hint">{t.settings.templateHint}</p>
	<form method="POST" action="?/saveTemplates" use:enhance={() => { return async ({ update }) => { await update({ reset: false }); }; }}>
		{#each [
			{ key: 'newReservation', label: t.settings.templateNewReservation },
			{ key: 'statusChange', label: t.settings.templateStatusChange },
			{ key: 'newMessage', label: t.settings.templateNewMessage },
			{ key: 'passwordReset', label: t.settings.templatePasswordReset },
			{ key: 'testEmail', label: t.settings.templateTestEmail },
		] as tpl}
			<div class="tpl-field">
				<label for="tpl-{tpl.key}">{tpl.label}</label>
				{#if templateVars[tpl.key]}
					<span class="tpl-vars">Variables: {templateVars[tpl.key]}</span>
				{/if}
				<textarea id="tpl-{tpl.key}" name="tpl_{tpl.key}" rows="4">{templates[tpl.key] ?? defaultTemplates[tpl.key] ?? ''}</textarea>
			</div>
		{/each}
		<div class="form-actions">
			<button type="submit" class="btn-action">{t.common.save}</button>
		</div>
	</form>
</div>

<!-- Mail Log -->
<div class="card log-card">
	<h3>{t.settings.mailLog}</h3>
	{#if emailLog.length === 0}
		<p class="empty-msg">{t.settings.mailLogEmpty}</p>
	{:else}
		<div class="log-table-wrap">
			<table class="log-table">
				<thead>
					<tr>
						<th>{t.settings.mailLogRecipient}</th>
						<th>{t.settings.mailLogSubject}</th>
						<th>{t.settings.mailLogTemplate}</th>
						<th>{t.settings.mailLogStatus}</th>
						<th>{t.settings.mailLogDate}</th>
					</tr>
				</thead>
				<tbody>
					{#each emailLog as entry}
						<tr>
							<td class="td-email">{entry.recipient}</td>
							<td>{entry.subject}</td>
							<td><span class="tpl-badge">{entry.template ?? '—'}</span></td>
							<td>
								<span class="status-dot" class:sent={entry.status === 'sent'} class:failed={entry.status === 'failed'}></span>
								{entry.status}
							</td>
							<td class="td-date">{new Date(entry.created_at).toLocaleString()}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
</div>

<style>
	.page { padding: 28px 32px; }

	.two-col {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 20px;
		align-items: start;
		margin-bottom: 20px;
	}

	.s-card { padding: 24px; }
	.tpl-card { padding: 24px; margin-bottom: 20px; }
	.log-card { padding: 24px; }

	.s-card h3, .tpl-card h3, .log-card h3 {
		font-size: 14px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--accent);
		margin: 0 0 16px;
	}

	.field { margin-bottom: 12px; }
	.field label {
		display: block;
		font-size: 12px;
		font-weight: 600;
		color: var(--text-muted);
		margin-bottom: 4px;
	}
	.field input[type="text"],
	.field input[type="email"],
	.field input[type="password"],
	.field input[type="number"] { width: 100%; }

	.field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

	.check-field { margin-bottom: 10px; }
	.check-field label {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		font-weight: 500;
		color: var(--text-base);
		cursor: pointer;
	}
	.check-field input[type="checkbox"] { width: 16px; height: 16px; accent-color: var(--accent); }

	.form-actions { margin-top: 16px; }

	.btn-action {
		padding: 8px 20px;
		border-radius: 8px;
		font-size: 13px;
		font-weight: 600;
		background: var(--accent-action);
		color: white;
		border: none;
		cursor: pointer;
	}
	.btn-action:hover { opacity: 0.9; }

	.btn-outline {
		padding: 7px 14px;
		border-radius: 6px;
		font-size: 12px;
		font-weight: 500;
		border: 1px solid var(--border);
		background: var(--bg-panel);
		color: var(--text-base);
		cursor: pointer;
	}
	.btn-outline:hover { border-color: var(--accent); color: var(--accent); }

	.test-section {
		margin-top: 16px;
		padding-top: 16px;
		border-top: 1px solid var(--border);
	}

	.test-form { display: flex; gap: 8px; align-items: center; }
	.test-form input { flex: 1; }
	.test-form button:disabled { opacity: 0.5; cursor: default; }

	.test-result {
		margin-top: 10px;
		padding: 8px 12px;
		border-radius: 6px;
		font-size: 12px;
		font-weight: 500;
		word-break: break-word;
	}
	.test-ok { background: #dcfce7; color: #15803d; }
	.test-err { background: #fef2f2; color: #dc2626; }

	/* Templates */
	.hint {
		font-size: 11px;
		color: var(--text-muted);
		margin: -8px 0 16px;
	}

	.tpl-field { margin-bottom: 16px; }
	.tpl-field label {
		display: block;
		font-size: 12px;
		font-weight: 600;
		color: var(--text-base);
		margin-bottom: 4px;
	}

	.tpl-vars {
		display: block;
		font-size: 10px;
		color: var(--text-muted);
		margin-bottom: 4px;
		font-family: monospace;
	}

	.tpl-field textarea {
		width: 100%;
		font-family: monospace;
		font-size: 12px;
		padding: 8px 10px;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--bg-panel2);
		color: var(--text-base);
		resize: vertical;
		line-height: 1.5;
	}

	/* Mail Log */
	.empty-msg {
		font-size: 13px;
		color: var(--text-muted);
		text-align: center;
		padding: 24px 0;
	}

	.log-table-wrap { overflow-x: auto; }

	.log-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 12px;
	}

	.log-table th {
		text-align: left;
		padding: 8px 10px;
		font-size: 11px;
		font-weight: 600;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.03em;
		border-bottom: 2px solid var(--border);
		white-space: nowrap;
	}

	.log-table td {
		padding: 7px 10px;
		border-bottom: 1px solid var(--border);
		color: var(--text-base);
	}

	.log-table tbody tr:hover { background: var(--bg-panel2); }

	.td-email {
		font-weight: 500;
		max-width: 200px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.td-date {
		white-space: nowrap;
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
	}

	.tpl-badge {
		font-size: 10px;
		padding: 2px 6px;
		border-radius: 4px;
		background: var(--bg-panel2);
		color: var(--text-muted);
		font-family: monospace;
	}

	.status-dot {
		display: inline-block;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		margin-right: 4px;
	}

	.status-dot.sent { background: #15803d; }
	.status-dot.failed { background: #dc2626; }

	.alert-success {
		padding: 10px 16px;
		border-radius: 8px;
		background: #dcfce7;
		color: #15803d;
		font-size: 13px;
		font-weight: 500;
		margin-bottom: 16px;
	}
	.alert-error {
		padding: 10px 16px;
		border-radius: 8px;
		background: #fef2f2;
		color: #dc2626;
		font-size: 13px;
		font-weight: 500;
		margin-bottom: 16px;
	}

	@media (max-width: 900px) {
		.two-col { grid-template-columns: 1fr; }
	}
</style>
