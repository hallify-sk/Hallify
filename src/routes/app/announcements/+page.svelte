<script lang="ts">
  import { t } from '$lib/i18n.svelte';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();

  const LEVELS = $derived<Record<string, { label: string; icon: string }>>({
    info:    { label: t.accountExtra.levelInfo,     icon: 'M12 16v-4M12 8h.01M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z' },
    success: { label: t.accountExtra.levelResolved, icon: 'M20 6L9 17l-5-5' },
    warning: { label: t.accountExtra.levelWarning,  icon: 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01' },
    error:   { label: t.accountExtra.levelMajor,    icon: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM15 9l-6 6M9 9l6 6' },
  });

  function fmtDate(d: string) {
    return new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
</script>

<svelte:head><title>{t.accountExtra.announcementsTitle} – Hallify</title></svelte:head>

<div class="page">
  <div class="page-header">
    <h1 class="page-title">{t.accountExtra.announcementsTitle}</h1>
    <span class="count">{data.announcements.length}</span>
  </div>
  <p class="page-sub">{t.accountExtra.announcementsSub}</p>

  {#if data.announcements.length === 0}
    <div class="empty">
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 11l18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>
      <p>{t.accountExtra.noAnnouncements}</p>
    </div>
  {:else}
    <div class="list">
      {#each data.announcements as a}
        {@const lvl = LEVELS[a.level] ?? LEVELS.info}
        <article class="ann ann-{a.level}" class:unread={!a.read}>
          <div class="ann-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d={lvl.icon}/></svg>
          </div>
          <div class="ann-body">
            <div class="ann-head">
              <h2>{a.title}</h2>
              {#if !a.read}<span class="new-dot" title={t.accountExtra.newBadge}></span>{/if}
              <span class="ann-level">{lvl.label}</span>
            </div>
            <p class="ann-text">{a.body}</p>
            <div class="ann-meta">{a.author ?? 'Hallify'} · {fmtDate(a.created_at)}</div>
          </div>
        </article>
      {/each}
    </div>
  {/if}
</div>

<style>
  .page { padding: 24px 28px; }
  .page-header { display: flex; align-items: center; gap: 10px; }
  .page-title { font-size: 18px; font-weight: 800; letter-spacing: -.025em; margin: 0; }
  .count { font-size: 12px; font-weight: 600; color: var(--text-muted); background: var(--bg-panel2, var(--bg-base)); border: 1px solid var(--border); border-radius: 99px; padding: 2px 9px; }
  .page-sub { font-size: 13px; color: var(--text-muted); margin: 4px 0 20px; }

  .empty { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 60px 0; color: var(--text-subtle); }
  .empty p { font-size: 14px; }

  .list { display: flex; flex-direction: column; gap: 12px; }
  .ann {
    display: flex; gap: 14px; padding: 16px 18px;
    background: var(--bg-panel); border: 1px solid var(--border); border-left-width: 3px; border-radius: 12px;
  }
  .ann-info    { border-left-color: var(--accent); }
  .ann-success { border-left-color: #16a34a; }
  .ann-warning { border-left-color: #f59e0b; }
  .ann-error   { border-left-color: #dc2626; }
  .ann.unread { background: color-mix(in srgb, var(--accent) 4%, var(--bg-panel)); }

  .ann-icon { flex-shrink: 0; width: 34px; height: 34px; border-radius: 9px; display: flex; align-items: center; justify-content: center; }
  .ann-info .ann-icon    { background: var(--accent-dim, color-mix(in srgb, var(--accent) 14%, transparent)); color: var(--accent); }
  .ann-success .ann-icon { background: color-mix(in srgb, #16a34a 14%, transparent); color: #16a34a; }
  .ann-warning .ann-icon { background: color-mix(in srgb, #f59e0b 16%, transparent); color: #b45309; }
  .ann-error .ann-icon   { background: color-mix(in srgb, #dc2626 14%, transparent); color: #dc2626; }

  .ann-body { flex: 1; min-width: 0; }
  .ann-head { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; }
  .ann-head h2 { font-size: 14.5px; font-weight: 700; margin: 0; }
  .new-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--danger, #ef4444); flex-shrink: 0; }
  .ann-level { margin-left: auto; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--text-subtle); }
  .ann-text { font-size: 13px; color: var(--text-muted); line-height: 1.55; white-space: pre-wrap; margin: 0 0 8px; }
  .ann-meta { font-size: 11.5px; color: var(--text-subtle); }
</style>
