<script lang="ts">
  import type { PageData } from './$types';
  import type { HallDayHours } from '$lib/db/index';
  import { migrateToMultiFloor } from '$lib/floorplan-types';
  import type { FloorData } from '$lib/floorplan-types';
  import { t } from '$lib/i18n.svelte';

  interface Props { data: PageData; }
  const { data }: Props = $props();

  const hall = data.hall;
  const user = data.user;
  const booked = data.booked;
  const amenities = (hall.amenities as string[]) ?? [];
  const openingHours = (hall.opening_hours as Record<string, HallDayHours>) ?? {};
  const galleryImages = (hall.gallery_images as string[]) ?? [];

  const bookHref = $derived(
    user
      ? `/halls/${hall.slug}/book`
      : `/login?redirect=${encodeURIComponent(`/halls/${hall.slug}/book`)}`
  );

  const AMENITY_LABELS: Record<string, () => string> = {
    parking: () => t.hallProfile.amenityParking, catering: () => t.hallProfile.amenityCatering, av: () => t.hallProfile.amenityAv,
    wifi: () => t.hallProfile.amenityWifi, ac: () => t.hallProfile.amenityAc, accessible: () => t.hallProfile.amenityAccessible,
    outdoor: () => t.hallProfile.amenityOutdoor, stage: () => t.hallProfile.amenityStage, dancefloor: () => t.hallProfile.amenityDancefloor, bar: () => t.hallProfile.amenityBar,
  };

  const DAYS = [
    { id: 'mon', idx: 0 },
    { id: 'tue', idx: 1 },
    { id: 'wed', idx: 2 },
    { id: 'thu', idx: 3 },
    { id: 'fri', idx: 4 },
    { id: 'sat', idx: 5 },
    { id: 'sun', idx: 6 },
  ];

  const hasHours = Object.keys(openingHours).length > 0;
  const hasContact = hall.contact_phone || hall.contact_email || hall.contact_website;

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
  <title>{hall.name} – {data.domainOrg.name}</title>
  <meta name="description" content={hall.description ?? `${t.hallProfile.metaBookPrefix} ${hall.name} ${t.hallProfile.metaBookSuffix}`} />
</svelte:head>

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
      <img class="hero-img" src={hall.cover_image_url} alt={hall.name} />
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

  <!-- ─── Body ──────────────────────────────────────────────────────────────── -->
  <div class="body-grid">

    <!-- Left: main content -->
    <div class="main-col">

      <!-- Overview -->
      <section class="section">
        <div class="section-kpis">
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

      <!-- Amenities -->
      {#if amenities.length > 0}
        <section class="section">
          <h2 class="section-title">{t.hallProfile.amenities}</h2>
          <div class="amenities-grid">
            {#each amenities as a}
              <div class="amenity-item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                <span>{AMENITY_LABELS[a]?.() ?? a}</span>
              </div>
            {/each}
          </div>
        </section>
      {/if}

      <!-- Pricing -->
      {#if hall.pricing_info}
        <section class="section">
          <h2 class="section-title">{t.hallProfile.pricing}</h2>
          <p class="pricing-text">{hall.pricing_info}</p>
        </section>
      {/if}

      <!-- Gallery -->
      {#if galleryImages.length > 0}
        <section class="section">
          <h2 class="section-title">{t.hallProfile.gallery}</h2>
          <div class="gallery-grid">
            {#each galleryImages as url}
              <div class="gallery-item">
                <img src={url} alt="" />
              </div>
            {/each}
          </div>
        </section>
      {/if}

      <!-- Floorplan preview -->
      {#if hall.floorplan_json}
        {@const mf = migrateToMultiFloor(hall.floorplan_json)}
        {@const f0 = mf.floors[0]}
        <section class="section">
          <h2 class="section-title">{t.hallProfile.floorplan}</h2>
          <div class="fp-wrap">
            <svg viewBox={computeViewBox(f0)} preserveAspectRatio="xMidYMid meet">
              {#if f0.bounds}
                <rect x={f0.bounds.x*10} y={f0.bounds.y*10} width={f0.bounds.w*10} height={f0.bounds.h*10}
                  fill="none" stroke="#cbd5e1" stroke-width="0.6" stroke-dasharray="3 2"/>
              {/if}
              {#each f0.zones as zone}
                {@const zx = zone.points.reduce((s,p)=>s+p.x,0)/zone.points.length}
                {@const zy = zone.points.reduce((s,p)=>s+p.y,0)/zone.points.length}
                <polygon points={zone.points.map(p => `${p.x*10},${p.y*10}`).join(' ')}
                  fill={zone.color ?? '#3b82f6'} fill-opacity="0.22" stroke={zone.color ?? '#3b82f6'} stroke-width="0.4" stroke-opacity="0.6"/>
                {#if zone.label}
                  <text x={zx*10} y={zy*10} text-anchor="middle" dominant-baseline="middle"
                    font-size="3.4" font-weight="700" fill={zone.color ?? '#3b82f6'}>{zone.label}</text>
                {/if}
              {/each}
              {#each f0.walls as wall}
                <polygon points={wall.points.map(p => `${p.x*10},${p.y*10}`).join(' ')} fill="#334155" opacity="0.9"/>
              {/each}
              {#each f0.tables as tbl}
                {#if tbl.shape === 'round'}
                  <circle cx={tbl.x*10} cy={tbl.y*10} r={(tbl.radius??1)*10*0.8} fill="#92400e" opacity="0.75"/>
                {:else}
                  <rect x={(tbl.x-(tbl.width??2)/2)*10} y={(tbl.y-(tbl.height??1)/2)*10}
                    width={(tbl.width??2)*10} height={(tbl.height??1)*10} rx="2" fill="#92400e" opacity="0.75"/>
                {/if}
              {/each}
              {#each f0.seats ?? [] as seat}
                <circle cx={seat.x*10} cy={seat.y*10} r="2.1" fill="#475569" opacity="0.8"/>
              {/each}
            </svg>
          </div>
        </section>
      {/if}

    </div>

    <!-- Right: sidebar -->
    <aside class="side-col">

      <!-- CTA card -->
      {#if hall.allow_reservations}
        <div class="cta-card" style="--hc:{hall.color}">
          <h3 class="cta-title">{t.hallProfile.bookCta} {hall.name}</h3>
          {#if user}
            <p class="cta-sub">{t.hallProfile.bookSubLoggedIn}</p>
            <a href={bookHref} class="cta-btn">{t.hallProfile.requestThisHall}</a>
          {:else}
            <p class="cta-sub">{t.hallProfile.bookSubSignIn}</p>
            <a href={bookHref} class="cta-btn">{t.hallProfile.signInToBook}</a>
          {/if}
        </div>
      {:else}
        <div class="cta-card cta-card-closed" style="--hc:#94a3b8">
          <h3 class="cta-title">{t.hallProfile.reservationsClosed}</h3>
          <p class="cta-sub">{t.hallProfile.reservationsClosedSub}</p>
        </div>
      {/if}

      <!-- Contact -->
      {#if hasContact}
        <div class="side-card">
          <h3 class="side-card-title">{t.hallProfile.contact}</h3>
          <div class="contact-list">
            {#if hall.contact_phone}
              <a href="tel:{hall.contact_phone}" class="contact-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13 19.79 19.79 0 0 1 1.61 4.4 2 2 0 0 1 3.6 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.16 6.16l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                {hall.contact_phone}
              </a>
            {/if}
            {#if hall.contact_email}
              <a href="mailto:{hall.contact_email}" class="contact-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                {hall.contact_email}
              </a>
            {/if}
            {#if hall.contact_website}
              <a href={hall.contact_website} target="_blank" rel="noopener" class="contact-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                {t.hallProfile.website}
              </a>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Opening hours -->
      {#if hasHours}
        <div class="side-card">
          <h3 class="side-card-title">{t.hallProfile.openingHours}</h3>
          <div class="hours-list">
            {#each DAYS as day}
              {@const dh = openingHours[day.id]}
              <div class="hours-row" class:hours-closed={dh && !dh.open}>
                <span class="hours-day">{t.dayNamesFull[day.idx]}</span>
                <span class="hours-val">
                  {#if !dh || dh.open === undefined}
                    —
                  {:else if dh.open}
                    {dh.from} – {dh.to}
                  {:else}
                    {t.status.closed}
                  {/if}
                </span>
              </div>
            {/each}
          </div>
        </div>
      {/if}

    </aside>

  </div>

</div>

<style>
  /* ── Success banner ── */
  .success-banner {
    display: flex; align-items: flex-start; gap: 12px;
    padding: 14px 32px; background: color-mix(in srgb, #22c55e 10%, transparent);
    border-bottom: 1px solid color-mix(in srgb, #22c55e 20%, transparent);
    font-size: 13px; color: var(--text-base);
  }
  .success-banner svg { color: #22c55e; flex-shrink: 0; margin-top: 2px; }
  .success-banner strong { color: #22c55e; display: block; margin-bottom: 2px; }

  .pub-root {
    min-height: 40vh;
    background: var(--bg-base, #0f1117);
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
    width: 40px; height: 4px; border-radius: 2px; margin-bottom: 10px;
  }
  .hero-title {
    font-size: 30px; font-weight: 900; color: #fff;
    letter-spacing: -.03em; margin: 0 0 6px;
    text-shadow: 0 2px 12px rgba(0,0,0,.3);
  }
  .hero-placeholder ~ .hero-content .hero-title { color: var(--text-base); text-shadow: none; }
  .hero-placeholder ~ .hero-content .hero-loc { color: var(--text-muted); }
  .hero-loc {
    display: flex; align-items: center; gap: 5px;
    font-size: 13px; color: rgba(255,255,255,.8); margin: 0;
  }

  /* ── Body layout ── */
  .body-grid {
    display: grid; grid-template-columns: 1fr 300px;
    gap: 28px; max-width: 1100px; margin: 0 auto;
    padding: 32px 32px 60px; box-sizing: border-box;
  }

  /* ── Section ── */
  .section {
    border-bottom: 1px solid var(--border); padding-bottom: 28px; margin-bottom: 28px;
  }
  .section:last-child { border-bottom: none; }
  .section-title {
    font-size: 14px; font-weight: 700; color: var(--text-base);
    letter-spacing: -.01em; margin: 0 0 14px;
  }

  /* KPI strip */
  .section-kpis {
    display: flex; gap: 0; border: 1px solid var(--border); border-radius: 10px;
    overflow: hidden; margin-bottom: 16px; width: fit-content;
  }
  .kpi {
    display: flex; flex-direction: column; align-items: center;
    padding: 12px 24px; background: var(--bg-panel);
  }
  .kpi + .kpi { border-left: 1px solid var(--border); }
  .kpi-val {
    font-size: 20px; font-weight: 800; color: var(--text-base);
    display: flex; align-items: center; gap: 6px;
  }
  .kpi-lbl {
    font-size: 10px; font-weight: 600; text-transform: uppercase;
    letter-spacing: .05em; color: var(--text-subtle); margin-top: 3px;
  }
  .status-dot {
    width: 8px; height: 8px; border-radius: 50%; background: currentColor; display: inline-block;
  }
  .kpi-open  .kpi-val { color: var(--success, #22c55e); }
  .kpi-closed .kpi-val { color: var(--danger, #ef4444); }

  .desc { font-size: 14px; color: var(--text-muted); line-height: 1.65; margin: 0; }

  /* Amenities */
  .amenities-grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px;
  }
  .amenity-item {
    display: flex; align-items: center; gap: 8px;
    font-size: 13px; color: var(--text-base); padding: 8px 10px;
    border-radius: 7px; background: var(--bg-panel); border: 1px solid var(--border);
  }
  .amenity-item svg { color: var(--accent); flex-shrink: 0; }

  /* Pricing */
  .pricing-text { font-size: 14px; color: var(--text-muted); line-height: 1.6; margin: 0; white-space: pre-line; }

  /* Gallery */
  .gallery-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; }
  .gallery-item { aspect-ratio: 4/3; border-radius: 8px; overflow: hidden; border: 1px solid var(--border); }
  .gallery-item img { width: 100%; height: 100%; object-fit: cover; }

  /* Floorplan */
  .fp-wrap {
    background: #f8f9fc; border: 1px solid var(--border); border-radius: 10px;
    overflow: hidden; height: 240px;
  }
  .fp-wrap svg { width: 100%; height: 100%; }

  /* ── Sidebar ── */
  .side-col { display: flex; flex-direction: column; gap: 16px; }

  /* CTA card */
  .cta-card {
    background: var(--bg-panel); border: 1px solid var(--border); border-radius: 14px;
    padding: 20px; border-left: 4px solid var(--hc, var(--accent));
    position: relative; overflow: hidden;
  }
  .cta-card::before {
    content: ''; position: absolute; inset: 0;
    background: linear-gradient(135deg, var(--hc, var(--accent)) 0%, transparent 50%);
    opacity: 0.05; pointer-events: none;
  }
  .cta-card-closed { border-left-color: var(--border); }
  .cta-card-closed::before { display: none; }
  .cta-title { font-size: 14px; font-weight: 700; color: var(--text-base); margin: 0 0 6px; }
  .cta-sub { font-size: 12px; color: var(--text-muted); margin: 0 0 16px; line-height: 1.4; }
  .cta-btn {
    display: block; text-align: center; padding: 10px 16px; border-radius: 8px;
    background: var(--accent); color: #fff; font-size: 13px; font-weight: 600;
    text-decoration: none; transition: opacity .12s;
  }
  .cta-btn:hover { opacity: .88; }

  /* Side card */
  .side-card {
    background: var(--bg-panel); border: 1px solid var(--border); border-radius: 12px;
    padding: 16px;
  }
  .side-card-title {
    font-size: 11px; font-weight: 700; text-transform: uppercase;
    letter-spacing: .06em; color: var(--text-subtle); margin: 0 0 12px;
  }

  /* Contact */
  .contact-list { display: flex; flex-direction: column; gap: 8px; }
  .contact-item {
    display: flex; align-items: center; gap: 9px;
    font-size: 13px; color: var(--text-base); text-decoration: none; transition: color .1s;
  }
  .contact-item:hover { color: var(--accent); }
  .contact-item svg { color: var(--text-subtle); flex-shrink: 0; }

  /* Hours */
  .hours-list { display: flex; flex-direction: column; gap: 5px; }
  .hours-row { display: flex; justify-content: space-between; font-size: 12px; padding: 3px 0; }
  .hours-day { color: var(--text-base); font-weight: 500; }
  .hours-val { color: var(--text-muted); }
  .hours-closed .hours-day, .hours-closed .hours-val { color: var(--text-subtle); }

  @media (max-width: 768px) {
    .hero { height: 220px; }
    .hero-title { font-size: 24px; }
    .hero-content { padding: 16px 20px; }
    .body-grid { grid-template-columns: 1fr; padding: 20px 20px 40px; }
    .side-col { order: -1; }
  }
</style>
