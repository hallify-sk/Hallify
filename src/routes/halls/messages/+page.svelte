<script lang="ts">
	import { venueTitle } from '$lib/page-title';
	import type { PageData } from './$types';
	import { fmtDate } from '$lib/reservationStatus';
	import { t as tr, getLocale } from '$lib/i18n.svelte';
	import { formatDate } from '$lib/format';

	interface Props { data: PageData; }
	const { data }: Props = $props();

	// Stored in UTC without a zone; formatDate reads it as UTC and prints it in the
	// visitor's language (it was always English: '23 Oct').
	const fmtWhen = (ts: string) => formatDate(ts, getLocale(), { day: 'numeric', month: 'short' });
</script>

<svelte:head><title>{venueTitle(data.domainOrg.name, tr.nav.messages)}</title></svelte:head>

<div class="page">
	<section class="section section--lead section--flush">
		<div class="section-head">
			<p class="eyebrow">{tr.messaging.manage}</p>
			<h1>{tr.nav.messages}</h1>
			<p>{tr.bubble.conversationsWith} {data.domainOrg.name}.</p>
		</div>

		{#if data.threads.length === 0}
			<div class="card card--inset empty">
				<div class="icon-tile">
					<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
				</div>
				<p class="empty-title">{tr.bubble.noConversations}</p>
				<p class="empty-sub">{tr.bubble.noConversationsHint}</p>
				<a href="/halls/my-reservations" class="btn-primary">{tr.bubble.myReservations}</a>
			</div>
		{:else}
			<div class="row-list">
				{#each data.threads as t}
					<a class="row-item thread" href="/halls/my-reservations/{t.reservation_id}">
						<div class="avatar">{data.domainOrg.name[0]?.toUpperCase() ?? '?'}</div>
						<div class="thread-main">
							<div class="thread-top">
								<span class="thread-title">{t.res_title}</span>
								<span class="thread-when">{fmtWhen(t.updated_at)}</span>
							</div>
							<span class="thread-date">{fmtDate(t.event_date, getLocale())}</span>
							<span class="thread-last">{t.last_message ?? tr.bubble.noMessagesYet}</span>
						</div>
						{#if t.unread}<span class="dot" title={tr.bubble.unread} aria-label={tr.bubble.unread}></span>{/if}
					</a>
				{/each}
			</div>
		{/if}
	</section>
</div>

<style>
	.section-head h1 { font-size: var(--display-size); font-weight: 550; color: var(--text-base); letter-spacing: -.055em; line-height: 1.08; margin: 0; }

	.thread { align-items: center; }
	.avatar { width: 38px; height: 38px; border-radius: 50%; background: var(--accent); color: var(--accent-contrast); display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 650; flex-shrink: 0; }
	.thread-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
	.thread-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
	.thread-title { font-size: 14px; font-weight: 650; letter-spacing: -0.03em; color: var(--text-base); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.thread-when { font-size: 11px; color: var(--text-subtle); flex-shrink: 0; }
	.thread-date { font-size: 12px; color: var(--text-muted); }
	.thread-last { font-size: 12.5px; color: var(--text-subtle); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.dot { width: 9px; height: 9px; border-radius: 50%; background: var(--accent); flex-shrink: 0; }

	.btn-primary { display: inline-flex; align-items: center; gap: 7px; padding: 10px 20px; border-radius: var(--radius-sm); background: var(--accent); color: var(--accent-contrast); font-size: 13px; font-weight: 650; border: none; cursor: pointer; text-decoration: none; transition: transform .2s, background .2s; }
	.btn-primary:hover { background: var(--accent-hover); transform: translateY(-2px); text-decoration: none; }
	.btn-primary:active { transform: translateY(0); }

	.empty { display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; }
	.empty-title { font-size: 14px; font-weight: 650; letter-spacing: -0.03em; color: var(--text-base); margin: 4px 0 0; }
	.empty-sub { font-size: 13px; color: var(--text-muted); margin: 0 0 6px; max-width: 44ch; }
</style>
