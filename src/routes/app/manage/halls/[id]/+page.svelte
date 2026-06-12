<script lang="ts">
  import { enhance } from '$app/forms';
  import { slide } from 'svelte/transition';
  import { t } from '$lib/i18n';
  import { migrateToMultiFloor } from '$lib/floorplan-types';
  import type { FloorData } from '$lib/floorplan-types';
  import DateRangePicker from '$lib/components/DateRangePicker.svelte';
  import type { PageData, ActionData } from './$types';

  interface Props { data: PageData; form: ActionData; }
  const { data, form }: Props = $props();

  function parseArr(v: unknown): string[] {
    if (!v) return [];
    if (Array.isArray(v)) return v as string[];
    if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } }
    return [];
  }
  function parseObj<T extends object>(v: unknown): T {
    if (!v) return {} as T;
    if (typeof v === 'object' && !Array.isArray(v)) return v as T;
    if (typeof v === 'string') { try { const p = JSON.parse(v); return (p && typeof p === 'object' && !Array.isArray(p)) ? p : {} as T; } catch { return {} as T; } }
    return {} as T;
  }

  let settingsSaved = $state(false);
  let profileSaved  = $state(false);

  let showBlockDialog   = $state(false);
  let blockStep         = $state(1);
  let rangeFrom         = $state('');
  let rangeTo           = $state('');
  let blockDays         = $state<number[]>([0,1,2,3,4,5,6]);
  let blockReason       = $state('');
  let showCancelConfirm = $state(false);

  let tableShape     = $state<'rect' | 'round'>('rect');
  let templatesOpen  = $state(true);
  let tableTypesOpen = $state(true);

  // Preview-bound state (feeds both the form and the live preview)
  let previewName        = $state(data.hall.name);
  let previewDescription = $state(data.hall.description ?? '');
  let previewMaxPeople   = $state(data.hall.max_people);
  let previewAddress     = $state(data.hall.address ?? '');
  let previewColor       = $state(data.hall.color);
  let previewPricing     = $state(data.hall.pricing_info ?? '');
  let previewPhone       = $state(data.hall.contact_phone ?? '');
  let previewEmail       = $state(data.hall.contact_email ?? '');
  let previewWebsite     = $state(data.hall.contact_website ?? '');

  let profileIsPublic    = $state(data.hall.is_public ?? false);
  let profileSlug        = $state(data.hall.slug ?? '');
  let profileCoverUrl    = $state(data.hall.cover_image_url ?? '');
  let profileAmenities   = $state<string[]>(parseArr(data.hall.amenities));
  let galleryImages      = $state<string[]>(parseArr(data.hall.gallery_images));
  let galleryUploading   = $state(false);
  let galleryUploadError = $state('');
  let coverUploading     = $state(false);
  let coverUploadError   = $state('');

  const galleryLimit = $derived(
    data.plan.limits.maxGalleryImages === -1 ? Infinity : data.plan.limits.maxGalleryImages
  );
  const galleryAtLimit = $derived(galleryImages.length >= galleryLimit);

  async function doUpload(file: File): Promise<string | null> {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/upload/image', { method: 'POST', body: fd });
    if (!res.ok) {
      let msg = 'Upload failed.';
      try {
        const body = await res.json();
        msg = body?.message ?? msg;
      } catch {
        msg = (await res.text().catch(() => '')) || msg;
      }
      throw new Error(msg);
    }
    const { url } = await res.json();
    return url as string;
  }

  async function uploadGalleryImage(file: File) {
    if (galleryAtLimit) return;
    galleryUploading = true;
    galleryUploadError = '';
    try {
      const url = await doUpload(file);
      if (url) galleryImages = [...galleryImages, url];
    } catch (err) {
      galleryUploadError = err instanceof Error ? err.message : 'Upload failed.';
    } finally {
      galleryUploading = false;
    }
  }

  async function uploadCover(file: File) {
    coverUploading = true;
    coverUploadError = '';
    try {
      const url = await doUpload(file);
      if (url) profileCoverUrl = url;
    } catch (err) {
      coverUploadError = err instanceof Error ? err.message : 'Upload failed.';
    } finally {
      coverUploading = false;
    }
  }

  type DayHours = { open: boolean; from: string; to: string };
  let profileHours = $state<Record<string, DayHours>>(parseObj(data.hall.opening_hours));

  const AMENITIES = [
    { id: 'parking',    label: 'Parking' },
    { id: 'catering',   label: 'Catering' },
    { id: 'av',         label: 'AV Equipment' },
    { id: 'wifi',       label: 'WiFi' },
    { id: 'ac',         label: 'Air Conditioning' },
    { id: 'accessible', label: 'Wheelchair Access' },
    { id: 'outdoor',    label: 'Outdoor Space' },
    { id: 'stage',      label: 'Stage' },
    { id: 'dancefloor', label: 'Dance Floor' },
    { id: 'bar',        label: 'Bar / Drinks' },
  ];

  const DAYS = [
    { id: 'mon', label: 'Monday' },
    { id: 'tue', label: 'Tuesday' },
    { id: 'wed', label: 'Wednesday' },
    { id: 'thu', label: 'Thursday' },
    { id: 'fri', label: 'Friday' },
    { id: 'sat', label: 'Saturday' },
    { id: 'sun', label: 'Sunday' },
  ];

  function slugify(s: string): string {
    return s.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function getDayHours(id: string): DayHours {
    return profileHours[id] ?? { open: true, from: '09:00', to: '22:00' };
  }
  function setDayHours(id: string, patch: Partial<DayHours>) {
    profileHours = { ...profileHours, [id]: { ...getDayHours(id), ...patch } };
  }

  const DAYS_SK   = ['Ne', 'Po', 'Ut', 'St', 'Št', 'Pi', 'So'];
  const DAYS_FULL = [t.dayNames[6], t.dayNames[0], t.dayNames[1], t.dayNames[2], t.dayNames[3], t.dayNames[4], t.dayNames[5]];
  const EVENT_TYPES_MAP: Record<string, string> = {
    Wedding: t.eventTypes.wedding, Ball: t.eventTypes.ball,
    Conference: t.eventTypes.conference, Birthday: t.eventTypes.birthday,
    Other: t.eventTypes.other,
  };

  const todayStr = new Date().toISOString().slice(0, 10);

  const upcomingReservations = $derived(
    data.reservations
      .filter(r => {
        const d = r.event_date instanceof Date ? r.event_date : new Date(r.event_date as string);
        const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        return iso >= todayStr;
      })
      .sort((a, b) => new Date(a.event_date as unknown as string).getTime() - new Date(b.event_date as unknown as string).getTime())
  );

  const eventDateStrings = $derived(
    data.reservations.map(r => {
      const d = r.event_date instanceof Date ? r.event_date : new Date(r.event_date as string);
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    })
  );

  const conflictingEvents = $derived.by(() => {
    if (!rangeFrom || !rangeTo) return [];
    return data.reservations.filter(r => {
      const d = r.event_date instanceof Date ? r.event_date : new Date(r.event_date as string);
      const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      return iso >= rangeFrom && iso <= rangeTo;
    });
  });

  function openBlockDialog() {
    blockStep = 1; rangeFrom = ''; rangeTo = '';
    blockDays = [0,1,2,3,4,5,6]; blockReason = '';
    showBlockDialog = true;
  }
  function onRangeChange(s: string, e: string) { rangeFrom = s; rangeTo = e; }
  function toggleBlockDay(d: number) {
    if (blockDays.includes(d)) blockDays = blockDays.filter(x => x !== d);
    else blockDays = [...blockDays, d];
  }

  function formatDate(d: Date | string | null): string {
    if (!d) return '';
    const date = typeof d === 'string' ? new Date(d + 'T00:00:00') : new Date(d);
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function shortDate(d: Date | string | null): string {
    if (!d) return '';
    const date = typeof d === 'string' ? new Date(d + 'T00:00:00') : new Date(d);
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }
  function daysBetween(from: string, to: string): number {
    if (!from || !to) return 0;
    return Math.round((new Date(to + 'T00:00:00').getTime() - new Date(from + 'T00:00:00').getTime()) / 86400000) + 1;
  }

  function computeViewBox(floor: FloorData): string {
    if (floor.bounds) {
      const { x, y, w, h } = floor.bounds, p = 0.5;
      return `${(x-p)*10} ${(y-p)*10} ${(w+p*2)*10} ${(h+p*2)*10}`;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const w of floor.walls) for (const p of w.points) {
      if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
    }
    for (const tbl of floor.tables) {
      const hw = (tbl.width ?? 2)/2, hh = (tbl.height ?? 1)/2;
      if (tbl.x-hw < minX) minX = tbl.x-hw; if (tbl.y-hh < minY) minY = tbl.y-hh;
      if (tbl.x+hw > maxX) maxX = tbl.x+hw; if (tbl.y+hh > maxY) maxY = tbl.y+hh;
    }
    if (!isFinite(minX)) return '0 0 100 70';
    const p = 0.5;
    return `${(minX-p)*10} ${(minY-p)*10} ${(maxX-minX+p*2)*10} ${(maxY-minY+p*2)*10}`;
  }
</script>

<svelte:head><title>{data.hall.name} – Hallify</title></svelte:head>

<div class="page">

  <!-- ─── Breadcrumb ──────────────────────────────────────────────────────────── -->
  <nav class="breadcrumb">
    <a href="/app/manage/halls">Halls</a>
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
    <span>{data.hall.name}</span>
  </nav>

  <!-- ─── Profile + Overview (merged, always open) ────────────────────────────── -->
  <div class="card profile-card">

    <!-- Card header: name, status chips, KPIs, save button -->
    <div class="profile-card-head">
      <div class="profile-head-left">
        <h1 class="hall-name">{previewName || data.hall.name}</h1>
        <div class="identity-chips">
          <span class="chip" class:chip-success={data.hall.allow_reservations} class:chip-closed={!data.hall.allow_reservations}>
            <span class="chip-dot"></span>
            {data.hall.allow_reservations ? 'Accepting bookings' : 'Closed to bookings'}
          </span>
          {#if profileIsPublic}
            <span class="chip chip-success">
              <span class="chip-dot"></span>Published
            </span>
          {:else}
            <span class="chip chip-muted">Draft</span>
          {/if}
        </div>
      </div>

      <div class="profile-head-right">
        <div class="kpi-trio">
          <div class="kpi-item">
            <span class="kpi-val">{data.reservations.length}</span>
            <span class="kpi-lbl">Total bookings</span>
          </div>
          <div class="kpi-item">
            <span class="kpi-val">{upcomingReservations.length}</span>
            <span class="kpi-lbl">Upcoming</span>
          </div>
          <div class="kpi-item">
            <span class="kpi-val">{data.blocks.length}</span>
            <span class="kpi-lbl">Blocked periods</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Two-column editor -->
    <div class="profile-editor-wrap">

      <!-- ── Left: form ── -->
      <form
        method="POST"
        action="?/saveProfile"
        use:enhance={() => async ({ result, update }) => {
          if (result.type === 'success') {
            profileSaved = true;
            setTimeout(() => profileSaved = false, 2500);
          } else {
            await update({ reset: false });
          }
        }}
        class="profile-form"
      >

        {#if form?.profileError}
          <div class="alert alert-error" style="margin:16px 18px 0">{form.profileError}</div>
        {/if}

        <!-- Hall details -->
        <div class="profile-section">
          <p class="col-label">Hall details</p>
          <div class="edit-row">
            <div class="field field-grow">
              <label class="field-label" for="pf-name">Hall name *</label>
              <input class="field-input" id="pf-name" name="name" type="text"
                bind:value={previewName} required />
            </div>
            <div class="field" style="width:110px">
              <label class="field-label" for="pf-cap">Capacity</label>
              <input class="field-input" id="pf-cap" name="maxPeople" type="number"
                min="1" max="5000" bind:value={previewMaxPeople} />
            </div>
            <div class="field">
              <label class="field-label" for="pf-color">Color</label>
              <label class="color-swatch" style="background:{previewColor}">
                <input id="pf-color" name="color" type="color" bind:value={previewColor} />
              </label>
            </div>
          </div>
          <div class="edit-row">
            <div class="field field-grow">
              <label class="field-label" for="pf-desc">Description</label>
              <input class="field-input" id="pf-desc" name="description" type="text"
                bind:value={previewDescription} placeholder="Short description of the hall…" />
            </div>
            <div class="field field-grow">
              <label class="field-label" for="pf-addr">Address</label>
              <input class="field-input" id="pf-addr" name="address" type="text"
                bind:value={previewAddress} placeholder="Optional location…" />
            </div>
          </div>
        </div>

        <!-- Visibility -->
        <div class="profile-section">
          <p class="col-label">Visibility</p>
          <label class="toggle-item" style="padding:6px 0;border-bottom:none">
            <div class="toggle-text">
              <span class="toggle-title">Make this hall publicly visible</span>
              <span class="toggle-hint">Visitors can discover and view this hall's profile without logging in.</span>
            </div>
            <div class="toggle-switch">
              <input type="checkbox" name="isPublic" bind:checked={profileIsPublic} />
              <span class="toggle-slider"></span>
            </div>
          </label>
          {#if profileIsPublic}
            <div class="profile-slug-row" transition:slide={{ duration: 140 }}>
              <div class="field" style="flex:1;min-width:0">
                <label class="field-label" for="pf-slug">Public URL</label>
                <div class="slug-wrap">
                  <span class="slug-prefix">/halls/</span>
                  <input class="field-input slug-input" id="pf-slug" name="slug"
                    type="text" value={profileSlug} placeholder="my-hall-name"
                    oninput={(e) => profileSlug = slugify(e.currentTarget.value)} />
                </div>
              </div>
              {#if data.hall.slug && data.hall.is_public}
                <a href="/app/halls/{data.hall.slug}" target="_blank" rel="noopener"
                  class="btn-ghost" style="align-self:flex-end;white-space:nowrap;flex-shrink:0">
                  View live
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                </a>
              {/if}
            </div>
          {/if}
        </div>

        <!-- Cover image -->
        <div class="profile-section">
          <p class="col-label">Cover image</p>
          <div class="cover-row">
            <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:6px">
              <label class="cover-upload-btn" class:uploading={coverUploading}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
                {coverUploading ? 'Uploading…' : 'Upload image'}
                <input type="file" accept="image/jpeg,image/png,image/webp,image/gif"
                  style="display:none"
                  onchange={(e) => { const f = e.currentTarget.files?.[0]; if (f) uploadCover(f); }} />
              </label>
              {#if coverUploadError}
                <span class="field-hint" style="color:var(--danger,#ef4444)">{coverUploadError}</span>
              {/if}
              <label class="field-label" for="pf-cover">Or paste image URL</label>
              <input class="field-input" id="pf-cover" name="coverImageUrl"
                type="url" bind:value={profileCoverUrl} placeholder="https://…" />
            </div>
            {#if profileCoverUrl}
              <div class="cover-thumb">
                <img src={profileCoverUrl} alt="Cover preview" />
              </div>
            {/if}
          </div>
        </div>

        <!-- Gallery -->
        <div class="profile-section">
          <div class="gallery-header">
            <p class="col-label" style="margin:0">Gallery</p>
            <span class="gallery-count" class:at-limit={galleryAtLimit}>
              {galleryImages.length} / {data.plan.limits.maxGalleryImages === -1 ? '∞' : data.plan.limits.maxGalleryImages}
            </span>
          </div>

          <div class="gallery-grid">
            {#each galleryImages as url, i}
              <div class="gallery-item">
                <img src={url} alt="" />
                <button type="button" class="gallery-remove"
                  onclick={() => galleryImages = galleryImages.filter((_, j) => j !== i)}
                  title="Remove image">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
                <input type="hidden" name="galleryImages" value={url} />
              </div>
            {/each}

            {#if !galleryAtLimit}
              <label class="gallery-add-slot" class:uploading={galleryUploading}>
                {#if galleryUploading}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                  <span>Uploading…</span>
                {:else}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  <span>Add photo</span>
                {/if}
                <input type="file" accept="image/jpeg,image/png,image/webp,image/gif"
                  style="display:none"
                  onchange={(e) => { const f = e.currentTarget.files?.[0]; if (f) uploadGalleryImage(f); e.currentTarget.value = ''; }} />
              </label>
            {/if}
          </div>

          {#if galleryUploadError}
            <span class="field-hint" style="color:var(--danger,#ef4444)">{galleryUploadError}</span>
          {/if}

          {#if galleryAtLimit}
            <div class="gallery-limit-banner">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {data.plan.limits.maxGalleryImages} image limit on the {data.plan.name} plan.
              <a href="/app/billing" class="gallery-upgrade-link">Upgrade</a>
            </div>
          {/if}
        </div>

        <!-- Amenities -->
        <div class="profile-section">
          <p class="col-label">Amenities</p>
          <div class="amenities-grid">
            {#each AMENITIES as a}
              <label class="amenity-item">
                <input type="checkbox" name="amenities" value={a.id}
                  checked={profileAmenities.includes(a.id)}
                  onchange={(e) => {
                    if (e.currentTarget.checked) profileAmenities = [...profileAmenities, a.id];
                    else profileAmenities = profileAmenities.filter(x => x !== a.id);
                  }} />
                <span class="amenity-label">{a.label}</span>
              </label>
            {/each}
          </div>
        </div>

        <!-- Pricing -->
        <div class="profile-section">
          <p class="col-label">Pricing</p>
          <div class="field">
            <label class="field-label" for="pf-pricing">Pricing information</label>
            <textarea class="field-input field-textarea" id="pf-pricing" name="pricingInfo"
              rows="3" placeholder="e.g. From €500 for weekday events, €800 on weekends."
              bind:value={previewPricing}></textarea>
          </div>
        </div>

        <!-- Contact -->
        <div class="profile-section">
          <p class="col-label">Contact</p>
          <div class="profile-fields-row">
            <div class="field field-grow">
              <label class="field-label" for="pf-phone">Phone</label>
              <input class="field-input" id="pf-phone" name="contactPhone" type="tel"
                bind:value={previewPhone} placeholder="+421 900 000 000" />
            </div>
            <div class="field field-grow">
              <label class="field-label" for="pf-email">Email</label>
              <input class="field-input" id="pf-email" name="contactEmail" type="email"
                bind:value={previewEmail} placeholder="contact@hall.com" />
            </div>
            <div class="field field-grow">
              <label class="field-label" for="pf-web">Website</label>
              <input class="field-input" id="pf-web" name="contactWebsite" type="url"
                bind:value={previewWebsite} placeholder="https://…" />
            </div>
          </div>
        </div>

        <!-- Opening hours -->
        <div class="profile-section" style="border-bottom:none">
          <p class="col-label">Opening hours</p>
          <div class="hours-grid">
            {#each DAYS as day}
              {@const dh = getDayHours(day.id)}
              <div class="hours-row">
                <span class="hours-day">{day.label}</span>
                <label class="toggle-switch" style="cursor:pointer;flex-shrink:0">
                  <input type="checkbox" checked={dh.open}
                    onchange={(e) => setDayHours(day.id, { open: e.currentTarget.checked })} />
                  <span class="toggle-slider"></span>
                </label>
                {#if dh.open}
                  <input class="field-input time-input" type="time" value={dh.from}
                    onchange={(e) => setDayHours(day.id, { from: e.currentTarget.value })} />
                  <span class="hours-sep">–</span>
                  <input class="field-input time-input" type="time" value={dh.to}
                    onchange={(e) => setDayHours(day.id, { to: e.currentTarget.value })} />
                {:else}
                  <span class="hours-closed">Closed</span>
                {/if}
              </div>
            {/each}
          </div>
          <input type="hidden" name="openingHours" value={JSON.stringify(profileHours)} />
        </div>

        <div class="profile-save-row">
          {#if profileSaved}
            <span class="saved-badge" transition:slide={{ axis: 'x', duration: 180 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              Saved
            </span>
          {/if}
          <button type="submit" class="btn-save">Save profile</button>
        </div>
      </form>

      <!-- ── Right: live preview ── -->
      <div class="profile-preview-col">
        <div class="preview-sticky">
          <div class="preview-label">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            Live preview
            {#if profileSlug}
              <span class="preview-slug">/halls/{profileSlug}</span>
            {/if}
          </div>

          <div class="preview-card">
            <div class="preview-cover" style="background: linear-gradient(135deg, {previewColor}cc 0%, {previewColor}44 100%)">
              {#if profileCoverUrl}
                <img src={profileCoverUrl} alt="" class="preview-cover-img" />
              {/if}
              <div class="preview-cover-overlay">
                <span class="preview-status" class:pub={profileIsPublic}>
                  {profileIsPublic ? '● Published' : '○ Draft'}
                </span>
                <h3 class="preview-hall-name">{previewName || 'Hall name'}</h3>
                <div class="preview-meta-row">
                  {#if previewMaxPeople}
                    <span class="preview-meta-chip">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                      {previewMaxPeople} guests
                    </span>
                  {/if}
                  {#if previewAddress}
                    <span class="preview-meta-chip">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                      {previewAddress}
                    </span>
                  {/if}
                </div>
              </div>
            </div>

            <div class="preview-body">
              {#if previewDescription}
                <p class="preview-desc">{previewDescription}</p>
              {/if}

              {#if profileAmenities.length > 0}
                <div class="preview-amenities">
                  {#each profileAmenities as aid}
                    {@const am = AMENITIES.find(x => x.id === aid)}
                    {#if am}<span class="preview-amenity-chip">{am.label}</span>{/if}
                  {/each}
                </div>
              {/if}

              {#if galleryImages.length > 0}
                <div class="preview-block">
                  <p class="preview-block-title">Gallery</p>
                  <div class="preview-gallery">
                    {#each galleryImages.slice(0, 6) as url}
                      <div class="preview-gallery-item"><img src={url} alt="" /></div>
                    {/each}
                  </div>
                </div>
              {/if}

              {#if previewPricing}
                <div class="preview-block">
                  <p class="preview-block-title">Pricing</p>
                  <p class="preview-block-text">{previewPricing}</p>
                </div>
              {/if}

              {#if previewPhone || previewEmail || previewWebsite}
                <div class="preview-block">
                  <p class="preview-block-title">Contact</p>
                  <div class="preview-contact-list">
                    {#if previewPhone}<span>{previewPhone}</span>{/if}
                    {#if previewEmail}<span>{previewEmail}</span>{/if}
                    {#if previewWebsite}<span>{previewWebsite}</span>{/if}
                  </div>
                </div>
              {/if}

              {#if Object.keys(profileHours).length > 0}
                <div class="preview-block">
                  <p class="preview-block-title">Opening hours</p>
                  <div class="preview-hours">
                    {#each DAYS as day}
                      {@const dh = getDayHours(day.id)}
                      <div class="preview-hours-row">
                        <span class="preview-hours-day">{day.label.slice(0,3)}</span>
                        {#if dh.open}
                          <span class="preview-hours-time">{dh.from} – {dh.to}</span>
                        {:else}
                          <span class="preview-hours-closed">Closed</span>
                        {/if}
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}

              {#if !previewDescription && profileAmenities.length === 0 && !previewPricing && !previewPhone && !previewEmail}
                <p class="preview-empty">Fill in the form to see the preview here.</p>
              {/if}
            </div>
          </div>
        </div>
      </div>

    </div><!-- /profile-editor-wrap -->
  </div><!-- /profile-card -->

  <!-- ─── Activity row: Upcoming + Blocked side by side ──────────────────────── -->
  <div class="dual-col">

    <div class="card">
      <div class="card-header">
        <h2 class="card-title">Upcoming reservations</h2>
        {#if upcomingReservations.length > 0}
          <span class="card-count">{upcomingReservations.length}</span>
        {/if}
      </div>
      {#if upcomingReservations.length === 0}
        <div class="list-empty">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <span>No upcoming reservations</span>
        </div>
      {:else}
        <div class="res-list">
          {#each upcomingReservations.slice(0, 8) as r}
            <a href="/app/reservation/{r.id}" class="res-row">
              <span class="res-date">{shortDate(r.event_date)}</span>
              <span class="res-title">{r.title}</span>
              <svg class="res-arrow" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
            </a>
          {/each}
          {#if upcomingReservations.length > 8}
            <div class="res-more">+{upcomingReservations.length - 8} more upcoming</div>
          {/if}
        </div>
      {/if}
    </div>

    <div class="card">
      <div class="card-header">
        <h2 class="card-title">Blocked dates</h2>
        <button class="btn-accent-sm" type="button" onclick={openBlockDialog}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add block
        </button>
      </div>
      {#if form?.blockSuccess}
        <div class="alert alert-success" style="margin:0 18px 10px">Block created.</div>
      {/if}
      {#if form?.blockError}
        <div class="alert alert-error" style="margin:0 18px 10px">{form.blockError}</div>
      {/if}
      {#if data.blocks.length === 0}
        <div class="list-empty">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
          <span>No blocked periods — guests can book any date</span>
        </div>
      {:else}
        <div class="blocks-list">
          {#each data.blocks as b}
            <div class="block-row">
              <div class="block-icon-wrap">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="9" y1="16" x2="15" y2="16"/></svg>
              </div>
              <div class="block-info">
                <span class="block-dates">
                  {#if b.block_type === 'date_range'}
                    {formatDate(b.date_from)} – {formatDate(b.date_to)}
                  {:else}
                    Weekly: {(b.days_of_week ?? []).map((d: number) => DAYS_SK[d]).join(', ')}
                  {/if}
                </span>
                {#if b.reason}<span class="block-reason">{b.reason}</span>{/if}
              </div>
              <form method="POST" action="?/deleteBlock" use:enhance style="margin-left:auto;flex-shrink:0">
                <input type="hidden" name="id" value={b.id} />
                <button class="btn-del" type="submit"
                  onclick={(e) => { if (!confirm('Remove this block?')) e.preventDefault(); }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                </button>
              </form>
            </div>
          {/each}
        </div>
      {/if}
    </div>

  </div><!-- /dual-col -->

  <!-- ─── Settings + Floorplan row ─────────────────────────────────────────── -->
  <div class="settings-row">

    <div class="card settings-card">
      <form
        method="POST"
        action="?/saveInfo"
        use:enhance={() => async ({ result, update }) => {
          if (result.type === 'success') {
            settingsSaved = true;
            setTimeout(() => settingsSaved = false, 2500);
          } else {
            await update({ reset: false });
          }
        }}
      >
        <input type="hidden" name="name"        value={previewName} />
        <input type="hidden" name="maxPeople"   value={previewMaxPeople} />
        <input type="hidden" name="color"       value={previewColor} />
        <input type="hidden" name="description" value={previewDescription} />
        <input type="hidden" name="address"     value={previewAddress} />

        <div class="settings-header">
          <h2 class="card-title">Booking settings</h2>
          <div class="settings-header-right">
            {#if settingsSaved}
              <span class="saved-badge" transition:slide={{ axis: 'x', duration: 180 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                Saved
              </span>
            {/if}
            <button type="submit" class="btn-save">Save settings</button>
          </div>
        </div>

        <div class="settings-cols">
          <div class="settings-toggles">
            <label class="toggle-item">
              <div class="toggle-text">
                <span class="toggle-title">{t.halls.allowReservations}</span>
                <span class="toggle-hint">{t.halls.allowReservationsHint}</span>
              </div>
              <div class="toggle-switch">
                <input type="checkbox" name="allowReservations" checked={data.hall.allow_reservations} />
                <span class="toggle-slider"></span>
              </div>
            </label>
            <label class="toggle-item">
              <div class="toggle-text">
                <span class="toggle-title">{t.halls.customLayouts}</span>
                <span class="toggle-hint">{t.halls.customLayoutsHint}</span>
              </div>
              <div class="toggle-switch">
                <input type="checkbox" name="customLayouts" checked={data.hall.custom_layouts} />
                <span class="toggle-slider"></span>
              </div>
            </label>
            <label class="toggle-item">
              <div class="toggle-text">
                <span class="toggle-title">{t.halls.forceLayouts}</span>
                <span class="toggle-hint">{t.halls.forceLayoutsHint}</span>
              </div>
              <div class="toggle-switch">
                <input type="checkbox" name="forceLayouts" checked={data.hall.force_layouts} />
                <span class="toggle-slider"></span>
              </div>
            </label>
            <label class="toggle-item">
              <div class="toggle-text">
                <span class="toggle-title">{t.halls.allowFeedback}</span>
                <span class="toggle-hint">{t.halls.allowFeedbackHint}</span>
              </div>
              <div class="toggle-switch">
                <input type="checkbox" name="allowFeedback" checked={data.hall.allow_feedback} />
                <span class="toggle-slider"></span>
              </div>
            </label>
            <label class="toggle-item" style="border-bottom:none">
              <div class="toggle-text">
                <span class="toggle-title">{t.halls.autoApprove}</span>
                <span class="toggle-hint">{t.halls.autoApproveHint}</span>
              </div>
              <div class="toggle-switch">
                <input type="checkbox" name="autoApprove" checked={data.hall.auto_approve} />
                <span class="toggle-slider"></span>
              </div>
            </label>
          </div>

          <div class="settings-fields">
            <div class="field-row">
              <div class="field field-grow">
                <label class="field-label" for="sf-min-adv">{t.halls.minDaysAdvance}</label>
                <input class="field-input" id="sf-min-adv" name="minDaysAdvance" type="number"
                  min="0" max="365" value={data.hall.min_days_advance} />
              </div>
              <div class="field field-grow">
                <label class="field-label" for="sf-min-can">{t.halls.minCancelDays}</label>
                <input class="field-input" id="sf-min-can" name="minCancelDays" type="number"
                  min="0" max="365" value={data.hall.min_cancel_days} />
              </div>
            </div>
            <div class="field">
              <label class="field-label" for="sf-pre">{t.halls.preReservationText}</label>
              <textarea class="field-input field-textarea" id="sf-pre" name="preReservationText"
                rows="4" placeholder={t.halls.preReservationTextPlaceholder}
              >{data.hall.pre_reservation_text ?? ''}</textarea>
              <span class="field-hint">{t.halls.preReservationTextHint}</span>
            </div>
          </div>
        </div>
      </form>
    </div>

    <div class="card fp-card">
      <div class="card-header">
        <h2 class="card-title">Floorplan</h2>
        <span class="chip" class:chip-success={!!data.hall.floorplan_json} class:chip-muted={!data.hall.floorplan_json}>
          {data.hall.floorplan_json ? 'Set' : 'Not set'}
        </span>
      </div>
      {#if data.hall.floorplan_json}
        {@const mfState = migrateToMultiFloor(data.hall.floorplan_json)}
        {@const floor0  = mfState.floors[0]}
        <div class="fp-preview">
          <svg viewBox={computeViewBox(floor0)} preserveAspectRatio="xMidYMid meet">
            {#each floor0.walls as wall}
              <polygon points={wall.points.map(p => `${p.x*10},${p.y*10}`).join(' ')} fill="#2b3462" opacity="0.8"/>
            {/each}
            {#each floor0.zones as zone}
              <polygon points={zone.points.map(p => `${p.x*10},${p.y*10}`).join(' ')} fill={zone.color ?? '#3b82f6'} opacity="0.18"/>
            {/each}
            {#each floor0.tables as tbl}
              {#if tbl.shape === 'round'}
                <circle cx={tbl.x*10} cy={tbl.y*10} r={(tbl.radius??1)*10*0.8} fill="#92400e" opacity="0.75"/>
              {:else}
                <rect x={(tbl.x-(tbl.width??2)/2)*10} y={(tbl.y-(tbl.height??1)/2)*10}
                  width={(tbl.width??2)*10} height={(tbl.height??1)*10} rx="2" fill="#92400e" opacity="0.75"/>
              {/if}
            {/each}
          </svg>
          {#if mfState.floors.length > 1}
            <span class="fp-floors-badge">{mfState.floors.length} floors</span>
          {/if}
        </div>
      {:else}
        <div class="fp-empty">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
          <p>No floorplan drawn yet.</p>
        </div>
      {/if}
      <div class="fp-footer">
        <a href="/app/manage/halls/{data.hall.id}/editor" class="btn-primary btn-full">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Open Editor
        </a>
      </div>
    </div>

  </div><!-- /settings-row -->

  <!-- ─── Templates (collapsible) ──────────────────────────────────────────── -->
  <div class="card section-card">
    <button class="section-trigger" type="button" onclick={() => templatesOpen = !templatesOpen}>
      <div class="section-trigger-left">
        <h2 class="card-title">Templates</h2>
        {#if data.templates.length > 0}<span class="card-count">{data.templates.length}</span>{/if}
      </div>
      <svg class="chevron" class:open={templatesOpen} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
    </button>
    {#if templatesOpen}
      <div class="section-body" transition:slide={{ duration: 180 }}>
        {#if data.templates.length === 0}
          <div class="list-empty" style="padding:20px 18px">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
            <span>No templates yet. Save one from the floorplan editor.</span>
          </div>
        {:else}
          <div class="templates-grid">
            {#each data.templates as tmpl}
              {@const tmplFloor = migrateToMultiFloor(tmpl.layout_json).floors[0]}
              <div class="template-card">
                <div class="template-preview">
                  <svg viewBox={computeViewBox(tmplFloor)} preserveAspectRatio="xMidYMid meet">
                    {#each tmplFloor.tables as tbl}
                      {#if tbl.shape === 'round'}
                        <circle cx={tbl.x*10} cy={tbl.y*10} r={(tbl.radius??1)*10*0.8} fill="#92400e" opacity="0.75"/>
                      {:else}
                        <rect x={(tbl.x-(tbl.width??2)/2)*10} y={(tbl.y-(tbl.height??1)/2)*10}
                          width={(tbl.width??2)*10} height={(tbl.height??1)*10} rx="2" fill="#92400e" opacity="0.75"/>
                      {/if}
                    {/each}
                  </svg>
                </div>
                <div class="template-meta">
                  <span class="template-name">{tmpl.name}</span>
                  {#if tmpl.event_type}
                    <span class="template-type">{EVENT_TYPES_MAP[tmpl.event_type] ?? tmpl.event_type}</span>
                  {/if}
                </div>
                <form method="POST" action="?/deleteTemplate" use:enhance class="template-del">
                  <input type="hidden" name="id" value={tmpl.id} />
                  <button class="btn-del" type="submit"
                    onclick={(e) => { if (!confirm('Delete this template?')) e.preventDefault(); }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                  </button>
                </form>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- ─── Table Types (collapsible) ──────────────────────────────────────────── -->
  <div class="card section-card">
    <button class="section-trigger" type="button" onclick={() => tableTypesOpen = !tableTypesOpen}>
      <div class="section-trigger-left">
        <h2 class="card-title">Table Types</h2>
        {#if data.tableTypes.length > 0}<span class="card-count">{data.tableTypes.length}</span>{/if}
      </div>
      <svg class="chevron" class:open={tableTypesOpen} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
    </button>
    {#if tableTypesOpen}
      <div class="section-body" transition:slide={{ duration: 180 }}>
        {#if form?.tableTypeSuccess}
          <div class="alert alert-success" style="margin:12px 18px 0">Table type added.</div>
        {/if}
        {#if form?.tableTypeError}
          <div class="alert alert-error" style="margin:12px 18px 0">{form.tableTypeError}</div>
        {/if}
        <div class="tt-layout">
          <div class="tt-form-col">
            <p class="col-label">Add new type</p>
            <form method="POST" action="?/addTableType" use:enhance class="tt-form">
              <div class="field">
                <label class="field-label" for="tt-name">Name</label>
                <input class="field-input" id="tt-name" name="name" type="text" placeholder="e.g. Round 8" required />
              </div>
              <div class="field">
                <label class="field-label">Shape</label>
                <div class="shape-toggle">
                  <button type="button" class="shape-btn" class:active={tableShape==='rect'} onclick={() => tableShape='rect'}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="6" width="18" height="12" rx="2"/></svg>
                    Rect
                  </button>
                  <button type="button" class="shape-btn" class:active={tableShape==='round'} onclick={() => tableShape='round'}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/></svg>
                    Round
                  </button>
                </div>
                <input type="hidden" name="shape" value={tableShape} />
              </div>
              {#if tableShape === 'rect'}
                <div class="field-row">
                  <div class="field field-grow">
                    <label class="field-label" for="tt-w">Width (m)</label>
                    <input class="field-input" id="tt-w" name="width" type="number" min="0.5" max="10" step="0.1" value="2" />
                  </div>
                  <div class="field field-grow">
                    <label class="field-label" for="tt-h">Height (m)</label>
                    <input class="field-input" id="tt-h" name="height" type="number" min="0.5" max="10" step="0.1" value="1" />
                  </div>
                </div>
              {:else}
                <div class="field">
                  <label class="field-label" for="tt-r">Radius (m)</label>
                  <input class="field-input" id="tt-r" name="radius" type="number" min="0.3" max="5" step="0.1" value="1" />
                </div>
              {/if}
              <div class="field-row">
                <div class="field field-grow">
                  <label class="field-label" for="tt-chairs">Max chairs</label>
                  <input class="field-input" id="tt-chairs" name="maxChairs" type="number" min="1" max="30" value="8" />
                </div>
                <div class="field field-grow">
                  <label class="field-label" for="tt-amount">Amount <span class="field-hint-inline">(0=∞)</span></label>
                  <input class="field-input" id="tt-amount" name="amount" type="number" min="0" max="200" value="0" />
                </div>
              </div>
              <button type="submit" class="btn-save">Add type</button>
            </form>
          </div>
          <div class="tt-list-col">
            <p class="col-label">Configured types</p>
            {#if data.tableTypes.length === 0}
              <div class="list-empty" style="padding:0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
                <span>No types yet</span>
              </div>
            {:else}
              <div class="tt-list">
                {#each data.tableTypes as tt}
                  <div class="tt-row">
                    <div class="tt-shape-icon">
                      {#if tt.shape === 'round'}
                        <svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="11" fill="#92400e" opacity="0.8"/></svg>
                      {:else}
                        <svg viewBox="0 0 32 32"><rect x="3" y="9" width="26" height="14" rx="2" fill="#92400e" opacity="0.8"/></svg>
                      {/if}
                    </div>
                    <div class="tt-info">
                      <span class="tt-name">{tt.name}</span>
                      <span class="tt-meta">
                        {tt.shape === 'round' ? `Round · r${tt.radius}m` : `Rect · ${tt.width}×${tt.height}m`}
                        · {tt.max_chairs} chairs{tt.amount > 0 ? ` · ×${tt.amount}` : ''}
                      </span>
                    </div>
                    <form method="POST" action="?/deleteTableType" use:enhance>
                      <input type="hidden" name="id" value={tt.id} />
                      <button class="btn-del" type="submit"
                        onclick={(e) => { if (!confirm('Delete this table type?')) e.preventDefault(); }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                      </button>
                    </form>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      </div>
    {/if}
  </div>

</div><!-- /page -->

<!-- ─── Block dialog ──────────────────────────────────────────────────────────── -->
{#if showBlockDialog}
  <div class="dialog-backdrop" onclick={() => showBlockDialog=false} role="presentation">
    <div class="dialog" onclick={(e) => e.stopPropagation()} role="dialog">
      <div class="dialog-header">
        <h2 class="dialog-title">Add Date Block</h2>
        <button class="dialog-close" type="button" onclick={() => showBlockDialog=false}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div class="steps-bar">
        {#each [1,2,3] as s}
          <div class="step" class:active={blockStep===s} class:done={blockStep>s}><span class="step-num">{s}</span></div>
          {#if s < 3}<div class="step-line" class:done={blockStep>s}></div>{/if}
        {/each}
      </div>

      <div class="dialog-body">
        {#if blockStep === 1}
          <p class="step-label">Select date range</p>
          <DateRangePicker onchange={onRangeChange} startDate={rangeFrom} endDate={rangeTo} eventDates={eventDateStrings} />
        {:else if blockStep === 2}
          <p class="step-label">Which days within the range to block?</p>
          <div class="days-grid">
            {#each DAYS_FULL as day, i}
              <div class="day-col">
                <span class="day-name">{day}</span>
                <button type="button" class="day-check" class:checked={blockDays.includes(i)} onclick={() => toggleBlockDay(i)}>
                  {#if blockDays.includes(i)}
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                  {/if}
                </button>
              </div>
            {/each}
          </div>
        {:else}
          <p class="step-label">Reason <span class="step-optional">(optional)</span></p>
          <input class="field-input" type="text" bind:value={blockReason} placeholder="e.g. Renovation, Private event…" />
          <p class="step-hint">Visible to admins only.</p>
        {/if}
      </div>

      {#if rangeFrom && rangeTo}
        <div class="dialog-range-bar">
          <span>{formatDate(rangeFrom)} – {formatDate(rangeTo)}</span>
          <span class="range-pill">{daysBetween(rangeFrom, rangeTo)} day{daysBetween(rangeFrom, rangeTo)===1?'':'s'}</span>
        </div>
      {/if}

      {#if conflictingEvents.length > 0 && rangeFrom && rangeTo}
        <div class="conflict-box">
          <div class="conflict-title">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            {conflictingEvents.length} reservation{conflictingEvents.length>1?'s':''} in this range
          </div>
          <ul class="conflict-list">{#each conflictingEvents as ev}<li>{ev.title} — {formatDate(ev.event_date)}</li>{/each}</ul>
          <button type="button" class="btn-ghost-sm" onclick={() => showCancelConfirm=true}>Cancel these reservations</button>
        </div>
      {/if}

      <div class="dialog-footer">
        <button type="button" class="btn-ghost" onclick={() => showBlockDialog=false}>Cancel</button>
        <div class="dfr">
          {#if blockStep > 1}
            <button type="button" class="btn-ghost" onclick={() => blockStep--}>Back</button>
          {/if}
          {#if blockStep < 3}
            <button type="button" class="btn-save" onclick={() => blockStep++}
              disabled={blockStep===1 && (!rangeFrom || !rangeTo)}>Next</button>
          {:else}
            <form method="POST" action="?/addBlock"
              use:enhance={() => async ({ result, update }) => {
                await update();
                if (result.type === 'success') showBlockDialog = false;
              }}>
              <input type="hidden" name="blockType" value="date_range" />
              <input type="hidden" name="dateFrom"  value={rangeFrom} />
              <input type="hidden" name="dateTo"    value={rangeTo} />
              <input type="hidden" name="reason"    value={blockReason} />
              {#each blockDays as d}<input type="hidden" name="days" value={d} />{/each}
              <button type="submit" class="btn-save">Create block</button>
            </form>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- ─── Cancel confirm dialog ─────────────────────────────────────────────────── -->
{#if showCancelConfirm}
  <div class="dialog-backdrop" onclick={() => showCancelConfirm=false} role="presentation">
    <div class="dialog dialog-sm" onclick={(e) => e.stopPropagation()} role="dialog">
      <div class="dialog-header">
        <h2 class="dialog-title">Cancel reservations?</h2>
        <button class="dialog-close" type="button" onclick={() => showCancelConfirm=false}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="dialog-body">
        <p class="confirm-text">This will permanently cancel the following reservations:</p>
        <ul class="conflict-list">{#each conflictingEvents as ev}<li>{ev.title} — {formatDate(ev.event_date)}</li>{/each}</ul>
      </div>
      <div class="dialog-footer">
        <button type="button" class="btn-ghost" onclick={() => showCancelConfirm=false}>Go back</button>
        <form method="POST" action="?/cancelEvents"
          use:enhance={() => async ({ result, update }) => {
            await update();
            if (result.type === 'success') showCancelConfirm = false;
          }}>
          <input type="hidden" name="ids" value={conflictingEvents.map(e => e.id).join(',')} />
          <button type="submit" class="btn-destructive">Cancel reservations</button>
        </form>
      </div>
    </div>
  </div>
{/if}

<style>
  @keyframes pageFadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes fadeSlideUp {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .page { padding: 24px 28px; animation: pageFadeIn 0.15s ease both; }

  /* ── Breadcrumb ── */
  .breadcrumb {
    display: flex; align-items: center; gap: 5px; margin-bottom: 16px;
    font-size: 12px; color: var(--text-subtle);
    animation: fadeSlideUp 0.3s ease both;
  }
  .breadcrumb a { color: var(--text-subtle); text-decoration: none; transition: color .1s; }
  .breadcrumb a:hover { color: var(--accent); }
  .breadcrumb svg { opacity: .5; flex-shrink: 0; }

  /* ── Shared card shell ── */
  .card {
    background: var(--bg-panel); border: 1px solid var(--border); border-radius: 12px;
    overflow: hidden;
  }
  .card-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 15px 18px 12px; gap: 8px;
  }
  .card-title { font-size: 13px; font-weight: 700; color: var(--text-base); }
  .card-count {
    font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 99px;
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    color: var(--accent);
  }

  /* ── Profile card (top) ── */
  .profile-card {
    margin-bottom: 16px;
    animation: fadeSlideUp 0.35s ease both; animation-delay: 40ms;
  }

  .profile-card-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 20px 24px 16px; gap: 20px;
    border-bottom: 1px solid var(--border);
  }
  .profile-head-left { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
  .profile-head-right { flex-shrink: 0; }

  .hall-name {
    font-size: 20px; font-weight: 800; color: var(--text-base);
    letter-spacing: -.025em; margin: 0;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .identity-chips { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }

  /* KPI trio */
  .kpi-trio {
    display: flex; border: 1px solid var(--border); border-radius: 10px; overflow: hidden;
  }
  .kpi-item {
    display: flex; flex-direction: column; align-items: center;
    padding: 10px 16px; background: var(--bg-panel2, var(--bg-base));
    min-width: 72px;
  }
  .kpi-item + .kpi-item { border-left: 1px solid var(--border); }
  .kpi-val { font-size: 18px; font-weight: 800; color: var(--text-base); line-height: 1; }
  .kpi-lbl {
    font-size: 9px; font-weight: 600; text-transform: uppercase;
    letter-spacing: .05em; color: var(--text-subtle); margin-top: 4px; white-space: nowrap;
  }

  /* ── Chips ── */
  .chip {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 11px; font-weight: 600; border-radius: 99px; padding: 3px 9px; white-space: nowrap;
  }
  .chip-success { background: color-mix(in srgb, var(--success) 12%, transparent); color: var(--success); }
  .chip-closed  { background: color-mix(in srgb, var(--danger,#ef4444) 10%, transparent); color: var(--danger,#ef4444); }
  .chip-muted   { background: var(--bg-panel2, var(--bg-base)); color: var(--text-subtle); border: 1px solid var(--border); }
  .chip-neutral { background: var(--bg-panel2, var(--bg-base)); color: var(--text-muted); border: 1px solid var(--border); }
  .chip-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; display: inline-block; }

  /* ── Activity row ── */
  .dual-col {
    display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;
    animation: fadeSlideUp 0.35s ease both; animation-delay: 80ms;
  }

  /* ── Settings + floorplan row ── */
  .settings-row {
    display: grid; grid-template-columns: 1fr 220px; gap: 16px; margin-bottom: 16px;
    align-items: start;
    animation: fadeSlideUp 0.35s ease both; animation-delay: 100ms;
  }

  .settings-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 15px 18px 0; gap: 10px;
  }
  .settings-header-right { display: flex; align-items: center; gap: 10px; }
  .settings-cols {
    display: grid; grid-template-columns: 1fr 1fr;
    border-top: 1px solid var(--border); margin-top: 12px;
  }
  .settings-toggles { padding: 4px 18px 16px; border-right: 1px solid var(--border); }
  .settings-fields  { padding: 16px 18px; display: flex; flex-direction: column; gap: 12px; }

  /* ── List empty state ── */
  .list-empty {
    display: flex; align-items: center; gap: 8px;
    padding: 18px 18px; font-size: 12px; color: var(--text-subtle);
    border-top: 1px solid var(--border);
  }

  /* ── Reservations list ── */
  .res-list { border-top: 1px solid var(--border); }
  .res-row {
    display: flex; align-items: center; gap: 12px;
    padding: 10px 18px; text-decoration: none; color: var(--text-base);
    border-bottom: 1px solid var(--border-subtle, var(--border));
    transition: background .1s;
  }
  .res-row:last-child { border-bottom: none; }
  .res-row:hover { background: var(--bg-hover); }
  .res-date { font-size: 12px; font-weight: 700; color: var(--accent); width: 60px; flex-shrink: 0; }
  .res-title { flex: 1; font-size: 13px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .res-arrow { color: var(--text-subtle); flex-shrink: 0; opacity: .5; transition: opacity .1s; }
  .res-row:hover .res-arrow { opacity: 1; }
  .res-more { padding: 8px 18px; font-size: 11px; color: var(--text-subtle); border-top: 1px solid var(--border); }

  /* ── Blocks list ── */
  .blocks-list { border-top: 1px solid var(--border); }
  .block-row {
    display: flex; align-items: center; gap: 12px;
    padding: 11px 18px; border-bottom: 1px solid var(--border-subtle, var(--border));
  }
  .block-row:last-child { border-bottom: none; }
  .block-icon-wrap { color: var(--text-subtle); flex-shrink: 0; }
  .block-info { flex: 1; min-width: 0; }
  .block-dates { display: block; font-size: 13px; font-weight: 500; }
  .block-reason { display: block; font-size: 11px; color: var(--text-muted); margin-top: 1px; }

  /* ── Toggles ── */
  .toggle-item {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 0; border-bottom: 1px solid var(--border); cursor: pointer; gap: 12px;
  }
  .toggle-item:last-child { border-bottom: none; }
  .toggle-text { flex: 1; min-width: 0; }
  .toggle-title { display: block; font-size: 12px; font-weight: 600; color: var(--text-base); }
  .toggle-hint  { display: block; font-size: 11px; color: var(--text-muted); margin-top: 1px; line-height: 1.35; }
  .toggle-switch { position: relative; width: 36px; height: 20px; flex-shrink: 0; }
  .toggle-switch input { opacity: 0; width: 0; height: 0; position: absolute; }
  .toggle-slider {
    position: absolute; inset: 0; background: var(--border); border-radius: 10px; transition: background .18s;
  }
  .toggle-slider::after {
    content: ''; position: absolute; width: 14px; height: 14px;
    left: 3px; top: 3px; background: #fff; border-radius: 50%;
    transition: transform .18s; box-shadow: 0 1px 3px rgba(0,0,0,.15);
  }
  .toggle-switch input:checked + .toggle-slider { background: var(--accent); }
  .toggle-switch input:checked + .toggle-slider::after { transform: translateX(16px); }

  .saved-badge {
    display: flex; align-items: center; gap: 5px;
    font-size: 11px; font-weight: 600; color: var(--success);
  }

  /* ── Floorplan card ── */
  .fp-preview {
    position: relative; height: 160px; overflow: hidden;
    background: var(--bg-panel2, var(--bg-base));
    border-top: 1px solid var(--border);
  }
  .fp-preview svg { width: 100%; height: 100%; }
  .fp-floors-badge {
    position: absolute; bottom: 8px; right: 8px;
    font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 99px;
    background: var(--bg-panel); border: 1px solid var(--border); color: var(--text-muted);
  }
  .fp-empty {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 8px; height: 120px; color: var(--text-subtle);
    border-top: 1px solid var(--border);
  }
  .fp-empty p { font-size: 12px; color: var(--text-muted); margin: 0; }
  .fp-footer { padding: 14px 18px; border-top: 1px solid var(--border); }

  /* ── Field shared ── */
  .field { display: flex; flex-direction: column; gap: 4px; }
  .field-row { display: flex; gap: 10px; align-items: flex-end; }
  .field-grow { flex: 1; min-width: 0; }
  .field-label {
    font-size: 10px; font-weight: 700; text-transform: uppercase;
    letter-spacing: .05em; color: var(--text-subtle);
  }
  .field-hint        { font-size: 11px; color: var(--text-subtle); }
  .field-hint-inline { text-transform: none; font-weight: 400; letter-spacing: 0; font-size: 10px; }
  .field-input {
    padding: 7px 10px; border: 1px solid var(--border); border-radius: 7px;
    background: var(--bg-panel2, var(--bg-base)); font-size: 13px;
    color: var(--text-base); font-family: inherit; outline: none; transition: border-color .12s;
  }
  .field-input:focus { border-color: var(--accent); }
  .field-textarea { resize: vertical; }
  .edit-row { display: flex; gap: 12px; align-items: flex-end; }

  .color-swatch {
    width: 36px; height: 36px; border-radius: 8px; border: 2px solid var(--border);
    cursor: pointer; display: block; position: relative; overflow: hidden;
    transition: border-color .12s;
  }
  .color-swatch:hover { border-color: var(--accent); }
  .color-swatch input[type="color"] {
    position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%;
  }

  /* ── Buttons ── */
  .btn-primary {
    display: inline-flex; align-items: center; gap: 7px;
    padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600;
    background: var(--accent); color: #fff; border: none; cursor: pointer;
    font-family: inherit; text-decoration: none; transition: opacity .12s; white-space: nowrap;
  }
  .btn-primary:hover { opacity: .88; }
  .btn-full { width: 100%; justify-content: center; box-sizing: border-box; }

  .btn-save {
    padding: 7px 16px; border-radius: 7px; font-size: 12px; font-weight: 600;
    background: var(--accent); color: #fff; border: none; cursor: pointer;
    font-family: inherit; transition: opacity .12s;
  }
  .btn-save:hover { opacity: .88; }
  .btn-save:disabled { opacity: .4; cursor: default; }

  .btn-ghost {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 7px 14px; border-radius: 7px; font-size: 12px; font-weight: 500;
    background: none; border: 1px solid var(--border); color: var(--text-muted);
    cursor: pointer; font-family: inherit; transition: border-color .1s, color .1s;
    text-decoration: none;
  }
  .btn-ghost:hover { border-color: var(--accent); color: var(--text-base); }

  .btn-ghost-sm {
    padding: 4px 10px; border-radius: 5px; font-size: 11px; font-weight: 500;
    background: none; border: 1px solid var(--border); color: var(--text-muted);
    cursor: pointer; font-family: inherit;
  }

  .btn-accent-sm {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 4px 11px; border-radius: 6px; font-size: 11px; font-weight: 600;
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    color: var(--accent); border: 1px solid color-mix(in srgb, var(--accent) 22%, transparent);
    cursor: pointer; font-family: inherit; transition: background .1s;
  }
  .btn-accent-sm:hover { background: color-mix(in srgb, var(--accent) 18%, transparent); }

  .btn-del {
    width: 30px; height: 30px; border-radius: 6px; border: 1px solid var(--border);
    background: var(--bg-panel); color: var(--text-subtle); cursor: pointer;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    transition: color .1s, border-color .1s, background .1s;
  }
  .btn-del:hover {
    color: var(--danger,#ef4444);
    border-color: color-mix(in srgb,var(--danger,#ef4444) 40%,transparent);
    background: color-mix(in srgb,var(--danger,#ef4444) 6%,transparent);
  }

  .btn-destructive {
    padding: 7px 16px; border-radius: 7px; font-size: 12px; font-weight: 600;
    background: var(--danger,#ef4444); color: #fff; border: none;
    cursor: pointer; font-family: inherit; transition: opacity .1s;
  }
  .btn-destructive:hover { opacity: .85; }

  /* ── Alert ── */
  .alert { padding: 9px 13px; border-radius: 7px; font-size: 12px; }
  .alert-success {
    background: color-mix(in srgb,var(--success) 10%,transparent);
    border: 1px solid color-mix(in srgb,var(--success) 25%,transparent);
    color: var(--success);
  }
  .alert-error {
    background: color-mix(in srgb,var(--danger,#ef4444) 10%,transparent);
    border: 1px solid color-mix(in srgb,var(--danger,#ef4444) 25%,transparent);
    color: var(--danger,#ef4444);
  }

  /* ── Collapsible sections ── */
  .section-card { margin-bottom: 16px; animation: fadeSlideUp 0.35s ease both; }
  .section-card:nth-child(1) { animation-delay: 120ms; }
  .section-card:nth-child(2) { animation-delay: 160ms; }

  .section-trigger {
    width: 100%; display: flex; align-items: center; justify-content: space-between;
    padding: 15px 18px; background: none; border: none; cursor: pointer; font-family: inherit;
    text-align: left;
  }
  .section-trigger:hover { background: var(--bg-hover); }
  .section-trigger-left { display: flex; align-items: center; gap: 8px; }
  .chevron { color: var(--text-subtle); transition: transform .2s; flex-shrink: 0; }
  .chevron.open { transform: rotate(90deg); }
  .section-body { border-top: 1px solid var(--border); overflow: hidden; }

  /* ── Templates grid ── */
  .templates-grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 12px; padding: 14px 18px 18px;
  }
  .template-card {
    background: var(--bg-panel2, var(--bg-base)); border: 1px solid var(--border);
    border-radius: 10px; overflow: hidden; display: flex; flex-direction: column;
    transition: border-color .12s;
  }
  .template-card:hover { border-color: color-mix(in srgb,var(--accent) 40%,var(--border)); }
  .template-preview { aspect-ratio: 1.5; border-bottom: 1px solid var(--border); overflow: hidden; }
  .template-preview svg { width: 100%; height: 100%; }
  .template-meta { padding: 9px 12px; flex: 1; display: flex; flex-direction: column; gap: 3px; }
  .template-name { font-size: 12px; font-weight: 600; color: var(--text-base); }
  .template-type { font-size: 10px; font-weight: 700; color: var(--accent); text-transform: uppercase; letter-spacing: .04em; }
  .template-del { padding: 0 12px 10px; display: flex; }

  /* ── Table types ── */
  .tt-layout {
    display: grid; grid-template-columns: 260px 1fr;
    border-top: 1px solid var(--border);
  }
  .tt-form-col { padding: 16px 18px; border-right: 1px solid var(--border); }
  .tt-list-col { padding: 16px 18px; }
  .col-label {
    font-size: 10px; font-weight: 700; text-transform: uppercase;
    letter-spacing: .06em; color: var(--text-subtle); margin: 0 0 12px;
  }
  .tt-form { display: flex; flex-direction: column; gap: 12px; }

  .shape-toggle { display: flex; gap: 6px; }
  .shape-btn {
    flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px;
    padding: 8px 6px; border-radius: 8px; font: inherit; font-size: 11px; font-weight: 600;
    border: 1.5px solid var(--border); background: var(--bg-panel2,var(--bg-base));
    color: var(--text-muted); cursor: pointer; transition: all .12s;
  }
  .shape-btn.active { background: color-mix(in srgb,var(--accent) 8%,transparent); color: var(--accent); border-color: var(--accent); }

  .tt-list { display: flex; flex-direction: column; gap: 8px; }
  .tt-row {
    display: flex; align-items: center; gap: 10px;
    padding: 9px 12px; border-radius: 8px;
    background: var(--bg-panel2,var(--bg-base)); border: 1px solid var(--border);
  }
  .tt-shape-icon { width: 32px; height: 32px; flex-shrink: 0; }
  .tt-shape-icon svg { width: 100%; height: 100%; }
  .tt-info { flex: 1; min-width: 0; }
  .tt-name { display: block; font-size: 12px; font-weight: 600; color: var(--text-base); }
  .tt-meta { display: block; font-size: 11px; color: var(--text-subtle); margin-top: 1px; }

  /* ── Dialog ── */
  .dialog-backdrop {
    position: fixed; inset: 0; background: rgba(0,0,0,.45);
    display: flex; align-items: center; justify-content: center; z-index: 100;
    backdrop-filter: blur(2px);
  }
  .dialog {
    background: var(--bg-panel); border: 1px solid var(--border); border-radius: 14px;
    width: 520px; max-height: 90vh; overflow-y: auto;
    box-shadow: 0 20px 60px rgba(0,0,0,.2);
  }
  .dialog-sm { width: 420px; }
  .dialog-header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 20px 24px 16px; border-bottom: 1px solid var(--border);
  }
  .dialog-title { font-size: 15px; font-weight: 700; color: var(--text-base); }
  .dialog-close {
    width: 28px; height: 28px; border-radius: 6px; border: none; background: none;
    color: var(--text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center;
    transition: background .1s;
  }
  .dialog-close:hover { background: var(--bg-hover); }

  .steps-bar { display: flex; align-items: center; justify-content: center; padding: 16px 40px 8px; }
  .step { display: flex; align-items: center; justify-content: center; }
  .step-num {
    width: 26px; height: 26px; border-radius: 50%;
    background: var(--bg-panel2,var(--bg-base)); border: 2px solid var(--border);
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 700; color: var(--text-subtle); transition: all .2s;
  }
  .step.active .step-num, .step.done .step-num { background: var(--accent); border-color: var(--accent); color: #fff; }
  .step-line { width: 52px; height: 2px; background: var(--border); transition: background .2s; }
  .step-line.done { background: var(--accent); }

  .dialog-body { padding: 16px 24px 24px; }
  .step-label { font-size: 13px; font-weight: 600; color: var(--text-base); margin: 0 0 12px; }
  .step-optional { font-size: 11px; font-weight: 400; color: var(--text-muted); }
  .step-hint { font-size: 12px; color: var(--text-muted); margin: 8px 0 0; }

  .days-grid { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; padding: 4px 0; }
  .day-col   { display: flex; flex-direction: column; align-items: center; gap: 5px; }
  .day-name  { font-size: 10px; font-weight: 600; color: var(--text-subtle); }
  .day-check {
    width: 28px; height: 28px; border-radius: 6px;
    border: 2px solid var(--border); background: var(--bg-panel2,var(--bg-base));
    cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all .12s;
  }
  .day-check.checked { background: var(--accent); border-color: var(--accent); }

  .dialog-range-bar {
    display: flex; align-items: center; justify-content: space-between;
    margin: 0 24px 4px; padding: 8px 12px;
    background: color-mix(in srgb,var(--accent) 7%,transparent);
    border: 1px solid color-mix(in srgb,var(--accent) 18%,transparent);
    border-radius: 7px; font-size: 12px; color: var(--text-base);
  }
  .range-pill {
    font-size: 11px; font-weight: 600; color: var(--accent); padding: 1px 8px; border-radius: 99px;
    background: color-mix(in srgb,var(--accent) 12%,transparent);
  }
  .conflict-box {
    margin: 6px 24px 0; padding: 10px 13px;
    background: color-mix(in srgb,var(--warning,#f59e0b) 7%,transparent);
    border: 1px solid color-mix(in srgb,var(--warning,#f59e0b) 22%,transparent);
    border-radius: 8px;
  }
  .conflict-title {
    display: flex; align-items: center; gap: 6px;
    font-size: 12px; font-weight: 600; color: var(--text-base); margin-bottom: 6px;
  }
  .conflict-title svg { color: var(--warning,#f59e0b); flex-shrink: 0; }
  .conflict-list { list-style: none; padding: 0; margin: 0 0 8px; }
  .conflict-list li { font-size: 12px; color: var(--text-muted); padding: 1px 0; }
  .confirm-text { font-size: 13px; color: var(--text-base); margin: 0 0 10px; }

  .dialog-footer {
    display: flex; justify-content: space-between; align-items: center;
    padding: 14px 24px 20px; border-top: 1px solid var(--border);
  }
  .dfr { display: flex; gap: 8px; align-items: center; }

  /* ── Profile editor two-column layout ── */
  .profile-form { display: flex; flex-direction: column; }
  .profile-section {
    padding: 16px 18px; border-bottom: 1px solid var(--border);
    display: flex; flex-direction: column; gap: 12px;
  }
  .profile-slug-row { display: flex; gap: 10px; align-items: flex-end; }
  .slug-wrap { display: flex; align-items: center; border: 1px solid var(--border); border-radius: 7px; overflow: hidden; }
  .slug-prefix {
    padding: 7px 10px; background: var(--bg-panel2, var(--bg-base));
    font-size: 12px; color: var(--text-subtle); border-right: 1px solid var(--border);
    white-space: nowrap; flex-shrink: 0;
  }
  .slug-input { border: none; border-radius: 0; flex: 1; }
  .slug-input:focus { outline: none; border: none; }

  .cover-upload-btn {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 7px 14px; border-radius: 7px; font-size: 12px; font-weight: 500;
    border: 1px dashed var(--border); background: var(--bg-panel2, var(--bg-base));
    color: var(--text-muted); cursor: pointer; transition: border-color .12s, color .12s;
  }
  .cover-upload-btn:hover { border-color: var(--accent); color: var(--accent); }
  .cover-upload-btn.uploading { opacity: .6; pointer-events: none; }

  .cover-row { display: flex; gap: 14px; align-items: flex-start; }
  .cover-thumb { width: 100px; height: 70px; border-radius: 8px; overflow: hidden; border: 1px solid var(--border); flex-shrink: 0; }
  .cover-thumb img { width: 100%; height: 100%; object-fit: cover; }

  /* ── Gallery ── */
  .gallery-header {
    display: flex; align-items: center; justify-content: space-between;
  }
  .gallery-count {
    font-size: 11px; font-weight: 600; color: var(--text-subtle);
    padding: 1px 8px; border-radius: 99px;
    background: var(--bg-panel2, var(--bg-base));
    border: 1px solid var(--border);
  }
  .gallery-count.at-limit { color: var(--warning, #f59e0b); border-color: color-mix(in srgb, var(--warning, #f59e0b) 30%, transparent); }

  .gallery-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }

  .gallery-item {
    position: relative;
    aspect-ratio: 4/3;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid var(--border);
    background: var(--bg-panel2, var(--bg-base));
  }
  .gallery-item img { width: 100%; height: 100%; object-fit: cover; display: block; }

  .gallery-remove {
    position: absolute; top: 5px; right: 5px;
    width: 22px; height: 22px; border-radius: 50%;
    background: rgba(0,0,0,.55); border: none; color: #fff;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    opacity: 0; transition: opacity .12s;
  }
  .gallery-item:hover .gallery-remove { opacity: 1; }

  .gallery-add-slot {
    aspect-ratio: 4/3;
    border-radius: 8px;
    border: 1.5px dashed var(--border);
    background: var(--bg-panel2, var(--bg-base));
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 5px; cursor: pointer; color: var(--text-subtle);
    transition: border-color .12s, color .12s;
  }
  .gallery-add-slot:hover { border-color: var(--accent); color: var(--accent); }
  .gallery-add-slot.uploading { opacity: .6; pointer-events: none; }
  .gallery-add-slot span { font-size: 11px; font-weight: 500; }

  .gallery-limit-banner {
    display: flex; align-items: center; gap: 7px;
    padding: 8px 12px; border-radius: 7px; font-size: 12px;
    background: color-mix(in srgb, var(--warning, #f59e0b) 8%, transparent);
    border: 1px solid color-mix(in srgb, var(--warning, #f59e0b) 22%, transparent);
    color: var(--text-muted);
  }
  .gallery-limit-banner svg { color: var(--warning, #f59e0b); flex-shrink: 0; }
  .gallery-upgrade-link {
    margin-left: auto; font-weight: 600; font-size: 12px;
    color: var(--accent); text-decoration: none;
  }
  .gallery-upgrade-link:hover { text-decoration: underline; }

  .amenities-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; }
  .amenity-item {
    display: flex; align-items: center; gap: 7px;
    padding: 7px 10px; border-radius: 7px; border: 1.5px solid var(--border);
    background: var(--bg-panel2, var(--bg-base)); cursor: pointer;
    transition: border-color .12s, background .12s;
  }
  .amenity-item:has(input:checked) {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 7%, transparent);
  }
  .amenity-item input { width: 14px; height: 14px; accent-color: var(--accent); flex-shrink: 0; }
  .amenity-label { font-size: 12px; font-weight: 500; color: var(--text-base); }

  .profile-fields-row { display: flex; gap: 12px; flex-wrap: wrap; }

  .hours-grid { display: flex; flex-direction: column; gap: 6px; }
  .hours-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; }
  .hours-day { width: 82px; font-size: 12px; font-weight: 500; color: var(--text-base); flex-shrink: 0; }
  .time-input { width: 96px; flex-shrink: 0; padding: 5px 8px; font-size: 12px; }
  .hours-sep { font-size: 12px; color: var(--text-muted); flex-shrink: 0; }
  .hours-closed { font-size: 12px; color: var(--text-subtle); flex-shrink: 0; }

  .profile-save-row {
    display: flex; align-items: center; justify-content: flex-end; gap: 10px;
    padding: 14px 18px; border-top: 1px solid var(--border);
  }

  /* ── Profile editor two-column layout ── */
  .profile-editor-wrap {
    display: grid;
    grid-template-columns: 1fr 320px;
    align-items: start;
    border-top: 1px solid var(--border);
  }
  .profile-preview-col {
    border-left: 1px solid var(--border);
    background: var(--bg-panel2, var(--bg-base));
  }
  .preview-sticky {
    position: sticky; top: 24px; padding: 16px;
    display: flex; flex-direction: column; gap: 12px;
  }

  .preview-label {
    display: flex; align-items: center; gap: 6px;
    font-size: 11px; font-weight: 700; text-transform: uppercase;
    letter-spacing: .06em; color: var(--text-subtle);
  }
  .preview-slug {
    font-size: 10px; font-weight: 500; text-transform: none; letter-spacing: 0;
    color: var(--accent); margin-left: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }

  .preview-card {
    border: 1px solid var(--border); border-radius: 10px;
    overflow: hidden; background: var(--bg-panel); font-size: 12px;
  }
  .preview-cover {
    position: relative; height: 120px; overflow: hidden;
    background-size: cover; background-position: center;
  }
  .preview-cover-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .preview-cover-overlay {
    position: absolute; inset: 0;
    background: linear-gradient(to top, rgba(0,0,0,.65) 0%, rgba(0,0,0,.1) 60%, transparent 100%);
    display: flex; flex-direction: column; justify-content: flex-end; padding: 10px 12px; gap: 4px;
  }
  .preview-status {
    font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em;
    color: rgba(255,255,255,.65); position: absolute; top: 8px; right: 10px;
  }
  .preview-status.pub { color: #4ade80; }
  .preview-hall-name { font-size: 14px; font-weight: 800; color: #fff; line-height: 1.15; margin: 0; text-shadow: 0 1px 4px rgba(0,0,0,.4); }
  .preview-meta-row { display: flex; gap: 6px; flex-wrap: wrap; }
  .preview-meta-chip {
    display: inline-flex; align-items: center; gap: 3px;
    font-size: 10px; font-weight: 500; color: rgba(255,255,255,.85);
    background: rgba(0,0,0,.25); padding: 2px 7px; border-radius: 99px; backdrop-filter: blur(4px);
  }

  .preview-body { padding: 12px; display: flex; flex-direction: column; gap: 10px; max-height: 400px; overflow-y: auto; }
  .preview-desc { font-size: 11px; color: var(--text-muted); line-height: 1.5; margin: 0; }
  .preview-amenities { display: flex; flex-wrap: wrap; gap: 4px; }
  .preview-amenity-chip {
    font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 99px;
    background: color-mix(in srgb, var(--accent) 9%, transparent); color: var(--accent);
    border: 1px solid color-mix(in srgb, var(--accent) 22%, transparent);
  }
  .preview-block { padding-top: 8px; border-top: 1px solid var(--border); }
  .preview-block-title {
    font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .07em;
    color: var(--text-subtle); margin: 0 0 4px;
  }
  .preview-block-text { font-size: 11px; color: var(--text-muted); line-height: 1.5; margin: 0; }
  .preview-contact-list { display: flex; flex-direction: column; gap: 2px; font-size: 11px; color: var(--text-muted); }
  .preview-gallery { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
  .preview-gallery-item { aspect-ratio: 4/3; border-radius: 4px; overflow: hidden; }
  .preview-gallery-item img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .preview-hours { display: flex; flex-direction: column; gap: 2px; }
  .preview-hours-row { display: flex; gap: 8px; font-size: 11px; }
  .preview-hours-day { width: 28px; font-weight: 600; color: var(--text-base); flex-shrink: 0; }
  .preview-hours-time { color: var(--text-muted); }
  .preview-hours-closed { color: var(--text-subtle); font-style: italic; }
  .preview-empty { font-size: 11px; color: var(--text-subtle); text-align: center; padding: 16px 0; margin: 0; }

  /* ── Responsive ── */
  @media (max-width: 900px) {
    .dual-col     { grid-template-columns: 1fr; }
    .settings-row { grid-template-columns: 1fr; }
    .settings-cols { grid-template-columns: 1fr; }
    .settings-toggles { border-right: none; border-bottom: 1px solid var(--border); }
    .profile-card-head { flex-direction: column; align-items: flex-start; gap: 12px; }
    .tt-layout { grid-template-columns: 1fr; }
    .tt-form-col { border-right: none; border-bottom: 1px solid var(--border); }
    .profile-editor-wrap { grid-template-columns: 1fr; }
    .profile-preview-col { border-left: none; border-top: 1px solid var(--border); }
    .preview-sticky { position: static; }
    .gallery-grid { grid-template-columns: repeat(3, 1fr); }
  }
</style>
