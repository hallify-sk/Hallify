<script lang="ts">
  import { enhance } from '$app/forms';
  import { goto, invalidateAll } from '$app/navigation';
  import { tick } from 'svelte';
  import { t, getLocale } from '$lib/i18n.svelte';
  import SectionHeader from '$lib/components/SectionHeader.svelte';
  import ProposalCard from '$lib/components/assistant/ProposalCard.svelte';
  import { renderReply, errorKey } from '$lib/assistant/render';
  import { threadKey, OPEN_KEY, tabStore, navigationTarget } from '$lib/assistant/session';
  import { creditAmount } from '$lib/assistant/credits';
  import type { PageData } from './$types';

  const { data }: { data: PageData } = $props();

  let text = $state('');
  let files = $state<{ id: string; name: string }[]>([]);
  let busy = $state(false);
  let uploading = $state(false);
  let error = $state('');
  /** The message being answered, shown straight away rather than after the round trip. */
  let pendingText = $state<string | null>(null);
  let resolving = $state<string | null>(null);
  let fileInput = $state<HTMLInputElement | null>(null);
  let scroller = $state<HTMLDivElement | null>(null);

  // The same formatter as the AI settings page, so the balance reads the same everywhere.
  const credits = $derived(creditAmount(Math.max(0, data.balanceMc), getLocale()));
  const questionCost = $derived(t.ai.questionCost(creditAmount(data.questionMc, getLocale())));

  const errorText = (code: unknown) => errorKey(t.ai.errors, code);

  async function scrollDown() {
    await tick();
    scroller?.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' });
  }
  $effect(() => {
    data.messages.length;
    scrollDown();
  });

  async function send(prompt?: string) {
    const message = (prompt ?? text).trim();
    if (busy || (!message && files.length === 0)) return;
    busy = true;
    error = '';
    pendingText = message + files.map((f) => `\n📎 ${f.name}`).join('');
    const attached = files;
    const attachmentIds = files.map((f) => f.id);
    text = '';
    files = [];
    // A refused or failed question goes back into the composer, so it need not be typed again.
    const giveBack = () => {
      if (!text.trim() && !files.length) {
        text = message;
        files = attached;
      }
    };
    scrollDown();
    try {
      const res = await fetch('/app/manage/assistant/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ threadId: data.threadId, text: message, attachmentIds })
      });
      const body = await res.json().catch(() => ({}));
      if (!body.ok) {
        error = errorText(body.error);
        giveBack();
      }
      const thread = body.threadId ?? data.threadId;
      const go = navigationTarget(body.actions);
      if (go) {
        // The assistant opened a page for them: go there, and carry the conversation
        // on in the floating widget, open, on that page.
        if (thread && data.currentOrg) {
          tabStore.set(threadKey(data.currentOrg.id), thread);
          tabStore.set(OPEN_KEY, '1');
        }
        await goto(go);
      } else if (thread && thread !== data.threadId) await goto(`?t=${thread}`, { keepFocus: true, noScroll: true });
      else await invalidateAll();
    } catch {
      error = t.ai.errors.generic;
      giveBack();
    } finally {
      busy = false;
      pendingText = null;
    }
  }

  async function upload(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    uploading = true;
    error = '';
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/app/manage/assistant/attachments', { method: 'POST', body: form });
      const body = await res.json().catch(() => ({}));
      if (body.ok) files = [...files, { id: body.id, name: body.name }];
      else error = errorText(body.error);
    } catch {
      error = t.ai.errors.generic;
    } finally {
      uploading = false;
    }
  }

  async function resolve(id: string, action: 'apply' | 'discard') {
    resolving = id;
    error = '';
    try {
      const res = await fetch(`/app/manage/assistant/proposals/${id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok && !body.ok) error = errorText(body.error);
      await invalidateAll();
    } finally {
      resolving = null;
    }
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send();
    }
  }

</script>

<svelte:head><title>{t.ai.title} – Hallify</title></svelte:head>

<div class="wrap page">
  <div class="head">
    <div class="title-block">
      <SectionHeader overline={t.sidebar.sectionAdmin} title={t.ai.title} />
      <p class="beta-line"><span class="beta">{t.ai.beta}</span> {t.ai.betaHint}</p>
    </div>
    {#if data.enabled}
      <span class="credits" title="{t.ai.balanceTitle}. {questionCost}">{t.ai.balance(credits)}</span>
    {/if}
  </div>

  {#if !data.enabled}
    <section class="card--inset gate">
      <h2>{t.ai.disabledTitle}</h2>
      <p>{t.ai.disabledBody}</p>
      {#if data.canEnable}
        <form method="POST" action="?/enable" use:enhance>
          <button type="submit" class="btn-action">{t.ai.enableButton}</button>
        </form>
      {:else}
        <p class="muted">{t.ai.enableAskAdmin}</p>
      {/if}
    </section>
  {:else}
    {#if !data.available}
      <p class="alert-warning">{t.ai.unavailable}</p>
    {/if}

    <div class="assistant">
      <aside class="threads">
        <a href="/app/manage/assistant" class="btn-outline btn-sm new-chat">{t.ai.newChat}</a>
        <p class="threads-label">{t.ai.threads}</p>
        {#if data.threads.length === 0}
          <p class="muted small">{t.ai.noThreads}</p>
        {/if}
        <ul>
          {#each data.threads as th (th.id)}
            <li class:active={th.id === data.threadId}>
              <a href="?t={th.id}">{th.title || '…'}</a>
              <form method="POST" action="?/deleteThread" use:enhance={() => async ({ update }) => {
                  await update();
                  if (th.id === data.threadId) goto('/app/manage/assistant');
                }}>
                <input type="hidden" name="id" value={th.id} />
                <button type="submit" class="thread-del" aria-label={t.ai.deleteThread} title={t.ai.deleteThread}>×</button>
              </form>
            </li>
          {/each}
        </ul>
      </aside>

      <section class="chat">
        <div class="messages" bind:this={scroller}>
          {#if data.messages.length === 0 && !pendingText}
            <div class="empty">
              <h2>{t.ai.emptyTitle}</h2>
              <p class="muted">{t.ai.subtitle}</p>
              <p class="muted small cost-note">{questionCost}</p>
              <div class="suggestions">
                {#each t.ai.suggestions as s}
                  <button type="button" class="suggestion" onclick={() => (text = s)}>{s}</button>
                {/each}
              </div>
            </div>
          {/if}

          {#each data.messages as m (m.id)}
            {#if m.text}
              <div class="msg msg--{m.role}">
                {#if m.role === 'assistant'}{@html renderReply(m.text)}{:else}{m.text}{/if}
              </div>
            {/if}
            {#if m.proposal}
              <ProposalCard proposal={m.proposal} {resolving} onresolve={resolve} />
            {/if}
          {/each}

          {#if pendingText}
            <div class="msg msg--user">{pendingText}</div>
            <div class="msg msg--assistant thinking" aria-live="polite">{t.ai.thinking}</div>
          {/if}
        </div>

        {#if error}<p class="inline-err" role="alert">{error}</p>{/if}

        <form class="composer" onsubmit={(e) => { e.preventDefault(); send(); }}>
          {#if files.length}
            <div class="files">
              {#each files as f (f.id)}
                <span class="file">📎 {f.name}
                  <button type="button" aria-label={t.ai.removeAttachment} onclick={() => (files = files.filter((x) => x.id !== f.id))}>×</button>
                </span>
              {/each}
            </div>
          {/if}
          <textarea rows="2" bind:value={text} onkeydown={onKey} placeholder={t.ai.placeholder}
            disabled={busy || !data.available} aria-label={t.ai.placeholder}></textarea>
          <div class="composer-bar">
            <input type="file" accept=".csv,.tsv,.txt,.pdf,.jpg,.jpeg,.png,.webp,text/csv,application/pdf,image/jpeg,image/png,image/webp" class="sr-only" bind:this={fileInput} onchange={upload} />
            <button type="button" class="btn-outline btn-sm" onclick={() => fileInput?.click()} disabled={busy || uploading || !data.available}>
              {uploading ? t.ai.uploading : t.ai.attach}
            </button>
            <span class="privacy">{t.ai.privacyNote}</span>
            <button type="submit" class="btn-action btn-sm" disabled={busy || uploading || !data.available || (!text.trim() && !files.length)}>
              {t.ai.send}
            </button>
          </div>
        </form>
      </section>
    </div>
  {/if}
</div>

<style>
  /* The assistant is in beta: said wherever it is offered. */
  .beta {
    display: inline-flex; align-items: center; padding: 1px 6px; border-radius: var(--radius-sm);
    font-size: 9.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; line-height: 1.5;
    background: var(--accent-dim); color: var(--accent-ink); vertical-align: middle;
  }
  .title-block :global(.section-header) { margin-bottom: 8px; }
  .beta-line { margin: 0 0 18px; font-size: 12px; color: var(--text-muted); display: flex; align-items: center; gap: 8px; }

  .page { padding-block: 24px; }
  .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
  .credits {
    margin-top: 6px; padding: 5px 11px; border-radius: var(--radius-sm);
    background: var(--accent-dim); color: var(--accent-ink); font-size: 12px; font-weight: 650; white-space: nowrap;
  }
  .muted { color: var(--text-muted); }
  .small { font-size: 12px; }

  .gate { padding: 28px; max-width: 620px; }
  .gate h2 { margin: 0 0 8px; font-size: var(--h2-size); }
  .gate p { margin: 0 0 16px; line-height: var(--body-leading); color: var(--text-muted); }

  .assistant {
    display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 20px;
    height: calc(100vh - 170px); min-height: 480px;
  }

  /* ── Threads ── */
  .threads { display: flex; flex-direction: column; min-height: 0; }
  .new-chat { justify-content: center; text-decoration: none; }
  .threads-label {
    margin: 16px 0 6px; font-size: 10px; font-weight: 650; text-transform: uppercase;
    letter-spacing: .1em; color: var(--text-subtle);
  }
  .threads ul { list-style: none; margin: 0; padding: 0; overflow-y: auto; flex: 1; }
  .threads li { display: flex; align-items: center; border-radius: var(--radius-sm); }
  .threads li:hover, .threads li.active { background: var(--bg-hover); }
  .threads li a {
    flex: 1; min-width: 0; padding: 7px 9px; font-size: 13px; color: var(--text-muted);
    text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .threads li.active a { color: var(--text-base); font-weight: 600; }
  .threads form { margin: 0; }
  .thread-del {
    border: none; background: none; color: var(--text-subtle); cursor: pointer; font-size: 15px;
    padding: 2px 8px; opacity: 0; transition: opacity .15s;
  }
  .threads li:hover .thread-del, .thread-del:focus-visible { opacity: 1; }
  .thread-del:hover { color: var(--danger); }

  /* ── Chat ── */
  .chat {
    display: flex; flex-direction: column; min-height: 0;
    border: 1px solid var(--border); border-radius: var(--radius); background: var(--bg-panel);
  }
  .messages { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 12px; }

  .empty { margin: auto; text-align: center; max-width: 460px; }
  .empty h2 { margin: 0 0 6px; font-size: var(--h2-size); }
  .empty p { margin: 0 0 18px; line-height: 1.5; }
  .empty p.cost-note { margin-top: -10px; }
  .suggestions { display: flex; flex-direction: column; gap: 6px; }
  .suggestion {
    padding: 9px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm);
    background: none; color: var(--text-base); font-family: inherit; font-size: 13px; text-align: left; cursor: pointer;
    transition: border-color .15s, background .15s;
  }
  .suggestion:hover { border-color: var(--accent); background: var(--accent-dim); }

  .msg { max-width: 78%; font-size: 13.5px; line-height: 1.55; border-radius: var(--radius); padding: 10px 14px; }
  .msg--user { align-self: flex-end; background: var(--accent-dim); color: var(--text-base); white-space: pre-wrap; }
  .msg--assistant { align-self: flex-start; background: var(--bg-hover); color: var(--text-base); }
  .msg--assistant :global(p) { margin: 0 0 6px; }
  .msg--assistant :global(p:last-child) { margin-bottom: 0; }
  .msg--assistant :global(ul) { margin: 4px 0 6px; padding-left: 18px; }
  .msg--assistant :global(code) { font-size: 12px; padding: 1px 4px; border-radius: 3px; background: var(--bg-panel); }
  .msg--assistant :global(ol) { margin: 4px 0 6px; padding-left: 20px; }
  .msg--assistant :global(.reply-heading) { margin-top: 10px; }
  .msg--assistant :global(.reply-heading:first-child) { margin-top: 0; }
  .msg--assistant :global(hr) { border: none; border-top: 1px solid var(--border); margin: 8px 0; }
  .msg--assistant :global(.reply-table) { overflow-x: auto; margin: 4px 0 8px; }
  .msg--assistant :global(.reply-table:last-child) { margin-bottom: 0; }
  .msg--assistant :global(table) { border-collapse: collapse; font-size: 12px; line-height: 1.45; }
  .msg--assistant :global(th), .msg--assistant :global(td) { text-align: left; vertical-align: top; padding: 4px 8px; border-bottom: 1px solid var(--border); }
  .msg--assistant :global(th) { font-weight: 600; color: var(--text-muted); white-space: nowrap; }
  .msg--assistant :global(tr:last-child td) { border-bottom: none; }
  .thinking { color: var(--text-muted); animation: pulse 1.4s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: .45; } }

  /* ── Composer ── */
  .inline-err {
    margin: 0 20px 10px; padding: 8px 12px; font-size: 12.5px; color: var(--danger);
    background: var(--danger-dim); border-radius: var(--radius-sm);
  }
  .composer { border-top: 1px solid var(--border); padding: 12px 14px; }
  .composer textarea {
    width: 100%; resize: none; border: none; outline: none; background: none; color: var(--text-base);
    font-family: inherit; font-size: 13.5px; line-height: 1.5;
  }
  .composer-bar { display: flex; align-items: center; gap: 10px; margin-top: 6px; }
  .privacy { flex: 1; font-size: 11px; color: var(--text-subtle); line-height: 1.4; }
  .files { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
  .file {
    display: inline-flex; align-items: center; gap: 4px; padding: 3px 4px 3px 9px; font-size: 12px;
    border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-hover);
  }
  .file button { border: none; background: none; color: var(--text-muted); cursor: pointer; font-size: 14px; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }

  @media (max-width: 860px) {
    .assistant { grid-template-columns: minmax(0, 1fr); height: auto; }
    .threads { display: none; }
    .chat { height: calc(100vh - 190px); }
    .msg { max-width: 92%; }
    .privacy { display: none; }
  }
</style>
