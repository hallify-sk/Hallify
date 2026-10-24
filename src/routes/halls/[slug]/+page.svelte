<script lang="ts">
  /**
   * A hall on the venue's own site: what it is, and a way to book it.
   *
   * Two columns on a desktop — the hall on the left, a sticky booking card on the
   * right — so the whole page reads in about two screens instead of one long
   * column of full-width sections. Secondary facts (floor plan, prices, hours,
   * terms) share one tabbed panel; long text folds behind "show more".
   *
   * The booking itself still happens on /book, with the same form and action: the
   * card here only lets the visitor pick a free day and a guest count first, and
   * hands both to the form as query parameters.
   */
  import { imageSrcset } from '$lib/image-variants';
  import { venueTitle } from '$lib/page-title';
  import { onMount, tick } from 'svelte';
  import { booking } from '$lib/analytics';
  import { trackListingClick, trackListingView } from '$lib/listing-tracker';
  import { externalContact, mailHref, takesHallifyBookings, telHref } from '$lib/listings';
  import type { PageData } from './$types';
  import { migrateToMultiFloor } from '$lib/floorplan-types';
  import { roomOutlinePath, roomParts } from '$lib/floorplan-geometry';
  import type { FloorData } from '$lib/floorplan-types';
  import { t, getLocale } from '$lib/i18n.svelte';
  import { formatDate } from '$lib/format';
  import { safeHref } from '$lib/safe-url';
  import { amenityLabel, amenityLabelMap } from '$lib/site/amenities';
  import { resolveOpeningHours } from '$lib/site/opening-hours';
  import { SITE_TEMPLATES } from '$lib/site-templates';
  import Lightbox from '$lib/components/Lightbox.svelte';
  import PhotoCredit from '$lib/components/PhotoCredit.svelte';
  import MiniCalendar from '$lib/components/MiniCalendar.svelte';
  import VenueMap from '$lib/marketing/VenueMap.svelte';

  interface Props { data: PageData; }
  const { data }: Props = $props();

  onMount(() => {
    booking.viewHall(data.hall.slug ?? data.hall.id, data.hall.name);
    trackListingView(data.listingRef);
  });

  const hall = data.hall;
  const user = data.user;
  const booked = data.booked;
  const amenities = (hall.amenities as string[]) ?? [];
  // Days the operator never edited follow the console's default (open 09:00–22:00)
  // instead of showing as '—' or closed.
  const openingHours = resolveOpeningHours(hall.opening_hours);
  // Only an http(s) website is linked: a javascript: one would run in this origin.
  const websiteHref = safeHref(hall.contact_website);
  // Booked through Hallify's form, or directly with the venue (its website, phone and
  // e-mail take the booking card's place).
  const bookable = takesHallifyBookings(hall);
  const external = hall.booking_mode === 'external';
  const direct = externalContact(hall);
  const galleryImages = (hall.gallery_images as string[]) ?? [];
  // The cover leads the gallery; a cover that is also in the gallery is shown once.
  const photos = [...new Set([hall.cover_image_url, ...galleryImages].filter((u): u is string => !!u))];
  let activeIndex = $state<number | null>(null);

  // Built-ins are translated; the venue's own amenities come with their own labels.
  const AMENITY_LABELS = $derived(amenityLabelMap({
    parking: t.hallProfile.amenityParking, catering: t.hallProfile.amenityCatering, av: t.hallProfile.amenityAv,
    wifi: t.hallProfile.amenityWifi, ac: t.hallProfile.amenityAc, accessible: t.hallProfile.amenityAccessible,
    outdoor: t.hallProfile.amenityOutdoor, stage: t.hallProfile.amenityStage, dancefloor: t.hallProfile.amenityDancefloor, bar: t.hallProfile.amenityBar,
  }, data.customAmenities, getLocale()));
  const AMENITY_PREVIEW = 9;
  let amenitiesOpen = $state(false);
  const shownAmenities = $derived(amenitiesOpen ? amenities : amenities.slice(0, AMENITY_PREVIEW));

  const hasContact = !!(hall.contact_phone || hall.contact_email || websiteHref);
  const hasCoords = Number.isFinite(hall.latitude) && Number.isFinite(hall.longitude) && hall.latitude != null && hall.longitude != null;
  const mapPoints = hasCoords
    ? [{ id: hall.id, name: hall.name, latitude: hall.latitude!, longitude: hall.longitude!, label: hall.name }]
    : [];
  const mapsHref = hasCoords
    ? `https://www.google.com/maps/search/?api=1&query=${hall.latitude},${hall.longitude}`
    : hall.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(hall.address)}` : null;
  // The map follows the template: tiles and controls go dark on a dark site.
  const darkSite = $derived.by(() => {
    const bg = SITE_TEMPLATES.find((tpl) => tpl.id === data.site.template)?.tokens.bg ?? '#ffffff';
    const n = parseInt(bg.slice(1), 16);
    return (((n >> 16) & 255) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 < 128;
  });

  // ── Description: folded to a few lines, opened on request ──
  let descEl = $state<HTMLParagraphElement | null>(null);
  let descOpen = $state(false);
  let descFolds = $state(false);
  onMount(() => {
    const measure = () => { if (descEl && !descOpen) descFolds = descEl.scrollHeight > descEl.clientHeight + 2; };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  });

  // ── Secondary facts share one tabbed panel instead of a section each ──
  type TabId = 'floorplan' | 'pricing' | 'hours' | 'terms';
  const tabs = $derived(([
    hall.floorplan_json ? { id: 'floorplan', label: t.hallProfile.floorplan } : null,
    hall.pricing_info ? { id: 'pricing', label: t.hallProfile.pricing } : null,
    openingHours ? { id: 'hours', label: t.hallProfile.openingHours } : null,
    bookable ? { id: 'terms', label: t.hallProfile.termsTab } : null,
  ] as ({ id: TabId; label: string } | null)[]).filter((x): x is { id: TabId; label: string } => !!x));
  let activeTab = $state<TabId | null>(null);
  const currentTab = $derived(tabs.find((x) => x.id === activeTab)?.id ?? tabs[0]?.id ?? null);
  function tabKey(e: KeyboardEvent, i: number) {
    const by = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!by) return;
    e.preventDefault();
    const next = tabs[(i + by + tabs.length) % tabs.length];
    activeTab = next.id;
    tick().then(() => document.getElementById(`hp-tab-${next.id}`)?.focus());
  }

  // ── Booking card: a day and a guest count, carried into the booking form ──
  let pickedDate = $state('');
  let guests = $state('');
  const overCapacity = $derived(!!guests && Number(guests) > hall.max_people);
  const bookPath = $derived.by(() => {
    const q = new URLSearchParams();
    if (pickedDate) q.set('date', pickedDate);
    if (guests && !overCapacity && Number(guests) > 0) q.set('guests', String(Math.floor(Number(guests))));
    const qs = q.toString();
    return `/halls/${hall.slug}/book${qs ? `?${qs}` : ''}`;
  });
  const bookHref = $derived(user ? bookPath : `/login?redirect=${encodeURIComponent(bookPath)}`);

  // On a phone the card sits below the content and a bar at the bottom of the
  // screen leads to it. The bar steps aside while the card itself is on screen.
  let cardEl = $state<HTMLElement | null>(null);
  let cardInView = $state(false);
  onMount(() => {
    if (!cardEl || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => (cardInView = e.isIntersecting), { threshold: 0.15 });
    io.observe(cardEl);
    return () => io.disconnect();
  });
  function toCard(e: MouseEvent) {
    e.preventDefault();
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    cardEl?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  }

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
  images={photos}
  index={activeIndex}
  alt={hall.name}
  onclose={() => (activeIndex = null)}
  onindex={(i) => (activeIndex = i)}
/>

<div class="hp site-wide" class:hp--bar={bookable}>

  {#if booked}
    <div class="hp-success" role="status">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
      <div>
        <strong>{t.hallProfile.bookingSubmittedTitle}</strong>
        {t.hallProfile.bookingSubmittedMsg}
      </div>
    </div>
  {/if}

  <!-- ─── Title ─────────────────────────────────────────────────────────────── -->
  <header class="hp-head">
    <p class="eyebrow">{data.domainOrg.name}</p>
    <h1>{hall.name}</h1>
    <p class="hp-sub">
      <span class="hp-sub-item">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        {t.hallProfile.upToGuests(hall.max_people)}
      </span>
      {#if hall.address}
        <span class="hp-sub-item">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          {hall.address}
        </span>
      {/if}
    </p>
  </header>

  <!-- ─── Gallery: the cover large, up to four more beside it ──────────────── -->
  {#if photos.length > 0}
    <div class="hp-gallery" data-count={Math.min(photos.length, 5)}>
      {#each photos.slice(0, 5) as url, i (url)}
        <button type="button" class="hp-photo" onclick={() => (activeIndex = i)} aria-label={`${hall.name} ${i + 1}/${photos.length}`}>
          <img
            src={url}
            srcset={imageSrcset(url)}
            sizes={i === 0 ? '(max-width: 760px) 100vw, 760px' : '(max-width: 760px) 100vw, 380px'}
            alt={i === 0 ? hall.name : ''}
            loading="eager"
          />
        </button>
      {/each}
      <!-- The cover's source, on the cover (it leads the gallery). -->
      {#if hall.cover_image_url && photos[0] === hall.cover_image_url}<PhotoCredit credit={hall.cover_image_credit} />{/if}
      {#if photos.length > 1}
        <button type="button" class="hp-allphotos" onclick={() => (activeIndex = 0)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
          {t.hallProfile.showAllPhotos(photos.length)}
        </button>
      {/if}
    </div>
  {:else}
    <div class="hp-nophoto" style="--hc:{hall.color}" aria-hidden="true"></div>
  {/if}

  <div class="hp-grid">
    <!-- ─── Main column ─────────────────────────────────────────────────────── -->
    <div class="hp-main">

      <dl class="hp-stats">
        <div class="hp-stat">
          <dt>{t.hallProfile.statUpTo}</dt>
          <dd>{hall.max_people} <span class="hp-unit">{t.hallProfile.statGuests}</span></dd>
        </div>
        <div class="hp-stat" class:is-open={bookable || external} class:is-closed={!bookable && !external}>
          <dt>{t.hallProfile.reservations}</dt>
          <dd><span class="hp-dot"></span>{bookable ? t.status.open : external ? t.listings.statusDirect : t.status.closed}</dd>
        </div>
        {#if bookable}
          <div class="hp-stat">
            <dt>{t.hallProfile.statConfirmation}</dt>
            <dd>{hall.auto_approve ? t.hallProfile.confirmInstant : t.hallProfile.confirmByVenue}</dd>
          </div>
          {#if hall.min_days_advance > 0}
            <div class="hp-stat">
              <dt>{t.hallProfile.statAdvance}</dt>
              <dd>{t.hallProfile.advanceDays(hall.min_days_advance)}</dd>
            </div>
          {/if}
        {/if}
        {#if hall.floorplan_json}
          <div class="hp-stat">
            <dt>{t.hallProfile.statFloorplan}</dt>
            <dd>{t.hallProfile.floorplanYes}</dd>
          </div>
        {/if}
      </dl>

      {#if hall.description}
        <section class="hp-block">
          <h2>{t.hallProfile.aboutHall}</h2>
          <p class="hp-desc" class:open={descOpen} bind:this={descEl} id="hp-desc">{hall.description}</p>
          {#if descFolds}
            <button type="button" class="hp-more" aria-expanded={descOpen} aria-controls="hp-desc" onclick={() => (descOpen = !descOpen)}>
              {descOpen ? t.hallProfile.showLess : t.hallProfile.showMore}
            </button>
          {/if}
        </section>
      {/if}

      {#if amenities.length > 0}
        <section class="hp-block">
          <h2>{t.hallProfile.amenities}</h2>
          <ul class="hp-amenities">
            {#each shownAmenities as a (a)}
              <li>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                <span>{amenityLabel(a, AMENITY_LABELS)}</span>
              </li>
            {/each}
          </ul>
          {#if amenities.length > AMENITY_PREVIEW}
            <button type="button" class="hp-more" aria-expanded={amenitiesOpen} onclick={() => (amenitiesOpen = !amenitiesOpen)}>
              {amenitiesOpen ? t.hallProfile.showLess : t.hallProfile.showAllAmenities(amenities.length)}
            </button>
          {/if}
        </section>
      {/if}

      {#if tabs.length > 0}
        <section class="hp-block">
          <div class="hp-tabs" role="tablist" aria-label={t.hallProfile.detailsTabs}>
            {#each tabs as tab, i (tab.id)}
              <button
                type="button" role="tab" id="hp-tab-{tab.id}"
                aria-selected={currentTab === tab.id}
                aria-controls="hp-panel"
                tabindex={currentTab === tab.id ? 0 : -1}
                class:active={currentTab === tab.id}
                onclick={() => (activeTab = tab.id)}
                onkeydown={(e) => tabKey(e, i)}
              >{tab.label}</button>
            {/each}
          </div>
          <div class="hp-panel" id="hp-panel" role="tabpanel" aria-labelledby="hp-tab-{currentTab}">
            {#if currentTab === 'floorplan' && hall.floorplan_json}
              {@const mf = migrateToMultiFloor(hall.floorplan_json)}
              {@const f0 = mf.floors[0]}
              <div class="fp-wrap">
                <svg viewBox={computeViewBox(f0)} preserveAspectRatio="xMidYMid meet" role="img" aria-label={t.hallProfile.floorplan}>
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
            {:else if currentTab === 'pricing'}
              <p class="hp-text">{hall.pricing_info}</p>
            {:else if currentTab === 'hours' && openingHours}
              <dl class="hp-hours">
                {#each openingHours as { hours }, idx}
                  <div class:closed={!hours.open}>
                    <dt>{t.dayNamesFull[idx]}</dt>
                    <dd>{hours.open ? `${hours.from} – ${hours.to}` : t.status.closed}</dd>
                  </div>
                {/each}
              </dl>
            {:else if currentTab === 'terms'}
              <ul class="hp-terms">
                <li>{t.hallProfile.wholeDayTerm}</li>
                {#if hall.min_days_advance > 0}<li>{t.hallProfile.advanceNotice(hall.min_days_advance)}</li>{/if}
                {#if hall.min_cancel_days > 0}<li>{t.hallProfile.cancelNotice(hall.min_cancel_days)}</li>{/if}
                <li>{hall.auto_approve ? t.publicBooking.autoApproveNote : t.publicBooking.reviewNote}</li>
              </ul>
              {#if hall.pre_reservation_text}
                <div class="hp-notice">
                  <span class="eyebrow">{t.hallProfile.beforeYouBook}</span>
                  <p class="hp-text">{hall.pre_reservation_text}</p>
                </div>
              {/if}
            {/if}
          </div>
        </section>
      {/if}

      {#if hasCoords || hasContact || hall.address}
        <section class="hp-block">
          <h2>{t.hallProfile.location}</h2>
          <div class="hp-where" class:has-map={hasCoords}>
            {#if hasCoords}
              <div class="hp-map"><VenueMap points={mapPoints} selected={hall.id} english={getLocale() === 'en'} fitKey={hall.id} theme={darkSite ? 'dark' : 'light'} /></div>
            {/if}
            <div class="hp-contact">
              {#if hall.address}
                <p class="hp-address">{hall.address}</p>
              {/if}
              {#if mapsHref}
                <a class="hp-link" href={mapsHref} target="_blank" rel="noopener noreferrer">{t.hallProfile.openInMaps} →</a>
              {/if}
              {#if hasContact}
                <ul class="hp-contact-list">
                  {#if hall.contact_phone}
                    <li><a href={telHref(hall.contact_phone)} onclick={() => trackListingClick(data.listingRef, 'phone')}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13 19.79 19.79 0 0 1 1.61 4.4 2 2 0 0 1 3.6 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.16 6.16l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                      {hall.contact_phone}</a></li>
                  {/if}
                  {#if hall.contact_email}
                    <li><a href={mailHref(hall.contact_email)} onclick={() => trackListingClick(data.listingRef, 'email')}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                      {hall.contact_email}</a></li>
                  {/if}
                  {#if websiteHref}
                    <li><a href={websiteHref} target="_blank" rel="noopener nofollow" onclick={() => trackListingClick(data.listingRef, 'website')}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                      {t.hallProfile.website}</a></li>
                  {/if}
                </ul>
              {/if}
            </div>
          </div>
        </section>
      {/if}
    </div>

    <!-- ─── Booking card ────────────────────────────────────────────────────── -->
    <aside class="hp-aside" id="book" bind:this={cardEl}>
      <div class="hp-card">
        {#if bookable}
          <div class="hp-card-head">
            <div>
              <span class="eyebrow">{t.hallProfile.reservations}</span>
              <h2>{t.hallProfile.cardTitle}</h2>
            </div>
            <span class="hp-pill">{t.hallProfile.upToGuests(hall.max_people)}</span>
          </div>

          {#if data.availability}
            <div class="hp-cal">
              <MiniCalendar
                takenDates={data.availability.taken}
                blockedDates={data.availability.unavailable}
                fullMonths={data.availability.fullMonths}
                minDate={data.availability.earliest}
                selectedDate={pickedDate}
                onselect={(d) => (pickedDate = d)}
                showLegend={true}
              />
            </div>
          {/if}

          <div class="hp-picked" class:empty={!pickedDate}>
            {#if pickedDate}
              <span><small>{t.hallProfile.cardSelected}</small>{formatDate(pickedDate, getLocale(), { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}</span>
              <button type="button" onclick={() => (pickedDate = '')}>{t.hallProfile.cardClearDate}</button>
            {:else}
              <span>{t.hallProfile.cardPickHint}</span>
            {/if}
          </div>

          <label class="hp-field">
            <span>{t.createEvent.guests}</span>
            <input type="number" min="1" max={hall.max_people} inputmode="numeric" bind:value={guests} placeholder="{t.publicBooking.maxPrefix} {hall.max_people}" />
          </label>
          {#if overCapacity}<p class="hp-err">{t.publicBooking.exceedsCapacity} ({hall.max_people}).</p>{/if}

          <a href={bookHref} class="hp-cta">{user ? t.hallProfile.continueBooking : t.hallProfile.signInToContinue}</a>
          <p class="hp-fine">{t.hallProfile.cardNotBinding}</p>
        {:else if external}
          <!-- Booked directly with the venue: its own ways in, where the form would be. -->
          <div class="hp-card-head">
            <div>
              <span class="eyebrow">{t.hallProfile.reservations}</span>
              <h2>{t.listings.bookDirectTitle}</h2>
            </div>
            <span class="hp-pill">{t.hallProfile.upToGuests(hall.max_people)}</span>
          </div>
          <p class="hp-fine hp-direct-hint">{t.listings.bookDirectHint}</p>
          <div class="hp-direct">
            {#if direct.website}
              <a class="hp-cta" href={direct.website} target="_blank" rel="noopener nofollow" onclick={() => trackListingClick(data.listingRef, 'website')}>{t.listings.visitWebsite}</a>
            {/if}
            {#if direct.phone}
              <a class="hp-direct-link" href={telHref(direct.phone)} onclick={() => trackListingClick(data.listingRef, 'phone')}>{direct.phone}</a>
            {/if}
            {#if direct.email}
              <a class="hp-direct-link" href={mailHref(direct.email)} onclick={() => trackListingClick(data.listingRef, 'email')}>{direct.email}</a>
            {/if}
          </div>
        {:else}
          <div class="hp-card-head">
            <div>
              <span class="eyebrow">{t.hallProfile.reservations}</span>
              <h2>{t.hallProfile.reservationsClosed}</h2>
            </div>
          </div>
          <p class="hp-fine">{t.hallProfile.reservationsClosedSub}</p>
        {/if}

        <!-- An open hall's contacts are in the Location block; the card stays short
             enough to fit the screen. A closed hall's card has room for them. -->
        {#if !bookable && !external && (hall.contact_phone || hall.contact_email)}
          <div class="hp-card-foot">
            <span>{t.hallProfile.cardQuestions}</span>
            {#if hall.contact_phone}<a href={telHref(hall.contact_phone)} onclick={() => trackListingClick(data.listingRef, 'phone')}>{hall.contact_phone}</a>{/if}
            {#if hall.contact_email}<a href={mailHref(hall.contact_email)} onclick={() => trackListingClick(data.listingRef, 'email')}>{hall.contact_email}</a>{/if}
          </div>
        {/if}
      </div>
    </aside>
  </div>

  {#if bookable}
    <!-- Phones: the card is below the content, so this bar leads to it. -->
    <div class="hp-bar" class:hidden={cardInView}>
      <div class="hp-bar-copy">
        <strong>{hall.name}</strong>
        <span>{pickedDate ? formatDate(pickedDate, getLocale(), { day: 'numeric', month: 'short' }) : t.hallProfile.upToGuests(hall.max_people)}</span>
      </div>
      <a href="#book" class="hp-cta hp-bar-cta" onclick={toCard}>{t.hallProfile.barPickDate}</a>
    </div>
  {/if}
</div>

<style>
  /* ── Frame: a container, so the layout follows the column it is given (the
     venue rail takes 232px of a desktop window). ── */
  .hp { container: hp / inline-size; animation: hpFade .2s ease both; }
  @keyframes hpFade { from { opacity: 0; } to { opacity: 1; } }

  .hp-success {
    display: flex; align-items: flex-start; gap: 12px; margin-bottom: 20px;
    padding: 12px 16px; border-radius: var(--radius); background: var(--success-dim);
    border: 1px solid color-mix(in srgb, var(--success) 25%, transparent);
    font-size: 13px; color: var(--text-base);
  }
  .hp-success svg { color: var(--success); flex-shrink: 0; margin-top: 2px; }
  .hp-success strong { color: var(--success); display: block; margin-bottom: 2px; font-weight: 600; }

  /* ── Title ── */
  .hp-head { margin-bottom: 18px; }
  .hp-head .eyebrow { margin: 0 0 6px; }
  .hp-head h1 { font-size: var(--display-size); line-height: 1.06; margin: 0 0 10px; overflow-wrap: anywhere; }
  .hp-sub { display: flex; flex-wrap: wrap; gap: 6px 18px; margin: 0; font-size: 13px; color: var(--text-muted); }
  .hp-sub-item { display: inline-flex; align-items: center; gap: 6px; }
  .hp-sub-item svg { color: var(--text-subtle, var(--text-muted)); flex-shrink: 0; }

  /* ── Gallery mosaic ── */
  .hp-gallery {
    position: relative; display: grid; gap: 8px; height: clamp(280px, 34vw, 440px);
    grid-template-columns: 2fr 1fr 1fr; grid-template-rows: 1fr 1fr;
    border-radius: var(--radius-lg); overflow: hidden;
  }
  .hp-gallery[data-count='1'] { grid-template-columns: 1fr; grid-template-rows: 1fr; }
  .hp-gallery[data-count='2'] { grid-template-columns: 2fr 1fr; grid-template-rows: 1fr; }
  .hp-gallery[data-count='3'] { grid-template-columns: 2fr 1fr; }
  .hp-gallery .hp-photo:first-child { grid-row: span 2; }
  .hp-gallery[data-count='2'] .hp-photo:first-child { grid-row: auto; }
  .hp-gallery[data-count='4'] .hp-photo:last-of-type { grid-row: span 2; }
  .hp-photo { padding: 0; border: 0; margin: 0; overflow: hidden; background: var(--bg-hover); cursor: zoom-in; display: block; min-width: 0; min-height: 0; }
  .hp-photo img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform .5s, filter .3s; }
  .hp-photo:hover img { transform: scale(1.03); filter: brightness(.94); }
  .hp-photo:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .hp-allphotos {
    position: absolute; right: 14px; bottom: 14px; display: inline-flex; align-items: center; gap: 7px;
    padding: 8px 13px; border-radius: var(--radius-sm); border: 1px solid var(--border);
    background: var(--bg-panel); color: var(--text-base); font-family: inherit; font-size: 12px; font-weight: 650;
    cursor: pointer; box-shadow: 0 2px 10px rgba(0,0,0,.12); transition: transform .2s;
  }
  .hp-allphotos:hover { transform: translateY(-2px); }
  .hp-nophoto {
    height: 120px; border-radius: var(--radius-lg);
    background: linear-gradient(120deg, color-mix(in srgb, var(--hc) 28%, var(--bg-hover)), var(--bg-hover) 70%);
  }

  /* ── Two columns ── */
  .hp-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 32px; margin-top: 28px; }
  @container hp (min-width: 880px) {
    .hp-grid { grid-template-columns: minmax(0, 1fr) 352px; gap: 48px; align-items: start; }
    /* Kept to about 640px tall so it fits a laptop window while it sticks; a
       card taller than the window would hide its own button. */
    .hp-aside { position: sticky; top: 20px; }
  }
  .hp-main { min-width: 0; display: flex; flex-direction: column; }

  /* Facts as one compact strip. */
  .hp-stats {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(118px, 1fr)); margin: 0;
    border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--bg-panel); overflow: hidden;
  }
  .hp-stat { padding: 14px 16px; min-width: 0; box-shadow: -1px 0 0 var(--border); }
  .hp-stat dt { font-size: 10px; font-weight: 650; text-transform: uppercase; letter-spacing: .12em; color: var(--text-muted); margin-bottom: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .hp-stat dd { margin: 0; font-size: 16px; font-weight: 650; color: var(--text-base); letter-spacing: -.02em; display: flex; align-items: center; gap: 6px; }
  .hp-stat .hp-unit { font-size: 12px; font-weight: 500; color: var(--text-muted); }
  .hp-stat .hp-dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
  .hp-stat.is-open dd { color: var(--success); }
  .hp-stat.is-closed dd { color: var(--danger); }

  /* Blocks: a heading and a hairline, with a third of the old section padding. */
  .hp-block { padding: 26px 0; border-bottom: 1px solid var(--border); }
  .hp-block:last-child { border-bottom: none; padding-bottom: 0; }
  .hp-block h2 { font-size: 20px; line-height: 1.2; margin: 0 0 14px; color: var(--text-base); }

  .hp-desc {
    margin: 0; font-size: 14px; line-height: 1.75; color: var(--text-muted); white-space: pre-line; max-width: 72ch;
    display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 5; line-clamp: 5; overflow: hidden;
  }
  .hp-desc.open { display: block; -webkit-line-clamp: unset; line-clamp: unset; }
  .hp-more {
    margin-top: 10px; padding: 0; border: 0; background: none; cursor: pointer; font-family: inherit;
    font-size: 13px; font-weight: 650; color: var(--accent-ink); text-decoration: underline; text-underline-offset: 3px;
  }

  .hp-amenities { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px 20px; }
  .hp-amenities li { display: flex; align-items: center; gap: 9px; font-size: 13.5px; color: var(--text-base); min-width: 0; }
  .hp-amenities svg { color: var(--accent-ink); flex-shrink: 0; }

  /* Tabs */
  .hp-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border); margin-bottom: 18px; overflow-x: auto; scrollbar-width: none; }
  .hp-tabs button {
    flex-shrink: 0; padding: 10px 14px; margin-bottom: -1px; border: 0; border-bottom: 2px solid transparent; background: none;
    font-family: inherit; font-size: 13.5px; font-weight: 550; color: var(--text-muted); cursor: pointer; transition: color .15s, border-color .15s;
  }
  .hp-tabs button:first-child { padding-left: 0; }
  .hp-tabs button:hover { color: var(--text-base); }
  .hp-tabs button.active { color: var(--accent-ink); border-bottom-color: var(--accent); font-weight: 650; }
  .hp-tabs button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .hp-panel { min-height: 120px; }
  .hp-text { margin: 0; font-size: 14px; line-height: 1.75; color: var(--text-muted); white-space: pre-line; max-width: 72ch; }
  .fp-wrap { background: var(--editor-canvas); border-radius: var(--radius-lg); overflow: hidden; height: 280px; }
  .fp-wrap svg { width: 100%; height: 100%; }
  .hp-hours { margin: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 0 32px; }
  .hp-hours div { display: flex; justify-content: space-between; gap: 16px; padding: 9px 0; border-bottom: 1px solid var(--border-subtle); font-size: 13px; }
  .hp-hours dt { color: var(--text-base); font-weight: 550; }
  .hp-hours dd { margin: 0; color: var(--text-muted); font-variant-numeric: tabular-nums; }
  .hp-hours .closed dt, .hp-hours .closed dd { color: var(--text-muted); opacity: .7; }
  .hp-terms { margin: 0; padding: 0 0 0 18px; display: grid; gap: 8px; font-size: 13.5px; line-height: 1.6; color: var(--text-muted); }
  .hp-notice { margin-top: 16px; padding: 14px 16px; border-radius: var(--radius); background: var(--bg-hover); }
  .hp-notice .eyebrow { display: block; margin-bottom: 6px; }

  /* Location */
  .hp-where { display: grid; gap: 20px; }
  @container hp (min-width: 640px) {
    .hp-where.has-map { grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); align-items: start; }
  }
  .hp-map { position: relative; height: 240px; border-radius: var(--radius-lg); overflow: hidden; isolation: isolate; border: 1px solid var(--border); }
  .hp-contact { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
  .hp-address { margin: 0; font-size: 14px; font-weight: 550; color: var(--text-base); line-height: 1.5; }
  .hp-link { font-size: 13px; font-weight: 650; color: var(--accent-ink); }
  .hp-contact-list { list-style: none; padding: 0; margin: 4px 0 0; display: grid; gap: 2px; border-top: 1px solid var(--border-subtle); }
  .hp-contact-list a { display: flex; align-items: center; gap: 9px; padding: 9px 0; font-size: 13px; color: var(--text-base); border-bottom: 1px solid var(--border-subtle); overflow-wrap: anywhere; }
  .hp-contact-list a:hover { color: var(--accent-ink); text-decoration: none; }
  .hp-contact-list svg { color: var(--text-muted); flex-shrink: 0; }

  /* ── Booking card ── */
  .hp-aside { min-width: 0; scroll-margin-top: 16px; }
  .hp-card {
    display: flex; flex-direction: column; gap: 12px; padding: 18px 18px 16px;
    background: var(--bg-panel); border: 1px solid var(--border); border-radius: var(--radius-xl);
    box-shadow: 0 1px 2px rgba(0,0,0,.04), 0 16px 40px -18px rgba(0,0,0,.18);
  }
  .hp-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  .hp-card-head .eyebrow { display: block; margin-bottom: 3px; }
  .hp-card-head h2 { font-size: 19px; line-height: 1.2; margin: 0; color: var(--text-base); }
  .hp-pill { flex-shrink: 0; font-size: 11px; font-weight: 650; color: var(--text-muted); padding: 4px 9px; border: 1px solid var(--border); border-radius: 999px; white-space: nowrap; margin-top: 2px; }
  .hp-cal { margin: 0 -4px; }
  .hp-picked {
    display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 42px;
    padding: 8px 12px; border-radius: var(--radius); background: var(--accent-dim);
    border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border)); font-size: 13.5px; font-weight: 600; color: var(--text-base);
  }
  .hp-picked small { display: block; font-size: 10px; font-weight: 650; text-transform: uppercase; letter-spacing: .1em; color: var(--text-muted); }
  .hp-picked.empty { background: var(--bg-hover); border-color: transparent; font-weight: 500; color: var(--text-muted); font-size: 12.5px; }
  .hp-picked button { border: 0; background: none; padding: 0; font-family: inherit; font-size: 12px; font-weight: 600; color: var(--accent-ink); cursor: pointer; text-decoration: underline; }
  .hp-field { display: flex; flex-direction: column; gap: 5px; }
  .hp-field span { font-size: 12px; font-weight: 600; color: var(--text-muted); }
  .hp-field input { font-family: inherit; font-size: 14px; padding: 9px 11px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-base); color: var(--text-base); width: 100%; box-sizing: border-box; }
  .hp-err { margin: -6px 0 0; font-size: 12px; color: var(--danger); }
  .hp-cta {
    display: block; text-align: center; padding: 12px 18px; border-radius: var(--radius-sm);
    background: var(--accent); color: var(--accent-contrast); font-size: 14px; font-weight: 650;
    text-decoration: none; transition: transform .2s, background .2s;
  }
  .hp-cta:hover { background: var(--accent-hover, var(--accent)); transform: translateY(-2px); text-decoration: none; }
  .hp-cta:active { transform: translateY(0); }
  .hp-fine { margin: -4px 0 0; font-size: 12px; line-height: 1.55; color: var(--text-muted); text-align: center; }
  .hp-card-foot { display: flex; flex-wrap: wrap; gap: 4px 12px; padding-top: 12px; border-top: 1px solid var(--border-subtle); font-size: 12px; color: var(--text-muted); }
  .hp-card-foot span { width: 100%; }
  .hp-card-foot a { color: var(--accent-ink); font-weight: 600; overflow-wrap: anywhere; }
  .hp-direct-hint { margin: 0; text-align: left; }
  .hp-direct { display: grid; gap: 8px; }
  .hp-direct-link {
    display: block; text-align: center; padding: 10px 14px; border-radius: var(--radius-sm);
    border: 1px solid var(--border); color: var(--text-base); font-size: 13.5px; font-weight: 600;
    text-decoration: none; overflow-wrap: anywhere;
  }
  .hp-direct-link:hover { border-color: var(--accent); color: var(--accent-ink); text-decoration: none; }

  /* ── Phone bar: only below the two-column width ── */
  .hp-bar { display: none; }
  @container hp (max-width: 879px) {
    .hp--bar { padding-bottom: 76px; }
    .hp-bar {
      position: fixed; left: 0; right: 0; bottom: var(--consent-space, 0px); z-index: 30;
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 10px 16px calc(10px + env(safe-area-inset-bottom, 0px));
      background: var(--bg-panel); border-top: 1px solid var(--border);
      box-shadow: 0 -8px 24px -12px rgba(0,0,0,.18);
      transition: transform .25s ease, opacity .2s;
    }
    .hp-bar.hidden { transform: translateY(110%); opacity: 0; pointer-events: none; }
    .hp-bar-copy { min-width: 0; display: flex; flex-direction: column; }
    .hp-bar-copy strong { font-size: 14px; font-weight: 650; color: var(--text-base); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .hp-bar-copy span { font-size: 12px; color: var(--text-muted); }
    .hp-bar-cta { flex-shrink: 0; padding: 11px 18px; }
  }

  /* Phones: the mosaic becomes a swipeable strip. */
  @container hp (max-width: 640px) {
    .hp-gallery, .hp-gallery[data-count] {
      display: flex; height: auto; overflow-x: auto; scroll-snap-type: x mandatory; gap: 6px;
      scrollbar-width: none; border-radius: var(--radius-lg);
    }
    .hp-gallery::-webkit-scrollbar { display: none; }
    .hp-photo { flex: 0 0 88%; aspect-ratio: 4 / 3; scroll-snap-align: start; border-radius: var(--radius); }
    .hp-gallery[data-count='1'] .hp-photo { flex-basis: 100%; }
    .hp-allphotos { position: static; display: none; }
    .hp-head h1 { font-size: 28px; }
    .hp-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .hp-stat { box-shadow: -1px 0 0 var(--border), 0 -1px 0 var(--border); }
    .hp-stat:last-child:nth-child(odd) { grid-column: span 2; }
    .hp-block { padding: 22px 0; }
    .fp-wrap { height: 220px; }
  }

  @media (prefers-reduced-motion: reduce) {
    .hp-cta:hover, .hp-allphotos:hover { transform: none; }
    .hp-photo:hover img { transform: none; }
    .hp-bar { transition: none; }
  }
</style>
