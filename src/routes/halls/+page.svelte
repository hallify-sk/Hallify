<script lang="ts">
  import { onMount } from 'svelte';
  import { booking } from '$lib/analytics';
  import { reveal } from '$lib/reveal';
  import type { PageData } from './$types';
  import { t } from '$lib/i18n.svelte';

  interface Props { data: PageData; }
  const { data }: Props = $props();

  onMount(() => booking.viewHallList((data.halls ?? []).length));

  function parseArr(v: unknown): string[] {
    if (!v) return [];
    if (Array.isArray(v)) return v as string[];
    if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } }
    return [];
  }

  const AMENITY_LABELS = $derived<Record<string, string>>({
    parking: t.hallDir.amenityParking, catering: t.hallDir.amenityCatering, av: t.hallDir.amenityAv,
    wifi: t.hallDir.amenityWifi, ac: t.hallDir.amenityAc, accessible: t.hallDir.amenityAccessible,
    outdoor: t.hallDir.amenityOutdoor, stage: t.hallDir.amenityStage, dancefloor: t.hallDir.amenityDancefloor, bar: t.hallDir.amenityBar,
  });

  let search = $state('');
  let minCap = $state(0);

  const filtered = $derived(
    data.halls.filter(h => {
      const q = search.toLowerCase();
      const matchName = !q
        || h.name.toLowerCase().includes(q)
        || (h.description ?? '').toLowerCase().includes(q)
        || (h.address ?? '').toLowerCase().includes(q);
      const matchCap = h.max_people >= minCap;
      return matchName && matchCap;
    })
  );
</script>

<svelte:head><title>{t.hallDir.browseHalls} – {data.domainOrg.name}</title></svelte:head>

<!-- ── Lead: the page heading, then its filters ── -->
<section class="section section--lead venue-hero" use:reveal>
  <div class="section-head">
    <!-- Lead with the BUSINESS, not with boilerplate. This is their own site on
         their own domain; a generic "Browse halls" headline is the main reason it
         read as a template rather than as theirs. Their own tagline and intro take
         precedence over our copy whenever they have written one. -->
    {#if data.domainOrg.logoUrl}
      <img class="venue-hero-logo" src={data.domainOrg.logoUrl} alt="" width="64" height="64" />
    {/if}
    <p class="eyebrow">{t.hallDir.browseHalls}</p>
    <h1>{data.domainOrg.name}</h1>
    <p class="venue-hero-lead">{data.site?.tagline || t.hallDir.heroSub}</p>
    {#if data.site?.intro}
      <p class="venue-hero-intro">{data.site.intro}</p>
    {/if}
  </div>

  <div class="filters">
    <div class="filter-search">
      <svg class="search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input class="filter-input" type="search" placeholder={t.hallDir.searchPlaceholder} bind:value={search} />
    </div>
    <div class="filter-cap">
      <label class="filter-cap-label" for="min-cap">{t.hallDir.minGuests}</label>
      <input class="filter-input filter-input-sm" id="min-cap" type="number" min="0" max="5000" step="10"
        bind:value={minCap} placeholder={t.hallDir.anyPlaceholder} />
    </div>
  </div>
</section>

<!-- ── The venues: photo-forward cards, no container ── -->
<section class="section" use:reveal>
  <div class="section-head">
    <p class="eyebrow">{t.nav.halls}</p>
    <h2>{t.hallDir.heroTitle}</h2>
    <p>{filtered.length} / {data.halls.length}</p>
  </div>

  {#if filtered.length === 0}
    <div class="card--inset empty">
      <span class="icon-tile" aria-hidden="true">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <line x1="3" y1="9" x2="21" y2="9"/>
          <line x1="9" y1="21" x2="9" y2="9"/>
        </svg>
      </span>
      <p>{data.halls.length === 0 ? t.hallDir.noHallsListed : t.hallDir.noHallsMatch}</p>
    </div>
  {:else}
    <div class="media-grid">
      {#each filtered as h}
        {@const amenities = parseArr(h.amenities)}
        <article class="media-card hall-card">
          <a class="media-photo" href="/halls/{h.slug}" aria-label={h.name}
            style={h.cover_image_url ? '' : `background:linear-gradient(135deg,${h.color}cc 0%,${h.color}44 100%)`}>
            {#if h.cover_image_url}
              <img src={h.cover_image_url} alt="" loading="lazy" />
            {/if}
          </a>
          {#if h.address}
            <div class="media-topline">
              <span class="hall-address">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                {h.address}
              </span>
            </div>
          {/if}
          <h3><a href="/halls/{h.slug}">{h.name}</a></h3>
          {#if h.description}
            <p class="hall-desc">{h.description}</p>
          {/if}
          <div class="media-bottom hall-meta">
            <span class="hall-cap">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
              {h.max_people} {t.hallDir.guests}
            </span>
            {#each amenities.slice(0, 3) as a}
              <span class="hall-chip">{AMENITY_LABELS[a] ?? a}</span>
            {/each}
            {#if amenities.length > 3}
              <span class="hall-chip hall-chip-more">+{amenities.length - 3}</span>
            {/if}
          </div>
        </article>
      {/each}
    </div>
  {/if}
</section>

<style>
  .venue-hero-logo {
    display: block; width: 64px; height: 64px; object-fit: contain;
    border-radius: var(--radius-sm); margin-bottom: 18px;
  }
  .venue-hero-lead { font-size: 15px; line-height: 1.75; max-width: 520px; }
  .venue-hero-intro {
    font-size: var(--body-size, 13px); line-height: 1.9; color: var(--text-muted);
    max-width: 560px; margin-top: 12px; white-space: pre-line;
  }

  /* The page title takes the density display scale, as every other page h1 does;
     app.css gives h1 its tracking but no size. */
  h1 { font-size: var(--display-size); margin: 0; }

  /* ── Filters ── */
  .filters { display: flex; gap: 12px; align-items: center; }
  .filter-search {
    flex: 1; display: flex; align-items: center; gap: 8px;
    border: 1px solid var(--border); border-radius: var(--radius-sm);
    background: var(--bg-panel2); padding: 0 13px;
    transition: border-color .15s, box-shadow .15s;
  }
  /* The input inside carries no border of its own, so the wrapper wears the ring. */
  .filter-search:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
  .search-icon { color: var(--text-subtle); flex-shrink: 0; }
  .filter-input {
    flex: 1; border: none; background: none; padding: 10px 0;
    font-size: 14px; color: var(--text-base); font-family: inherit; outline: none;
  }
  .filter-cap { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
  .filter-cap-label { font-size: 12px; color: var(--text-subtle); white-space: nowrap; }
  .filter-input-sm {
    width: 80px; padding: 9px 11px;
    border: 1px solid var(--border); border-radius: var(--radius-sm);
    background: var(--bg-panel2); font-size: 13px; color: var(--text-base);
    font-family: inherit; outline: none;
    transition: border-color .15s, box-shadow .15s;
  }
  .filter-input-sm:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }

  /* ── Hall card: .media-card supplies the composition; only the extras live here ── */
  .hall-card a { color: inherit; text-decoration: none; }
  .hall-card h3 a:hover { color: var(--accent-ink); text-decoration: none; }
  .hall-address { display: inline-flex; align-items: center; gap: 4px; min-width: 0; }
  .hall-address svg { flex-shrink: 0; }
  .hall-desc {
    font-size: 13px; color: var(--text-muted); margin: 0 0 14px; line-height: 1.5;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .hall-meta { flex-wrap: wrap; justify-content: flex-start; gap: 6px; }
  /* Accent tint behind, so the label writes in --accent-ink rather than the fill. */
  .hall-cap {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 12px; color: var(--accent-ink); font-weight: 600;
    padding: 3px 9px; border-radius: 3px;
    background: color-mix(in srgb, var(--accent) 8%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 20%, transparent);
  }
  .hall-chip {
    font-size: 10px; font-weight: 500; padding: 2px 8px; border-radius: 3px;
    background: var(--bg-panel2); border: 1px solid var(--border);
    color: var(--text-subtle);
  }
  .hall-chip-more { color: var(--text-muted); background: none; border-color: transparent; }

  /* ── Empty ── */
  .empty {
    text-align: center; color: var(--text-subtle);
    display: flex; flex-direction: column; align-items: center; gap: 14px;
  }
  .empty p { margin: 0; font-size: 14px; line-height: 1.75; }

  @media (max-width: 640px) {
    .filters { flex-direction: column; align-items: stretch; }
    .filter-cap { justify-content: space-between; }
    .filter-input-sm { flex: 1; }
  }
</style>
