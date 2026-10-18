<script lang="ts">
  import { enhance } from '$app/forms';
  import { t } from '$lib/i18n.svelte';
  import SetupServiceCard from '$lib/components/SetupServiceCard.svelte';
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

<div class="wrap page">
  <div class="page-head">
    <h1 class="page-title">{t.membersAdmin.helpTitle}</h1>
    <p class="page-sub">{t.membersAdmin.helpSub}</p>
  </div>

  <!-- The permanent door back into the walkthrough. The dashboard prompt only
       appears while it is unfinished and only for a month; this is here for
       good, so skipping it is never a one-way decision. -->
  <a class="rerun" href="/app/welcome?again=1">
    <span class="icon-tile">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
    </span>
    <span class="rerun-copy">
      <strong>{t.onboarding.rerunTitle}</strong>
      <span>{t.onboarding.rerunBody}</span>
    </span>
  </a>

  <!-- Onboarding checklist -->
  <section class="section section--lead">
    <div class="section-head section-head--row">
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

    <ul class="row-list cl-list">
      {#each data.checklist as item}
        <li class="row-item cl-item" class:done={item.done}>
          {#if item.auto}
            <!-- The app can see this is finished, so there is nothing to tick. -->
            <span class="cl-check" title={t.membersAdmin.stepDetected}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
            </span>
          {:else}
            <form method="POST" action="?/toggleStep" use:enhance class="cl-check-form">
              <input type="hidden" name="key" value={item.key} />
              <button
                type="submit"
                class="cl-check cl-check-btn"
                class:is-checked={item.manual}
                aria-pressed={item.manual}
                aria-label={item.manual ? t.membersAdmin.markNotDone : t.membersAdmin.markDone}
                title={item.manual ? t.membersAdmin.markNotDone : t.membersAdmin.markDone}
              >
                {#if item.manual}
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                {/if}
              </button>
            </form>
          {/if}
          <div class="cl-text">
            <span class="cl-label">{item.label}</span>
            <span class="cl-desc">{item.desc}</span>
          </div>
          {#if !item.done}
            <a href={item.href} class="cl-cta">{item.cta}</a>
          {:else if item.manual && !item.auto}
            <span class="cl-manual">{t.membersAdmin.markedDone}</span>
          {/if}
        </li>
      {/each}
    </ul>
  </section>

  <!-- Have us do it instead. Placed under the checklist on purpose: this is the
       page where somebody is looking at everything still to set up. -->
  <section class="section">
    <div class="section-head">
      <h2>{t.setupService.title}</h2>
      <p>{t.setupService.lead}</p>
    </div>

    <SetupServiceCard priceCents={data.setupPriceCents} pending={data.setupRequest} />
  </section>

  <!-- Knowledgebase -->
  <section class="section">
    <div class="section-head">
      <h2>{t.membersAdmin.knowledgebase}</h2>
    </div>
    {#each grouped as [category, articles]}
      <div class="kb-group">
        <span class="eyebrow kb-cat">{category}</span>
        <div class="row-list">
          {#each articles as a}
            <a href="/app/manage/help/{a.slug}" class="row-item kb-item">
              <span class="icon-tile" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>
              </span>
              <span class="kb-copy">
                <span class="kb-card-title">{a.title}</span>
                <span class="kb-card-summary">{a.summary}</span>
              </span>
              <span class="kb-card-arrow">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
              </span>
            </a>
          {/each}
        </div>
      </div>
    {/each}
  </section>
</div>

<style>
  .cl-check-form { display: flex; margin: 0; }
  .cl-check-btn { cursor: pointer; padding: 0; background: none; transition: border-color .15s, background .15s, color .15s; }
  .cl-check-btn:hover { border-color: var(--accent); color: var(--accent-ink); }
  .cl-manual { font-size: var(--meta-size); color: var(--text-subtle); white-space: nowrap; }

  .page { padding: 24px 0; }
  .page-head { margin-bottom: 4px; }
  .page-title { font-size: var(--display-size); font-weight: 550; letter-spacing: -.055em; margin: 0; }
  .page-sub { font-size: 13px; color: var(--text-muted); margin: 4px 0 20px; }

  /* Checklist */
  .cl-sub { font-size: 12px; color: var(--text-muted); }
  .cl-progress { display: flex; align-items: center; gap: 10px; min-width: 180px; }
  .cl-bar { flex: 1; height: 7px; border-radius: 99px; background: var(--bg-panel2, var(--bg-base)); overflow: hidden; }
  .cl-bar-fill { height: 100%; background: var(--accent); border-radius: 99px; transition: width .3s ease; }
  .cl-pct { font-size: 12px; font-weight: 650; color: var(--text-muted); min-width: 34px; text-align: right; }

  .cl-done-banner { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: var(--success); margin-bottom: 14px; }

  /* .row-list / .row-item carry the rules and the rhythm; only the marker,
     the text stack and the call to action are local. */
  .cl-list { list-style: none; }
  .cl-check {
    flex-shrink: 0; width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--border);
    display: flex; align-items: center; justify-content: center; color: var(--on-success);
  }
  .cl-item.done .cl-check { background: var(--success); border-color: var(--success); }
  .cl-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .cl-label { font-size: 13.5px; font-weight: 600; color: var(--text-base); }
  .cl-item.done .cl-label { color: var(--text-muted); text-decoration: line-through; }
  .cl-desc { font-size: 12px; color: var(--text-muted); }
  .cl-cta {
    flex-shrink: 0; font-size: 12.5px; font-weight: 600; color: var(--accent-ink); text-decoration: none;
    padding: 6px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); transition: border-color .15s;
  }
  .cl-cta:hover { border-color: var(--accent); }

  /* Knowledgebase index */
  .kb-group { margin-bottom: 22px; }
  .kb-group:last-child { margin-bottom: 0; }
  .kb-cat { display: block; color: var(--text-muted); margin-bottom: 6px; }
  .kb-item { text-decoration: none; }
  .kb-item:hover { text-decoration: none; }
  .kb-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .kb-card-title { font-size: 13.5px; font-weight: 600; letter-spacing: -.03em; color: var(--text-base); }
  .kb-card-summary { font-size: 12px; color: var(--text-muted); line-height: 1.45; }
  .kb-card-arrow { flex-shrink: 0; display: flex; color: var(--text-muted); }
  .kb-item:hover .kb-card-arrow { color: var(--accent-ink); }
  /* ── Re-run the walkthrough ────────────────── */
  .rerun {
    display: flex; align-items: center; gap: 13px;
    padding: 13px 16px; margin-bottom: 20px;
    border: 1px solid var(--border); border-radius: var(--radius);
    background: var(--bg-panel); text-decoration: none; color: inherit;
    transition: border-color .15s, background .15s;
  }
  .rerun:hover { border-color: var(--accent); background: var(--accent-dim); text-decoration: none; }
  .rerun-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .rerun-copy strong { font-size: 13.5px; font-weight: 600; }
  .rerun-copy span { font-size: var(--meta-size); color: var(--text-muted); line-height: 1.6; }
</style>
