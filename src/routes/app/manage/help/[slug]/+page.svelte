<script lang="ts">
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>{data.article.title} – Help – Hallify</title></svelte:head>

<div class="page">
  <a href="/app/manage/help" class="back">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
    Help
  </a>

  <article class="article">
    <span class="cat">{data.article.category}</span>
    <h1>{data.article.title}</h1>
    <!-- Trusted, code-authored content. -->
    <div class="body">{@html data.article.body}</div>
  </article>

  {#if data.related.length}
    <div class="related">
      <span class="related-label">More in {data.article.category}</span>
      {#each data.related as r}
        <a href="/app/manage/help/{r.slug}" class="related-link">{r.title}</a>
      {/each}
    </div>
  {/if}
</div>

<style>
  .page { padding: 24px 28px; max-width: 760px; }
  .back { display: inline-flex; align-items: center; gap: 5px; font-size: 13px; font-weight: 600; color: var(--text-muted); text-decoration: none; margin-bottom: 16px; }
  .back:hover { color: var(--accent); }

  .article { background: var(--bg-panel); border: 1px solid var(--border); border-radius: 14px; padding: 28px 30px; }
  .cat { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--accent); }
  .article h1 { font-size: 22px; font-weight: 800; letter-spacing: -.02em; margin: 6px 0 18px; }

  .body { font-size: 14px; line-height: 1.65; color: var(--text-muted); }
  .body :global(h3) { font-size: 15px; font-weight: 700; color: var(--text-base); margin: 22px 0 8px; }
  .body :global(p) { margin: 0 0 12px; }
  .body :global(ul), .body :global(ol) { margin: 0 0 12px; padding-left: 22px; display: flex; flex-direction: column; gap: 6px; }
  .body :global(li) { line-height: 1.55; }
  .body :global(strong) { color: var(--text-base); font-weight: 700; }
  .body :global(em) { color: var(--text-base); }

  .related { margin-top: 22px; display: flex; flex-direction: column; gap: 6px; }
  .related-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--text-subtle); margin-bottom: 4px; }
  .related-link { font-size: 13.5px; font-weight: 600; color: var(--accent); text-decoration: none; }
  .related-link:hover { text-decoration: underline; }
</style>
