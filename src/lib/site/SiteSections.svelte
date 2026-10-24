<script lang="ts">
  /**
   * Renders an organisation's public landing page from its ordered section list.
   *
   * Shared deliberately by the live bubble and by the settings preview, so the
   * preview cannot drift from the real page — a builder whose preview lies is
   * worse than no preview.
   *
   * Every section reads data Hallify already holds (venues, their contact details,
   * their amenities). Nothing here has a content store of its own, so an operator
   * never maintains the same fact twice and no section can go stale when a venue
   * is renamed.
   */
  import type { SectionType } from '$lib/site-sections';
  import { displayWebsite } from '$lib/site/display-url';
  import { amenityLabel } from '$lib/site/amenities';
  import { imageSrcset } from '$lib/image-variants';

  export interface SiteHall {
    id: string;
    name: string;
    slug: string | null;
    description: string | null;
    max_people: number;
    /** The hall's console colour: tints the card when there is no photo. */
    color?: string | null;
    cover_image_url: string | null;
    address: string | null;
    amenities: string[];
    contact_phone?: string | null;
    contact_email?: string | null;
    contact_website?: string | null;
  }

  interface Props {
    sections: SectionType[];
    org: { name: string; logoUrl: string | null };
    halls: SiteHall[];
    tagline: string;
    intro: string;
    amenityLabels: Record<string, string>;
    /** Translated chrome. Passed in so this component holds no copy of its own. */
    labels: {
      guests: string;
      viewVenue: string;
      allVenues: string;
      about: string;
      amenities: string;
      contact: string;
      ctaTitle: string;
      ctaBody: string;
      ctaButton: string;
      searchPlaceholder: string;
      minGuests: string;
      noMatches: string;
    };
    /** Preview renders inert: links must not navigate inside the iframe. */
    inert?: boolean;
  }

  const {
    sections, org, halls, tagline, intro, amenityLabels, labels, inert = false
  }: Props = $props();

  // The featured panel takes the first venue; the list shows the rest. When there
  // is no featured section the list shows everything, so a venue is never dropped
  // just because of how the page was arranged.
  const showsFeatured = $derived(sections.includes('featured'));
  const featured = $derived(halls[0] ?? null);
  const rest = $derived(showsFeatured ? halls.slice(1) : halls);

  let search = $state('');
  let minCap = $state(0);
  const filtered = $derived(
    rest.filter((h) => {
      const q = search.trim().toLowerCase();
      const matches =
        !q ||
        h.name.toLowerCase().includes(q) ||
        (h.address ?? '').toLowerCase().includes(q) ||
        (h.description ?? '').toLowerCase().includes(q);
      return matches && h.max_people >= minCap;
    })
  );

  /** Every distinct amenity across the venues, so the summary needs no extra input. */
  const allAmenities = $derived([...new Set(halls.flatMap((h) => h.amenities))]);

  const contact = $derived({
    phone: halls.find((h) => h.contact_phone)?.contact_phone ?? null,
    email: halls.find((h) => h.contact_email)?.contact_email ?? null,
    // Only an http(s) address is ever linked: a website saved as javascript: ran in
    // the venue's origin for anyone who clicked it. Shown shortened, so a long URL
    // cannot push the page wider than the screen.
    website: halls.map((h) => displayWebsite(h.contact_website)).find((w) => w !== null) ?? null,
    address: halls.find((h) => h.address)?.address ?? null
  });

  const href = (h: SiteHall) => (inert ? undefined : `/halls/${h.slug ?? h.id}`);
</script>

<!-- .site-wide widens the shell's column (SiteShell); the tighter section rhythm
     keeps the landing to a couple of screens rather than one long scroll. -->
<div class="sx-page site-wide">
{#each sections as section (section)}
  {#if section === 'featured' && featured}
    <!-- The opening panel: one venue, photograph across the full width. -->
    <section class="section section--lead sx-featured">
      <a class="sx-featured-media" href={href(featured)} aria-hidden={inert ? 'true' : undefined}>
        {#if featured.cover_image_url}
          <img src={featured.cover_image_url} srcset={imageSrcset(featured.cover_image_url)} sizes="100vw" alt={featured.name} loading="eager" />
        {:else}
          <span class="sx-noimg" aria-hidden="true"></span>
        {/if}
      </a>
      <div class="sx-featured-copy">
        {#if tagline}<p class="eyebrow">{tagline}</p>{/if}
        <h1>{featured.name}</h1>
        {#if featured.description}<p class="sx-lead">{featured.description}</p>{/if}
        <p class="sx-meta">
          <span class="sx-fact sx-fact--cap">{featured.max_people} {labels.guests}</span>
          {#if featured.address}<span class="sx-fact">{featured.address}</span>{/if}
          {#each featured.amenities.slice(0, 3) as a (a)}<span class="sx-fact">{amenityLabel(a, amenityLabels)}</span>{/each}
        </p>
        <a class="btn-action" href={href(featured)} tabindex={inert ? -1 : undefined}>{labels.viewVenue}</a>
      </div>
    </section>
  {/if}

  {#if section === 'search'}
    <section class="section sx-search">
      <div class="sx-filters">
        <input type="search" placeholder={labels.searchPlaceholder} aria-label={labels.searchPlaceholder} bind:value={search} disabled={inert} />
        <label>
          <span class="sr-only">{labels.minGuests}</span>
          <input type="number" min="0" step="10" bind:value={minCap} placeholder={labels.minGuests} disabled={inert} />
        </label>
      </div>
    </section>
  {/if}

  {#if section === 'hall-list' && rest.length > 0}
    <section class="section">
      <div class="section-head"><h2>{labels.allVenues}</h2></div>
      {#if filtered.length === 0}
        <p class="sx-empty">{labels.noMatches}</p>
      {:else}
        <!-- Wide cards, two to a row on a desktop: photo, facts and the way in. -->
        <div class="sx-list">
          {#each filtered as h (h.id)}
            <a class="sx-card sx-card--wide" href={href(h)} tabindex={inert ? -1 : undefined}>
              <span class="sx-card-media">
                {#if h.cover_image_url}<img src={h.cover_image_url} srcset={imageSrcset(h.cover_image_url)} sizes="(max-width: 600px) 100vw, 260px" alt="" loading="lazy" />{:else}<span class="sx-noimg sx-noimg--tint" style:--hc={h.color || null}></span>{/if}
              </span>
              <span class="sx-card-body">
                <strong class="sx-card-title">{h.name}</strong>
                {#if h.address}<span class="sx-card-sub">{h.address}</span>{/if}
                {#if h.description}<span class="sx-card-desc">{h.description}</span>{/if}
                <span class="sx-card-facts">
                  <span class="sx-fact sx-fact--cap">{h.max_people} {labels.guests}</span>
                  {#each h.amenities.slice(0, 2) as a (a)}<span class="sx-fact">{amenityLabel(a, amenityLabels)}</span>{/each}
                  {#if h.amenities.length > 2}<span class="sx-fact">+{h.amenities.length - 2}</span>{/if}
                </span>
                <span class="sx-card-cta">{labels.viewVenue} →</span>
              </span>
            </a>
          {/each}
        </div>
      {/if}
    </section>
  {/if}

  {#if section === 'hall-grid' && halls.length > 0}
    <section class="section">
      <div class="section-head"><h2>{labels.allVenues}</h2></div>
      <div class="sx-grid">
        {#each halls as h (h.id)}
          <a class="sx-card" href={href(h)} tabindex={inert ? -1 : undefined}>
            <span class="sx-card-media">
              {#if h.cover_image_url}<img src={h.cover_image_url} srcset={imageSrcset(h.cover_image_url)} sizes="(max-width: 600px) 100vw, 400px" alt="" loading="lazy" />{:else}<span class="sx-noimg sx-noimg--tint" style:--hc={h.color || null}></span>{/if}
              <span class="sx-badge">{h.max_people} {labels.guests}</span>
            </span>
            <span class="sx-card-body">
              <strong class="sx-card-title">{h.name}</strong>
              {#if h.address}<span class="sx-card-sub">{h.address}</span>{/if}
              {#if h.description}<span class="sx-card-desc">{h.description}</span>{/if}
              {#if h.amenities.length > 0}
                <span class="sx-card-facts">
                  {#each h.amenities.slice(0, 3) as a (a)}<span class="sx-fact">{amenityLabel(a, amenityLabels)}</span>{/each}
                  {#if h.amenities.length > 3}<span class="sx-fact">+{h.amenities.length - 3}</span>{/if}
                </span>
              {/if}
              <span class="sx-card-cta">{labels.viewVenue} →</span>
            </span>
          </a>
        {/each}
      </div>
    </section>
  {/if}

  {#if section === 'about' && intro}
    <section class="section sx-about">
      <div class="section-head"><h2>{labels.about}</h2></div>
      <p class="sx-prose">{intro}</p>
    </section>
  {/if}

  {#if section === 'amenities' && allAmenities.length > 0}
    <section class="section">
      <div class="section-head"><h2>{labels.amenities}</h2></div>
      <ul class="sx-amenities">
        {#each allAmenities as a (a)}<li>{amenityLabel(a, amenityLabels)}</li>{/each}
      </ul>
    </section>
  {/if}

  {#if section === 'contact' && (contact.phone || contact.email || contact.address || contact.website)}
    <section class="section">
      <div class="section-head"><h2>{labels.contact}</h2></div>
      <div class="row-list sx-contact">
        {#if contact.phone}<div class="row-item"><a href={inert ? undefined : `tel:${contact.phone}`}>{contact.phone}</a></div>{/if}
        {#if contact.email}<div class="row-item"><a href={inert ? undefined : `mailto:${contact.email}`}>{contact.email}</a></div>{/if}
        {#if contact.website}<div class="row-item"><a href={inert ? undefined : contact.website.href} target="_blank" rel="noopener noreferrer" title={contact.website.href}>{contact.website.label}</a></div>{/if}
        {#if contact.address}<div class="row-item muted">{contact.address}</div>{/if}
      </div>
    </section>
  {/if}

  {#if section === 'cta'}
    <section class="section card--inset sx-cta">
      <h2>{labels.ctaTitle}</h2>
      <p>{labels.ctaBody}</p>
      {#if featured}
        <a class="btn-action" href={href(featured)} tabindex={inert ? -1 : undefined}>{labels.ctaButton}</a>
      {/if}
    </section>
  {/if}
{/each}
</div>

<style>
  .sx-page { --section-pad: 44px; --head-gap: 20px; }
  .sx-page :global(.section-head h2) { font-size: clamp(22px, 2.2vw, 30px); }
  /* Featured: photo and copy side by side, stacking on a phone. */
  .sx-featured { display: grid; grid-template-columns: 1.1fr 1fr; gap: 42px; align-items: center; }
  .sx-featured-media { display: block; aspect-ratio: 4 / 3; overflow: hidden; border-radius: var(--radius-lg); background: var(--bg-hover); }
  .sx-featured-media img { width: 100%; height: 100%; object-fit: cover; transition: transform .5s; }
  .sx-featured-media:hover img { transform: scale(1.03); }
  @media (prefers-reduced-motion: reduce) {
    .sx-card:hover, .sx-card:hover .sx-card-media img, .sx-featured-media:hover img { transform: none; }
  }
  .sx-noimg { display: block; width: 100%; height: 100%; background: var(--bg-hover); }
  .sx-noimg--tint { background: linear-gradient(135deg, color-mix(in srgb, var(--hc, var(--accent)) 30%, var(--bg-hover)), var(--bg-hover) 75%); }
  .sx-featured-copy h1 { margin: 0 0 14px; }
  .sx-lead { font-size: 15px; line-height: 1.75; color: var(--text-muted); margin: 0 0 12px; }
  .sx-meta { font-size: var(--meta-size); color: var(--text-muted); margin: 0 0 22px; }

  .sx-filters { display: flex; gap: 12px; flex-wrap: wrap; }
  .sx-filters input[type='search'] { flex: 1; min-width: 200px; }
  .sx-filters input[type='number'] { width: 120px; }

  /* Venue cards: the list's wide cards and the grid's tall ones share one anatomy. */
  .sx-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 460px), 1fr)); gap: var(--grid-gap, 18px); }
  .sx-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr)); gap: var(--grid-gap, 18px); }
  .sx-card {
    display: flex; flex-direction: column; min-width: 0; color: inherit; text-decoration: none;
    background: var(--bg-panel); border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden;
    transition: transform .2s, box-shadow .2s, border-color .2s;
  }
  .sx-card:hover { text-decoration: none; transform: translateY(-2px); border-color: color-mix(in srgb, var(--accent) 35%, var(--border)); box-shadow: 0 14px 32px -18px rgba(0,0,0,.25); }
  .sx-card:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .sx-card--wide { flex-direction: row; }
  .sx-card-media { position: relative; display: block; aspect-ratio: 4 / 3; overflow: hidden; background: var(--bg-hover); flex-shrink: 0; }
  .sx-card--wide .sx-card-media { width: 40%; aspect-ratio: auto; min-height: 168px; }
  .sx-card-media img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform .5s; }
  .sx-card:hover .sx-card-media img { transform: scale(1.04); }
  .sx-badge { position: absolute; left: 10px; top: 10px; padding: 4px 9px; border-radius: 999px; background: var(--bg-panel); color: var(--text-base); font-size: 11px; font-weight: 650; box-shadow: 0 2px 8px rgba(0,0,0,.12); }
  .sx-card-body { display: flex; flex-direction: column; gap: 6px; padding: 16px 18px 18px; min-width: 0; flex: 1; }
  .sx-card-title { font-size: 16px; font-weight: 650; letter-spacing: -.02em; color: var(--text-base); font-family: var(--heading-font, inherit); }
  .sx-card-sub { font-size: 12px; color: var(--text-muted); }
  .sx-card-desc { font-size: 13px; line-height: 1.55; color: var(--text-muted); display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; overflow: hidden; }
  .sx-card-facts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
  .sx-fact { display: inline-flex; align-items: center; font-size: 11px; font-weight: 600; padding: 4px 9px; border-radius: 999px; background: var(--bg-hover); color: var(--text-muted); white-space: nowrap; }
  .sx-fact--cap { background: var(--accent-dim); color: var(--accent-ink); }
  .sx-card-cta { margin-top: auto; padding-top: 10px; font-size: 13px; font-weight: 650; color: var(--accent-ink); }
  .sx-meta { display: flex; flex-wrap: wrap; gap: 6px; }

  .sx-prose { font-size: var(--body-size); line-height: 1.9; color: var(--text-muted); max-width: 620px; white-space: pre-line; }
  .sx-amenities { display: flex; flex-wrap: wrap; gap: 8px; list-style: none; padding: 0; margin: 0; }
  .sx-amenities li { font-size: 11px; font-weight: 600; padding: 7px 13px; border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text-muted); }

  .sx-contact { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); column-gap: 24px; }
  .sx-contact .row-item { border-bottom: 1px solid var(--border-subtle); font-size: 14px; }
  .sx-contact a { color: var(--accent-ink); min-width: 0; overflow-wrap: anywhere; }
  .sx-cta { text-align: center; }
  .sx-cta p { color: var(--text-muted); margin: 8px 0 18px; }
  .sx-empty { color: var(--text-muted); font-size: var(--body-size); }

  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }

  @media (max-width: 820px) {
    .sx-featured { grid-template-columns: 1fr; gap: 24px; }
    /* Phones keep the list a list: a thumbnail beside the facts, not a stack of
       full-width photos. */
    .sx-card--wide .sx-card-media { width: 112px; min-height: 0; }
    .sx-card--wide .sx-card-body { padding: 12px 14px; gap: 4px; }
    .sx-card--wide .sx-card-desc { display: none; }
    .sx-card--wide .sx-card-cta { padding-top: 6px; }
  }
</style>
