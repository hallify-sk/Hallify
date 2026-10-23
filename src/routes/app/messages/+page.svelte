<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { t as tr, getLocale } from '$lib/i18n.svelte';
  import { confirmFirst } from '$lib/forms';
  import { parseDbTime, timeAgo as relTime, formatDate } from '$lib/format';
  import { channelName, splitMentions, CHANNEL_NAME_MAX, CHANNEL_DESC_MAX } from '$lib/channels';
  import type { PageData, ActionData } from './$types';

  interface Props { data: PageData; form: ActionData; }
  const { data, form }: Props = $props();

  const channels        = $derived(data.channels.filter((c) => !c.archived_at));
  const archivedChannels = $derived(data.channels.filter((c) => !!c.archived_at));
  const tickets         = $derived(data.tickets);
  const myReservations  = $derived(data.myReservations);
  const members         = $derived(data.members);
  const activeChannel   = $derived(data.activeChannel);
  const activeTicket    = $derived(data.activeTicket);
  const channelMessages = $derived(data.channelMessages);
  const ticketMessages  = $derived(data.ticketMessages);
  const currentUserId   = $derived(data.currentUserId);
  const canManage       = $derived(data.canManageChannels);

  const onlineCount = $derived(members.filter((m: { is_online: number }) => !!m.is_online).length);
  // Names that can be @mentioned: full names and first names of the team.
  const mentionNames = $derived(members.flatMap((m) => [`${m.first_name} ${m.last_name}`, m.first_name]));

  type ChatForm = { chatError?: string; channelError?: string; manageError?: string; name?: string } | null;
  const f = $derived(form as ChatForm);

  let body         = $state('');
  let editingId    = $state<string | null>(null);
  let editBody     = $state('');
  let showNewTicket   = $state(false);
  let showNewChannel  = $state(false);
  let showManage      = $state(false);
  let newChannelName  = $state('');
  let threadEl     = $state<HTMLDivElement | null>(null);
  let sending      = $state(false);
  let uploading    = $state(false);
  let uploadError  = $state('');
  let pendingFile  = $state<{ url: string; name: string; type: string } | null>(null);
  let fileInput: HTMLInputElement | undefined = $state();

  // A failed create keeps the form open with what was typed.
  $effect(() => { if (f?.channelError) { showNewChannel = true; newChannelName = f.name ?? newChannelName; } });
  $effect(() => { if (f?.manageError) showManage = true; });

  $effect(() => {
    void channelMessages.length;
    void ticketMessages.length;
    if (threadEl) threadEl.scrollTop = threadEl.scrollHeight;
  });

  // Poll a cheap read-only marker and reload only when the thread changed (the page
  // used to reload everything every 3 s and write a read marker each time). Paused
  // while the tab is hidden.
  $effect(() => {
    const target = activeChannel ? `c=${activeChannel.id}` : activeTicket ? `t=${activeTicket.id}` : '';
    if (!target) return;
    let last: string | null = null;
    let stopped = false;
    async function tick() {
      if (stopped || document.hidden) return;
      try {
        const res = await fetch(`/app/messages/poll?${target}`, { headers: { accept: 'application/json' } });
        if (!res.ok) return;
        const { marker } = (await res.json()) as { marker: string | null };
        if (last !== null && marker !== last) await invalidateAll();
        last = marker;
      } catch { /* offline — try again next tick */ }
    }
    tick();
    const timer = setInterval(tick, 4000);
    return () => { stopped = true; clearInterval(timer); };
  });

  $effect(() => {
    const beat = () => fetch('/api/presence', { method: 'POST' }).catch(() => {});
    beat();
    const timer = setInterval(beat, 30_000);
    return () => clearInterval(timer);
  });

  // Stored times are UTC without a zone; parseDbTime reads them correctly (they were
  // shown two hours off before).
  function timeAgo(d: string) {
    return relTime(d, getLocale());
  }

  function initials(first: string, last: string) {
    return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase();
  }

  function avatarColor(id: string) {
    const colors = ['#a6225e','#2f7a52','#9a6512','#6b4fa0','#1f6b74','#c3362c','#4a5d3f'];
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffffffff;
    return colors[Math.abs(h) % colors.length];
  }

  function startEdit(id: string, currentBody: string) { editingId = id; editBody = currentBody; }
  function cancelEdit() { editingId = null; editBody = ''; }

  function shouldShowMeta(msgs: { sender_id: string; created_at: string }[], i: number) {
    if (i === 0) return true;
    if (msgs[i - 1].sender_id !== msgs[i].sender_id) return true;
    const a = parseDbTime(msgs[i - 1].created_at)?.getTime() ?? 0;
    const b = parseDbTime(msgs[i].created_at)?.getTime() ?? 0;
    return b - a > 5 * 60 * 1000;
  }

  // Enter sends, Shift+Enter starts a new line.
  function submitOnEnter(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      (e.currentTarget as HTMLElement).closest('form')?.requestSubmit();
    }
  }

  const sendEnhance = () => {
    sending = true;
    return async ({ update, result }: { update: (o?: { reset?: boolean }) => Promise<void>; result: { type: string } }) => {
      await update({ reset: false });
      if (result.type === 'success' || result.type === 'redirect') { body = ''; pendingFile = null; }
      sending = false;
    };
  };

  async function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    uploading = true;
    uploadError = '';
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload/image', { method: 'POST', body: fd });
      if (!res.ok) { uploadError = tr.messagesAdmin.uploadFailed; return; }
      const { url } = (await res.json()) as { url: string };
      pendingFile = { url, name: file.name, type: file.type };
    } catch { uploadError = tr.messagesAdmin.uploadFailed; }
    finally { uploading = false; input.value = ''; }
  }

  function roleLabel(role: string) {
    return (tr.teamChat.roles as Record<string, string>)[role] ?? role;
  }
</script>

<svelte:head>
  <title>{activeChannel ? `#${activeChannel.name}` : activeTicket ? activeTicket.subject : tr.memberMessages.pageTitle} – Hallify</title>
</svelte:head>

{#snippet richText(text: string)}
  {#each splitMentions(text, mentionNames) as seg}{#if seg.mention}<span class="mention">{seg.text}</span>{:else}{seg.text}{/if}{/each}
{/snippet}

{#snippet attachment(m: { attachment_url: string | null; attachment_name: string | null; attachment_type: string | null })}
  {#if m.attachment_url}
    {#if m.attachment_type?.startsWith('image/')}
      <a href={m.attachment_url} target="_blank" rel="noopener noreferrer">
        <img src={m.attachment_url} alt={m.attachment_name ?? tr.memberMessages.attachment} class="msg-image" loading="lazy" />
      </a>
    {:else}
      <a href={m.attachment_url} target="_blank" rel="noopener noreferrer" class="msg-file">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
        {m.attachment_name ?? tr.memberMessages.attachment}
      </a>
    {/if}
  {/if}
{/snippet}

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

      <div class="row-list">
        {#each channels as ch}
          <a href="/app/messages?c={ch.id}" class="row-item nav-item" class:active={activeChannel?.id === ch.id}>
            <span class="ch-icon" aria-hidden="true">{ch.type === 'announcement' ? '📣' : '#'}</span>
            <span class="nav-item-name">{ch.name}</span>
            {#if Number(ch.unread_count) > 0}<span class="unread-badge">{ch.unread_count}</span>{/if}
          </a>
        {:else}
          <!-- Members used to see an empty "Team" with no word on why. -->
          <p class="nav-empty">{canManage ? tr.teamChat.noChannelsAdmin : tr.teamChat.noChannelsMember}</p>
        {/each}
      </div>

      {#if canManage}
        <button class="nav-new-btn" type="button" aria-expanded={showNewChannel} onclick={() => { showNewChannel = !showNewChannel; showNewTicket = false; }}>
          {tr.memberMessages.newChannel}
        </button>
        {#if showNewChannel}
          <form method="POST" action="?/createChannel" use:enhance class="inline-form">
            <label class="inline-label" for="new-ch-name">{tr.teamChat.channelName}</label>
            <input id="new-ch-name" name="name" bind:value={newChannelName} placeholder={tr.memberMessages.channelNamePlaceholder}
              required maxlength={CHANNEL_NAME_MAX * 2} class="inline-input" autocomplete="off" aria-describedby="new-ch-hint" />
            <span id="new-ch-hint" class="inline-hint">
              {#if newChannelName.trim() && channelName(newChannelName)}{tr.teamChat.savedAs} #{channelName(newChannelName)}{:else}{tr.teamChat.nameHint}{/if}
            </span>
            <input name="description" placeholder={tr.memberMessages.descriptionPlaceholder} aria-label={tr.memberMessages.descriptionPlaceholder} maxlength={CHANNEL_DESC_MAX} class="inline-input" />
            <label class="inline-check"><input type="checkbox" name="type" value="announcement" /> {tr.teamChat.announcementType}</label>
            {#if f?.channelError}<span class="inline-error" role="alert">{f.channelError}</span>{/if}
            <div class="inline-actions">
              <button type="submit" class="btn-xs btn-accent">{tr.common.create}</button>
              <button type="button" class="btn-xs" onclick={() => showNewChannel = false}>{tr.common.cancel}</button>
            </div>
          </form>
        {/if}
      {/if}

      {#if canManage && archivedChannels.length > 0}
        <details class="archived">
          <summary>{tr.teamChat.archived} ({archivedChannels.length})</summary>
          <div class="row-list">
            {#each archivedChannels as ch}
              <a href="/app/messages?c={ch.id}" class="row-item nav-item" class:active={activeChannel?.id === ch.id}>
                <span class="ch-icon" aria-hidden="true">#</span>
                <span class="nav-item-name">{ch.name}</span>
              </a>
            {/each}
          </div>
        </details>
      {/if}
    </div>

    <div class="nav-divider"></div>

    <div class="nav-section">
      <div class="nav-section-header">
        <span class="nav-section-label">{tr.memberMessages.clients}</span>
        <button class="nav-new-btn-inline" type="button" aria-expanded={showNewTicket} onclick={() => { showNewTicket = !showNewTicket; showNewChannel = false; }}>{tr.memberMessages.newShort}</button>
      </div>

      {#if showNewTicket}
        <form method="POST" action="?/createTicket" use:enhance={() => { showNewTicket = false; return async ({ update }) => update(); }} class="inline-form">
          {#if myReservations.length === 0}
            <p class="inline-hint">{tr.memberMessages.noReservationsHint}</p>
          {:else}
            <label class="inline-label" for="new-t-res">{tr.memberMessages.reservation}</label>
            <select id="new-t-res" name="reservation_id" required class="inline-input inline-select">
              <option value="">{tr.memberMessages.selectReservation}</option>
              {#each myReservations as r}
                <option value={r.id}>{r.hall_name} – {formatDate(r.event_date, getLocale())}</option>
              {/each}
            </select>
            <textarea name="body" placeholder={tr.memberMessages.ticketBodyPlaceholder} aria-label={tr.memberMessages.ticketBodyPlaceholder} rows="2" required maxlength="5000" class="inline-input inline-textarea"></textarea>
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

      <div class="row-list">
        {#each tickets as t}
          <a href="/app/messages?t={t.id}" class="row-item nav-item nav-item-ticket" class:active={activeTicket?.id === t.id}>
            <span class="ticket-status-dot" class:open={t.status === 'open'} class:closed={t.status === 'closed'}></span>
            <span class="nav-item-name">
              {#if t.hall_name}{t.hall_name}{:else}{t.subject}{/if}
            </span>
            {#if t.unread}<span class="unread-dot" title={tr.teamChat.unread}></span>{/if}
          </a>
        {:else}
          <p class="nav-empty">{tr.memberMessages.noThreadsYet}</p>
        {/each}
      </div>
    </div>
  </nav>

  <!-- ─── Right panel ───────────────────────────────────────────────────── -->
  <div class="msg-view">

    {#if activeChannel}

      <div class="msg-header">
        <div class="msg-header-left">
          <span class="header-icon" aria-hidden="true">{activeChannel.type === 'announcement' ? '📣' : '#'}</span>
          <span class="header-title">{activeChannel.name}</span>
          {#if activeChannel.description}<span class="header-desc">{activeChannel.description}</span>{/if}
        </div>
        <div class="msg-header-right">
          <span class="member-count">{members.length} {tr.memberMessages.membersLower} · {onlineCount} {tr.memberMessages.online}</span>
          {#if canManage}
            <button type="button" class="header-action-btn header-action-neutral" aria-expanded={showManage} onclick={() => (showManage = !showManage)}>{tr.teamChat.manage}</button>
          {/if}
        </div>
      </div>

      {#if canManage && showManage}
        <div class="manage-panel">
          <form method="POST" action="?/renameChannel" use:enhance class="manage-row">
            <input type="hidden" name="channel_id" value={activeChannel.id} />
            <label class="inline-label" for="mg-name">{tr.teamChat.channelName}</label>
            <input id="mg-name" name="name" class="inline-input" value={activeChannel.name} required maxlength={CHANNEL_NAME_MAX * 2} />
            <label class="inline-label" for="mg-desc">{tr.common.description}</label>
            <input id="mg-desc" name="description" class="inline-input" value={activeChannel.description ?? ''} maxlength={CHANNEL_DESC_MAX} />
            <button type="submit" class="btn-xs btn-accent">{tr.common.save}</button>
          </form>
          <div class="manage-actions">
            {#if activeChannel.archived_at}
              <form method="POST" action="?/unarchiveChannel" use:enhance>
                <input type="hidden" name="channel_id" value={activeChannel.id} />
                <button type="submit" class="btn-xs">{tr.teamChat.unarchive}</button>
              </form>
            {:else}
              <form method="POST" action="?/archiveChannel" use:enhance={confirmFirst(() => tr.teamChat.confirmArchive)}>
                <input type="hidden" name="channel_id" value={activeChannel.id} />
                <button type="submit" class="btn-xs">{tr.teamChat.archive}</button>
              </form>
            {/if}
            <form method="POST" action="?/removeChannel" use:enhance={confirmFirst(() => tr.teamChat.confirmDeleteChannel(activeChannel.name))}>
              <input type="hidden" name="channel_id" value={activeChannel.id} />
              <button type="submit" class="btn-xs btn-danger-xs">{tr.teamChat.deleteChannel}</button>
            </form>
          </div>
          {#if f?.manageError}<span class="inline-error" role="alert">{f.manageError}</span>{/if}
        </div>
      {/if}

      <div class="msg-thread" bind:this={threadEl}>
        {#if channelMessages.length === 0}
          <div class="thread-empty">
            <div class="card card--inset thread-empty-inner">
              <div class="icon-tile">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              </div>
              <p class="thread-empty-title">{tr.memberMessages.startOf} #{activeChannel.name}</p>
              <p class="thread-empty-sub">{tr.memberMessages.sayHello}</p>
            </div>
          </div>
        {/if}

        {#each channelMessages as msg, i (msg.id)}
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
                  {#if member}<span class="msg-role role-{member.role}">{roleLabel(member.role)}</span>{/if}
                  <span class="msg-time">{timeAgo(msg.created_at)}</span>
                </div>
              {/if}
              {#if editingId === msg.id}
                <form method="POST" action="?/editChannel" use:enhance={() => { editingId = null; return async ({ update }) => update(); }}>
                  <input type="hidden" name="msg_id" value={msg.id} />
                  <textarea class="edit-input" name="body" rows="2" maxlength="5000" aria-label={tr.messaging.editMessageText} bind:value={editBody} onkeydown={(e) => { if (e.key === 'Escape') cancelEdit(); else submitOnEnter(e); }}></textarea>
                  <div class="edit-actions">
                    <button type="submit" class="btn-xs btn-accent">{tr.common.save}</button>
                    <button type="button" class="btn-xs" onclick={cancelEdit}>{tr.common.cancel}</button>
                  </div>
                </form>
              {:else}
                {#if msg.body}<p class="msg-text">{@render richText(msg.body)}{#if msg.edited_at}<span class="msg-edited"> ({tr.messaging.edited})</span>{/if}</p>{/if}
                {@render attachment(msg)}
              {/if}
            </div>
            {#if (isOwn || canManage) && editingId !== msg.id}
              <div class="msg-actions">
                {#if isOwn}
                  <button type="button" class="action-btn" title={tr.common.edit} aria-label={tr.common.edit} onclick={() => startEdit(msg.id, msg.body)}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                {/if}
                <!-- Owners and admins may remove anyone's message (moderation). -->
                <form method="POST" action="?/deleteChannel" use:enhance={confirmFirst(() => tr.messaging.confirmDelete)} style="display:contents">
                  <input type="hidden" name="msg_id" value={msg.id} />
                  <button type="submit" class="action-btn action-btn-danger" title={tr.common.delete} aria-label={tr.common.delete}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                  </button>
                </form>
              </div>
            {/if}
          </div>
        {/each}
      </div>

      {#if uploadError || f?.chatError}<div class="compose-error" role="alert">{uploadError || f?.chatError}</div>{/if}
      {#if data.canPostInChannel}
        {#if pendingFile}
          <div class="pending-file">
            <img src={pendingFile.url} alt="" class="pending-thumb" />
            <span class="pending-name">{pendingFile.name}</span>
            <button type="button" class="action-btn" aria-label={tr.common.delete} onclick={() => (pendingFile = null)}>&times;</button>
          </div>
        {/if}
        <form class="compose" method="POST" action="?/sendChannel" use:enhance={sendEnhance}>
          <input type="hidden" name="channel_id" value={activeChannel.id} />
          <input type="hidden" name="attachment_url" value={pendingFile?.url ?? ''} />
          <input type="hidden" name="attachment_name" value={pendingFile?.name ?? ''} />
          <input type="hidden" name="attachment_type" value={pendingFile?.type ?? ''} />
          <input type="file" bind:this={fileInput} onchange={handleFileSelect} class="sr-only" tabindex="-1" aria-hidden="true"
            accept="image/jpeg,image/png,image/webp,image/gif" />
          <button type="button" class="compose-attach" aria-label={tr.teamChat.attachImage} title={tr.teamChat.attachImage}
            onclick={() => fileInput?.click()} disabled={uploading}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
          </button>
          <textarea class="compose-input" name="body" rows="1" maxlength="5000" aria-label="{tr.memberMessages.messagePrefix} #{activeChannel.name}"
            placeholder="{tr.memberMessages.messagePrefix} #{activeChannel.name}… {tr.teamChat.newLineHint}" bind:value={body} onkeydown={submitOnEnter}></textarea>
          <button type="submit" class="compose-send" aria-label={tr.messaging.send} disabled={(!body.trim() && !pendingFile) || sending || uploading}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </form>
      {:else}
        <div class="compose-closed">{activeChannel.archived_at ? tr.teamChat.channelArchived : tr.teamChat.announcementReadOnly}</div>
      {/if}

    {:else if activeTicket}

      <div class="msg-header">
        <div class="msg-header-left">
          <span class="ticket-header-dot" class:open={activeTicket.status === 'open'} class:closed={activeTicket.status === 'closed'}></span>
          <div class="ticket-header-info">
            <span class="header-title">
              {activeTicket.hall_name ?? activeTicket.subject}
            </span>
            {#if activeTicket.hall_name && activeTicket.event_date}
              <span class="header-desc">{formatDate(activeTicket.event_date, getLocale())}</span>
            {/if}
          </div>
          <span class="ticket-badge" class:badge-open={activeTicket.status === 'open'} class:badge-closed={activeTicket.status === 'closed'}>{activeTicket.status === 'open' ? tr.status.open : tr.status.closed}</span>
        </div>
        <div class="msg-header-right">
          {#if activeTicket.status === 'open'}
            <form method="POST" action="?/closeTicket" use:enhance={confirmFirst(() => tr.memberMessages.confirmCloseThread)} style="display:contents">
              <input type="hidden" name="ticket_id" value={activeTicket.id} />
              <button type="submit" class="header-action-btn">
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
        {#each ticketMessages as msg, i (msg.id)}
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
                  <textarea class="edit-input" name="body" rows="2" maxlength="5000" aria-label={tr.messaging.editMessageText} bind:value={editBody} onkeydown={(e) => { if (e.key === 'Escape') cancelEdit(); else submitOnEnter(e); }}></textarea>
                  <div class="edit-actions">
                    <button type="submit" class="btn-xs btn-accent">{tr.common.save}</button>
                    <button type="button" class="btn-xs" onclick={cancelEdit}>{tr.common.cancel}</button>
                  </div>
                </form>
              {:else}
                {#if msg.body}<p class="msg-text">{msg.body}{#if msg.edited_at}<span class="msg-edited"> ({tr.messaging.edited})</span>{/if}</p>{/if}
                {@render attachment(msg)}
              {/if}
            </div>
            {#if isOwn && editingId !== msg.id && msg.message_type === 'text'}
              <div class="msg-actions">
                <button type="button" class="action-btn" title={tr.common.edit} aria-label={tr.common.edit} onclick={() => startEdit(msg.id, msg.body ?? '')}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <form method="POST" action="?/deleteTicket" use:enhance={confirmFirst(() => tr.messaging.confirmDelete)} style="display:contents">
                  <input type="hidden" name="msg_id" value={msg.id} />
                  <button type="submit" class="action-btn action-btn-danger" title={tr.common.delete} aria-label={tr.common.delete}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                  </button>
                </form>
              </div>
            {/if}
          </div>
        {:else}
          <div class="thread-empty">
            <div class="card card--inset thread-empty-inner">
              <div class="icon-tile">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              </div>
              <p class="thread-empty-title">{tr.memberMessages.threadOpened}</p>
              <p class="thread-empty-sub">{tr.memberMessages.noRepliesYet}</p>
            </div>
          </div>
        {/each}
      </div>

      {#if f?.chatError}<div class="compose-error" role="alert">{f.chatError}</div>{/if}
      {#if activeTicket.status === 'open'}
        <form class="compose" method="POST" action="?/sendTicket" use:enhance={sendEnhance}>
          <input type="hidden" name="ticket_id" value={activeTicket.id} />
          <textarea class="compose-input" name="body" rows="1" maxlength="5000" aria-label={tr.memberMessages.replyPlaceholder}
            placeholder="{tr.memberMessages.replyPlaceholder} {tr.teamChat.newLineHint}" bind:value={body} onkeydown={submitOnEnter}></textarea>
          <button type="submit" class="compose-send" aria-label={tr.messaging.send} disabled={!body.trim() || sending}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </form>
      {:else}
        <div class="compose-closed">{tr.memberMessages.ticketClosed}</div>
      {/if}

    {:else}
      <div class="empty-state">
        <div class="card card--inset empty-state-inner">
          <div class="icon-tile">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </div>
          <p>{tr.memberMessages.selectToStart}</p>
          {#if channels.length === 0}<p class="empty-hint">{canManage ? tr.teamChat.noChannelsAdmin : tr.teamChat.noChannelsMember}</p>{/if}
        </div>
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
    font-size: 10px; font-weight: 650;
    text-transform: uppercase; letter-spacing: .13em;
    line-height: 1.7;
    color: var(--text-muted);
  }

  .online-pill {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 10px; font-weight: 600;
    color: var(--success);
    background: var(--success-dim);
    border-radius: 3px; padding: 1px 7px;
  }
  .online-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--success); }

  .presence-strip { display: flex; flex-wrap: wrap; gap: 5px; padding: 2px 14px 10px; }
  .presence-av { position: relative; width: 26px; height: 26px; cursor: default; }
  .av-inner {
    width: 26px; height: 26px; border-radius: var(--radius-sm);
    display: flex; align-items: center; justify-content: center;
    font-size: 9px; font-weight: 650; color: #fff;
  }
  .presence-dot {
    position: absolute; bottom: -1px; right: -1px;
    width: 8px; height: 8px; border-radius: 50%;
    border: 2px solid var(--bg-base); background: var(--border);
  }
  .presence-dot.online { background: var(--success); }
  .presence-av-more { font-size: 10px; font-weight: 600; color: var(--text-subtle); line-height: 26px; }

  /* Hairline rows (.row-item) at nav density. */
  .nav-item {
    gap: 7px;
    padding: 6px 14px;
    font-size: 13px; font-weight: 500;
    color: var(--text-muted); text-decoration: none;
    transition: background .15s, color .15s;
  }
  .nav-item:hover { background: var(--bg-hover); color: var(--text-base); }
  .nav-item.active {
    background: var(--accent-dim);
    color: var(--accent-ink); font-weight: 600;
  }
  .ch-icon { font-size: 12px; width: 14px; text-align: center; flex-shrink: 0; }
  .nav-item-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .unread-badge {
    background: var(--accent); color: var(--accent-contrast);
    font-size: 9px; font-weight: 650; border-radius: var(--radius-sm); padding: 1px 5px; flex-shrink: 0;
  }
  .unread-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); flex-shrink: 0; }
  .ticket-status-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .ticket-status-dot.open   { background: var(--success); }
  .ticket-status-dot.closed { background: var(--text-subtle); }

  .nav-new-btn {
    display: block; width: 100%; padding: 5px 14px;
    font-size: 12px; font-weight: 500; color: var(--text-subtle);
    background: none; border: none; text-align: left; cursor: pointer;
    transition: color .15s; font-family: inherit;
  }
  .nav-new-btn:hover { color: var(--accent-ink); }
  .nav-new-btn-inline {
    font-size: 10px; font-weight: 600; color: var(--text-subtle);
    background: none; border: none; cursor: pointer; padding: 0; font-family: inherit;
  }
  .nav-new-btn-inline:hover { color: var(--accent-ink); }

  .inline-form { padding: 4px 12px 8px; }
  .inline-input {
    display: block; width: 100%; padding: 6px 9px;
    border: 1px solid var(--border); border-radius: var(--radius-sm);
    background: var(--bg-panel2);
    font-size: 12px; color: var(--text-base); font-family: inherit;
    margin-bottom: 4px; box-sizing: border-box; outline: none;
    transition: border-color .15s, box-shadow .15s;
  }
  .inline-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
  .inline-textarea { resize: none; height: 50px; }
  .inline-select { appearance: none; cursor: pointer; }
  .inline-label {
    display: block; font-size: 10px; font-weight: 650;
    color: var(--text-muted); text-transform: uppercase; letter-spacing: .13em;
    line-height: 1.7; margin-bottom: 2px;
  }
  .inline-hint { font-size: 11px; color: var(--text-subtle); padding: 2px 0 6px; margin: 0; }
  .inline-actions { display: flex; gap: 6px; margin-top: 4px; }

  .btn-xs {
    padding: 4px 11px; border-radius: var(--radius-sm);
    font-size: 11px; font-weight: 500;
    border: 1px solid var(--border);
    background: var(--bg-panel2);
    color: var(--text-muted); cursor: pointer; font-family: inherit;
    transition: background .15s, border-color .15s;
  }
  .btn-xs:hover { background: var(--bg-hover); border-color: var(--text-subtle); }
  .btn-accent {
    background: var(--accent); color: var(--accent-contrast); border-color: var(--accent);
    font-weight: 650; transition: transform .2s, background .2s;
  }
  .btn-accent:hover { background: var(--accent-hover); border-color: var(--accent-hover); transform: translateY(-2px); }
  .btn-accent:active { transform: translateY(0); }

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
    flex-shrink: 0; min-height: 52px; gap: 12px;
  }
  .msg-header-left { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .msg-header-right { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
  .header-icon { font-size: 16px; flex-shrink: 0; }
  .header-title {
    font-size: 14px; font-weight: 650; letter-spacing: -.03em; color: var(--text-base);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .header-desc {
    font-size: 12px; color: var(--text-subtle);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .member-count { font-size: 11px; color: var(--text-subtle); font-weight: 500; flex-shrink: 0; }
  .ticket-header-info { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .header-action-btn {
    padding: 6px 13px; border-radius: var(--radius-sm); font-size: 12px; font-weight: 500;
    border: 1px solid var(--border); background: var(--bg-panel2);
    color: var(--text-muted); cursor: pointer; font-family: inherit;
    transition: color .15s, border-color .15s;
  }
  .header-action-btn:hover { color: var(--danger); border-color: var(--danger); }
  .header-action-reopen { color: var(--success); border-color: color-mix(in srgb, var(--success) 40%, transparent); }
  .header-action-reopen:hover { color: var(--success); border-color: var(--success); }

  .ticket-header-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .ticket-header-dot.open   { background: var(--success); }
  .ticket-header-dot.closed { background: var(--text-subtle); }
  .ticket-badge { font-size: 10px; font-weight: 600; border-radius: var(--radius-sm); padding: 1px 8px; flex-shrink: 0; }
  .badge-open   { background: var(--success-dim); color: var(--success); }
  .badge-closed { background: var(--bg-panel2); color: var(--text-subtle); }

  /* ── Thread ── */
  .msg-thread {
    flex: 1; overflow-y: auto;
    padding: 14px 20px 6px;
    display: flex; flex-direction: column; gap: 0;
    scrollbar-width: thin;
  }

  /* A transcript, not a stack of cards: no box per message, just rhythm. */
  .msg-row {
    display: flex; gap: 10px;
    padding: 4px 8px;
    position: relative; align-items: flex-start;
  }
  .msg-row:hover { background: var(--bg-hover); }
  .msg-row:hover .msg-actions { opacity: 1; }
  .msg-row.editing { background: color-mix(in srgb, var(--accent) 6%, transparent); }

  .msg-av-wrap { position: relative; flex-shrink: 0; margin-top: 1px; }
  .msg-av {
    width: 32px; height: 32px; border-radius: var(--radius);
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 650; color: #fff;
  }
  .msg-av-spacer { width: 32px; flex-shrink: 0; }
  .av-online-dot {
    position: absolute; bottom: -1px; right: -1px;
    width: 9px; height: 9px; border-radius: 50%;
    background: var(--success);
    border: 2px solid var(--bg-base);
  }

  .msg-body { flex: 1; min-width: 0; padding-top: 2px; }
  .msg-meta { display: flex; align-items: baseline; gap: 6px; margin-bottom: 1px; }
  .msg-author { font-size: 13px; font-weight: 600; color: var(--text-base); }
  .msg-role {
    font-size: 9px; font-weight: 650; text-transform: uppercase;
    letter-spacing: .08em; border-radius: var(--radius-sm); padding: 1px 5px;
  }
  .role-owner, .role-admin {
    background: var(--accent-dim); color: var(--accent-ink);
  }
  .role-member { background: var(--bg-panel2); color: var(--text-subtle); }
  .msg-time { font-size: 11px; color: var(--text-subtle); }
  .msg-text {
    font-size: 13.5px; color: var(--text-base);
    line-height: 1.55; white-space: pre-wrap; word-break: break-word; margin: 0;
  }
  .msg-edited { font-size: 10px; color: var(--text-subtle); }
  .msg-system { text-align: center; font-size: 11px; color: var(--text-subtle); padding: 6px 0; }
  .msg-image {
    max-width: 320px; max-height: 240px; border-radius: var(--radius);
    border: 1px solid var(--border); margin-top: 4px; display: block;
  }
  .msg-file {
    display: inline-flex; align-items: center; gap: 5px;
    font-size: 12px; color: var(--accent-ink); text-decoration: none; margin-top: 4px;
  }
  .msg-file:hover { text-decoration: underline; }

  .msg-actions {
    position: absolute; right: 8px; top: 4px;
    opacity: 0; transition: opacity .15s;
    display: flex; gap: 2px;
    background: var(--bg-panel); border: 1px solid var(--border);
    border-radius: var(--radius-sm); padding: 2px 4px;
    box-shadow: var(--shadow-sm);
  }
  .action-btn {
    background: none; border: none; color: var(--text-muted);
    cursor: pointer; padding: 3px; border-radius: var(--radius-sm);
    display: flex; align-items: center; transition: color .15s, background .15s;
  }
  .action-btn:hover { color: var(--text-base); background: var(--bg-hover); }
  .action-btn-danger:hover { color: var(--danger); }

  .edit-input {
    width: 100%; padding: 6px 9px;
    border: 1px solid var(--accent); border-radius: var(--radius-sm);
    background: var(--bg-panel2); font-size: 13px;
    color: var(--text-base); font-family: inherit;
    box-sizing: border-box; outline: none;
    transition: box-shadow .15s;
  }
  .edit-input:focus { box-shadow: 0 0 0 3px var(--accent-dim); }
  .edit-actions { display: flex; gap: 6px; margin-top: 4px; }

  .thread-empty {
    flex: 1; display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    padding: 20px; text-align: center;
  }
  .thread-empty-inner {
    display: flex; flex-direction: column; align-items: center;
    max-width: 44ch;
  }
  .thread-empty-title { font-size: 14px; font-weight: 600; letter-spacing: -.03em; color: var(--text-base); margin: 14px 0 4px; }
  .thread-empty-sub   { font-size: 13px; color: var(--text-subtle); margin: 0; }

  .empty-state {
    flex: 1; display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    color: var(--text-subtle); font-size: 13px;
  }
  .empty-state-inner {
    display: flex; flex-direction: column; align-items: center; gap: 12px;
    text-align: center;
  }
  .empty-state-inner p { margin: 0; }

  /* ── Compose ── */
  .compose {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 16px 12px;
    border-top: 1px solid var(--border);
    flex-shrink: 0;
  }
  .compose-input {
    flex: 1; min-width: 0; padding: 9px 13px;
    border: 1px solid var(--border); border-radius: var(--radius-sm);
    background: var(--bg-panel2);
    font-size: 13px; color: var(--text-base);
    font-family: inherit; transition: border-color .15s, box-shadow .15s; outline: none;
  }
  .compose-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
  .compose-input::placeholder { color: var(--text-subtle); }

  .compose-send {
    width: 34px; height: 34px; border-radius: var(--radius-sm);
    background: var(--accent); color: var(--accent-contrast); border: none;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    transition: transform .2s, background .2s; flex-shrink: 0;
  }
  .compose-send:hover:not(:disabled) { background: var(--accent-hover); transform: translateY(-2px); }
  .compose-send:active:not(:disabled) { transform: translateY(0); }
  .compose-send:disabled { opacity: .35; cursor: default; }

  .compose-closed {
    padding: 12px 20px; font-size: 12px; color: var(--text-subtle);
    border-top: 1px solid var(--border);
    text-align: center; flex-shrink: 0;
  }

  /* ── Team chat additions: mentions, channel management, attachments, errors ── */
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
  .mention {
    color: var(--accent-ink); background: var(--accent-dim);
    border-radius: 3px; padding: 0 2px; font-weight: 600;
  }
  .inline-hint, .inline-error { display: block; font-size: 11px; line-height: 1.4; margin: -2px 0 6px; }
  .inline-hint { color: var(--text-subtle); }
  .inline-error { color: var(--danger); }
  .inline-check { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-muted); margin-bottom: 6px; }
  .archived { padding: 4px 0 0; }
  .archived > summary {
    cursor: pointer; padding: 5px 14px; font-size: 12px; color: var(--text-subtle); list-style: none;
  }
  .archived > summary::-webkit-details-marker { display: none; }
  .archived > summary:hover { color: var(--accent-ink); }
  .header-action-neutral:hover { color: var(--accent-ink); border-color: var(--accent); }
  .manage-panel {
    display: flex; flex-direction: column; gap: 8px;
    padding: 10px 16px; border-bottom: 1px solid var(--border); background: var(--bg-panel2);
  }
  .manage-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .manage-row .inline-input { width: auto; flex: 1 1 160px; margin: 0; }
  .manage-row .inline-label { margin: 0; }
  .manage-actions { display: flex; gap: 6px; flex-wrap: wrap; }
  .btn-danger-xs { color: var(--danger); }
  .compose { align-items: flex-end; }
  textarea.compose-input { resize: none; max-height: 160px; line-height: 1.45; field-sizing: content; }
  .compose-attach {
    width: 34px; height: 34px; border-radius: var(--radius-sm); flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    background: none; border: 1px solid var(--border); color: var(--text-muted); cursor: pointer;
  }
  .compose-attach:hover:not(:disabled) { color: var(--accent-ink); border-color: var(--accent); }
  .compose-attach:disabled { opacity: .4; cursor: default; }
  .compose-error { padding: 6px 16px 0; font-size: 12px; color: var(--danger); }
  .pending-file { display: flex; align-items: center; gap: 8px; padding: 8px 16px 0; font-size: 12px; color: var(--text-muted); }
  .pending-thumb { width: 40px; height: 40px; object-fit: cover; border-radius: var(--radius-sm); border: 1px solid var(--border); }
  .pending-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 240px; }
  .empty-hint { font-size: 12px; color: var(--text-subtle); max-width: 40ch; }
</style>
