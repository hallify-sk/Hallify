<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { t as tr } from '$lib/i18n.svelte';
  import type { PageData } from './$types';

  interface Props { data: PageData; }
  const { data }: Props = $props();

  const channels        = $derived(data.channels);
  const tickets         = $derived(data.tickets);
  const myReservations  = $derived(data.myReservations);
  const members         = $derived(data.members);
  const activeChannel   = $derived(data.activeChannel);
  const activeTicket    = $derived(data.activeTicket);
  const channelMessages = $derived(data.channelMessages);
  const ticketMessages  = $derived(data.ticketMessages);
  const currentUserId   = $derived(data.currentUserId);
  const orgRole         = $derived(data.orgRole);

  const onlineCount = $derived(members.filter((m: { is_online: boolean }) => m.is_online).length);

  let body         = $state('');
  let editingId    = $state<string | null>(null);
  let editBody     = $state('');
  let showNewTicket   = $state(false);
  let showNewChannel  = $state(false);
  let threadEl     = $state<HTMLDivElement | null>(null);

  $effect(() => {
    void channelMessages.length;
    void ticketMessages.length;
    if (threadEl) threadEl.scrollTop = threadEl.scrollHeight;
  });

  $effect(() => {
    if (!activeChannel && !activeTicket) return;
    const timer = setInterval(() => invalidateAll(), 3000);
    return () => clearInterval(timer);
  });

  $effect(() => {
    const beat = () => fetch('/api/presence', { method: 'POST' }).catch(() => {});
    beat();
    const timer = setInterval(beat, 30_000);
    return () => clearInterval(timer);
  });

  function timeAgo(d: Date | string) {
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return tr.memberMessages.timeNow;
    if (mins < 60) return `${mins}${tr.memberMessages.timeMinutes}`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}${tr.memberMessages.timeHours}`;
    return `${Math.floor(hrs / 24)}${tr.memberMessages.timeDays}`;
  }

  function initials(first: string, last: string) {
    return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase();
  }

  function avatarColor(id: string) {
    const colors = ['#4f6ef7','#22c55e','#f59e0b','#8b5cf6','#14b8a6','#ec4899','#f97316'];
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffffffff;
    return colors[Math.abs(h) % colors.length];
  }

  function startEdit(id: string, currentBody: string) { editingId = id; editBody = currentBody; }
  function cancelEdit() { editingId = null; editBody = ''; }

  function shouldShowMeta(msgs: { sender_id: string; created_at: Date | string }[], i: number) {
    if (i === 0) return true;
    if (msgs[i - 1].sender_id !== msgs[i].sender_id) return true;
    return new Date(msgs[i].created_at).getTime() - new Date(msgs[i - 1].created_at).getTime() > 5 * 60 * 1000;
  }

  function submitOnEnter(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      (e.currentTarget as HTMLElement).closest('form')?.requestSubmit();
    }
  }
</script>

<svelte:head>
  <title>{activeChannel ? `#${activeChannel.name}` : activeTicket ? activeTicket.subject : tr.memberMessages.pageTitle} – Hallify</title>
</svelte:head>

<div class="hub">

  <!-- ─── Left nav ─────────────────────────────────────────────────────── -->
  <nav class="msg-nav">

    <div class="nav-section">
      <div class="nav-section-header">
        <span class="nav-section-label">{tr.memberMessages.team}</span>
        {#if onlineCount > 0}
          <span class="online-pill"><span class="online-dot"></span>{onlineCount} {tr.memberMessages.online}</span>
        {/if}
      </div>

      <div class="presence-strip">
        {#each members.slice(0, 8) as m}
          <div class="presence-av" title="{m.first_name} {m.last_name} — {m.is_online ? tr.memberMessages.online : tr.memberMessages.offline}">
            <span class="av-inner" style="background:{avatarColor(m.user_id)}">{initials(m.first_name, m.last_name)}</span>
            <span class="presence-dot" class:online={m.is_online}></span>
          </div>
        {/each}
        {#if members.length > 8}<div class="presence-av-more">+{members.length - 8}</div>{/if}
      </div>

      {#each channels as ch}
        <a href="/app/messages?c={ch.id}" class="nav-item" class:active={activeChannel?.id === ch.id}>
          <span class="ch-icon">{ch.type === 'announcement' ? '📣' : '#'}</span>
          <span class="nav-item-name">{ch.name}</span>
          {#if parseInt(ch.unread_count) > 0}<span class="unread-badge">{ch.unread_count}</span>{/if}
        </a>
      {/each}

      {#if orgRole === 'owner' || orgRole === 'admin'}
        <button class="nav-new-btn" type="button" onclick={() => { showNewChannel = !showNewChannel; showNewTicket = false; }}>
          {tr.memberMessages.newChannel}
        </button>
        {#if showNewChannel}
          <form method="POST" action="?/createChannel" use:enhance={() => { showNewChannel = false; return async ({ update }) => update(); }} class="inline-form">
            <input name="name" placeholder={tr.memberMessages.channelNamePlaceholder} required class="inline-input" autocomplete="off" />
            <input name="description" placeholder={tr.memberMessages.descriptionPlaceholder} class="inline-input" />
            <div class="inline-actions">
              <button type="submit" class="btn-xs btn-accent">{tr.common.create}</button>
              <button type="button" class="btn-xs" onclick={() => showNewChannel = false}>{tr.common.cancel}</button>
            </div>
          </form>
        {/if}
      {/if}
    </div>

    <div class="nav-divider"></div>

    <div class="nav-section">
      <div class="nav-section-header">
        <span class="nav-section-label">{tr.memberMessages.clients}</span>
        <button class="nav-new-btn-inline" type="button" onclick={() => { showNewTicket = !showNewTicket; showNewChannel = false; }}>{tr.memberMessages.newShort}</button>
      </div>

      {#if showNewTicket}
        <form method="POST" action="?/createTicket" use:enhance={() => { showNewTicket = false; return async ({ update }) => update(); }} class="inline-form">
          {#if myReservations.length === 0}
            <p class="inline-hint">{tr.memberMessages.noReservationsHint}</p>
          {:else}
            <label class="inline-label">{tr.memberMessages.reservation}</label>
            <select name="reservation_id" required class="inline-input inline-select">
              <option value="">{tr.memberMessages.selectReservation}</option>
              {#each myReservations as r}
                <option value={r.id}>{r.hall_name} – {new Date(r.event_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</option>
              {/each}
            </select>
            <textarea name="body" placeholder={tr.memberMessages.ticketBodyPlaceholder} rows="2" required class="inline-input inline-textarea"></textarea>
            <div class="inline-actions">
              <button type="submit" class="btn-xs btn-accent">{tr.messaging.send}</button>
              <button type="button" class="btn-xs" onclick={() => showNewTicket = false}>{tr.common.cancel}</button>
            </div>
          {/if}
          {#if myReservations.length === 0}
            <button type="button" class="btn-xs" onclick={() => showNewTicket = false}>{tr.memberMessages.closePopup}</button>
          {/if}
        </form>
      {/if}

      {#each tickets as t}
        <a href="/app/messages?t={t.id}" class="nav-item nav-item-ticket" class:active={activeTicket?.id === t.id}>
          <span class="ticket-status-dot" class:open={t.status === 'open'} class:closed={t.status === 'closed'}></span>
          <span class="nav-item-name">
            {#if t.hall_name}{t.hall_name}{:else}{t.subject}{/if}
          </span>
          {#if t.unread}<span class="unread-dot"></span>{/if}
        </a>
      {:else}
        <p class="nav-empty">{tr.memberMessages.noThreadsYet}</p>
      {/each}
    </div>
  </nav>

  <!-- ─── Right panel ───────────────────────────────────────────────────── -->
  <div class="msg-view">

    {#if activeChannel}

      <div class="msg-header">
        <div class="msg-header-left">
          <span class="header-icon">{activeChannel.type === 'announcement' ? '📣' : '#'}</span>
          <span class="header-title">{activeChannel.name}</span>
          {#if activeChannel.description}<span class="header-desc">{activeChannel.description}</span>{/if}
        </div>
        <span class="member-count">{members.length} {tr.memberMessages.membersLower} · {onlineCount} {tr.memberMessages.online}</span>
      </div>

      <div class="msg-thread" bind:this={threadEl}>
        {#if channelMessages.length === 0}
          <div class="thread-empty">
            <p class="thread-empty-title">{tr.memberMessages.startOf} #{activeChannel.name}</p>
            <p class="thread-empty-sub">{tr.memberMessages.sayHello}</p>
          </div>
        {/if}

        {#each channelMessages as msg, i}
          {@const showMeta = shouldShowMeta(channelMessages, i)}
          {@const isOwn = msg.sender_id === currentUserId}
          {@const member = members.find((m: { user_id: string }) => m.user_id === msg.sender_id)}
          <div class="msg-row" class:editing={editingId === msg.id}>
            {#if showMeta}
              <div class="msg-av-wrap">
                <div class="msg-av" style="background:{avatarColor(msg.sender_id)}">{initials(msg.sender_first_name, msg.sender_last_name)}</div>
                {#if member?.is_online}<span class="av-online-dot"></span>{/if}
              </div>
            {:else}
              <div class="msg-av-spacer"></div>
            {/if}
            <div class="msg-body">
              {#if showMeta}
                <div class="msg-meta">
                  <span class="msg-author">{msg.sender_first_name} {msg.sender_last_name}</span>
                  {#if member}<span class="msg-role role-{member.role}">{member.role}</span>{/if}
                  <span class="msg-time">{timeAgo(msg.created_at)}</span>
                </div>
              {/if}
              {#if editingId === msg.id}
                <form method="POST" action="?/editChannel" use:enhance={() => { editingId = null; return async ({ update }) => update(); }}>
                  <input type="hidden" name="msg_id" value={msg.id} />
                  <input class="edit-input" name="body" bind:value={editBody} onkeydown={(e) => { if (e.key === 'Escape') cancelEdit(); }} />
                  <div class="edit-actions">
                    <button type="submit" class="btn-xs btn-accent">{tr.common.save}</button>
                    <button type="button" class="btn-xs" onclick={cancelEdit}>{tr.common.cancel}</button>
                  </div>
                </form>
              {:else}
                <p class="msg-text">{msg.body}{#if msg.edited_at}<span class="msg-edited"> ({tr.messaging.edited})</span>{/if}</p>
              {/if}
            </div>
            {#if isOwn && editingId !== msg.id}
              <div class="msg-actions">
                <button type="button" class="action-btn" title={tr.common.edit} onclick={() => startEdit(msg.id, msg.body)}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <form method="POST" action="?/deleteChannel" use:enhance style="display:contents">
                  <input type="hidden" name="msg_id" value={msg.id} />
                  <button type="submit" class="action-btn action-btn-danger" title={tr.common.delete}
                    onclick={(e) => { if (!confirm(tr.messaging.confirmDelete)) e.preventDefault(); }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                  </button>
                </form>
              </div>
            {/if}
          </div>
        {/each}
      </div>

      <form class="compose" method="POST" action="?/sendChannel" use:enhance={() => { body = ''; return async ({ update }) => update(); }}>
        <input type="hidden" name="channel_id" value={activeChannel.id} />
        <input class="compose-input" name="body" placeholder="{tr.memberMessages.messagePrefix} #{activeChannel.name}…" bind:value={body} onkeydown={submitOnEnter} autocomplete="off" />
        <button type="submit" class="compose-send" disabled={!body.trim()}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </form>

    {:else if activeTicket}

      <div class="msg-header">
        <div class="msg-header-left">
          <span class="ticket-header-dot" class:open={activeTicket.status === 'open'} class:closed={activeTicket.status === 'closed'}></span>
          <div class="ticket-header-info">
            <span class="header-title">
              {activeTicket.hall_name ?? activeTicket.subject}
            </span>
            {#if activeTicket.hall_name && activeTicket.event_date}
              <span class="header-desc">{new Date(activeTicket.event_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            {/if}
          </div>
          <span class="ticket-badge" class:badge-open={activeTicket.status === 'open'} class:badge-closed={activeTicket.status === 'closed'}>{activeTicket.status === 'open' ? tr.status.open : tr.status.closed}</span>
        </div>
        <div class="msg-header-right">
          {#if activeTicket.status === 'open'}
            <form method="POST" action="?/closeTicket" use:enhance style="display:contents">
              <input type="hidden" name="ticket_id" value={activeTicket.id} />
              <button type="submit" class="header-action-btn"
                onclick={(e) => { if (!confirm(tr.memberMessages.confirmCloseThread)) e.preventDefault(); }}>
                {tr.memberMessages.closeThread}
              </button>
            </form>
          {:else}
            <form method="POST" action="?/reopenTicket" use:enhance style="display:contents">
              <input type="hidden" name="ticket_id" value={activeTicket.id} />
              <button type="submit" class="header-action-btn header-action-reopen">{tr.messaging.reopen}</button>
            </form>
          {/if}
        </div>
      </div>

      <div class="msg-thread" bind:this={threadEl}>
        {#each ticketMessages as msg, i}
          {#if msg.message_type === 'system'}
            <div class="msg-system">{msg.body}</div>
          {:else}
            {@const showMeta = shouldShowMeta(ticketMessages, i)}
            {@const isOwn = msg.sender_id === currentUserId}
            {@const isSupport = msg.sender_role === 'owner' || msg.sender_role === 'admin'}
            <div class="msg-row" class:editing={editingId === msg.id}>
              {#if showMeta}
                <div class="msg-av-wrap">
                  <div class="msg-av" style="background:{avatarColor(msg.sender_id)}">{initials(msg.sender_first_name, msg.sender_last_name)}</div>
                </div>
              {:else}
                <div class="msg-av-spacer"></div>
              {/if}
              <div class="msg-body">
                {#if showMeta}
                  <div class="msg-meta">
                    <span class="msg-author">{msg.sender_first_name} {msg.sender_last_name}</span>
                    {#if isSupport}<span class="msg-role role-admin">{tr.memberMessages.support}</span>{/if}
                    <span class="msg-time">{timeAgo(msg.created_at)}</span>
                  </div>
                {/if}
                {#if editingId === msg.id}
                  <form method="POST" action="?/editTicket" use:enhance={() => { editingId = null; return async ({ update }) => update(); }}>
                    <input type="hidden" name="msg_id" value={msg.id} />
                    <input class="edit-input" name="body" bind:value={editBody} onkeydown={(e) => { if (e.key === 'Escape') cancelEdit(); }} />
                    <div class="edit-actions">
                      <button type="submit" class="btn-xs btn-accent">{tr.common.save}</button>
                      <button type="button" class="btn-xs" onclick={cancelEdit}>{tr.common.cancel}</button>
                    </div>
                  </form>
                {:else}
                  {#if msg.body}<p class="msg-text">{msg.body}{#if msg.edited_at}<span class="msg-edited"> ({tr.messaging.edited})</span>{/if}</p>{/if}
                  {#if msg.attachment_url}
                    {#if msg.attachment_type?.startsWith('image/')}
                      <img src={msg.attachment_url} alt={msg.attachment_name ?? tr.memberMessages.attachment} class="msg-image" />
                    {:else}
                      <a href={msg.attachment_url} target="_blank" rel="noopener noreferrer" class="msg-file">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                        {msg.attachment_name}
                      </a>
                    {/if}
                  {/if}
                {/if}
              </div>
              {#if isOwn && editingId !== msg.id && msg.message_type === 'text'}
                <div class="msg-actions">
                  <button type="button" class="action-btn" title={tr.common.edit} onclick={() => startEdit(msg.id, msg.body ?? '')}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  <form method="POST" action="?/deleteTicket" use:enhance style="display:contents">
                    <input type="hidden" name="msg_id" value={msg.id} />
                    <button type="submit" class="action-btn action-btn-danger" title={tr.common.delete}
                      onclick={(e) => { if (!confirm(tr.messaging.confirmDelete)) e.preventDefault(); }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                    </button>
                  </form>
                </div>
              {/if}
            </div>
          {/if}
        {:else}
          <div class="thread-empty">
            <p class="thread-empty-title">{tr.memberMessages.threadOpened}</p>
            <p class="thread-empty-sub">{tr.memberMessages.noRepliesYet}</p>
          </div>
        {/each}
      </div>

      {#if activeTicket.status === 'open'}
        <form class="compose" method="POST" action="?/sendTicket" use:enhance={() => { body = ''; return async ({ update }) => update(); }}>
          <input type="hidden" name="ticket_id" value={activeTicket.id} />
          <input class="compose-input" name="body" placeholder={tr.memberMessages.replyPlaceholder} bind:value={body} onkeydown={submitOnEnter} autocomplete="off" />
          <button type="submit" class="compose-send" disabled={!body.trim()}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </form>
      {:else}
        <div class="compose-closed">{tr.memberMessages.ticketClosed}</div>
      {/if}

    {:else}
      <div class="empty-state">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <p>{tr.memberMessages.selectToStart}</p>
      </div>
    {/if}
  </div>
</div>

<style>
  @keyframes pageFadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes fadeSlideUp {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .hub {
    display: flex;
    height: 100%;
    overflow: hidden;
    animation: pageFadeIn 0.15s ease both;
  }

  /* ── Left nav ── */
  .msg-nav {
    width: 224px;
    flex-shrink: 0;
    background: var(--bg-panel);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    scrollbar-width: thin;
    animation: fadeSlideUp 0.35s ease both;
    animation-delay: 0ms;
  }

  .nav-section { padding: 14px 0 4px; }

  .nav-section-header {
    display: flex; align-items: center;
    justify-content: space-between;
    padding: 0 14px 6px;
  }
  .nav-section-label {
    font-size: 10px; font-weight: 700;
    text-transform: uppercase; letter-spacing: .07em;
    color: var(--text-subtle);
  }

  .online-pill {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 10px; font-weight: 600;
    color: var(--success, #22c55e);
    background: color-mix(in srgb, var(--success, #22c55e) 12%, transparent);
    border-radius: 99px; padding: 1px 7px;
  }
  .online-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--success, #22c55e); }

  .presence-strip { display: flex; flex-wrap: wrap; gap: 5px; padding: 2px 14px 10px; }
  .presence-av { position: relative; width: 26px; height: 26px; cursor: default; }
  .av-inner {
    width: 26px; height: 26px; border-radius: 7px;
    display: flex; align-items: center; justify-content: center;
    font-size: 9px; font-weight: 700; color: #fff;
  }
  .presence-dot {
    position: absolute; bottom: -1px; right: -1px;
    width: 8px; height: 8px; border-radius: 50%;
    border: 2px solid var(--bg-panel); background: var(--border);
  }
  .presence-dot.online { background: var(--success, #22c55e); }
  .presence-av-more { font-size: 10px; font-weight: 600; color: var(--text-subtle); line-height: 26px; }

  .nav-item {
    display: flex; align-items: center; gap: 7px;
    padding: 5px 14px;
    font-size: 13px; font-weight: 500;
    color: var(--text-muted); text-decoration: none;
    transition: background .1s, color .1s;
  }
  .nav-item:hover { background: var(--bg-hover); color: var(--text-base); }
  .nav-item.active {
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    color: var(--accent); font-weight: 600;
  }
  .ch-icon { font-size: 12px; width: 14px; text-align: center; flex-shrink: 0; }
  .nav-item-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .unread-badge {
    background: var(--accent); color: #fff;
    font-size: 9px; font-weight: 700; border-radius: 99px; padding: 1px 5px; flex-shrink: 0;
  }
  .unread-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); flex-shrink: 0; }
  .ticket-status-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .ticket-status-dot.open   { background: var(--success, #22c55e); }
  .ticket-status-dot.closed { background: var(--text-subtle); }

  .nav-new-btn {
    display: block; width: 100%; padding: 5px 14px;
    font-size: 12px; font-weight: 500; color: var(--text-subtle);
    background: none; border: none; text-align: left; cursor: pointer;
    transition: color .1s; font-family: inherit;
  }
  .nav-new-btn:hover { color: var(--accent); }
  .nav-new-btn-inline {
    font-size: 10px; font-weight: 600; color: var(--text-subtle);
    background: none; border: none; cursor: pointer; padding: 0; font-family: inherit;
  }
  .nav-new-btn-inline:hover { color: var(--accent); }

  .inline-form { padding: 4px 12px 8px; }
  .inline-input {
    display: block; width: 100%; padding: 5px 8px;
    border: 1px solid var(--border); border-radius: 5px;
    background: var(--bg-panel2, var(--bg-base));
    font-size: 12px; color: var(--text-base); font-family: inherit;
    margin-bottom: 4px; box-sizing: border-box; outline: none;
  }
  .inline-input:focus { border-color: var(--accent); }
  .inline-textarea { resize: none; height: 50px; }
  .inline-select { appearance: none; cursor: pointer; }
  .inline-label {
    display: block; font-size: 10px; font-weight: 600;
    color: var(--text-subtle); text-transform: uppercase; letter-spacing: .05em;
    margin-bottom: 2px;
  }
  .inline-hint { font-size: 11px; color: var(--text-subtle); padding: 2px 0 6px; margin: 0; }
  .inline-actions { display: flex; gap: 6px; margin-top: 4px; }

  .btn-xs {
    padding: 3px 10px; border-radius: 5px;
    font-size: 11px; font-weight: 500;
    border: 1px solid var(--border);
    background: var(--bg-panel2, var(--bg-base));
    color: var(--text-muted); cursor: pointer; font-family: inherit;
  }
  .btn-accent { background: var(--accent); color: #fff; border-color: var(--accent); }
  .btn-accent:hover { opacity: .88; }

  .nav-divider { height: 1px; background: var(--border); margin: 4px 0; }
  .nav-empty { font-size: 12px; color: var(--text-subtle); padding: 4px 14px 8px; }

  /* ── Right panel ── */
  .msg-view {
    flex: 1; display: flex; flex-direction: column;
    overflow: hidden; min-width: 0; background: var(--bg-base);
    animation: fadeSlideUp 0.35s ease both;
    animation-delay: 80ms;
  }

  .msg-header {
    display: flex; align-items: center;
    justify-content: space-between;
    padding: 12px 20px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-panel);
    flex-shrink: 0; min-height: 52px; gap: 12px;
  }
  .msg-header-left { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .header-icon { font-size: 16px; flex-shrink: 0; }
  .header-title {
    font-size: 14px; font-weight: 700; color: var(--text-base);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .header-desc {
    font-size: 12px; color: var(--text-subtle);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .member-count { font-size: 11px; color: var(--text-subtle); font-weight: 500; flex-shrink: 0; }
  .ticket-header-info { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .header-action-btn {
    padding: 5px 12px; border-radius: 6px; font-size: 12px; font-weight: 500;
    border: 1px solid var(--border); background: var(--bg-panel2, var(--bg-base));
    color: var(--text-muted); cursor: pointer; font-family: inherit;
    transition: color .1s, border-color .1s;
  }
  .header-action-btn:hover { color: var(--danger, #ef4444); border-color: var(--danger, #ef4444); }
  .header-action-reopen { color: var(--success, #22c55e); border-color: color-mix(in srgb, var(--success, #22c55e) 40%, transparent); }
  .header-action-reopen:hover { opacity: .8; }

  .ticket-header-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .ticket-header-dot.open   { background: var(--success, #22c55e); }
  .ticket-header-dot.closed { background: var(--text-subtle); }
  .ticket-badge { font-size: 10px; font-weight: 600; border-radius: 99px; padding: 1px 8px; flex-shrink: 0; }
  .badge-open   { background: color-mix(in srgb, var(--success, #22c55e) 14%, transparent); color: var(--success, #22c55e); }
  .badge-closed { background: var(--bg-panel2, var(--bg-base)); color: var(--text-subtle); }

  /* ── Thread ── */
  .msg-thread {
    flex: 1; overflow-y: auto;
    padding: 14px 20px 6px;
    display: flex; flex-direction: column; gap: 0;
    scrollbar-width: thin;
  }

  .msg-row {
    display: flex; gap: 10px;
    padding: 3px 8px; border-radius: 6px;
    position: relative; align-items: flex-start;
  }
  .msg-row:hover { background: var(--bg-hover); }
  .msg-row:hover .msg-actions { opacity: 1; }
  .msg-row.editing { background: color-mix(in srgb, var(--accent) 6%, transparent); }

  .msg-av-wrap { position: relative; flex-shrink: 0; margin-top: 1px; }
  .msg-av {
    width: 32px; height: 32px; border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 700; color: #fff;
  }
  .msg-av-spacer { width: 32px; flex-shrink: 0; }
  .av-online-dot {
    position: absolute; bottom: -1px; right: -1px;
    width: 9px; height: 9px; border-radius: 50%;
    background: var(--success, #22c55e);
    border: 2px solid var(--bg-base);
  }

  .msg-body { flex: 1; min-width: 0; padding-top: 2px; }
  .msg-meta { display: flex; align-items: baseline; gap: 6px; margin-bottom: 1px; }
  .msg-author { font-size: 13px; font-weight: 600; color: var(--text-base); }
  .msg-role {
    font-size: 9px; font-weight: 700; text-transform: uppercase;
    letter-spacing: .05em; border-radius: 4px; padding: 1px 5px;
  }
  .role-owner, .role-admin {
    background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent);
  }
  .role-member { background: var(--bg-panel2, var(--bg-base)); color: var(--text-subtle); }
  .msg-time { font-size: 11px; color: var(--text-subtle); }
  .msg-text {
    font-size: 13.5px; color: var(--text-base);
    line-height: 1.55; white-space: pre-wrap; word-break: break-word; margin: 0;
  }
  .msg-edited { font-size: 10px; color: var(--text-subtle); }
  .msg-system { text-align: center; font-size: 11px; color: var(--text-subtle); padding: 6px 0; }
  .msg-image {
    max-width: 320px; max-height: 240px; border-radius: 8px;
    border: 1px solid var(--border); margin-top: 4px; display: block;
  }
  .msg-file {
    display: inline-flex; align-items: center; gap: 5px;
    font-size: 12px; color: var(--accent); text-decoration: none; margin-top: 4px;
  }
  .msg-file:hover { text-decoration: underline; }

  .msg-actions {
    position: absolute; right: 8px; top: 4px;
    opacity: 0; transition: opacity .12s;
    display: flex; gap: 2px;
    background: var(--bg-panel); border: 1px solid var(--border);
    border-radius: 6px; padding: 2px 4px;
    box-shadow: 0 1px 6px rgba(0,0,0,.12);
  }
  .action-btn {
    background: none; border: none; color: var(--text-muted);
    cursor: pointer; padding: 3px; border-radius: 4px;
    display: flex; align-items: center; transition: color .1s, background .1s;
  }
  .action-btn:hover { color: var(--text-base); background: var(--bg-hover); }
  .action-btn-danger:hover { color: var(--danger, #ef4444); }

  .edit-input {
    width: 100%; padding: 5px 8px;
    border: 1px solid var(--accent); border-radius: 6px;
    background: var(--bg-panel); font-size: 13px;
    color: var(--text-base); font-family: inherit;
    box-sizing: border-box; outline: none;
  }
  .edit-actions { display: flex; gap: 6px; margin-top: 4px; }

  .thread-empty {
    flex: 1; display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    padding: 48px 20px; text-align: center;
  }
  .thread-empty-title { font-size: 14px; font-weight: 600; color: var(--text-base); margin-bottom: 4px; }
  .thread-empty-sub   { font-size: 13px; color: var(--text-subtle); margin: 0; }

  .empty-state {
    flex: 1; display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    gap: 12px; color: var(--text-subtle); font-size: 13px;
  }

  /* ── Compose ── */
  .compose {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 16px 12px;
    border-top: 1px solid var(--border);
    background: var(--bg-panel); flex-shrink: 0;
  }
  .compose-input {
    flex: 1; min-width: 0; padding: 8px 12px;
    border: 1px solid var(--border); border-radius: 8px;
    background: var(--bg-panel2, var(--bg-base));
    font-size: 13px; color: var(--text-base);
    font-family: inherit; transition: border-color .12s; outline: none;
  }
  .compose-input:focus { border-color: var(--accent); }
  .compose-input::placeholder { color: var(--text-subtle); }

  .compose-send {
    width: 34px; height: 34px; border-radius: 8px;
    background: var(--accent); color: #fff; border: none;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    transition: opacity .12s, transform .1s; flex-shrink: 0;
  }
  .compose-send:hover:not(:disabled) { opacity: .9; transform: scale(1.05); }
  .compose-send:disabled { opacity: .35; cursor: default; }

  .compose-closed {
    padding: 12px 20px; font-size: 12px; color: var(--text-subtle);
    border-top: 1px solid var(--border); background: var(--bg-panel);
    text-align: center; flex-shrink: 0;
  }
</style>
