<script lang="ts">
  import { onMount } from 'svelte';
  import { booking } from '$lib/analytics';
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

<div class="page">

  <!-- ── Hero ── -->
  <div class="hero">
    <h1 class="hero-title">{t.hallDir.heroTitle}</h1>
    <p class="hero-sub">{t.hallDir.heroSub}</p>
  </div>

  <!-- ── Filters ── -->
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

  <!-- ── Grid ── -->
  <div class="halls-grid">
    {#if filtered.length === 0}
      <div class="empty">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <line x1="3" y1="9" x2="21" y2="9"/>
          <line x1="9" y1="21" x2="9" y2="9"/>
        </svg>
        <p>{data.halls.length === 0 ? t.hallDir.noHallsListed : t.hallDir.noHallsMatch}</p>
      </div>
    {:else}
      {#each filtered as h}
        {@const amenities = parseArr(h.amenities)}
        <a href="/halls/{h.slug}" class="hall-card">
          <div class="hall-cover"
            style={h.cover_image_url
              ? `background-image:url('${h.cover_image_url}')`
              : `background:linear-gradient(135deg,${h.color}cc 0%,${h.color}44 100%)`}>
            <div class="cover-overlay">
              <h2 class="cover-name">{h.name}</h2>
              {#if h.address}
                <span class="cover-address">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  {h.address}
                </span>
              {/if}
            </div>
          </div>
          <div class="hall-body">
            {#if h.description}
              <p class="hall-desc">{h.description}</p>
            {/if}
            <div class="hall-meta">
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
          </div>
        </a>
      {/each}
    {/if}
  </div>

</div>

<style>
  .page {
    max-width: 1200px; margin: 0 auto;
    padding: 0 32px 60px; box-sizing: border-box;
  }

  /* ── Hero ── */
  .hero {
    padding: 52px 0 36px; text-align: center;
  }
  .hero-title {
    font-size: 34px; font-weight: 900; color: var(--text-base);
    letter-spacing: -.03em; margin: 0 0 10px;
  }
  .hero-sub {
    font-size: 15px; color: var(--text-muted); max-width: 420px;
    margin: 0 auto; line-height: 1.6;
  }

  /* ── Filters ── */
  .filters {
    display: flex; gap: 12px; align-items: center;
    margin-bottom: 28px; max-width: 800px; margin-left: auto; margin-right: auto;
  }
  .filter-search {
    flex: 1; display: flex; align-items: center; gap: 8px;
    border: 1px solid var(--border); border-radius: 9px;
    background: var(--bg-panel); padding: 0 12px;
  }
  .search-icon { color: var(--text-subtle); flex-shrink: 0; }
  .filter-input {
    flex: 1; border: none; background: none; padding: 10px 0;
    font-size: 14px; color: var(--text-base); font-family: inherit; outline: none;
  }
  .filter-cap { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
  .filter-cap-label { font-size: 12px; color: var(--text-subtle); white-space: nowrap; }
  .filter-input-sm {
    width: 80px; padding: 9px 10px;
    border: 1px solid var(--border); border-radius: 8px;
    background: var(--bg-panel); font-size: 13px; color: var(--text-base);
    font-family: inherit; outline: none;
  }
  .filter-input-sm:focus { border-color: var(--accent); }

  /* ── Grid ── */
  .halls-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 20px;
  }

  /* ── Hall card ── */
  .hall-card {
    background: var(--bg-panel); border: 1px solid var(--border); border-radius: 14px;
    overflow: hidden; text-decoration: none; color: var(--text-base);
    display: flex; flex-direction: column;
    transition: border-color .15s, transform .15s, box-shadow .15s;
  }
  .hall-card:hover {
    border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
    transform: translateY(-2px);
    box-shadow: 0 8px 32px rgba(0,0,0,.14);
  }

  .hall-cover {
    height: 180px;
    background-size: cover; background-position: center;
    position: relative; overflow: hidden;
  }
  .cover-overlay {
    position: absolute; inset: 0;
    background: linear-gradient(to top, rgba(0,0,0,.72) 0%, rgba(0,0,0,.05) 55%, transparent 100%);
    display: flex; flex-direction: column; justify-content: flex-end;
    padding: 14px 16px; gap: 4px;
  }
  .cover-name {
    font-size: 16px; font-weight: 700; color: #fff; margin: 0;
    letter-spacing: -.01em; text-shadow: 0 1px 4px rgba(0,0,0,.3);
  }
  .cover-address {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 11px; color: rgba(255,255,255,.7);
  }

  .hall-body {
    padding: 12px 16px 14px; flex: 1; display: flex; flex-direction: column; gap: 8px;
  }
  .hall-desc {
    font-size: 13px; color: var(--text-muted); margin: 0; line-height: 1.4;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .hall-meta {
    display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  }
  .hall-cap {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 12px; color: var(--accent); font-weight: 600;
    padding: 3px 9px; border-radius: 99px;
    background: color-mix(in srgb, var(--accent) 8%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 20%, transparent);
  }
  .hall-chip {
    font-size: 10px; font-weight: 500; padding: 2px 7px; border-radius: 99px;
    background: var(--bg-panel2, var(--bg-base)); border: 1px solid var(--border);
    color: var(--text-subtle);
  }
  .hall-chip-more { color: var(--text-muted); background: none; border-color: transparent; }

  /* ── Empty ── */
  .empty {
    grid-column: 1/-1; text-align: center;
    padding: 80px 40px; color: var(--text-subtle);
    display: flex; flex-direction: column; align-items: center; gap: 12px;
  }
  .empty p { margin: 0; font-size: 14px; }

  @media (max-width: 640px) {
    .page { padding: 0 18px 40px; }
    .hero { padding: 36px 0 24px; }
    .hero-title { font-size: 26px; }
    .filters { flex-direction: column; align-items: stretch; margin-bottom: 20px; }
    .filter-cap { justify-content: space-between; }
    .filter-input-sm { flex: 1; }
    .halls-grid { grid-template-columns: 1fr; }
  }
</style>
