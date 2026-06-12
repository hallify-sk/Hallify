<script lang="ts">
  import { enhance } from '$app/forms';
  import SectionHeader from '$lib/components/SectionHeader.svelte';
  import type { PageData } from './$types';

  interface Props { data: PageData; }
  const { data }: Props = $props();

  let filter = $state<'all' | 'open' | 'closed'>('all');

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
</script>

<svelte:head><title>Client Threads – Hallify</title></svelte:head>

<div class="page">
  <SectionHeader overline="Messages" title="Client Threads" />

  <div class="filters">
    <button class="filter-btn" class:active={filter === 'all'} onclick={() => filter = 'all'} type="button">
      All <span class="count">{data.tickets.length}</span>
    </button>
    <button class="filter-btn" class:active={filter === 'open'} onclick={() => filter = 'open'} type="button">
      Open <span class="count">{data.tickets.filter(tk => tk.status === 'open').length}</span>
    </button>
    <button class="filter-btn" class:active={filter === 'closed'} onclick={() => filter = 'closed'} type="button">
      Closed <span class="count">{data.tickets.filter(tk => tk.status === 'closed').length}</span>
    </button>
  </div>

  <div class="ticket-list">
    {#each filtered as ticket}
      <div class="ticket-card">
        <a href="/app/manage/messages/{ticket.id}" class="ticket-link">
          <div class="ticket-top">
            <div class="ticket-left">
              <span class="ticket-dot" class:open={ticket.status === 'open'} class:closed={ticket.status === 'closed'}></span>
              <div class="ticket-info">
                <span class="ticket-subject">
                  {ticket.hall_name ?? ticket.subject}
                </span>
                {#if ticket.hall_name && ticket.event_date}
                  <span class="ticket-meta-line">
                    {fmtDate(ticket.event_date)} · {ticket.subject}
                  </span>
                {/if}
              </div>
            </div>
            <span class="ticket-time">{timeAgo(ticket.updated_at)}</span>
          </div>

          <div class="ticket-meta">
            <span class="ticket-user">{ticket.user_first_name} {ticket.user_last_name}</span>
            <span class="ticket-email">{ticket.user_email}</span>
            <span class="msg-count">{ticket.message_count} msg{ticket.message_count === 1 ? '' : 's'}</span>
          </div>

          {#if ticket.last_message}
            <div class="ticket-preview">{ticket.last_message}</div>
          {/if}
        </a>

        <div class="ticket-actions">
          {#if ticket.status === 'open'}
            <form method="POST" action="?/close" use:enhance style="display:contents">
              <input type="hidden" name="id" value={ticket.id} />
              <button type="submit" class="action-btn action-close"
                onclick={(e) => { if (!confirm('Close this thread?')) e.preventDefault(); }}>
                Close
              </button>
            </form>
          {:else}
            <form method="POST" action="?/reopen" use:enhance style="display:contents">
              <input type="hidden" name="id" value={ticket.id} />
              <button type="submit" class="action-btn action-reopen">Reopen</button>
            </form>
          {/if}
        </div>
      </div>
    {:else}
      <div class="empty">No threads found.</div>
    {/each}
  </div>
</div>

<style>
  .page { padding: 28px 32px; max-width: 860px; }

  .filters {
    display: flex; gap: 6px; margin-bottom: 20px;
  }
  .filter-btn {
    display: flex; align-items: center; gap: 6px;
    padding: 6px 14px; border-radius: 20px; font-size: 12px;
    font-weight: 500; background: var(--bg-panel); border: 1px solid var(--border);
    color: var(--text-muted); cursor: pointer; transition: all .12s;
  }
  .filter-btn:hover { border-color: var(--accent); color: var(--text-base); }
  .filter-btn.active { background: color-mix(in srgb, var(--accent) 10%, transparent); border-color: var(--accent); color: var(--accent); font-weight: 600; }
  .count { background: var(--bg-panel2, var(--bg-base)); padding: 1px 7px; border-radius: 10px; font-size: 11px; }

  .ticket-list { display: flex; flex-direction: column; gap: 8px; }

  .ticket-card {
    background: var(--bg-panel); border: 1px solid var(--border);
    border-radius: 10px; overflow: hidden;
    display: flex; align-items: stretch;
    transition: border-color .12s;
  }
  .ticket-card:hover { border-color: color-mix(in srgb, var(--accent) 50%, var(--border)); }

  .ticket-link {
    flex: 1; padding: 14px 18px; text-decoration: none; color: var(--text-base);
    display: block;
  }

  .ticket-top { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 6px; gap: 12px; }
  .ticket-left { display: flex; align-items: flex-start; gap: 8px; min-width: 0; }
  .ticket-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; margin-top: 4px; }
  .ticket-dot.open   { background: var(--success, #22c55e); }
  .ticket-dot.closed { background: var(--text-subtle); }
  .ticket-info { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .ticket-subject { font-weight: 600; font-size: 14px; color: var(--text-base); }
  .ticket-meta-line { font-size: 11px; color: var(--text-subtle); }
  .ticket-time { font-size: 11px; color: var(--text-muted); flex-shrink: 0; margin-top: 2px; }

  .ticket-meta {
    display: flex; gap: 10px; font-size: 12px; color: var(--text-muted); margin-bottom: 4px;
    flex-wrap: wrap; align-items: center;
  }
  .ticket-user { font-weight: 500; }
  .ticket-email { color: var(--text-subtle); }
  .msg-count { color: var(--text-subtle); margin-left: auto; }

  .ticket-preview {
    font-size: 13px; color: var(--text-muted);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  .ticket-actions {
    display: flex; align-items: center;
    padding: 0 14px;
    border-left: 1px solid var(--border);
    background: var(--bg-panel2, var(--bg-base));
    flex-shrink: 0;
  }
  .action-btn {
    padding: 6px 14px; border-radius: 7px; font-size: 12px; font-weight: 500;
    border: 1px solid var(--border); background: var(--bg-panel);
    cursor: pointer; font-family: inherit; white-space: nowrap;
    transition: color .1s, border-color .1s;
  }
  .action-close { color: var(--text-muted); }
  .action-close:hover { color: var(--danger, #ef4444); border-color: var(--danger, #ef4444); }
  .action-reopen { color: var(--success, #22c55e); border-color: color-mix(in srgb, var(--success, #22c55e) 40%, transparent); }
  .action-reopen:hover { opacity: .8; }

  .empty { text-align: center; padding: 60px 20px; color: var(--text-muted); font-size: 14px; }
</style>
