<script lang="ts">
  import { enhance } from '$app/forms';
  import { t } from '$lib/i18n.svelte';
  import type { PageData } from './$types';

  interface Props { data: PageData; }
  const { data }: Props = $props();

  let filter = $state<'all' | 'open' | 'closed'>('all');

  const openCount = $derived(data.tickets.filter(tk => tk.status === 'open').length);
  const closedCount = $derived(data.tickets.filter(tk => tk.status === 'closed').length);

  const filtered = $derived(
    filter === 'all' ? data.tickets : data.tickets.filter(tk => tk.status === filter)
  );

  function timeAgo(d: Date | string) {
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  }

  function fmtDate(d: Date | string | null) {
    if (!d) return null;
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function initials(first: string, last: string) {
    return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase();
  }

  // Stable per-person avatar tint from the name.
  const AV_COLORS = ['#4f6ef7', '#0ea5e9', '#10b981', '#f59e0b', '#e11d48', '#8b5cf6', '#14b8a6'];
  function avColor(seed: string) {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return AV_COLORS[h % AV_COLORS.length];
  }
</script>

<svelte:head><title>{t.messagesAdmin.pageTitle} – Hallify</title></svelte:head>

<div class="page">

  <div class="page-header">
    <div class="page-header-left">
      <h1 class="page-title">{t.messagesAdmin.pageTitle}</h1>
      <span class="total-badge">{data.tickets.length}</span>
    </div>
  </div>

  <div class="filters">
    <button class="filter-btn" class:active={filter === 'all'} onclick={() => filter = 'all'} type="button">
      {t.messaging.allTickets} <span class="f-count">{data.tickets.length}</span>
    </button>
    <button class="filter-btn" class:active={filter === 'open'} onclick={() => filter = 'open'} type="button"
      style:--sc="var(--success, #22c55e)">
      {t.messaging.openTickets} <span class="f-count">{openCount}</span>
    </button>
    <button class="filter-btn" class:active={filter === 'closed'} onclick={() => filter = 'closed'} type="button"
      style:--sc="var(--text-subtle)">
      {t.messaging.closedTickets} <span class="f-count">{closedCount}</span>
    </button>
  </div>

  <div class="thread-list">
    {#each filtered as ticket (ticket.id)}
      <div class="thread" class:is-closed={ticket.status === 'closed'}>
        <a href="/app/manage/messages/{ticket.id}" class="thread-main">
          <div class="thread-avatar" style="background:{avColor(ticket.user_id)}">
            {initials(ticket.user_first_name, ticket.user_last_name)}
          </div>

          <div class="thread-body">
            <div class="thread-row1">
              <span class="thread-name">{ticket.user_first_name} {ticket.user_last_name}</span>
              <span class="status-pill" class:open={ticket.status === 'open'} class:closed={ticket.status === 'closed'}>
                {ticket.status === 'open' ? t.messaging.openTickets : t.messaging.closedTickets}
              </span>
              <span class="thread-time">{timeAgo(ticket.updated_at)}</span>
            </div>

            <div class="thread-subject">
              {#if ticket.hall_name}
                <span class="thread-hall">{ticket.hall_name}</span>
                {#if ticket.event_date}<span class="thread-sep">·</span>{fmtDate(ticket.event_date)}{/if}
              {:else}
                {ticket.subject}
              {/if}
            </div>

            {#if ticket.last_message}
              <p class="thread-preview">{ticket.last_message}</p>
            {/if}

            <div class="thread-foot">
              <span class="thread-email">{ticket.user_email}</span>
              <span class="thread-count">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                {ticket.message_count}
              </span>
            </div>
          </div>

          <svg class="thread-chevron" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </a>

        <div class="thread-actions">
          {#if ticket.status === 'open'}
            <form method="POST" action="?/close" use:enhance style="display:contents">
              <input type="hidden" name="id" value={ticket.id} />
              <button type="submit" class="action-btn action-close"
                onclick={(e) => { if (!confirm(t.messagesAdmin.confirmClose)) e.preventDefault(); }}>
                {t.messaging.close}
              </button>
            </form>
          {:else}
            <form method="POST" action="?/reopen" use:enhance style="display:contents">
              <input type="hidden" name="id" value={ticket.id} />
              <button type="submit" class="action-btn action-reopen">{t.messaging.reopen}</button>
            </form>
          {/if}
        </div>
      </div>
    {:else}
      <div class="empty">
        <div class="empty-icon">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </div>
        <p class="empty-title">
          {#if filter === 'open'}{t.messagesAdmin.emptyOpen}
          {:else if filter === 'closed'}{t.messagesAdmin.emptyClosed}
          {:else}{t.messagesAdmin.emptyAll}{/if}
        </p>
        <p class="empty-sub">{t.messagesAdmin.emptyHint}</p>
      </div>
    {/each}
  </div>
</div>

<style>
  .page { padding: 24px 28px; }

  /* Header */
  .page-header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 18px;
  }
  .page-header-left { display: flex; align-items: center; gap: 10px; }
  .page-title { font-size: 18px; font-weight: 800; color: var(--text-base); letter-spacing: -.025em; margin: 0; }
  .total-badge {
    font-size: 12px; font-weight: 700; color: var(--text-muted);
    background: var(--bg-panel2, var(--bg-base)); border: 1px solid var(--border);
    border-radius: 99px; padding: 1px 9px; line-height: 1.6;
  }

  /* Filters */
  .filters { display: flex; gap: 6px; margin-bottom: 18px; flex-wrap: wrap; }
  .filter-btn {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 5px 13px; border-radius: 99px; font-size: 12px; font-weight: 500;
    background: var(--bg-panel); border: 1px solid var(--border);
    color: var(--text-muted); cursor: pointer; font-family: inherit;
    transition: border-color .12s, color .12s, background .12s;
  }
  .filter-btn:hover { border-color: var(--accent); color: var(--text-base); }
  .filter-btn.active {
    background: color-mix(in srgb, var(--sc, var(--accent)) 10%, transparent);
    border-color: color-mix(in srgb, var(--sc, var(--accent)) 35%, transparent);
    color: var(--sc, var(--accent)); font-weight: 600;
  }
  .f-count {
    background: var(--bg-panel2, var(--bg-base)); padding: 0 6px; border-radius: 9px;
    font-size: 11px; font-weight: 700; line-height: 1.6;
  }
  .filter-btn.active .f-count { background: color-mix(in srgb, var(--sc, var(--accent)) 16%, transparent); }

  /* Thread list */
  .thread-list { display: flex; flex-direction: column; gap: 8px; }

  .thread {
    display: flex; align-items: stretch;
    background: var(--bg-panel); border: 1px solid var(--border);
    border-radius: 12px; overflow: hidden;
    transition: border-color .12s, box-shadow .12s;
  }
  .thread:hover { border-color: color-mix(in srgb, var(--accent) 45%, var(--border)); box-shadow: var(--shadow-sm); }
  .thread.is-closed { opacity: .72; }
  .thread.is-closed:hover { opacity: 1; }

  .thread-main {
    flex: 1; min-width: 0;
    display: flex; align-items: flex-start; gap: 13px;
    padding: 14px 16px; text-decoration: none; color: inherit;
  }

  .thread-avatar {
    flex-shrink: 0; width: 38px; height: 38px; border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-size: 13px; font-weight: 700; letter-spacing: .02em;
  }

  .thread-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }

  .thread-row1 { display: flex; align-items: center; gap: 8px; }
  .thread-name { font-size: 14px; font-weight: 600; color: var(--text-base); }
  .status-pill {
    font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em;
    border-radius: 99px; padding: 1px 8px;
  }
  .status-pill.open { color: var(--success, #16a34a); background: color-mix(in srgb, var(--success, #22c55e) 14%, transparent); }
  .status-pill.closed { color: var(--text-subtle); background: var(--bg-panel2, var(--bg-base)); }
  .thread-time { margin-left: auto; font-size: 11px; color: var(--text-subtle); flex-shrink: 0; }

  .thread-subject { font-size: 12.5px; color: var(--text-muted); }
  .thread-hall { font-weight: 600; color: var(--text-base); }
  .thread-sep { margin: 0 5px; color: var(--text-subtle); }

  .thread-preview {
    font-size: 13px; color: var(--text-muted); margin: 2px 0 0; line-height: 1.5;
    display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }

  .thread-foot { display: flex; align-items: center; gap: 10px; margin-top: 6px; }
  .thread-email {
    font-size: 11px; color: var(--text-subtle);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;
  }
  .thread-count {
    display: inline-flex; align-items: center; gap: 4px; margin-left: auto; flex-shrink: 0;
    font-size: 11px; font-weight: 600; color: var(--text-subtle);
  }
  .thread-count svg { opacity: .6; }

  .thread-chevron { flex-shrink: 0; align-self: center; color: var(--text-subtle); }

  .thread-actions {
    display: flex; align-items: center; padding: 0 14px;
    border-left: 1px solid var(--border); background: var(--bg-panel2, var(--bg-base));
    flex-shrink: 0;
  }
  .action-btn {
    padding: 6px 14px; border-radius: 8px; font-size: 12px; font-weight: 600;
    border: 1px solid var(--border); background: var(--bg-panel);
    cursor: pointer; font-family: inherit; white-space: nowrap;
    transition: color .1s, border-color .1s, background .1s;
  }
  .action-close { color: var(--text-muted); }
  .action-close:hover { color: var(--danger, #ef4444); border-color: color-mix(in srgb, var(--danger, #ef4444) 45%, var(--border)); }
  .action-reopen { color: var(--success, #22c55e); border-color: color-mix(in srgb, var(--success, #22c55e) 40%, transparent); }
  .action-reopen:hover { background: color-mix(in srgb, var(--success, #22c55e) 8%, transparent); }

  /* Empty */
  .empty { text-align: center; padding: 56px 20px; }
  .empty-icon {
    width: 56px; height: 56px; border-radius: 16px; margin: 0 auto 16px;
    display: flex; align-items: center; justify-content: center;
    background: var(--bg-panel); border: 1px solid var(--border); color: var(--text-subtle);
  }
  .empty-title { font-size: 15px; font-weight: 700; color: var(--text-base); margin: 0 0 4px; text-transform: capitalize; }
  .empty-sub { font-size: 13px; color: var(--text-muted); margin: 0; }

  @media (max-width: 640px) {
    .page { padding: 20px 16px; }
    .thread { flex-direction: column; }
    .thread-actions { border-left: none; border-top: 1px solid var(--border); padding: 10px 16px; }
    .action-btn { width: 100%; }
  }
</style>
