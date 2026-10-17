<script lang="ts">
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>{data.article.title} – Help – Hallify</title></svelte:head>

<div class="wrap page">
  <a href="/app/manage/help" class="back">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
    Help
  </a>

  <section class="section section--lead article">
    <div class="section-head">
      <span class="eyebrow cat">{data.article.category}</span>
      <h1>{data.article.title}</h1>
    </div>
    <!-- Trusted, code-authored content. -->
    <div class="body">{@html data.article.body}</div>
  </section>

  {#if data.related.length}
    <section class="section related">
      <div class="section-head">
        <span class="eyebrow related-label">More in {data.article.category}</span>
      </div>
      <div class="row-list">
        {#each data.related as r}
          <a href="/app/manage/help/{r.slug}" class="row-item related-link">{r.title}</a>
        {/each}
      </div>
    </section>
  {/if}
</div>

<style>
  .page { padding: 24px 0; max-width: 760px; }
  .back { display: inline-flex; align-items: center; gap: 5px; font-size: 13px; font-weight: 600; color: var(--text-muted); text-decoration: none; margin-bottom: 16px; }
  .back:hover { color: var(--accent-ink); }

  .cat { display: block; color: var(--text-muted); }
  .article h1 { font-size: var(--display-size); font-weight: 550; letter-spacing: -.055em; margin: 6px 0 0; }

  .body { font-size: 14px; line-height: 1.75; color: var(--text-muted); }
  .body :global(h3) { font-size: 15px; font-weight: 600; letter-spacing: -.03em; color: var(--text-base); margin: 22px 0 8px; }
  .body :global(p) { margin: 0 0 12px; }
  .body :global(ul), .body :global(ol) { margin: 0 0 12px; padding-left: 22px; display: flex; flex-direction: column; gap: 6px; }
  .body :global(li) { line-height: 1.55; }
  .body :global(strong) { color: var(--text-base); font-weight: 650; }
  .body :global(em) { color: var(--text-base); }

  .related-label { display: block; color: var(--text-muted); }
  .related-link { font-size: 13.5px; font-weight: 600; color: var(--accent-ink); text-decoration: none; }
  .related-link:hover { text-decoration: underline; }
</style>
