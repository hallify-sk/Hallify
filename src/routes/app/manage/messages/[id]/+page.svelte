<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';
	import { t } from '$lib/i18n.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import type { PageData } from './$types';

	interface Props { data: PageData; }
	const { data }: Props = $props();

	const currentUserId = $derived($page.data.user?.id);

	let msgBody = $state('');
	let chatEnd: HTMLDivElement;
	let pollTimer: ReturnType<typeof setInterval> | null = null;
	let fileInput: HTMLInputElement;
	let pendingFile = $state<{ url: string; name: string; type: string } | null>(null);
	let uploading = $state(false);
	let editingId = $state<string | null>(null);
	let editBody = $state('');

	$effect(() => {
		chatEnd?.scrollIntoView({ behavior: 'smooth' });
	});

	$effect(() => {
		pollTimer = setInterval(() => { invalidateAll(); }, 5000);
		return () => { if (pollTimer) clearInterval(pollTimer); };
	});

	async function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		uploading = true;
		try {
			const fd = new FormData();
			fd.append('file', file);
			const res = await fetch('/api/upload', { method: 'POST', body: fd });
			if (!res.ok) { alert(t.messagesAdmin.uploadFailed); return; }
			pendingFile = await res.json();
		} catch { alert(t.messagesAdmin.uploadFailed); }
		finally { uploading = false; input.value = ''; }
	}

	function isImage(type: string | null | undefined) {
		return type?.startsWith('image/');
	}

	function formatSystemMessage(body: string): string {
		const parts = body.split(':');
		const type = parts[0];
		const status = parts[1] ?? '';
		const actor = parts.slice(2).join(':');
		const statusLabel = (t.status as Record<string, string>)[status] ?? status;
		if (type === 'reservation_created') {
			return `${actor} ${t.messaging.createdReservation} (${statusLabel})`;
		}
		return `${actor} ${t.messaging.changedStatusTo} ${statusLabel}`;
	}

	function formatTime(d: Date | string) {
		return new Date(d).toLocaleString('sk-SK', {
			day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
		});
	}
</script>

<svelte:head><title>{data.ticket.subject} – Hallify</title></svelte:head>

<div class="page">
	<div class="chat-header">
		<a href="/app/manage/messages" class="back-link">
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
			{t.common.back}
		</a>
		<div class="chat-title">
			<h2>{data.ticket.subject}</h2>
			<div class="chat-meta">
				<span>{data.ticket.user_first_name} {data.ticket.user_last_name}</span>
				<span class="email">{data.ticket.user_email}</span>
				<StatusBadge status={data.ticket.status} />
			</div>
		</div>
		<div class="chat-actions">
			{#if data.ticket.status === 'open'}
				<form method="POST" action="?/close" use:enhance>
					<button type="submit" class="btn-outline">{t.messaging.close}</button>
				</form>
			{:else}
				<form method="POST" action="?/reopen" use:enhance>
					<button type="submit" class="btn-outline">{t.messaging.reopen}</button>
				</form>
			{/if}
		</div>
	</div>

	<div class="chat-body">
		{#each data.messages as msg}
			{#if msg.message_type === 'system'}
				<div class="system-msg">
					<span class="system-line"></span>
					<span class="system-text">{formatSystemMessage(msg.body)}</span>
					<span class="system-time">{formatTime(msg.created_at)}</span>
					<span class="system-line"></span>
				</div>
			{:else}
				<div class="msg" class:admin={msg.sender_role === 'admin'}>
					<div class="msg-sender">
						{msg.sender_first_name} {msg.sender_last_name}
						{#if msg.sender_role === 'admin'}
							<span class="admin-badge">{t.messaging.admin}</span>
						{/if}
						<span class="msg-time">
							{formatTime(msg.created_at)}
							{#if msg.edited_at}<span class="edited-tag">({t.messaging.edited})</span>{/if}
						</span>
					</div>
					{#if editingId === msg.id}
						<form method="POST" action="?/editMessage" use:enhance={() => {
							return async ({ update }) => { await update(); editingId = null; };
						}}>
							<input type="hidden" name="messageId" value={msg.id} />
							<input type="text" name="body" class="edit-input" value={editBody} />
							<div class="edit-actions">
								<button type="submit" class="btn-edit-save">{t.common.save}</button>
								<button type="button" class="btn-edit-cancel" onclick={() => editingId = null}>{t.common.cancel}</button>
							</div>
						</form>
					{:else}
						{#if msg.body}<div class="msg-body">{msg.body}</div>{/if}
						{#if msg.attachment_url}
							<div class="msg-attachment">
								{#if isImage(msg.attachment_type)}
									<a href={msg.attachment_url} target="_blank" rel="noopener">
										<img src={msg.attachment_url} alt={msg.attachment_name ?? t.messagesAdmin.attachment} class="att-img" />
									</a>
								{:else}
									<a href={msg.attachment_url} target="_blank" rel="noopener" class="att-file">
										<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
										{msg.attachment_name ?? t.messagesAdmin.file}
									</a>
								{/if}
							</div>
						{/if}
						<div class="msg-actions">
							{#if msg.sender_id === currentUserId}
								<button type="button" class="msg-action-btn" onclick={() => { editingId = msg.id; editBody = msg.body; }}>
									{t.messaging.editMessage}
								</button>
							{/if}
							<form method="POST" action="?/deleteMessage" class="inline-form" use:enhance
								onsubmit={(e) => { if (!confirm(t.messaging.confirmDelete)) e.preventDefault(); }}>
								<input type="hidden" name="messageId" value={msg.id} />
								<button type="submit" class="msg-action-btn danger">{t.messaging.deleteMessage}</button>
							</form>
						</div>
					{/if}
				</div>
			{/if}
		{:else}
			<div class="empty">{t.messaging.noMessages}</div>
		{/each}
		<div bind:this={chatEnd}></div>
	</div>

	{#if data.ticket.status === 'open'}
		{#if pendingFile}
			<div class="pending-file">
				{#if isImage(pendingFile.type)}
					<img src={pendingFile.url} alt="" class="pending-thumb" />
				{:else}
					<span class="pending-name">{pendingFile.name}</span>
				{/if}
				<button class="pending-remove" onclick={() => pendingFile = null}>&times;</button>
			</div>
		{/if}
		<form method="POST" action="?/send" class="chat-input" use:enhance={() => {
			return async ({ update }) => {
				await update();
				msgBody = '';
				pendingFile = null;
			};
		}}>
			<input type="hidden" name="attachmentUrl" value={pendingFile?.url ?? ''} />
			<input type="hidden" name="attachmentName" value={pendingFile?.name ?? ''} />
			<input type="hidden" name="attachmentType" value={pendingFile?.type ?? ''} />
			<input type="file" bind:this={fileInput} onchange={handleFileSelect} class="sr-only"
				accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" />
			<button type="button" class="btn-attach" onclick={() => fileInput.click()} disabled={uploading}>
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
				</svg>
			</button>
			<input type="text" name="body" bind:value={msgBody}
				placeholder={t.messaging.writeMessage} autocomplete="off" />
			<button type="submit" class="btn-send" disabled={!msgBody.trim() && !pendingFile}>
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
				</svg>
			</button>
		</form>
	{:else}
		<div class="chat-closed">{t.messaging.ticketClosed}</div>
	{/if}
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow: hidden;
	}

	.chat-header {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 16px 24px;
		border-bottom: 1px solid var(--border);
		background: var(--bg-panel);
		flex-shrink: 0;
	}

	.back-link {
		display: flex; align-items: center; gap: 4px;
		font-size: 13px; color: var(--text-muted);
		text-decoration: none; white-space: nowrap;
	}
	.back-link:hover { color: var(--accent); }

	.chat-title { flex: 1; }
	.chat-title h2 { font-size: 16px; font-weight: 600; margin: 0; }
	.chat-meta { display: flex; gap: 10px; align-items: center; font-size: 12px; color: var(--text-muted); margin-top: 2px; }
	.email { color: var(--text-muted); }

	.chat-actions { flex-shrink: 0; }
	.btn-outline {
		padding: 5px 14px; border-radius: 6px; font-size: 12px;
		font-weight: 500; border: 1px solid var(--border);
		background: var(--bg-panel); color: var(--text-base);
		cursor: pointer;
	}
	.btn-outline:hover { border-color: var(--accent); color: var(--accent); }

	.chat-body {
		flex: 1;
		overflow-y: auto;
		padding: 20px 24px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.msg {
		max-width: 70%;
		padding: 10px 14px;
		border-radius: 12px;
		background: var(--bg-panel);
		border: 1px solid var(--border);
		align-self: flex-start;
	}
	.msg.admin {
		align-self: flex-end;
		background: var(--accent-dim);
		border-color: rgba(59,130,246,0.2);
	}

	.msg-sender {
		font-size: 11px;
		font-weight: 600;
		color: var(--text-muted);
		margin-bottom: 4px;
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.admin-badge {
		background: var(--accent);
		color: white;
		padding: 1px 6px;
		border-radius: 4px;
		font-size: 9px;
		text-transform: uppercase;
	}
	.msg-time { margin-left: auto; font-weight: 400; font-size: 10px; }

	.msg-body {
		font-size: 14px;
		line-height: 1.5;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.chat-input {
		display: flex;
		gap: 8px;
		padding: 12px 24px;
		border-top: 1px solid var(--border);
		background: var(--bg-panel);
		flex-shrink: 0;
	}

	.chat-input input {
		flex: 1;
		padding: 10px 14px;
		border-radius: 8px;
		border: 1px solid var(--border);
		font-size: 14px;
		background: var(--bg-base);
	}
	.chat-input input:focus { border-color: var(--accent); outline: none; }

	.btn-send {
		width: 40px; height: 40px;
		border-radius: 8px;
		background: var(--accent);
		color: white;
		border: none;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.btn-send:hover { opacity: 0.9; }
	.btn-send:disabled { opacity: 0.4; cursor: default; }

	.chat-closed {
		padding: 16px 24px;
		text-align: center;
		font-size: 13px;
		color: var(--text-muted);
		border-top: 1px solid var(--border);
		background: var(--bg-panel2);
	}

	.empty { text-align: center; padding: 40px; color: var(--text-muted); font-size: 14px; }

	.system-msg {
		display: flex; align-items: center; gap: 10px;
		align-self: stretch; padding: 4px 0;
	}
	.system-line { flex: 1; height: 1px; background: var(--border); }
	.system-text {
		font-size: 11px; color: var(--text-muted); white-space: nowrap;
		font-weight: 500;
	}
	.system-time { font-size: 10px; color: var(--text-muted); opacity: 0.6; white-space: nowrap; }

	.msg-attachment { margin-top: 6px; }
	.att-img { max-width: 240px; max-height: 180px; border-radius: 6px; cursor: pointer; display: block; }
	.att-file {
		display: inline-flex; align-items: center; gap: 6px;
		padding: 6px 10px; border-radius: 6px; background: var(--bg-panel2);
		border: 1px solid var(--border); font-size: 12px; color: var(--accent);
		text-decoration: none; font-weight: 500;
	}
	.att-file:hover { background: var(--accent-dim); text-decoration: none; }

	.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); border: 0; }

	.btn-attach {
		width: 40px; height: 40px; border-radius: 8px; background: var(--bg-panel2);
		color: var(--text-muted); border: 1px solid var(--border);
		cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
	}
	.btn-attach:hover { color: var(--accent); border-color: var(--accent); }

	.pending-file {
		display: flex; align-items: center; gap: 8px;
		padding: 8px 24px; border-top: 1px solid var(--border); background: var(--bg-panel2);
	}
	.pending-thumb { height: 48px; border-radius: 4px; }
	.pending-name { font-size: 12px; color: var(--text-base); }
	.pending-remove {
		margin-left: auto; width: 24px; height: 24px; border-radius: 50%;
		background: var(--danger); color: white; border: none; cursor: pointer;
		display: flex; align-items: center; justify-content: center; font-size: 14px;
	}

	.edited-tag { font-style: italic; opacity: 0.7; }

	.msg-actions {
		display: flex; gap: 8px; margin-top: 4px; opacity: 0;
		transition: opacity 0.15s;
	}
	.msg:hover .msg-actions { opacity: 1; }
	.msg-action-btn {
		background: none; border: none; font-size: 11px; font-weight: 500;
		color: var(--text-muted); cursor: pointer; padding: 0;
	}
	.msg-action-btn:hover { color: var(--accent); }
	.msg-action-btn.danger:hover { color: var(--danger); }
	.inline-form { display: inline; }

	.edit-input {
		width: 100%; padding: 6px 10px; border-radius: 6px;
		border: 1px solid var(--accent); font-size: 14px;
		background: var(--bg-base); margin-top: 4px;
	}
	.edit-actions { display: flex; gap: 6px; margin-top: 4px; }
	.btn-edit-save {
		padding: 3px 10px; border-radius: 4px; font-size: 11px; font-weight: 600;
		background: var(--accent); color: white; border: none; cursor: pointer;
	}
	.btn-edit-cancel {
		padding: 3px 10px; border-radius: 4px; font-size: 11px; font-weight: 500;
		background: var(--bg-panel2); color: var(--text-muted); border: 1px solid var(--border); cursor: pointer;
	}
</style>
