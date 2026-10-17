<script lang="ts">
  import { LEGAL_UPDATED, LEGAL_LABELS, LEGAL_PATHS, LEGAL_IS_DRAFT, type LegalDoc, type LegalKind } from '$lib/legal';
  import { getLocale, t } from '$lib/i18n.svelte';
  import { openConsentSettings } from '$lib/analytics';

  interface Props {
    doc: LegalDoc;
    /** Which document this is — the footer links to the other two. */
    kind: LegalKind;
  }
  const { doc, kind }: Props = $props();

  const L = $derived(LEGAL_LABELS[getLocale()]);
  const others = $derived(
    (['terms', 'privacy', 'dpa'] as LegalKind[])
      .filter((k) => k !== kind)
      .map((k) => ({ href: LEGAL_PATHS[k], label: L[k] }))
  );
</script>

<div class="legal">
  <header class="legal-head">
    <a href="/" class="brand">
      <img src="/Hallify.svg" alt="" class="brand-logo" />
      <span class="brand-name">Hallify</span>
    </a>
    <h1>{doc.title}</h1>
    <p class="subtitle">{doc.subtitle}</p>
    <p class="updated">{L.updated}: {LEGAL_UPDATED}</p>
    {#if LEGAL_IS_DRAFT}
      <p class="draft" role="note">{L.draftWarning}</p>
    {/if}
  </header>

  <article>
    {#each doc.sections as section (section.heading)}
      <section>
        <h2>{section.heading}</h2>
        {#each section.blocks as block}
          {#if block.p}
            <p>{block.p}</p>
          {/if}
          {#if block.list}
            <ul>
              {#each block.list as item}
                <li>{item}</li>
              {/each}
            </ul>
          {/if}
        {/each}
      </section>
    {/each}
  </article>

  <footer class="legal-foot">
    {#each others as other (other.href)}
      <a href={other.href}>{other.label}</a>
      <span class="sep">·</span>
    {/each}
    <a href="/">{L.backHome}</a>
    <span class="sep">·</span>
    <button type="button" class="consent-link" onclick={openConsentSettings}>{t.consent.settingsLink}</button>
  </footer>
</div>

<style>
  /* No private palette here any more: the document inherits the real theme tokens
     from app.css, so --accent / --accent-ink / --accent-contrast (and the org
     branding override that recomputes them) apply to legal pages too. */
  .legal {
    background: var(--bg-base);
    color: var(--text-base);
    min-height: 100vh;
    font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif;
    padding: 0 24px 96px;
  }

  .legal-head {
    max-width: 760px;
    margin: 0 auto;
    padding: 56px 0 40px;
    border-bottom: 1px solid var(--border);
  }

  .brand {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    text-decoration: none;
    color: var(--text-base);
    margin-bottom: 40px;
  }
  .brand:hover { text-decoration: none; }
  .brand-logo { width: 26px; height: 26px; }
  /* The wordmark — the one place Poppins 900 italic is allowed. */
  .brand-name {
    font-family: 'Poppins', 'Segoe UI', system-ui, -apple-system, sans-serif;
    font-weight: 900;
    font-style: italic;
    font-size: 1.05rem;
    letter-spacing: -0.05em;
  }

  h1 {
    font-size: clamp(1.9rem, 4vw, 2.6rem);
    line-height: 1.08;
    letter-spacing: -0.055em;
    margin: 0 0 12px;
    font-weight: 550;
  }

  .subtitle { color: var(--text-muted); font-size: 1.05rem; margin: 0 0 20px; line-height: 1.75; }
  .updated { color: var(--text-subtle); font-size: 0.85rem; margin: 0; }

  .draft {
    margin: 20px 0 0;
    padding: 10px 14px;
    border: 1px solid color-mix(in srgb, var(--warning) 35%, transparent);
    background: var(--warning-dim);
    color: var(--warning);
    border-radius: var(--radius);
    font-size: 0.85rem;
  }

  article { max-width: 760px; margin: 0 auto; }

  section { padding: 36px 0 0; }

  h2 {
    font-size: 1.15rem;
    font-weight: 550;
    letter-spacing: -0.045em;
    margin: 0 0 14px;
  }

  p {
    color: var(--text-muted);
    line-height: 1.8;
    margin: 0 0 14px;
    font-size: 0.95rem;
  }

  ul { margin: 0 0 14px; padding-left: 20px; }

  li {
    color: var(--text-muted);
    line-height: 1.8;
    margin-bottom: 7px;
    font-size: 0.95rem;
  }

  .legal-foot {
    max-width: 760px;
    margin: 64px auto 0;
    padding-top: 28px;
    border-top: 1px solid var(--border);
    font-size: 0.9rem;
  }

  .legal-foot a, .consent-link { color: var(--text-muted); text-decoration: none; }
  .consent-link { background: none; border: none; padding: 0; font: inherit; cursor: pointer; transition: color .15s; }
  .legal-foot a:hover, .consent-link:hover { color: var(--accent-ink); }
  .sep { color: var(--text-subtle); margin: 0 10px; }

  @media (max-width: 640px) {
    .legal-head { padding-top: 36px; }
    section { padding-top: 28px; }
  }
</style>
