<script lang="ts">
  import { t, getLocale } from '$lib/i18n.svelte';
  import { formatDateTime } from '$lib/format';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();

  const LEVELS = $derived<Record<string, { label: string; icon: string }>>({
    info:    { label: t.accountExtra.levelInfo,     icon: 'M12 16v-4M12 8h.01M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z' },
    success: { label: t.accountExtra.levelResolved, icon: 'M20 6L9 17l-5-5' },
    warning: { label: t.accountExtra.levelWarning,  icon: 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01' },
    error:   { label: t.accountExtra.levelMajor,    icon: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM15 9l-6 6M9 9l6 6' },
  });

  // Stored times are UTC without a zone; formatDateTime reads them as UTC and shows
  // them in the viewer's zone and language (they were 2 h off, in English).
  const fmtDate = (d: string) => formatDateTime(d, getLocale());
</script>

<svelte:head><title>{t.accountExtra.announcementsTitle} – Hallify</title></svelte:head>

<div class="wrap">
  <section class="section section--lead">
    <div class="section-head">
      <div class="page-header">
        <h1 class="page-title">{t.accountExtra.announcementsTitle}</h1>
        <span class="count">{data.announcements.length}</span>
      </div>
      <p>{t.accountExtra.announcementsSub}</p>
    </div>

    {#if data.announcements.length === 0}
      <div class="card card--inset empty">
        <div class="icon-tile">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 11l18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>
        </div>
        <p>{t.accountExtra.noAnnouncements}</p>
      </div>
    {:else}
      <div class="row-list">
        {#each data.announcements as a}
          {@const lvl = LEVELS[a.level] ?? LEVELS.info}
          <article class="row-item ann ann-{a.level}" class:unread={!a.read}>
            <div class="icon-tile ann-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d={lvl.icon}/></svg>
            </div>
            <div class="ann-body">
              <div class="ann-head">
                <h2>{a.title}</h2>
                {#if !a.read}<span class="new-dot" title={t.accountExtra.newBadge}></span>{/if}
                <span class="ann-level">{lvl.label}</span>
              </div>
              <p class="ann-text">{a.body}</p>
              <div class="ann-meta">{t.accountExtra.announcementSignature} · {fmtDate(a.created_at)}{#if a.updated_at}{' '}· {t.platformMisc.editedTag}{/if}</div>
            </div>
          </article>
        {/each}
      </div>
    {/if}
  </section>
</div>

<style>
  .page-header { display: flex; align-items: center; gap: 10px; }
  .page-title { font-size: var(--display-size); font-weight: 550; color: var(--text-base); letter-spacing: -.055em; line-height: 1.08; margin: 0; }
  .count { font-size: 12px; font-weight: 600; color: var(--text-muted); background: var(--bg-panel2); border: 1px solid var(--border); border-radius: 3px; padding: 2px 9px; }

  .empty { display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; color: var(--text-subtle); }
  .empty p { font-size: 14px; margin: 0; }

  .ann { align-items: flex-start; }
  .ann.unread { background: color-mix(in srgb, var(--accent) 4%, transparent); }

  .ann-success .ann-icon { background: var(--success-dim); color: var(--success); }
  .ann-warning .ann-icon { background: var(--warning-dim); color: var(--warning); }
  .ann-error .ann-icon   { background: var(--danger-dim); color: var(--danger); }

  .ann-body { flex: 1; min-width: 0; }
  .ann-head { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; }
  .ann-head h2 { font-size: 14.5px; font-weight: 650; letter-spacing: -.03em; margin: 0; }
  .new-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--danger); flex-shrink: 0; }
  .ann-level { margin-left: auto; font-size: 10px; font-weight: 650; text-transform: uppercase; letter-spacing: .13em; color: var(--text-subtle); }
  .ann-text { font-size: 13px; color: var(--text-muted); line-height: 1.55; white-space: pre-wrap; margin: 0 0 8px; }
  .ann-meta { font-size: 11.5px; color: var(--text-subtle); }
</style>
