<script lang="ts">
  import { t } from '$lib/i18n.svelte';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();

  const pct = $derived(Math.round((data.completed / data.total) * 100));

  // Group articles by category, preserving first-seen order.
  const grouped = $derived.by(() => {
    const map = new Map<string, typeof data.articles>();
    for (const a of data.articles) {
      if (!map.has(a.category)) map.set(a.category, []);
      map.get(a.category)!.push(a);
    }
    return [...map.entries()];
  });
</script>

<svelte:head><title>{t.membersAdmin.helpTitle} – Hallify</title></svelte:head>

<div class="page">
  <div class="page-header">
    <h1 class="page-title">{t.membersAdmin.helpTitle}</h1>
  </div>
  <p class="page-sub">{t.membersAdmin.helpSub}</p>

  <!-- Onboarding checklist -->
  <section class="card checklist-card">
    <div class="cl-head">
      <div>
        <h2>{t.membersAdmin.setupChecklist}</h2>
        <span class="cl-sub">{data.completed} {t.membersAdmin.progressOf} {data.total} {t.membersAdmin.progressDone}</span>
      </div>
      <div class="cl-progress">
        <div class="cl-bar"><div class="cl-bar-fill" style="width:{pct}%"></div></div>
        <span class="cl-pct">{pct}%</span>
      </div>
    </div>

    {#if data.completed === data.total}
      <div class="cl-done-banner">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        {t.membersAdmin.allSetUp}
      </div>
    {/if}

    <ul class="cl-list">
      {#each data.checklist as item}
        <li class="cl-item" class:done={item.done}>
          <span class="cl-check">
            {#if item.done}
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
            {/if}
          </span>
          <div class="cl-text">
            <span class="cl-label">{item.label}</span>
            <span class="cl-desc">{item.desc}</span>
          </div>
          {#if !item.done}
            <a href={item.href} class="cl-cta">{item.cta}</a>
          {/if}
        </li>
      {/each}
    </ul>
  </section>

  <!-- Knowledgebase -->
  <h2 class="kb-title">{t.membersAdmin.knowledgebase}</h2>
  {#each grouped as [category, articles]}
    <div class="kb-group">
      <span class="kb-cat">{category}</span>
      <div class="kb-grid">
        {#each articles as a}
          <a href="/app/manage/help/{a.slug}" class="kb-card">
            <span class="kb-card-title">{a.title}</span>
            <span class="kb-card-summary">{a.summary}</span>
            <span class="kb-card-arrow">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
            </span>
          </a>
        {/each}
      </div>
    </div>
  {/each}
</div>

<style>
  .page { padding: 24px 28px; }
  .page-title { font-size: 18px; font-weight: 800; letter-spacing: -.025em; margin: 0; }
  .page-sub { font-size: 13px; color: var(--text-muted); margin: 4px 0 20px; }

  .card { background: var(--bg-panel); border: 1px solid var(--border); border-radius: 14px; padding: 20px 22px; }
  .checklist-card { margin-bottom: 28px; }
  .cl-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
  .cl-head h2 { font-size: 15px; font-weight: 700; margin: 0; }
  .cl-sub { font-size: 12px; color: var(--text-muted); }
  .cl-progress { display: flex; align-items: center; gap: 10px; min-width: 180px; }
  .cl-bar { flex: 1; height: 7px; border-radius: 99px; background: var(--bg-panel2, var(--bg-base)); overflow: hidden; }
  .cl-bar-fill { height: 100%; background: var(--accent); border-radius: 99px; transition: width .3s ease; }
  .cl-pct { font-size: 12px; font-weight: 700; color: var(--text-muted); min-width: 34px; text-align: right; }

  .cl-done-banner { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: var(--success, #16a34a); margin-bottom: 14px; }

  .cl-list { list-style: none; display: flex; flex-direction: column; gap: 2px; }
  .cl-item { display: flex; align-items: center; gap: 12px; padding: 11px 0; border-bottom: 1px solid var(--border-subtle, var(--border)); }
  .cl-item:last-child { border-bottom: none; }
  .cl-check {
    flex-shrink: 0; width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--border);
    display: flex; align-items: center; justify-content: center; color: #fff;
  }
  .cl-item.done .cl-check { background: var(--success, #16a34a); border-color: var(--success, #16a34a); }
  .cl-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .cl-label { font-size: 13.5px; font-weight: 600; color: var(--text-base); }
  .cl-item.done .cl-label { color: var(--text-muted); text-decoration: line-through; }
  .cl-desc { font-size: 12px; color: var(--text-muted); }
  .cl-cta {
    flex-shrink: 0; font-size: 12.5px; font-weight: 600; color: var(--accent); text-decoration: none;
    padding: 6px 12px; border: 1px solid var(--border); border-radius: 8px; transition: border-color .12s;
  }
  .cl-cta:hover { border-color: var(--accent); }

  .kb-title { font-size: 16px; font-weight: 800; margin: 0 0 14px; }
  .kb-group { margin-bottom: 22px; }
  .kb-cat { display: block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--text-subtle); margin-bottom: 10px; }
  .kb-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
  .kb-card {
    position: relative; display: flex; flex-direction: column; gap: 5px; padding: 15px 38px 15px 16px;
    background: var(--bg-panel); border: 1px solid var(--border); border-radius: 12px; text-decoration: none;
    transition: border-color .12s, transform .12s;
  }
  .kb-card:hover { border-color: var(--accent); transform: translateY(-1px); }
  .kb-card-title { font-size: 13.5px; font-weight: 700; color: var(--text-base); }
  .kb-card-summary { font-size: 12px; color: var(--text-muted); line-height: 1.45; }
  .kb-card-arrow { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); color: var(--text-subtle); }
  .kb-card:hover .kb-card-arrow { color: var(--accent); }
</style>
