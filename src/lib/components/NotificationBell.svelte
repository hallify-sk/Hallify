<script lang="ts">
  // The notification centre's bell (D12): an unread count, and a panel of the
  // organisation's recent events this member may see. In the sidebar's header on a
  // desktop and in the top bar on a phone. The panel is position: fixed, so the
  // sidebar's overflow cannot clip it.
  import { afterNavigate } from '$app/navigation';
  import { t, getLocale } from '$lib/i18n.svelte';
  import { timeAgo, formatDateTime } from '$lib/format';
  import { dialog } from '$lib/actions/dialog';
  import { notificationText, type NotificationItem } from '$lib/notification-centre';

  interface Props {
    /** Unread count, kept live by the app shell's poll. */
    unread?: number;
    /** Told the new count after the panel loaded or marked something read. */
    onchange?: (unread: number) => void;
    /** 'sidebar' sits in the desktop sidebar's header; 'bar' in the phone top bar. */
    placement?: 'sidebar' | 'bar';
  }

  const { unread = 0, onchange, placement = 'sidebar' }: Props = $props();

  let open = $state(false);
  let loading = $state(false);
  let failed = $state(false);
  let items = $state<NotificationItem[]>([]);
  let button = $state<HTMLButtonElement | null>(null);
  let panelStyle = $state('');

  const PANEL_W = 360;
  const badge = $derived(unread > 99 ? '99+' : String(unread));

  function place() {
    if (!button) return;
    const r = button.getBoundingClientRect();
    const vw = window.innerWidth;
    const top = Math.round(r.bottom + 6);
    if (vw < 520) {
      panelStyle = `top:${top}px;left:8px;right:8px;max-height:calc(100dvh - ${top + 8}px)`;
    } else {
      const left = Math.max(8, Math.min(Math.round(r.left), vw - PANEL_W - 8));
      panelStyle = `top:${top}px;left:${left}px;width:${PANEL_W}px;max-height:calc(100dvh - ${top + 16}px)`;
    }
  }

  async function load() {
    loading = true;
    failed = false;
    try {
      const res = await fetch('/api/notifications/centre', { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(String(res.status));
      apply(await res.json());
    } catch {
      failed = true;
    } finally {
      loading = false;
    }
  }

  function apply(data: { items: NotificationItem[]; unread: number }) {
    items = data.items ?? [];
    onchange?.(Number(data.unread ?? 0));
  }

  async function post(body: Record<string, unknown>, keepalive = false) {
    try {
      const res = await fetch('/api/notifications/centre', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body),
        keepalive,
      });
      if (res.ok) apply(await res.json());
    } catch { /* offline: the next poll corrects the count */ }
  }

  function toggle() {
    if (open) { close(); return; }
    place();
    open = true;
    load();
  }

  function close() { open = false; }

  function markRead(n: NotificationItem) {
    if (n.read) return;
    n.read = true;
    onchange?.(Math.max(0, unread - 1));
    post({ action: 'read', id: n.id }, true);
  }

  function markAll() {
    for (const n of items) n.read = true;
    onchange?.(0);
    post({ action: 'readAll' });
  }

  // Outside clicks close the panel; so does leaving the page.
  $effect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const el = e.target as HTMLElement;
      if (!el.closest('.notif-panel') && !el.closest('.notif-btn')) close();
    };
    const onResize = () => place();
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('resize', onResize);
    };
  });
  afterNavigate(() => { open = false; });
</script>

<button
  bind:this={button}
  type="button"
  class="notif-btn"
  class:notif-btn--bar={placement === 'bar'}
  aria-label={t.notifCentre.open(unread)}
  aria-haspopup="dialog"
  aria-expanded={open}
  onclick={toggle}
>
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
  </svg>
  {#if unread > 0}<span class="notif-count" aria-hidden="true">{badge}</span>{/if}
</button>

{#if open}
  <div
    class="notif-panel"
    role="dialog"
    aria-label={t.notifCentre.title}
    style={panelStyle}
    use:dialog={{ onclose: close }}
  >
    <header class="notif-head">
      <h2>{t.notifCentre.title}</h2>
      <div class="notif-head-actions">
        {#if items.some((n) => !n.read)}
          <button type="button" class="notif-link-btn" onclick={markAll}>{t.notifCentre.markAllRead}</button>
        {/if}
        <button type="button" class="notif-x" aria-label={t.notifCentre.close} onclick={close}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </header>

    <div class="notif-body">
      {#if loading && items.length === 0}
        <ul class="notif-list" aria-hidden="true">
          {#each [0, 1, 2] as i (i)}<li class="notif-skel"><span></span><span></span></li>{/each}
        </ul>
      {:else if failed}
        <p class="notif-empty" role="alert">
          {t.notifCentre.loadError}
          <button type="button" class="notif-link-btn" onclick={load}>{t.notifCentre.retry}</button>
        </p>
      {:else if items.length === 0}
        <div class="notif-empty">
          <p class="notif-empty-title">{t.notifCentre.empty}</p>
          <p>{t.notifCentre.emptySub}</p>
        </div>
      {:else}
        <ul class="notif-list">
          {#each items as n (n.id)}
            {@const text = notificationText(n, t, getLocale())}
            <li class="notif-item" class:unread={!n.read}>
              {#if n.link}
                <a class="notif-main" href={n.link} onclick={() => { markRead(n); close(); }}>
                  {@render body(n, text)}
                </a>
              {:else}
                <div class="notif-main">{@render body(n, text)}</div>
              {/if}
              {#if !n.read}
                <button type="button" class="notif-dot" aria-label={t.notifCentre.markRead} title={t.notifCentre.markRead} onclick={() => markRead(n)}>
                  <span aria-hidden="true"></span>
                </button>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>
{/if}

{#snippet body(n: NotificationItem, text: { title: string; detail: string })}
  <span class="notif-title">
    {#if !n.read}<span class="visually-hidden">{t.notifCentre.unread}: </span>{/if}{text.title}
  </span>
  {#if text.detail}<span class="notif-detail">{text.detail}</span>{/if}
  <time class="notif-time" datetime={n.created_at} title={formatDateTime(n.created_at, getLocale())}>{timeAgo(n.created_at, getLocale())}</time>
{/snippet}

<style>
  .notif-btn {
    position: relative;
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--text-muted);
    cursor: pointer;
  }
  .notif-btn:hover, .notif-btn[aria-expanded='true'] { background: var(--bg-hover); color: var(--text-base); }
  .notif-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  /* Finger-sized in the phone's top bar, matching the menu button. */
  .notif-btn--bar { width: 40px; height: 40px; border-color: var(--border); color: var(--text-base); }
  .notif-count {
    position: absolute;
    top: -3px;
    right: -4px;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 8px;
    background: var(--danger);
    color: #fff;
    font-size: 10px;
    font-weight: 700;
    line-height: 16px;
    text-align: center;
  }

  .notif-panel {
    position: fixed;
    z-index: 200;
    display: flex;
    flex-direction: column;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow);
    overflow: hidden;
    color: var(--text-base);
  }
  .notif-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 10px 10px 10px 14px;
    border-bottom: 1px solid var(--border-subtle);
  }
  .notif-head h2 { margin: 0; font-size: 14px; font-weight: 650; }
  .notif-head-actions { display: flex; align-items: center; gap: 4px; }
  .notif-link-btn {
    border: none;
    background: none;
    padding: 4px 6px;
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    color: var(--accent-ink);
    cursor: pointer;
    border-radius: var(--radius-sm);
  }
  .notif-link-btn:hover { background: var(--bg-hover); }
  .notif-x {
    width: 28px; height: 28px;
    display: inline-flex; align-items: center; justify-content: center;
    border: none; background: none; border-radius: var(--radius-sm);
    color: var(--text-muted); cursor: pointer;
  }
  .notif-x:hover { background: var(--bg-hover); color: var(--text-base); }

  .notif-body { overflow-y: auto; min-height: 0; }
  .notif-list { list-style: none; margin: 0; padding: 4px 0; }
  .notif-item {
    position: relative;
    display: flex;
    align-items: flex-start;
    border-bottom: 1px solid var(--border-subtle);
  }
  .notif-item:last-child { border-bottom: none; }
  .notif-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px 6px 10px 14px;
    color: inherit;
    text-decoration: none;
  }
  a.notif-main:hover { background: var(--bg-hover); text-decoration: none; }
  .notif-title { font-size: 13px; font-weight: 500; color: var(--text-muted); }
  .notif-item.unread .notif-title { font-weight: 650; color: var(--text-base); }
  .notif-detail {
    font-size: 12.5px;
    color: var(--text-muted);
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow-wrap: anywhere;
  }
  .notif-time { font-size: 11.5px; color: var(--text-subtle); }
  .notif-dot {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    margin: 6px 6px 0 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
  }
  .notif-dot span { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); }
  .notif-dot:hover { background: var(--bg-hover); }

  .notif-empty { padding: 22px 16px; font-size: 13px; color: var(--text-muted); margin: 0; }
  .notif-empty p { margin: 0 0 4px; }
  .notif-empty-title { font-weight: 650; color: var(--text-base); }

  .visually-hidden {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
  }

  .notif-skel { display: flex; flex-direction: column; gap: 6px; padding: 12px 14px; }
  .notif-skel span { display: block; height: 10px; border-radius: 3px; background: var(--bg-hover); }
  .notif-skel span:first-child { width: 55%; }
  .notif-skel span:last-child { width: 85%; }
</style>
