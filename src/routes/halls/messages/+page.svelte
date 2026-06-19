<script lang="ts">
	import type { PageData } from './$types';
	import { fmtDate } from '$lib/reservationStatus';
	import { t as tr } from '$lib/i18n.svelte';

	interface Props { data: PageData; }
	const { data }: Props = $props();

	function fmtWhen(ts: string) {
		const iso = ts.includes('T') ? ts : ts.replace(' ', 'T') + 'Z';
		return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
	}
</script>

<svelte:head><title>{tr.nav.messages} – {data.domainOrg.name}</title></svelte:head>

<div class="page">
	<header class="head">
		<h1>{tr.nav.messages}</h1>
		<p>{tr.bubble.conversationsWith} {data.domainOrg.name}.</p>
	</header>

	{#if data.threads.length === 0}
		<div class="empty">
			<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
			<p class="empty-title">{tr.bubble.noConversations}</p>
			<p class="empty-sub">{tr.bubble.noConversationsHint}</p>
			<a href="/halls/my-reservations" class="btn-primary">{tr.bubble.myReservations}</a>
		</div>
	{:else}
		<div class="list">
			{#each data.threads as t}
				<a class="thread" href="/halls/my-reservations/{t.reservation_id}">
					<div class="avatar">{data.domainOrg.name[0]?.toUpperCase() ?? '?'}</div>
					<div class="thread-main">
						<div class="thread-top">
							<span class="thread-title">{t.res_title}</span>
							<span class="thread-when">{fmtWhen(t.updated_at)}</span>
						</div>
						<span class="thread-date">{fmtDate(t.event_date)}</span>
						<span class="thread-last">{t.last_message ?? tr.bubble.noMessagesYet}</span>
					</div>
					{#if t.unread}<span class="dot" title="Unread"></span>{/if}
				</a>
			{/each}
		</div>
	{/if}
</div>

<style>
	.page { display: flex; flex-direction: column; gap: 18px; }
	.head h1 { font-size: 22px; font-weight: 800; color: var(--text-base); letter-spacing: -0.02em; margin: 0; }
	.head p { font-size: 13px; color: var(--text-muted); margin: 4px 0 0; }

	.list { display: flex; flex-direction: column; border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; background: var(--bg-panel); }
	.thread { display: flex; align-items: center; gap: 13px; padding: 14px 16px; text-decoration: none; color: inherit; transition: background .1s; }
	.thread:not(:last-child) { border-bottom: 1px solid var(--border); }
	.thread:hover { background: var(--bg-hover); text-decoration: none; }
	.avatar { width: 38px; height: 38px; border-radius: 50%; background: var(--accent); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 700; flex-shrink: 0; }
	.thread-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
	.thread-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
	.thread-title { font-size: 14px; font-weight: 700; color: var(--text-base); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.thread-when { font-size: 11px; color: var(--text-subtle); flex-shrink: 0; }
	.thread-date { font-size: 12px; color: var(--text-muted); }
	.thread-last { font-size: 12.5px; color: var(--text-subtle); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.dot { width: 9px; height: 9px; border-radius: 50%; background: var(--accent); flex-shrink: 0; }

	.btn-primary { display: inline-flex; align-items: center; gap: 7px; padding: 8px 16px; border-radius: var(--radius); background: var(--accent); color: #fff; font-size: 13px; font-weight: 600; border: none; cursor: pointer; text-decoration: none; transition: opacity .12s; }
	.btn-primary:hover { opacity: .9; text-decoration: none; }

	.empty { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 52px 20px; text-align: center; background: var(--bg-panel); border: 1px dashed var(--border); border-radius: var(--radius-lg); }
	.empty svg { color: var(--text-subtle); opacity: .6; }
	.empty-title { font-size: 14px; font-weight: 700; color: var(--text-base); margin: 4px 0 0; }
	.empty-sub { font-size: 13px; color: var(--text-muted); margin: 0 0 6px; max-width: 44ch; }
</style>
