<script lang="ts">
  /**
   * The assistant, available from every console page: a button in the bottom-right
   * corner that opens a small conversation panel.
   *
   * It works WITH the page that is open:
   *   - every message carries the page's path and title, and the server resolves the
   *     path to the event or hall on screen, so "seat these guests here" needs no id;
   *   - after a proposal is applied the open page reloads its data and shows the change;
   *   - when the assistant opens a page (its open_page tool) the browser goes there,
   *     and the panel stays open across the navigation.
   *
   * The conversation lives server-side; this tab only remembers which one it is in,
   * so it survives navigation and reloads without leaking between tabs.
   */
  import { onMount, tick } from 'svelte';
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/stores';
  import { t, getLocale } from '$lib/i18n.svelte';
  import ProposalCard from './ProposalCard.svelte';
  import { renderReply, errorKey } from '$lib/assistant/render';
  import { assistantPageHooks } from '$lib/assistant/page-hooks';
  import { threadKey, OPEN_KEY, tabStore as store, navigationTarget } from '$lib/assistant/session';

  interface Message {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    proposal: { id: string; kind: string; status: string; payload: unknown; result: unknown } | null;
  }

  const { orgId }: { orgId: string } = $props();

  const KEY_THREAD = $derived(threadKey(orgId));
  const KEY_OPEN = OPEN_KEY;

  let open = $state(false);
  let threadId = $state<string | null>(null);
  let messages = $state<Message[]>([]);
  let balanceMc = $state<number | null>(null);
  let text = $state('');
  let files = $state<{ id: string; name: string }[]>([]);
  let busy = $state(false);
  let uploading = $state(false);
  let error = $state('');
  let pendingText = $state<string | null>(null);
  let resolving = $state<string | null>(null);
  let loaded = $state(false);
  let scroller = $state<HTMLDivElement | null>(null);
  let input = $state<HTMLTextAreaElement | null>(null);
  let fileInput = $state<HTMLInputElement | null>(null);
  let pageTitle = $state('');

  const dateLocale = $derived(getLocale() === 'en' ? 'en-GB' : 'sk-SK');
  const credits = $derived(
    balanceMc === null ? '' :
      new Intl.NumberFormat(dateLocale, { maximumFractionDigits: 1 }).format(Math.floor(Math.max(0, balanceMc) / 100) / 10)
  );
  const errorText = (code: unknown) => errorKey(t.ai.errors, code);

  // The title is read after each navigation has rendered; it is what the user sees
  // in the tab, and what the panel says it can see.
  $effect(() => {
    $page.url.pathname;
    tick().then(() => { pageTitle = document.title.replace(/\s+–\s+Hallify$/, ''); });
  });

  async function scrollDown() {
    await tick();
    scroller?.scrollTo({ top: scroller.scrollHeight });
  }

  async function load() {
    try {
      const res = await fetch(`/app/manage/assistant/thread${threadId ? `?t=${threadId}` : ''}`);
      const body = await res.json();
      if (body.ok) {
        messages = body.messages;
        balanceMc = body.balanceMc;
        if (!body.threadId && threadId) setThread(null); // deleted elsewhere
      }
    } catch { /* offline: keep what is shown */ }
    loaded = true;
    scrollDown();
  }

  function setThread(id: string | null) {
    threadId = id;
    store.set(KEY_THREAD, id);
  }

  async function toggle(next = !open) {
    open = next;
    store.set(KEY_OPEN, open ? '1' : null);
    if (open) {
      if (!loaded) await load();
      await tick();
      input?.focus();
    }
  }

  function newConversation() {
    setThread(null);
    messages = [];
    error = '';
    input?.focus();
  }

  async function send() {
    const message = text.trim();
    if (busy || (!message && files.length === 0)) return;
    busy = true;
    error = '';
    pendingText = message + files.map((f) => `\n📎 ${f.name}`).join('');
    const attachmentIds = files.map((f) => f.id);
    text = '';
    files = [];
    scrollDown();
    try {
      const res = await fetch('/app/manage/assistant/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          threadId, text: message, attachmentIds,
          page: { path: $page.url.pathname + $page.url.search, title: pageTitle }
        })
      });
      const body = await res.json().catch(() => ({}));
      if (!body.ok) error = errorText(body.error);
      if (body.threadId) setThread(body.threadId);
      await load();
      const go = navigationTarget(body.actions);
      if (go) await goto(go);
    } catch {
      error = t.ai.errors.generic;
    } finally {
      busy = false;
      pendingText = null;
      scrollDown();
    }
  }

  async function upload(e: Event) {
    const el = e.currentTarget as HTMLInputElement;
    const file = el.files?.[0];
    el.value = '';
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
    // The open page may hold unsaved work this change would collide with.
    const blocked = action === 'apply' ? assistantPageHooks()?.blocker?.() : null;
    if (blocked) {
      error = blocked;
      return;
    }
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
      await load();
      // The page underneath shows the change without anyone pressing reload — and a
      // page with its own working copy (the seating editor) rebuilds it from the fresh data.
      if (action === 'apply' && res.ok) {
        await invalidateAll();
        assistantPageHooks()?.afterApply?.();
      }
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

  onMount(() => {
    threadId = store.get(KEY_THREAD);
    if (store.get(KEY_OPEN) === '1') toggle(true);
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape' && open) toggle(false); };
    window.addEventListener('keydown', onEsc);
    // A "Draft with AI" button elsewhere on the page opens the panel.
    const onOpen = () => toggle(true);
    window.addEventListener('hallify:assistant:open', onOpen);
    return () => { window.removeEventListener('keydown', onEsc); window.removeEventListener('hallify:assistant:open', onOpen); };
  });
</script>

{#if open}
  <section class="aw-panel" aria-label={t.ai.title}>
    <header class="aw-head">
      <span class="aw-spark" aria-hidden="true">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>
      </span>
      <strong>{t.ai.title}</strong>
      <span class="beta" title={t.ai.betaHint}>{t.ai.beta}</span>
      {#if credits}<span class="aw-credits" title={t.ai.balanceTitle}>{t.ai.balance(credits)}</span>{/if}
      <span class="aw-head-actions">
        <button type="button" class="aw-icon" onclick={newConversation} title={t.ai.newChat} aria-label={t.ai.newChat}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
        <a class="aw-icon" href="/app/manage/assistant{threadId ? `?t=${threadId}` : ''}" title={t.ai.openFull} aria-label={t.ai.openFull}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
        </a>
        <button type="button" class="aw-icon" onclick={() => toggle(false)} title={t.ai.widgetClose} aria-label={t.ai.widgetClose}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </span>
    </header>

    <div class="aw-messages" bind:this={scroller}>
      {#if messages.length === 0 && !pendingText}
        <p class="aw-empty">{t.ai.widgetEmpty}</p>
      {/if}
      {#each messages as m (m.id)}
        {#if m.text}
          <div class="aw-msg aw-msg--{m.role}">
            {#if m.role === 'assistant'}{@html renderReply(m.text)}{:else}{m.text}{/if}
          </div>
        {/if}
        {#if m.proposal}
          <ProposalCard proposal={m.proposal} {resolving} onresolve={resolve} compact />
        {/if}
      {/each}
      {#if pendingText}
        <div class="aw-msg aw-msg--user">{pendingText}</div>
        <div class="aw-msg aw-msg--assistant aw-thinking" aria-live="polite">{t.ai.thinking}</div>
      {/if}
    </div>

    {#if error}<p class="aw-error" role="alert">{error}</p>{/if}

    <form class="aw-composer" onsubmit={(e) => { e.preventDefault(); send(); }}>
      {#if pageTitle}
        <p class="aw-context" title={$page.url.pathname}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          {t.ai.seesPage(pageTitle)}
        </p>
      {/if}
      {#if files.length}
        <div class="aw-files">
          {#each files as f (f.id)}
            <span class="aw-file">📎 {f.name}
              <button type="button" aria-label={t.ai.removeAttachment} onclick={() => (files = files.filter((x) => x.id !== f.id))}>×</button>
            </span>
          {/each}
        </div>
      {/if}
      <div class="aw-input">
        <textarea rows="2" bind:this={input} bind:value={text} onkeydown={onKey}
          placeholder={t.ai.placeholder} aria-label={t.ai.placeholder} disabled={busy}></textarea>
        <input type="file" accept=".csv,.tsv,.txt,.pdf,.jpg,.jpeg,.png,.webp,text/csv,application/pdf,image/jpeg,image/png,image/webp" class="aw-hidden" bind:this={fileInput} onchange={upload} />
        <button type="button" class="aw-icon" onclick={() => fileInput?.click()} disabled={busy || uploading}
          title={t.ai.attach} aria-label={t.ai.attach}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
        </button>
        <button type="submit" class="aw-send" disabled={busy || uploading || (!text.trim() && !files.length)}
          title={t.ai.send} aria-label={t.ai.send}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
    </form>
  </section>
{/if}

<button type="button" class="aw-launcher" class:is-open={open} onclick={() => toggle()}
  aria-expanded={open} aria-label={open ? t.ai.widgetClose : t.ai.widgetOpen} title={open ? t.ai.widgetClose : t.ai.widgetOpen}>
  {#if open}
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="6 9 12 15 18 9"/></svg>
  {:else}
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>
  {/if}
</button>

<style>
  /* The assistant is in beta: said wherever it is offered. */
  .beta {
    display: inline-flex; align-items: center; padding: 1px 6px; border-radius: var(--radius-sm);
    font-size: 9.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; line-height: 1.5;
    background: var(--accent-dim); color: var(--accent-ink); vertical-align: middle;
  }

  /* Above page content, below the page's own dialogs (z-index 100), so a confirm
     dialog the assistant's change leads to is never hidden behind it. */
  .aw-launcher {
    position: fixed; right: 20px; bottom: 20px; z-index: 90;
    width: 48px; height: 48px; border-radius: 50%; border: none; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    background: var(--accent); color: var(--accent-contrast);
    box-shadow: 0 6px 20px rgba(0, 0, 0, .28);
    transition: transform .2s, background .2s;
  }
  .aw-launcher:hover { background: var(--accent-hover); transform: translateY(-2px); }
  .aw-launcher:focus-visible { outline: 2px solid var(--accent-ink); outline-offset: 3px; }

  .aw-panel {
    position: fixed; right: 20px; bottom: 80px; z-index: 90;
    width: 400px; height: min(620px, calc(100vh - 110px));
    display: flex; flex-direction: column;
    background: var(--bg-panel); border: 1px solid var(--border); border-radius: var(--radius-lg, 12px);
    box-shadow: 0 18px 50px rgba(0, 0, 0, .35);
    overflow: hidden;
  }

  .aw-head {
    display: flex; align-items: center; gap: 8px; padding: 11px 12px 11px 14px;
    border-bottom: 1px solid var(--border);
  }
  .aw-head strong { font-size: 13.5px; font-weight: 650; letter-spacing: -.02em; }
  .aw-spark { display: flex; color: var(--accent-ink); }
  .aw-credits {
    font-size: 11px; font-weight: 650; padding: 2px 7px; border-radius: var(--radius-sm);
    background: var(--accent-dim); color: var(--accent-ink); white-space: nowrap;
  }
  .aw-head-actions { margin-left: auto; display: flex; gap: 2px; }
  .aw-icon {
    width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
    border: none; border-radius: var(--radius-sm); background: none; color: var(--text-muted); cursor: pointer;
    transition: background .15s, color .15s;
  }
  .aw-icon:hover:not(:disabled) { background: var(--bg-hover); color: var(--text-base); }
  .aw-icon:disabled { opacity: .4; cursor: default; }

  .aw-messages { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
  .aw-empty { margin: auto 8px; text-align: center; font-size: 13px; line-height: 1.55; color: var(--text-muted); }
  .aw-msg { max-width: 88%; font-size: 13px; line-height: 1.55; border-radius: var(--radius); padding: 8px 12px; }
  .aw-msg--user { align-self: flex-end; background: var(--accent-dim); white-space: pre-wrap; }
  .aw-msg--assistant { align-self: flex-start; background: var(--bg-hover); }
  .aw-msg--assistant :global(p) { margin: 0 0 6px; }
  .aw-msg--assistant :global(p:last-child) { margin-bottom: 0; }
  .aw-msg--assistant :global(ul) { margin: 4px 0 6px; padding-left: 18px; }
  .aw-msg--assistant :global(code) { font-size: 12px; padding: 1px 4px; border-radius: 3px; background: var(--bg-panel); }
  .aw-msg--assistant :global(ol) { margin: 4px 0 6px; padding-left: 20px; }
  .aw-msg--assistant :global(.reply-heading) { margin-top: 10px; }
  .aw-msg--assistant :global(.reply-heading:first-child) { margin-top: 0; }
  .aw-msg--assistant :global(hr) { border: none; border-top: 1px solid var(--border); margin: 8px 0; }
  .aw-msg--assistant :global(.reply-table) { overflow-x: auto; margin: 4px 0 8px; }
  .aw-msg--assistant :global(.reply-table:last-child) { margin-bottom: 0; }
  .aw-msg--assistant :global(table) { border-collapse: collapse; font-size: 12px; line-height: 1.45; }
  .aw-msg--assistant :global(th), .aw-msg--assistant :global(td) { text-align: left; vertical-align: top; padding: 4px 8px; border-bottom: 1px solid var(--border); }
  .aw-msg--assistant :global(th) { font-weight: 600; color: var(--text-muted); white-space: nowrap; }
  .aw-msg--assistant :global(tr:last-child td) { border-bottom: none; }
  .aw-thinking { color: var(--text-muted); animation: aw-pulse 1.4s ease-in-out infinite; }
  @keyframes aw-pulse { 50% { opacity: .45; } }

  .aw-error {
    margin: 0 14px 8px; padding: 7px 10px; font-size: 12px; color: var(--danger);
    background: var(--danger-dim); border-radius: var(--radius-sm);
  }

  .aw-composer { border-top: 1px solid var(--border); padding: 8px 10px 10px; }
  .aw-context {
    display: flex; align-items: center; gap: 5px; margin: 0 2px 6px;
    font-size: 11px; color: var(--text-subtle); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .aw-context svg { flex-shrink: 0; }
  .aw-files { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; }
  .aw-file {
    display: inline-flex; align-items: center; gap: 4px; padding: 2px 4px 2px 8px; font-size: 12px;
    border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-hover);
  }
  .aw-file button { border: none; background: none; color: var(--text-muted); cursor: pointer; font-size: 14px; }
  .aw-input {
    display: flex; align-items: flex-end; gap: 4px; padding: 6px 6px 6px 10px;
    border: 1px solid var(--border); border-radius: var(--radius); background: var(--bg-panel2, var(--bg-base));
    transition: border-color .15s, box-shadow .15s;
  }
  .aw-input:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
  .aw-input textarea {
    flex: 1; min-width: 0; resize: none; border: none; outline: none; background: none; color: var(--text-base);
    font-family: inherit; font-size: 13px; line-height: 1.5; max-height: 120px; padding: 4px 0;
  }
  .aw-send {
    width: 32px; height: 32px; flex-shrink: 0; border: none; border-radius: var(--radius-sm); cursor: pointer;
    display: inline-flex; align-items: center; justify-content: center;
    background: var(--accent); color: var(--accent-contrast); transition: background .15s, opacity .15s;
  }
  .aw-send:hover:not(:disabled) { background: var(--accent-hover); }
  .aw-send:disabled { opacity: .4; cursor: default; }
  .aw-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }

  /* On a phone the panel is a sheet over the page, leaving the launcher visible. */
  @media (max-width: 560px) {
    .aw-panel { left: 8px; right: 8px; width: auto; bottom: 76px; height: calc(100vh - 96px); }
    .aw-launcher { right: 14px; bottom: 14px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .aw-launcher:hover { transform: none; }
    .aw-thinking { animation: none; }
  }
</style>
