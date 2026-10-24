<script lang="ts">
  import { imageSrcset } from '$lib/image-variants';
  import { venueTitle } from '$lib/page-title';
  import { onMount } from 'svelte';
  import { booking } from '$lib/analytics';
  import { reveal } from '$lib/reveal';
  import type { PageData } from './$types';
  import { migrateToMultiFloor } from '$lib/floorplan-types';
  import { roomOutlinePath, roomParts } from '$lib/floorplan-geometry';
  import type { FloorData } from '$lib/floorplan-types';
  import { t, getLocale } from '$lib/i18n.svelte';
  import { safeHref } from '$lib/safe-url';
  import { amenityLabel, amenityLabelMap } from '$lib/site/amenities';
  import { resolveOpeningHours } from '$lib/site/opening-hours';
  import Lightbox from '$lib/components/Lightbox.svelte';
  import MiniCalendar from '$lib/components/MiniCalendar.svelte';

  interface Props { data: PageData; }
  const { data }: Props = $props();

  onMount(() => booking.viewHall(data.hall.slug ?? data.hall.id, data.hall.name));

  const hall = data.hall;
  const user = data.user;
  const booked = data.booked;
  const amenities = (hall.amenities as string[]) ?? [];
  // Days the operator never edited follow the console's default (open 09:00–22:00)
  // instead of showing as '—' or closed.
  const openingHours = resolveOpeningHours(hall.opening_hours);
  // Only an http(s) website is linked: a javascript: one would run in this origin.
  const websiteHref = safeHref(hall.contact_website);
  const galleryImages = (hall.gallery_images as string[]) ?? [];
  // Visitors could not open a gallery photo here at all — the grid was the whole
  // feature. Now it opens full size and pages through like the signed-in page.
  let activeIndex = $state<number | null>(null);

  const bookHref = $derived(
    user
      ? `/halls/${hall.slug}/book`
      : `/login?redirect=${encodeURIComponent(`/halls/${hall.slug}/book`)}`
  );

  // Built-ins are translated; the venue's own amenities come with their own labels.
  const AMENITY_LABELS = $derived(amenityLabelMap({
    parking: t.hallProfile.amenityParking, catering: t.hallProfile.amenityCatering, av: t.hallProfile.amenityAv,
    wifi: t.hallProfile.amenityWifi, ac: t.hallProfile.amenityAc, accessible: t.hallProfile.amenityAccessible,
    outdoor: t.hallProfile.amenityOutdoor, stage: t.hallProfile.amenityStage, dancefloor: t.hallProfile.amenityDancefloor, bar: t.hallProfile.amenityBar,
  }, data.customAmenities, getLocale()));

  const hasContact = hall.contact_phone || hall.contact_email || websiteHref;

  function computeViewBox(floor: FloorData): string {
    if (floor.bounds) {
      const { x, y, w, h } = floor.bounds, p = 0.5;
      return `${(x-p)*10} ${(y-p)*10} ${(w+p*2)*10} ${(h+p*2)*10}`;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const ext = (x: number, y: number) => {
      if (x < minX) minX = x; if (y < minY) minY = y;
      if (x > maxX) maxX = x; if (y > maxY) maxY = y;
    };
    for (const w of floor.walls) for (const pt of w.points) ext(pt.x, pt.y);
    for (const z of floor.zones) for (const pt of z.points) ext(pt.x, pt.y);
    for (const s of floor.seats ?? []) { ext(s.x - 0.3, s.y - 0.3); ext(s.x + 0.3, s.y + 0.3); }
    for (const tbl of floor.tables) {
      const hw = (tbl.width ?? 2)/2, hh = (tbl.height ?? 1)/2;
      ext(tbl.x - hw, tbl.y - hh); ext(tbl.x + hw, tbl.y + hh);
    }
    if (!isFinite(minX)) return '0 0 100 70';
    const p = 0.5;
    return `${(minX-p)*10} ${(minY-p)*10} ${(maxX-minX+p*2)*10} ${(maxY-minY+p*2)*10}`;
  }
</script>

<svelte:head>
  <title>{venueTitle(data.domainOrg.name, hall.name)}</title>
  <meta name="description" content={hall.description ?? `${t.hallProfile.metaBookPrefix} ${hall.name} ${t.hallProfile.metaBookSuffix}`} />
</svelte:head>

<Lightbox
  images={galleryImages}
  index={activeIndex}
  alt={hall.name}
  onclose={() => (activeIndex = null)}
  onindex={(i) => (activeIndex = i)}
/>

<div class="pub-root">

  <!-- ─── Success banner ────────────────────────────────────────────────────── -->
  {#if booked}
    <div class="success-banner">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
      <div>
        <strong>{t.hallProfile.bookingSubmittedTitle}</strong>
        {t.hallProfile.bookingSubmittedMsg}
      </div>
    </div>
  {/if}

  <!-- ─── Hero ──────────────────────────────────────────────────────────────── -->
  <div class="hero" style="--hc:{hall.color}">
    {#if hall.cover_image_url}
      <img class="hero-img" src={hall.cover_image_url} srcset={imageSrcset(hall.cover_image_url)} sizes="100vw" alt={hall.name} />
      <div class="hero-overlay"></div>
    {:else}
      <div class="hero-placeholder" style="background:color-mix(in srgb, var(--hc) 15%, var(--bg-base))"></div>
    {/if}
    <div class="hero-content">
      <div class="hero-strip" style="background:{hall.color}"></div>
      <h1 class="hero-title">{hall.name}</h1>
      {#if hall.address}
        <p class="hero-loc">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          {hall.address}
        </p>
      {/if}
    </div>
  </div>

  <!-- ─── Body: hairline-divided sections, no panels ─────────────────────────── -->
  <div class="body">

    <!-- Overview -->
    <section class="section section--lead" use:reveal>
      <div class="kpis">
        <div class="kpi">
          <span class="kpi-val">{hall.max_people}</span>
          <span class="kpi-lbl">{t.hallProfile.maxGuests}</span>
        </div>
        <div class="kpi" class:kpi-open={hall.allow_reservations} class:kpi-closed={!hall.allow_reservations}>
          <span class="kpi-val status-dot-wrap">
            <span class="status-dot"></span>
            {hall.allow_reservations ? t.status.open : t.status.closed}
          </span>
          <span class="kpi-lbl">{t.hallProfile.reservations}</span>
        </div>
      </div>
      {#if hall.description}
        <p class="desc">{hall.description}</p>
      {/if}
    </section>

    <!-- Booking -->
    {#if hall.allow_reservations}
      <section class="section" use:reveal>
        <div class="section-head">
          <p class="eyebrow">{t.hallProfile.reservations}</p>
          <h2>{t.hallProfile.bookCta(hall.name)}</h2>
        </div>
        {#if user}
          <p class="cta-sub">{t.hallProfile.bookSubLoggedIn}</p>
          <a href={bookHref} class="cta-btn">{t.hallProfile.requestThisHall}</a>
        {:else}
          <p class="cta-sub">{t.hallProfile.bookSubSignIn}</p>
          <a href={bookHref} class="cta-btn">{t.hallProfile.signInToBook}</a>
        {/if}
      </section>

      {#if data.availability}
        <section class="section" use:reveal>
          <div class="section-head">
            <h2>{t.hallProfile.availabilityTitle}</h2>
            <p>{t.hallProfile.availabilityHint}</p>
          </div>
          <div class="avail-cal">
            <MiniCalendar
              takenDates={data.availability.taken}
              blockedDates={data.availability.unavailable}
              fullMonths={data.availability.fullMonths}
              minDate={data.availability.earliest}
              showLegend={true}
            />
          </div>
        </section>
      {/if}
    {:else}
      <section class="section" use:reveal>
        <div class="section-head">
          <p class="eyebrow">{t.hallProfile.reservations}</p>
          <h2>{t.hallProfile.reservationsClosed}</h2>
          <p>{t.hallProfile.reservationsClosedSub}</p>
        </div>
      </section>
    {/if}

    <!-- Amenities -->
    {#if amenities.length > 0}
      <section class="section" use:reveal>
        <div class="section-head">
          <h2>{t.hallProfile.amenities}</h2>
        </div>
        <div class="amenities-grid">
          {#each amenities as a}
            <div class="amenity-item">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              <span>{amenityLabel(a, AMENITY_LABELS)}</span>
            </div>
          {/each}
        </div>
      </section>
    {/if}

    <!-- Pricing -->
    {#if hall.pricing_info}
      <section class="section" use:reveal>
        <div class="section-head">
          <h2>{t.hallProfile.pricing}</h2>
        </div>
        <p class="pricing-text">{hall.pricing_info}</p>
      </section>
    {/if}

    <!-- Gallery -->
    {#if galleryImages.length > 0}
      <section class="section" use:reveal>
        <div class="section-head">
          <h2>{t.hallProfile.gallery}</h2>
        </div>
        <div class="gallery-grid">
          {#each galleryImages as url, i (url)}
            <button type="button" class="gallery-item" onclick={() => (activeIndex = i)} aria-label={hall.name}>
              <img src={url} srcset={imageSrcset(url)} sizes="(max-width: 420px) 100vw, (max-width: 600px) 50vw, 300px" alt="" loading="lazy" />
            </button>
          {/each}
        </div>
      </section>
    {/if}

    <!-- Floorplan preview -->
    {#if hall.floorplan_json}
      {@const mf = migrateToMultiFloor(hall.floorplan_json)}
      {@const f0 = mf.floors[0]}
      <section class="section" use:reveal>
        <div class="section-head">
          <h2>{t.hallProfile.floorplan}</h2>
        </div>
        <div class="fp-wrap">
          <svg viewBox={computeViewBox(f0)} preserveAspectRatio="xMidYMid meet">
            {#if f0.bounds}
              <path d={roomOutlinePath(roomParts(f0), 10)}
                fill="none" stroke="color-mix(in srgb, var(--editor-wall) 30%, transparent)" stroke-width="0.6" stroke-dasharray="3 2"/>
            {/if}
            {#each f0.zones as zone}
              {@const zx = zone.points.reduce((s,p)=>s+p.x,0)/zone.points.length}
              {@const zy = zone.points.reduce((s,p)=>s+p.y,0)/zone.points.length}
              <polygon points={zone.points.map(p => `${p.x*10},${p.y*10}`).join(' ')}
                fill={zone.color ?? 'var(--accent)'} fill-opacity="0.22" stroke={zone.color ?? 'var(--accent)'} stroke-width="0.4" stroke-opacity="0.6"/>
              {#if zone.label}
                <text x={zx*10} y={zy*10} text-anchor="middle" dominant-baseline="middle"
                  font-size="3.4" font-weight="650" fill={zone.color ?? 'var(--accent-ink)'}>{zone.label}</text>
              {/if}
            {/each}
            {#each f0.walls as wall}
              <polygon points={wall.points.map(p => `${p.x*10},${p.y*10}`).join(' ')} fill="var(--editor-wall)" opacity="0.9"/>
            {/each}
            {#each f0.tables as tbl}
              {#if tbl.shape === 'round'}
                <circle cx={tbl.x*10} cy={tbl.y*10} r={(tbl.radius??1)*10*0.8} fill="var(--warning)" opacity="0.75"/>
              {:else}
                <rect x={(tbl.x-(tbl.width??2)/2)*10} y={(tbl.y-(tbl.height??1)/2)*10}
                  width={(tbl.width??2)*10} height={(tbl.height??1)*10} rx="2" fill="var(--warning)" opacity="0.75"/>
              {/if}
            {/each}
            {#each f0.seats ?? [] as seat}
              <circle cx={seat.x*10} cy={seat.y*10} r="2.1" fill="var(--text-muted)" opacity="0.8"/>
            {/each}
          </svg>
        </div>
      </section>
    {/if}

    <!-- Contact -->
    {#if hasContact}
      <section class="section" use:reveal>
        <div class="section-head">
          <h2>{t.hallProfile.contact}</h2>
        </div>
        <div class="row-list">
          {#if hall.contact_phone}
            <a href="tel:{hall.contact_phone}" class="row-item contact-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13 19.79 19.79 0 0 1 1.61 4.4 2 2 0 0 1 3.6 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.16 6.16l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              {hall.contact_phone}
            </a>
          {/if}
          {#if hall.contact_email}
            <a href="mailto:{hall.contact_email}" class="row-item contact-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
              {hall.contact_email}
            </a>
          {/if}
          {#if websiteHref}
            <a href={websiteHref} target="_blank" rel="noopener noreferrer" class="row-item contact-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              {t.hallProfile.website}
            </a>
          {/if}
        </div>
      </section>
    {/if}

    <!-- Opening hours -->
    {#if openingHours}
      <section class="section" use:reveal>
        <div class="section-head">
          <h2>{t.hallProfile.openingHours}</h2>
        </div>
        <div class="row-list hours-list">
          {#each openingHours as { hours }, idx}
            <div class="row-item hours-row" class:hours-closed={!hours.open}>
              <span class="hours-day">{t.dayNamesFull[idx]}</span>
              <span class="hours-val">
                {#if hours.open}
                  {hours.from} – {hours.to}
                {:else}
                  {t.status.closed}
                {/if}
              </span>
            </div>
          {/each}
        </div>
      </section>
    {/if}

  </div>

</div>

<style>
  /* ── Success banner ── */
  .success-banner {
    display: flex; align-items: flex-start; gap: 12px;
    padding: 14px 32px; background: var(--success-dim);
    border-bottom: 1px solid color-mix(in srgb, var(--success) 25%, transparent);
    font-size: 13px; color: var(--text-base);
  }
  .success-banner svg { color: var(--success); flex-shrink: 0; margin-top: 2px; }
  .success-banner strong { color: var(--success); display: block; margin-bottom: 2px; font-weight: 600; }

  .pub-root {
    min-height: 40vh;
    background: var(--bg-base);
    animation: pubFade .2s ease both;
  }
  @keyframes pubFade { from { opacity: 0; } to { opacity: 1; } }

  /* ── Hero ── */
  .hero {
    position: relative; height: 300px; overflow: hidden;
  }
  .hero-img {
    width: 100%; height: 100%; object-fit: cover; display: block;
  }
  .hero-overlay {
    position: absolute; inset: 0;
    background: linear-gradient(to bottom, transparent 30%, rgba(0,0,0,.6) 100%);
  }
  .hero-placeholder { width: 100%; height: 100%; }
  .hero-content {
    position: absolute; bottom: 0; left: 0; right: 0;
    padding: 24px 32px;
  }
  .hero-strip {
    width: 40px; height: 4px; border-radius: 3px; margin-bottom: 12px;
  }
  /* White over the photo scrim, not over an --accent fill, so #fff is correct here. */
  .hero-title {
    font-size: var(--display-size); font-weight: 550; color: #fff;
    letter-spacing: -.055em; line-height: 1.08; margin: 0 0 8px;
    text-shadow: 0 2px 12px rgba(0,0,0,.3);
  }
  .hero-placeholder ~ .hero-content .hero-title { color: var(--text-base); text-shadow: none; }
  .hero-placeholder ~ .hero-content .hero-loc { color: var(--text-muted); }
  .hero-loc {
    display: flex; align-items: center; gap: 5px;
    font-size: 13px; color: rgba(255,255,255,.8); margin: 0;
  }

  /* ── Body measure. The vertical rhythm belongs to .section. ── */
  .body {
    max-width: 1100px; margin: 0 auto;
    padding: 0 32px 24px; box-sizing: border-box;
  }

  /* KPI pair — hairline-separated, not a boxed strip */
  .kpis { display: flex; margin-bottom: 18px; width: fit-content; }
  .kpi { display: flex; flex-direction: column; padding-right: 30px; }
  .kpi + .kpi { border-left: 1px solid var(--border-subtle); padding-left: 30px; }
  .kpi-val {
    font-size: 20px; font-weight: 650; color: var(--text-base);
    display: flex; align-items: center; gap: 6px;
  }
  /* Eyebrow metrics, but this caption sits under a value rather than over a
     section, so it keeps the muted ink instead of --accent-ink. */
  .kpi-lbl {
    font-size: 10px; font-weight: 650; text-transform: uppercase;
    letter-spacing: .13em; color: var(--text-subtle); margin-top: 4px;
  }
  .status-dot {
    width: 8px; height: 8px; border-radius: 50%; background: currentColor; display: inline-block;
  }
  .kpi-open  .kpi-val { color: var(--success); }
  .kpi-closed .kpi-val { color: var(--danger); }

  .desc { font-size: 14px; color: var(--text-muted); line-height: 1.8; margin: 0; max-width: 70ch; }

  /* ── Booking call to action ── */
  .cta-sub { font-size: 13px; color: var(--text-muted); margin: 0 0 18px; line-height: 1.7; max-width: 60ch; }
  /* The booking CTA is the primary action on this page, so it takes the hover lift
     and writes in --accent-contrast on the accent fill. */
  .cta-btn {
    display: inline-block; text-align: center; padding: 11px 24px; border-radius: var(--radius-sm);
    background: var(--accent); color: var(--accent-contrast); font-size: 13px; font-weight: 650;
    text-decoration: none; transition: transform .2s, background .2s;
  }
  .cta-btn:hover { background: var(--accent-hover); transform: translateY(-2px); text-decoration: none; }
  .cta-btn:active { transform: translateY(0); }

  .avail-cal { max-width: 360px; }

  /* Amenities — ticked lines, no chips */
  .amenities-grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px 20px;
  }
  .amenity-item {
    display: flex; align-items: center; gap: 9px;
    font-size: 13px; color: var(--text-base);
  }
  /* Tick icon over the page background, so it writes in --accent-ink. */
  .amenity-item svg { color: var(--accent-ink); flex-shrink: 0; }

  /* Pricing */
  .pricing-text { font-size: 14px; color: var(--text-muted); line-height: 1.8; margin: 0; white-space: pre-line; max-width: 70ch; }

  /* Gallery */
  .gallery-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
  .gallery-item {
    aspect-ratio: 4/3; border-radius: var(--radius); overflow: hidden;
    padding: 0; border: 0; background: var(--bg-hover); cursor: zoom-in; display: block;
  }
  .gallery-item:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .gallery-item img { width: 100%; height: 100%; object-fit: cover; transition: transform .5s; }
  .gallery-item:hover img { transform: scale(1.04); }

  /* Floorplan */
  .fp-wrap {
    background: var(--editor-canvas); border-radius: var(--radius-lg);
    overflow: hidden; height: 240px;
  }
  .fp-wrap svg { width: 100%; height: 100%; }

  /* Contact rows */
  .contact-item { font-size: 13px; color: var(--text-base); text-decoration: none; transition: color .1s; }
  .contact-item:hover { color: var(--accent-ink); }
  .contact-item svg { color: var(--text-subtle); flex-shrink: 0; }

  /* Hours rows */
  .hours-list { max-width: 420px; }
  .hours-row { justify-content: space-between; font-size: 13px; }
  .hours-day { color: var(--text-base); font-weight: 500; }
  .hours-val { color: var(--text-muted); }
  .hours-closed .hours-day, .hours-closed .hours-val { color: var(--text-subtle); }

  @media (prefers-reduced-motion: reduce) {
    .cta-btn:hover { transform: none; }
    .gallery-item:hover img { transform: none; }
  }

  @media (max-width: 768px) {
    .hero { height: 220px; }
    .hero-content { padding: 16px 20px; }
    .body { padding: 0 20px 16px; }
  }
</style>
