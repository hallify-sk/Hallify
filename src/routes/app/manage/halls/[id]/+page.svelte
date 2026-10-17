<script lang="ts">
  import { enhance } from '$app/forms';
  import { slide } from 'svelte/transition';
  import { t, getLocale } from '$lib/i18n.svelte';
  import VenueLocationPicker from '$lib/marketing/VenueLocationPicker.svelte';
  import { migrateToMultiFloor } from '$lib/floorplan-types';
  import type { FloorData } from '$lib/floorplan-types';
  import DateRangePicker from '$lib/components/DateRangePicker.svelte';
  import InfoHint from '$lib/components/InfoHint.svelte';
  import ImageUploadDialog from '$lib/components/ImageUploadDialog.svelte';
  import type { TableTypeRow, HallExtraRow } from '$lib/db/index';
  import { eur } from '$lib/extras';
  import { EVENT_TYPE_KEYS, parseEventTypes } from '$lib/eventTypes';
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

  const HALL_COLORS = ['#f05ca1','#2f7a52','#9a6512','#c3362c','#8b5cf6','#06b6d4','#f97316','#686d68'] as const;

  // ── Unsaved-changes tracking ────────────────────────────────────────────────
  let profileFormEl:  HTMLFormElement | null = null;
  let settingsFormEl: HTMLFormElement | null = null;
  let settingsDirty = $state(false);
  let savingAll     = $state(false);


  let showBlockDialog   = $state(false);
  let blockStep         = $state(1);
  let rangeFrom         = $state('');
  let rangeTo           = $state('');
  let blockDays         = $state<number[]>([0,1,2,3,4,5,6]);
  let blockReason       = $state('');
  let showCancelConfirm = $state(false);

  // ── Extras (bookable add-ons) ───────────────────────────────────────────────
  let extraDialogOpen = $state(false);
  let extraEditing = $state<HallExtraRow | null>(null);
  let exName = $state(''); let exDesc = $state(''); let exPrice = $state(''); let exPricing = $state<'fixed' | 'per_guest'>('fixed');
  const extrasLimit = $derived(data.plan.limits.maxExtrasPerHall);
  const extrasAtLimit = $derived(extrasLimit !== -1 && data.extras.length >= extrasLimit);
  // Surfaced ABOVE the add button: an operator should know they have one slot left
  // before they fill a form, not after the save is refused.
  const extrasLeft = $derived(extrasLimit === -1 ? Infinity : Math.max(0, extrasLimit - data.extras.length));
  function openExtraNew() { extraEditing = null; exName = ''; exDesc = ''; exPrice = ''; exPricing = 'fixed'; extraDialogOpen = true; }
  function openExtraEdit(e: HallExtraRow) { extraEditing = e; exName = e.name; exDesc = e.description ?? ''; exPrice = (e.price_cents / 100).toString(); exPricing = e.pricing; extraDialogOpen = true; }

  // ── Table-type editor ──────────────────────────────────────────────────────
  let ttDialogOpen = $state(false);
  let ttEditId     = $state<string | null>(null);
  let ttName       = $state('');
  let ttShape      = $state<'rect' | 'round'>('rect');
  let ttWidth      = $state(2);
  let ttHeight     = $state(1);
  let ttRadius     = $state(1);
  let ttMaxChairs  = $state(8);
  let ttAmount     = $state(0);
  let ttColor      = $state('#9a6512');

  function openTtNew() {
    ttEditId = null; ttName = ''; ttShape = 'rect';
    ttWidth = 2; ttHeight = 1; ttRadius = 1; ttMaxChairs = 8; ttAmount = 0; ttColor = '#9a6512';
    ttDialogOpen = true;
  }
  function openTtEdit(tt: TableTypeRow) {
    ttEditId = tt.id; ttName = tt.name; ttShape = tt.shape;
    ttWidth = tt.width; ttHeight = tt.height; ttRadius = tt.radius;
    ttMaxChairs = tt.max_chairs; ttAmount = tt.amount; ttColor = tt.color || '#9a6512';
    ttDialogOpen = true;
  }

  // Geometry for the little table preview (0–100 viewBox): table centred, chairs
  // walked around the perimeter so the shape/size/seating reads at a glance.
  function ttGeom(shape: string, w: number, h: number) {
    if (shape === 'round') return { round: true as const, cx: 50, cy: 50, r: 26 };
    const ww = Math.max(0.5, w || 1), hh = Math.max(0.5, h || 1);
    const ratio = ww / hh;
    let tw: number, th: number;
    if (ratio >= 1) { tw = 58; th = 58 / ratio; } else { th = 58; tw = 58 * ratio; }
    tw = Math.max(18, tw); th = Math.max(18, th);
    return { round: false as const, x: 50 - tw / 2, y: 50 - th / 2, w: tw, h: th };
  }
  function ttChairs(shape: string, w: number, h: number, n: number) {
    const count = Math.max(0, Math.min(Math.round(n || 0), 40));
    const pts: { x: number; y: number }[] = [];
    if (count === 0) return pts;
    if (shape === 'round') {
      const r = 34;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 - Math.PI / 2;
        pts.push({ x: 50 + Math.cos(a) * r, y: 50 + Math.sin(a) * r });
      }
      return pts;
    }
    const g = ttGeom('rect', w, h) as { x: number; y: number; w: number; h: number };
    const ww = Math.max(0.5, w || 1), hh = Math.max(0.5, h || 1);

    // Hand each chair to the side with the most room per chair (length / count).
    // This keeps top/bottom and left/right balanced and proportional to the table
    // shape (e.g. a 2×1 table → 3 top, 3 bottom, 1 left, 1 right).
    let top = 0, bottom = 0, left = 0, right = 0;
    for (let i = 0; i < count; i++) {
      const cand = [
        { s: 'top',    d: (top + 1) / ww },
        { s: 'bottom', d: (bottom + 1) / ww },
        { s: 'left',   d: (left + 1) / hh },
        { s: 'right',  d: (right + 1) / hh },
      ].sort((a, b) => a.d - b.d);
      if (cand[0].s === 'top') top++;
      else if (cand[0].s === 'bottom') bottom++;
      else if (cand[0].s === 'left') left++;
      else right++;
    }

    const gap = 8;
    // Evenly spaced and inset from the corners along each edge.
    for (let i = 0; i < top; i++)    pts.push({ x: g.x + ((i + 0.5) / top) * g.w,    y: g.y - gap });
    for (let i = 0; i < bottom; i++) pts.push({ x: g.x + ((i + 0.5) / bottom) * g.w, y: g.y + g.h + gap });
    for (let i = 0; i < left; i++)   pts.push({ x: g.x - gap,        y: g.y + ((i + 0.5) / left) * g.h });
    for (let i = 0; i < right; i++)  pts.push({ x: g.x + g.w + gap,  y: g.y + ((i + 0.5) / right) * g.h });
    return pts;
  }
  function ttMeta(tt: TableTypeRow): string {
    const dims = tt.shape === 'round' ? `⌀ ${tt.radius}m` : `${tt.width}×${tt.height}m`;
    const qty = tt.amount > 0 ? `×${tt.amount}` : '∞';
    return `${dims} · ${tt.max_chairs} ${t.event.seats} · ${qty}`;
  }

  // Preview-bound state (feeds both the form and the live preview)
  let previewName        = $state(data.hall.name);
  let previewDescription = $state(data.hall.description ?? '');
  let previewMaxPeople   = $state(data.hall.max_people);
  let previewAddress     = $state(data.hall.address ?? '');
  let previewLatitude = $state<number | null>(data.hall.latitude ?? null);
  let previewLongitude = $state<number | null>(data.hall.longitude ?? null);
  let previewColor       = $state(data.hall.color);
  let previewPricing     = $state(data.hall.pricing_info ?? '');
  let previewPhone       = $state(data.hall.contact_phone ?? '');
  let previewEmail       = $state(data.hall.contact_email ?? '');
  let previewWebsite     = $state(data.hall.contact_website ?? '');

  let profileIsPublic    = $state<boolean>(!!data.hall.is_public);
  let profileSlug        = $state(data.hall.slug ?? '');
  let profileCoverUrl    = $state(data.hall.cover_image_url ?? '');
  let profileAmenities   = $state<string[]>(parseArr(data.hall.amenities));
  let galleryImages      = $state<string[]>(parseArr(data.hall.gallery_images));
  let previewPriceBand   = $state<string>(data.hall.price_band ? String(data.hall.price_band) : '');

  // Both pickers are the same shared dialog: drag a file in, click to browse, or
  // paste an address. The dialog does the upload and hands back finished URLs.
  let coverDialogOpen   = $state(false);
  let galleryDialogOpen = $state(false);

  const galleryLimit = $derived(
    data.plan.limits.maxGalleryImages === -1 ? Infinity : data.plan.limits.maxGalleryImages
  );
  const galleryAtLimit = $derived(galleryImages.length >= galleryLimit);
  const galleryLeft = $derived(Math.max(0, galleryLimit - galleryImages.length));

  function addGalleryImages(urls: string[]) {
    const room = galleryLeft;
    galleryImages = [...galleryImages, ...urls.slice(0, room)];
  }

  type DayHours = { open: boolean; from: string; to: string };
  let profileHours = $state<Record<string, DayHours>>(parseObj(data.hall.opening_hours));

  // Dirty-tracking for the profile form. Declared AFTER every `preview*` / `profile*`
  // state above: $derived bodies are lazy so hoisting worked at runtime, but it read
  // as a use-before-declaration to the type checker.
  const _init = $derived({
    name:      data.hall.name,
    desc:      data.hall.description ?? '',
    maxPeople: data.hall.max_people,
    address:   data.hall.address ?? '',
    latitude: data.hall.latitude ?? null,
    longitude: data.hall.longitude ?? null,
    color:     data.hall.color,
    pricing:   data.hall.pricing_info ?? '',
    phone:     data.hall.contact_phone ?? '',
    email:     data.hall.contact_email ?? '',
    website:   data.hall.contact_website ?? '',
    isPublic:  !!data.hall.is_public,
    slug:      data.hall.slug ?? '',
    cover:     data.hall.cover_image_url ?? '',
    priceBand: data.hall.price_band ? String(data.hall.price_band) : '',
    amenities: JSON.stringify(parseArr(data.hall.amenities)),
    gallery:   JSON.stringify(parseArr(data.hall.gallery_images)),
    hours:     JSON.stringify(parseObj(data.hall.opening_hours)),
  });

  const profileDirty = $derived(
    previewName        !== _init.name      ||
    previewDescription !== _init.desc      ||
    previewMaxPeople   !== _init.maxPeople ||
    previewAddress     !== _init.address   ||
    previewLatitude !== _init.latitude ||
    previewLongitude !== _init.longitude ||
    previewColor       !== _init.color     ||
    previewPricing     !== _init.pricing   ||
    previewPhone       !== _init.phone     ||
    previewEmail       !== _init.email     ||
    previewWebsite     !== _init.website   ||
    profileIsPublic    !== _init.isPublic  ||
    profileSlug        !== _init.slug      ||
    profileCoverUrl    !== _init.cover     ||
    previewPriceBand   !== _init.priceBand ||
    JSON.stringify(profileAmenities) !== _init.amenities ||
    JSON.stringify(galleryImages)    !== _init.gallery   ||
    JSON.stringify(profileHours)     !== _init.hours
  );

  const anyDirty = $derived(profileDirty || settingsDirty);

  // Clear settings dirty flag once the server confirms save.
  $effect(() => { if (settingsSaved) settingsDirty = false; });

  async function saveAll() {
    savingAll = true;
    if (profileDirty)  profileFormEl?.requestSubmit();
    if (settingsDirty) settingsFormEl?.requestSubmit();
    savingAll = false;
  }

  function revertAll() {
    previewName        = _init.name;
    previewDescription = _init.desc;
    previewMaxPeople   = _init.maxPeople;
    previewAddress     = _init.address;
    previewLatitude = _init.latitude;
    previewLongitude = _init.longitude;
    previewColor       = _init.color;
    previewPricing     = _init.pricing;
    previewPhone       = _init.phone;
    previewEmail       = _init.email;
    previewWebsite     = _init.website;
    profileIsPublic    = _init.isPublic;
    profileSlug        = _init.slug;
    profileCoverUrl    = _init.cover;
    previewPriceBand   = _init.priceBand;
    profileAmenities   = JSON.parse(_init.amenities);
    galleryImages      = JSON.parse(_init.gallery);
    profileHours       = JSON.parse(_init.hours);
    settingsFormEl?.reset();
    settingsDirty      = false;
  }

  const AMENITIES = $derived([
    { id: 'parking',    label: t.hallProfile.amenityParking },
    { id: 'catering',   label: t.hallProfile.amenityCatering },
    { id: 'av',         label: t.hallProfile.amenityAv },
    { id: 'wifi',       label: t.hallProfile.amenityWifi },
    { id: 'ac',         label: t.hallProfile.amenityAc },
    { id: 'accessible', label: t.hallProfile.amenityAccessible },
    { id: 'outdoor',    label: t.hallProfile.amenityOutdoor },
    { id: 'stage',      label: t.hallProfile.amenityStage },
    { id: 'dancefloor', label: t.hallProfile.amenityDancefloor },
    { id: 'bar',        label: t.hallProfile.amenityBar },
  ]);

  // ── Custom amenities ────────────────────────────────────────────────────────
  // The operator fills whichever language they think in; rendering falls back to
  // the other one, so nobody is forced to write both to add "Vírivka".
  const customAmenities = $derived(
    (data.orgAmenities ?? []).map((row) => ({
      id: row.id,
      slug: row.slug,
      label: (getLocale() === 'en'
        ? (row.label_en || row.label_sk)
        : (row.label_sk || row.label_en)) || row.slug,
      labelSk: row.label_sk ?? '',
      labelEn: row.label_en ?? '',
    }))
  );
  /** Every amenity the preview might have to name, keyed by the slug stored on the hall. */
  const amenityLabels = $derived(
    new Map<string, string>([
      ...AMENITIES.map((a) => [a.id, a.label] as const),
      ...customAmenities.map((a) => [a.slug, a.label] as const),
    ])
  );

  let amenityDialogOpen = $state(false);
  let amenityDeleting = $state<{ id: string; slug: string; label: string } | null>(null);

  // The save bar announces UNSAVED changes and then vanishes, so a successful save
  // produced no confirmation at all. Every action already returns a success flag;
  // this surfaces them and clears itself so it cannot linger over later edits.
  let savedNotice = $state(false);
  $effect(() => {
    if (!(form?.profileSuccess || form?.infoSuccess || form?.amenityAdded || form?.amenityRemoved)) return;
    savedNotice = true;
    const timer = setTimeout(() => { savedNotice = false; }, 3200);
    return () => clearTimeout(timer);
  });
  let newAmenitySk = $state('');
  let newAmenityEn = $state('');

  function toggleAmenity(slug: string, on: boolean) {
    profileAmenities = on
      ? [...new Set([...profileAmenities, slug])]
      : profileAmenities.filter((x) => x !== slug);
  }

  // ── Price band ──────────────────────────────────────────────────────────────
  const PRICE_BANDS = $derived([
    { value: '',  symbol: '—',   label: t.hallAdmin.priceBandNotStated },
    { value: '1', symbol: '€',   label: t.hallAdmin.priceBandBudget },
    { value: '2', symbol: '€€',  label: t.hallAdmin.priceBandMid },
    { value: '3', symbol: '€€€', label: t.hallAdmin.priceBandPremium },
  ]);

  // ── Geocoding ───────────────────────────────────────────────────────────────
  // The server fills a missing pin from the address on save; these two buttons are
  // the explicit version of the same thing, in both directions, so an operator can
  // see the result before they commit to it.
  let geoBusy    = $state<'' | 'forward' | 'reverse'>('');
  let geoMessage = $state('');
  let geoProblem = $state(false);

  async function geocodeFromAddress() {
    const query = previewAddress.trim();
    if (!query) { geoProblem = true; geoMessage = t.hallAdmin.geocodeNeedsAddress; return; }
    geoBusy = 'forward'; geoProblem = false; geoMessage = t.hallAdmin.geocodeSearching;
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
      const body = res.ok ? await res.json() : null;
      if (body?.result) {
        previewLatitude = body.result.latitude;
        previewLongitude = body.result.longitude;
        geoMessage = t.hallAdmin.geocodeFound;
      } else {
        geoProblem = true;
        geoMessage = res.ok ? t.hallAdmin.geocodeNotFound : t.hallAdmin.geocodeFailed;
      }
    } catch {
      geoProblem = true; geoMessage = t.hallAdmin.geocodeFailed;
    } finally {
      geoBusy = '';
    }
  }

  async function addressFromPin() {
    if (previewLatitude === null || previewLongitude === null) {
      geoProblem = true; geoMessage = t.hallAdmin.geocodeNeedsPin; return;
    }
    geoBusy = 'reverse'; geoProblem = false; geoMessage = t.hallAdmin.geocodeSearching;
    try {
      const res = await fetch(`/api/geocode?lat=${previewLatitude}&lon=${previewLongitude}`);
      const body = res.ok ? await res.json() : null;
      if (body?.label) {
        previewAddress = body.label;
        geoMessage = t.hallAdmin.geocodeAddressFilled;
      } else {
        geoProblem = true;
        geoMessage = res.ok ? t.hallAdmin.geocodeNotFound : t.hallAdmin.geocodeFailed;
      }
    } catch {
      geoProblem = true; geoMessage = t.hallAdmin.geocodeFailed;
    } finally {
      geoBusy = '';
    }
  }

  // Info popovers are the shared <InfoHint> component (a real button with a label,
  // not a title= attribute, which is invisible to a keyboard and to a touch screen).
  // It owns its own open state, so this page keeps none.

  const DAYS = $derived([
    { id: 'mon', label: t.dayNamesFull[0] },
    { id: 'tue', label: t.dayNamesFull[1] },
    { id: 'wed', label: t.dayNamesFull[2] },
    { id: 'thu', label: t.dayNamesFull[3] },
    { id: 'fri', label: t.dayNamesFull[4] },
    { id: 'sat', label: t.dayNamesFull[5] },
    { id: 'sun', label: t.dayNamesFull[6] },
  ]);

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
  const DAYS_FULL = $derived([t.dayNames[6], t.dayNames[0], t.dayNames[1], t.dayNames[2], t.dayNames[3], t.dayNames[4], t.dayNames[5]]);
  // ── Floor-plan sub-sections ──
  // The floor plan, its templates and its table types used to sit in three loose
  // rows. They are now collapsible sections under one "Floor plan" eyebrow, open by
  // default so nothing an operator used to see is hidden behind a click.
  let templatesOpen  = $state(true);
  let tableTypesOpen = $state(true);

  // ── Create-template dialog ──
  let tmplDialogOpen = $state(false);
  let tmplName       = $state('');
  let tmplTypes      = $state<Set<string>>(new Set());
  function openTmplNew() { tmplName = ''; tmplTypes = new Set(); tmplDialogOpen = true; }
  function toggleTmplType(k: string) {
    const s = new Set(tmplTypes);
    s.has(k) ? s.delete(k) : s.add(k);
    tmplTypes = s;
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  const upcomingReservations = $derived(
    data.reservations
      .filter(r => {
        const d = new Date(r.event_date);
        const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        return iso >= todayStr;
      })
      .sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime())
  );

  const eventDateStrings = $derived(
    data.reservations.map(r => {
      const d = new Date(r.event_date);
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    })
  );

  const conflictingEvents = $derived.by(() => {
    if (!rangeFrom || !rangeTo) return [];
    return data.reservations.filter(r => {
      const d = new Date(r.event_date);
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

{#snippet tablePreview(shape: string, w: number, h: number, chairs: number, color: string)}
  {@const g = ttGeom(shape, w, h)}
  <svg viewBox="0 0 100 100" class="tt-svg" aria-hidden="true">
    {#each ttChairs(shape, w, h, chairs) as c}
      <circle cx={c.x} cy={c.y} r="3.4" class="tt-chair" />
    {/each}
    {#if g.round}
      <circle cx={g.cx} cy={g.cy} r={g.r} fill="var(--tt-table, var(--warning))" />
    {:else}
      <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="3.5" fill="var(--tt-table, var(--warning))" />
    {/if}
  </svg>
{/snippet}

<div class="wrap page">

  <!-- ─── Breadcrumb ──────────────────────────────────────────────────────────── -->
  <nav class="breadcrumb">
    <a href="/app/manage/halls">{t.nav.halls}</a>
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
    <span>{data.hall.name}</span>
  </nav>

  {#if data.hall.plan_locked}
    <div class="locked-banner">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      <div>
        <strong>{t.hallAdmin.suspendedTitle}</strong>
        <span>{t.hallAdmin.suspendedDesc}</span>
      </div>
      <form method="POST" action="?/reactivate" use:enhance>
        <button type="submit" class="btn-action btn-sm">{t.hallAdmin.reactivate}</button>
      </form>
    </div>
  {/if}

  <!-- ─── Profile + Overview (merged, always open) ────────────────────────────── -->
  <section class="section section--lead profile-block">

    <!-- Section head: name, status chips, KPIs, save button -->
    <div class="section-head section-head--row profile-card-head">
      <div class="profile-head-left">
        <p class="eyebrow">{t.nav.halls}</p>
        <h1 class="hall-name">{previewName || data.hall.name}</h1>
        <div class="identity-chips">
          <span class="chip" class:chip-success={data.hall.allow_reservations} class:chip-closed={!data.hall.allow_reservations}>
            <span class="chip-dot"></span>
            {data.hall.allow_reservations ? t.hallAdmin.acceptingBookings : t.hallAdmin.closedToBookings}
          </span>
          {#if profileIsPublic}
            <span class="chip chip-success">
              <span class="chip-dot"></span>{t.hallAdmin.published}
            </span>
          {:else}
            <span class="chip chip-muted">{t.hallAdmin.draft}</span>
          {/if}
        </div>
      </div>

      <div class="profile-head-right">
        <div class="kpi-trio">
          <div class="kpi-item">
            <span class="kpi-val">{data.reservations.length}</span>
            <span class="kpi-lbl">{t.hallAdmin.totalBookings}</span>
          </div>
          <div class="kpi-item">
            <span class="kpi-val">{upcomingReservations.length}</span>
            <span class="kpi-lbl">{t.hallAdmin.upcoming}</span>
          </div>
          <div class="kpi-item">
            <span class="kpi-val">{data.blocks.length}</span>
            <span class="kpi-lbl">{t.hallAdmin.blockedPeriods}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Two-column editor -->
    <div class="profile-editor-wrap">

      <!-- ── Left: form ── -->
      <form
        bind:this={profileFormEl}
        method="POST"
        action="?/saveProfile"
        use:enhance={() => async ({ update }) => {
          await update({ reset: false });
        }}
        class="profile-form"
      >

        {#if form?.profileError}
          <div class="alert alert-error" style="margin:16px 18px 0 0">{form.profileError}</div>
        {/if}

        <!-- Hall details -->
        <div class="profile-section">
          <p class="eyebrow">{t.hallAdmin.hallDetails}</p>
          <div class="edit-row">
            <div class="field field-grow">
              <label class="field-label" for="pf-name">{t.halls.hallName} *</label>
              <input class="field-input" id="pf-name" name="name" type="text"
                bind:value={previewName} required />
            </div>
            <div class="field" style="width:110px">
              <label class="field-label" for="pf-cap">{t.common.capacity} *</label>
              <input class="field-input" id="pf-cap" name="maxPeople" type="number"
                min="1" max="5000" bind:value={previewMaxPeople} required />
            </div>
            <div class="field">
              <span class="field-label" id="pf-color-label">{t.halls.hallColor}</span>
              <div class="color-picker-row" role="group" aria-labelledby="pf-color-label">
                {#each HALL_COLORS as c}
                  <button type="button" class="color-chip" class:color-chip-active={previewColor === c}
                    style="background:{c}" onclick={() => previewColor = c} aria-label="{t.halls.hallColor} {c}">
                    {#if previewColor === c}
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5"><polyline points="20 6 9 17 4 12"/></svg>
                    {/if}
                  </button>
                {/each}
                <label class="color-chip color-chip-custom" class:color-chip-active={!HALL_COLORS.includes(previewColor as typeof HALL_COLORS[number])}
                  style={!HALL_COLORS.includes(previewColor as typeof HALL_COLORS[number]) ? `background:${previewColor}` : ''} title={t.hallAdmin.customColor}>
                  {#if !HALL_COLORS.includes(previewColor as typeof HALL_COLORS[number])}
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5"><polyline points="20 6 9 17 4 12"/></svg>
                  {:else}
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  {/if}
                  <input id="pf-color" name="color" type="color" bind:value={previewColor} />
                </label>
              </div>
            </div>
          </div>
          <div class="edit-row">
            <div class="field field-grow">
              <label class="field-label" for="pf-desc">{t.common.description}</label>
              <input class="field-input" id="pf-desc" name="description" type="text"
                bind:value={previewDescription} placeholder={t.hallAdmin.shortDescriptionPlaceholder} />
            </div>
          </div>
        </div>

        <!-- Location: the address and the pin are one subject, and each can be
             derived from the other, so they live together. -->
        <div class="profile-section location-section">
          <p class="eyebrow">{t.hallAdmin.location}</p>
          <div class="field">
            <label class="field-label" for="pf-addr">{t.halls.address} {#if profileIsPublic}*{/if}</label>
            <input class="field-input" id="pf-addr" name="address" type="text"
              bind:value={previewAddress} required={profileIsPublic}
              placeholder={profileIsPublic ? t.hallAdmin.addressRequiredPlaceholder : t.hallAdmin.addressOptionalPlaceholder} />
          </div>

          <div class="geo-actions">
            <button type="button" class="btn-ghost" onclick={geocodeFromAddress}
              disabled={geoBusy !== ''} aria-busy={geoBusy === 'forward'}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              {t.hallAdmin.findFromAddress}
            </button>
            <button type="button" class="btn-ghost" onclick={addressFromPin}
              disabled={geoBusy !== ''} aria-busy={geoBusy === 'reverse'}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16"/><path d="M4 12h10"/><path d="M4 17h7"/><polyline points="16 14 20 18 16 22"/></svg>
              {t.hallAdmin.fillAddressFromPin}
            </button>
            <span class="geo-msg" class:problem={geoProblem} role="status" aria-live="polite">{geoMessage}</span>
          </div>

          <p class="field-hint">{t.hallAdmin.locationHint}</p>

          <div class="map-shell">
            <VenueLocationPicker bind:latitude={previewLatitude} bind:longitude={previewLongitude} english={getLocale() === "en"} />
          </div>
          <input type="hidden" name="latitude" value={previewLatitude ?? ""} />
          <input type="hidden" name="longitude" value={previewLongitude ?? ""} />
        </div>

        <!-- Visibility -->
        <div class="profile-section">
          <p class="eyebrow">{t.hallAdmin.visibility}</p>
          <label class="toggle-item" style="padding:6px 0;border-bottom:none">
            <div class="toggle-text">
              <span class="toggle-title">{t.hallAdmin.listedInDiscovery}</span>
              <span class="toggle-hint">{t.hallAdmin.listedInDiscoveryHint}</span>
            </div>
            <div class="toggle-switch">
              <input type="checkbox" name="isPublic" bind:checked={profileIsPublic} />
              <span class="toggle-slider"></span>
            </div>
          </label>
          <!-- Listed with a gap in the profile: say what a visitor will see, and
               let them save anyway. Neither of these is worth blocking a listing. -->
          {#if profileIsPublic && (!profileCoverUrl || !previewMaxPeople)}
            <div class="listing-warning" transition:slide={{ duration: 140 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <span>
                {#if !profileCoverUrl}{t.hallAdmin.publicNoCoverWarning}{/if}
                {#if !profileCoverUrl && !previewMaxPeople}{' '}{/if}
                {#if !previewMaxPeople}{t.hallAdmin.publicNoCapacityWarning}{/if}
              </span>
            </div>
          {/if}
          {#if profileIsPublic}
            <div class="field" transition:slide={{ duration: 140 }}>
              <label class="field-label" for="pf-slug">{t.hallAdmin.publicUrl} *</label>
              <div class="slug-row">
                <div class="slug-wrap">
                  <span class="slug-prefix">/halls/</span>
                  <input class="field-input slug-input" id="pf-slug" name="slug"
                    type="text" value={profileSlug} placeholder={t.hallAdmin.slugPlaceholder} required
                    oninput={(e) => profileSlug = slugify(e.currentTarget.value)} />
                </div>
                {#if data.hall.slug && data.hall.is_public}
                  <a href="/app/halls/{data.hall.slug}" target="_blank" rel="noopener" class="btn-ghost view-live-btn">
                    {t.hallAdmin.viewLive}
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                  </a>
                {/if}
              </div>
            </div>
          {/if}
        </div>

        <!-- Cover image — recommended, never required -->
        <div class="profile-section">
          <div class="sub-head">
            <p class="eyebrow">{t.hallAdmin.coverImage}</p>
            <span class="recommend-pill">{t.hallAdmin.coverRecommended}</span>
          </div>
          <p class="field-hint">{t.hallAdmin.coverRecommendHint}</p>
          <div class="cover-row">
            <div class="cover-controls">
              <button type="button" class="btn-outline btn-sm" onclick={() => coverDialogOpen = true}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
                {t.hallAdmin.uploadImage}
              </button>
              {#if profileCoverUrl}
                <button type="button" class="btn-ghost btn-ghost-sm" onclick={() => profileCoverUrl = ''}>
                  {t.hallAdmin.removeCover}
                </button>
              {/if}
              <input type="hidden" name="coverImageUrl" value={profileCoverUrl} />
            </div>
            {#if profileCoverUrl}
              <div class="cover-thumb">
                <img src={profileCoverUrl} alt={t.hallAdmin.coverPreviewAlt} />
              </div>
            {/if}
          </div>
        </div>

        <!-- Gallery -->
        <div class="profile-section">
          <div class="gallery-header">
            <p class="eyebrow" style="margin:0">{t.hallProfile.gallery}</p>
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
                  title={t.hallAdmin.removeImage} aria-label={t.hallAdmin.removeImage}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
                <input type="hidden" name="galleryImages" value={url} />
              </div>
            {/each}

            {#if !galleryAtLimit}
              <button type="button" class="gallery-add-slot" onclick={() => galleryDialogOpen = true}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                <span>{t.hallAdmin.addPhotos}</span>
              </button>
            {/if}
          </div>

          {#if galleryAtLimit}
            <div class="gallery-limit-banner">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {t.hallAdmin.imageLimitPrefix} {data.plan.limits.maxGalleryImages} {t.hallAdmin.imageLimitMid} {data.plan.name} {t.hallAdmin.imageLimitSuffix}
              <a href="/app/billing" class="gallery-upgrade-link">{t.hallAdmin.upgrade}</a>
            </div>
          {/if}
        </div>

        <!-- Amenities -->
        <div class="profile-section">
          <p class="eyebrow">{t.hallProfile.amenities}</p>
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

            {#each customAmenities as a (a.slug)}
              <label class="amenity-item amenity-custom">
                <input type="checkbox" name="amenities" value={a.slug}
                  checked={profileAmenities.includes(a.slug)}
                  onchange={(e) => {
                    if (e.currentTarget.checked) profileAmenities = [...profileAmenities, a.slug];
                    else profileAmenities = profileAmenities.filter(x => x !== a.slug);
                  }} />
                <span class="amenity-label">{a.label}</span>
                <button type="button" class="amenity-remove" aria-label={`${t.hallAdmin.removeAmenity}: ${a.label}`}
                  onclick={() => { amenityDeleting = a; }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </label>
            {/each}
          </div>

          <button type="button" class="btn-outline btn-sm amenity-add" onclick={() => { newAmenitySk = ''; newAmenityEn = ''; amenityDialogOpen = true; }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            {t.hallAdmin.addAmenity}
          </button>
        </div>

        <!-- Pricing — the band is what discovery filters on, the text is the nuance,
             so the two sit side by side rather than in separate places. -->
        <div class="profile-section">
          <p class="eyebrow">{t.hallProfile.pricing}</p>
          <div class="pricing-row">
            <div class="field field-grow">
              <label class="field-label" for="pf-pricing">{t.hallAdmin.pricingInformation}</label>
              <textarea class="field-input field-textarea" id="pf-pricing" name="pricingInfo"
                rows="3" placeholder={t.hallAdmin.pricingPlaceholder}
                bind:value={previewPricing}></textarea>
            </div>
            <div class="field band-field">
              <span class="field-label" id="pf-band-label">{t.hallAdmin.priceBand}</span>
              <div class="band-row" role="radiogroup" aria-labelledby="pf-band-label">
                {#each PRICE_BANDS as band}
                  <label class="band-opt">
                    <input type="radio" name="priceBand" value={band.value} bind:group={previewPriceBand} />
                    <span class="band-sym" aria-hidden="true">{band.symbol}</span>
                    <span class="band-lbl">{band.label}</span>
                  </label>
                {/each}
              </div>
            </div>
          </div>
          <p class="field-hint">{t.hallAdmin.priceBandHint}</p>
        </div>

        <!-- Contact -->
        <div class="profile-section">
          <p class="eyebrow">{t.hallProfile.contact}</p>
          <div class="profile-fields-row">
            <div class="field field-grow">
              <label class="field-label" for="pf-phone">{t.rsvp.phone}</label>
              <input class="field-input" id="pf-phone" name="contactPhone" type="tel"
                bind:value={previewPhone} placeholder="+421 900 000 000" />
            </div>
            <div class="field field-grow">
              <label class="field-label" for="pf-email">{t.users.email}</label>
              <input class="field-input" id="pf-email" name="contactEmail" type="email"
                bind:value={previewEmail} placeholder="contact@hall.com" />
            </div>
            <div class="field field-grow">
              <label class="field-label" for="pf-web">{t.hallProfile.website}</label>
              <input class="field-input" id="pf-web" name="contactWebsite" type="url"
                bind:value={previewWebsite} placeholder="https://…" />
            </div>
          </div>
        </div>

        <!-- Opening hours -->
        <div class="profile-section" style="border-bottom:none">
          <p class="eyebrow">{t.hallProfile.openingHours}</p>
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
                  <span class="hours-closed">{t.createEvent.closed}</span>
                {/if}
              </div>
            {/each}
          </div>
          <input type="hidden" name="openingHours" value={JSON.stringify(profileHours)} />
        </div>
      </form>

      <!-- ── Right: live preview ── -->
      <div class="profile-preview-col">
        <div class="preview-sticky">
          <div class="preview-label">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            {t.hallAdmin.livePreview}
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
                  {profileIsPublic ? `● ${t.hallAdmin.published}` : `○ ${t.hallAdmin.draft}`}
                </span>
                <h3 class="preview-hall-name">{previewName || t.halls.hallName}</h3>
                <div class="preview-meta-row">
                  {#if previewMaxPeople}
                    <span class="preview-meta-chip">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                      {previewMaxPeople} {t.hallDir.guests}
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
                  <!-- Looked up through amenityLabels, not AMENITIES: the map also
                       carries the organisation's own slugs, so a custom amenity shows
                       in the preview exactly as a visitor will see it. -->
                  {#each profileAmenities as aid}
                    {@const label = amenityLabels.get(aid)}
                    {#if label}<span class="preview-amenity-chip">{label}</span>{/if}
                  {/each}
                </div>
              {/if}

              {#if galleryImages.length > 0}
                <div class="preview-block">
                  <p class="preview-block-title">{t.hallProfile.gallery}</p>
                  <div class="preview-gallery">
                    {#each galleryImages.slice(0, 6) as url}
                      <div class="preview-gallery-item"><img src={url} alt="" /></div>
                    {/each}
                  </div>
                </div>
              {/if}

              {#if previewPricing}
                <div class="preview-block">
                  <p class="preview-block-title">{t.hallProfile.pricing}</p>
                  <p class="preview-block-text">{previewPricing}</p>
                </div>
              {/if}

              {#if previewPhone || previewEmail || previewWebsite}
                <div class="preview-block">
                  <p class="preview-block-title">{t.hallProfile.contact}</p>
                  <div class="preview-contact-list">
                    {#if previewPhone}<span>{previewPhone}</span>{/if}
                    {#if previewEmail}<span>{previewEmail}</span>{/if}
                    {#if previewWebsite}<span>{previewWebsite}</span>{/if}
                  </div>
                </div>
              {/if}

              {#if Object.keys(profileHours).length > 0}
                <div class="preview-block">
                  <p class="preview-block-title">{t.hallProfile.openingHours}</p>
                  <div class="preview-hours">
                    {#each DAYS as day}
                      {@const dh = getDayHours(day.id)}
                      <div class="preview-hours-row">
                        <span class="preview-hours-day">{day.label.slice(0,3)}</span>
                        {#if dh.open}
                          <span class="preview-hours-time">{dh.from} – {dh.to}</span>
                        {:else}
                          <span class="preview-hours-closed">{t.createEvent.closed}</span>
                        {/if}
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}

              {#if !previewDescription && profileAmenities.length === 0 && !previewPricing && !previewPhone && !previewEmail}
                <p class="preview-empty">{t.hallAdmin.previewEmpty}</p>
              {/if}
            </div>
          </div>
        </div>
      </div>

    </div><!-- /profile-editor-wrap -->
  </section><!-- /profile -->

  <!-- ─── Extras (sits with pricing — add-ons guests can order) ─────────────────── -->
  <section class="section extras-block">
    <div class="section-head section-head--row">
      <div class="extras-head-text">
        <p class="eyebrow">{t.hallProfile.pricing}</p>
        <h2>{t.hallAdmin.extras}</h2>
        <p>{t.hallAdmin.extrasSub}</p>
      </div>
      {#if !extrasAtLimit}
        <div class="extras-add-wrap">
          <span class="extras-left">
            {extrasLeft === Infinity ? t.hallAdmin.extrasUnlimited : t.hallAdmin.extrasLeft(extrasLeft)}
          </span>
          <button type="button" class="btn-action btn-sm extras-add" onclick={openExtraNew}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            {t.hallAdmin.addExtra}
          </button>
        </div>
      {/if}
    </div>

    <div class="extras-disclaimer">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
      <span>{t.hallAdmin.extrasDisclaimer}</span>
    </div>

    {#if form?.extraError}<div class="inline-err">{form.extraError}</div>{/if}

    {#if data.extras.length === 0}
      <div class="card--inset extras-empty">
        <span class="icon-tile">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>
        </span>
        <h3>{t.hallAdmin.addExtra}</h3>
        <p>{t.hallAdmin.extrasEmpty}</p>
      </div>
    {:else}
      <div class="row-list extras-list">
        {#each data.extras as ex}
          <div class="row-item extra-row">
            <div class="extra-tile-head">
              <span class="extra-tile-name">{ex.name}</span>
              <span class="extra-tile-pill" class:per-guest={ex.pricing === 'per_guest'}>{ex.pricing === 'per_guest' ? t.hallAdmin.perGuest : t.hallAdmin.flat}</span>
            </div>
            {#if ex.description}<p class="extra-tile-desc">{ex.description}</p>{/if}
            <div class="extra-tile-foot">
              <span class="extra-tile-price">{eur(ex.price_cents)}</span>
              <div class="extra-tile-actions">
                <button type="button" class="extra-icon" onclick={() => openExtraEdit(ex)} aria-label="{t.common.edit} {ex.name}">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>
                </button>
                <form method="POST" action="?/deleteExtra" use:enhance>
                  <input type="hidden" name="id" value={ex.id} />
                  <button type="submit" class="extra-icon danger" aria-label="{t.common.delete} {ex.name}"
                    onclick={(e) => { if (!confirm(t.hallAdmin.confirmDeleteExtra)) e.preventDefault(); }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                  </button>
                </form>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}

    {#if extrasAtLimit}
      <p class="extras-limit">{t.hallAdmin.planLimitReached} ({extrasLimit} {t.hallAdmin.perHall}). <a href="/app/billing">{t.hallAdmin.upgrade}</a> {t.hallAdmin.toAddMore}</p>
    {:else if data.extras.length > 0}
      <p class="extras-count">{data.extras.length}{extrasLimit === -1 ? '' : ` ${t.common.of} ${extrasLimit}`} {t.hallAdmin.extras.toLowerCase()}</p>
    {/if}
  </section>

  <!-- ─── Activity row: Upcoming + Blocked side by side ──────────────────────── -->
  <div class="dual-col">

    <section class="section">
      <div class="section-head section-head--row">
        <div>
          <p class="eyebrow">{t.hallAdmin.upcoming}</p>
          <h2>{t.hallAdmin.upcomingReservations}</h2>
        </div>
        {#if upcomingReservations.length > 0}
          <span class="card-count">{upcomingReservations.length}</span>
        {/if}
      </div>
      {#if upcomingReservations.length === 0}
        <div class="card--inset list-empty">
          <span class="icon-tile">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          </span>
          <span>{t.hallAdmin.noUpcomingReservations}</span>
        </div>
      {:else}
        <div class="row-list res-list">
          {#each upcomingReservations.slice(0, 8) as r}
            <a href="/app/reservation/{r.id}" class="row-item res-row">
              <span class="res-date">{shortDate(r.event_date)}</span>
              <span class="res-title">{r.title}</span>
              <svg class="res-arrow" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
            </a>
          {/each}
          {#if upcomingReservations.length > 8}
            <div class="res-more">+{upcomingReservations.length - 8} {t.hallAdmin.moreUpcoming}</div>
          {/if}
        </div>
      {/if}
    </section>

    <section class="section">
      <div class="section-head section-head--row">
        <div>
          <p class="eyebrow">{t.hallAdmin.blockedPeriods}</p>
          <h2>{t.halls.blockedDates}</h2>
        </div>
        <button class="btn-accent-sm" type="button" onclick={openBlockDialog}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          {t.halls.addBlock}
        </button>
      </div>
      {#if form?.blockSuccess}
        <div class="alert alert-success" style="margin:0 0 10px">{t.hallAdmin.blockCreated}</div>
      {/if}
      {#if form?.blockError}
        <div class="alert alert-error" style="margin:0 0 10px">{form.blockError}</div>
      {/if}
      {#if data.blocks.length === 0}
        <div class="card--inset list-empty">
          <span class="icon-tile">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
          </span>
          <span>{t.hallAdmin.noBlockedPeriods}</span>
        </div>
      {:else}
        <div class="row-list blocks-list">
          {#each data.blocks as b}
            <div class="row-item block-row">
              <div class="block-icon-wrap">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="9" y1="16" x2="15" y2="16"/></svg>
              </div>
              <div class="block-info">
                <span class="block-dates">
                  {#if b.block_type === 'date_range'}
                    {formatDate(b.date_from)} – {formatDate(b.date_to)}
                  {:else}
                    {t.halls.weekly}: {parseArr(b.days_of_week).map((d) => DAYS_SK[Number(d)]).join(', ')}
                  {/if}
                </span>
                {#if b.reason}<span class="block-reason">{b.reason}</span>{/if}
              </div>
              <form method="POST" action="?/deleteBlock" use:enhance style="margin-left:auto;flex-shrink:0">
                <input type="hidden" name="id" value={b.id} />
                <button class="btn-del" type="submit" aria-label={t.common.delete}
                  onclick={(e) => { if (!confirm(t.hallAdmin.confirmRemoveBlock)) e.preventDefault(); }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                </button>
              </form>
            </div>
          {/each}
        </div>
      {/if}
    </section>

  </div><!-- /dual-col -->

  <!-- ─── Settings + Floorplan row ─────────────────────────────────────────── -->
  <div class="settings-row">

    <section class="section settings-block">
      <form
        bind:this={settingsFormEl}
        onchange={() => settingsDirty = true}
        method="POST"
        action="?/saveInfo"
        use:enhance={() => async ({ result, update }) => {
          await update({ reset: false });
          if (result.type === 'success') {
            settingsSaved = true;
            setTimeout(() => settingsSaved = false, 2500);
          }
        }}
      >
        <input type="hidden" name="name"        value={previewName} />
        <input type="hidden" name="maxPeople"   value={previewMaxPeople} />
        <input type="hidden" name="color"       value={previewColor} />
        <input type="hidden" name="description" value={previewDescription} />
        <input type="hidden" name="address"     value={previewAddress} />
        <input type="hidden" name="latitude" value={previewLatitude ?? ""} />
        <input type="hidden" name="longitude" value={previewLongitude ?? ""} />

        <div class="section-head">
          <p class="eyebrow">{t.halls.settings}</p>
          <h2>{t.hallAdmin.bookingSettings}</h2>
        </div>

        <div class="settings-cols">
          <div class="settings-toggles">
            <label class="toggle-item">
              <div class="toggle-text">
                <span class="toggle-title">{t.halls.allowReservations}</span>
                <span class="toggle-hint">{t.halls.allowReservationsHint}</span>
              </div>
              <div class="toggle-switch">
                <input type="checkbox" name="allowReservations" checked={!!data.hall.allow_reservations} />
                <span class="toggle-slider"></span>
              </div>
            </label>
            <label class="toggle-item">
              <div class="toggle-text">
                <span class="toggle-title">{t.halls.customLayouts}</span>
                <span class="toggle-hint">{t.halls.customLayoutsHint}</span>
              </div>
              <div class="toggle-switch">
                <input type="checkbox" name="customLayouts" checked={!!data.hall.custom_layouts} />
                <span class="toggle-slider"></span>
              </div>
            </label>
            <label class="toggle-item">
              <div class="toggle-text">
                <span class="toggle-title">{t.halls.forceLayouts}</span>
                <span class="toggle-hint">{t.halls.forceLayoutsHint}</span>
              </div>
              <div class="toggle-switch">
                <input type="checkbox" name="forceLayouts" checked={!!data.hall.force_layouts} />
                <span class="toggle-slider"></span>
              </div>
            </label>
            <label class="toggle-item">
              <div class="toggle-text">
                <span class="toggle-title">{t.halls.allowFeedback}</span>
                <span class="toggle-hint">{t.halls.allowFeedbackHint}</span>
              </div>
              <div class="toggle-switch">
                <input type="checkbox" name="allowFeedback" checked={!!data.hall.allow_feedback} />
                <span class="toggle-slider"></span>
              </div>
            </label>
            <label class="toggle-item" style="border-bottom:none">
              <div class="toggle-text">
                <span class="toggle-title">{t.halls.autoApprove}</span>
                <span class="toggle-hint">{t.halls.autoApproveHint}</span>
              </div>
              <div class="toggle-switch">
                <input type="checkbox" name="autoApprove" checked={!!data.hall.auto_approve} />
                <span class="toggle-slider"></span>
              </div>
            </label>
          </div>

          <div class="settings-fields">
            <div class="field-row">
              <div class="field field-grow">
                <label class="field-label" for="sf-min-adv">{t.halls.minDaysAdvance}<InfoHint text={t.halls.minDaysAdvanceHint} label={t.common.whatIsThis} /></label>
                <input class="field-input" id="sf-min-adv" name="minDaysAdvance" type="number"
                  min="0" max="365" value={data.hall.min_days_advance} />
              </div>
              <div class="field field-grow">
                <label class="field-label" for="sf-min-can">{t.halls.minCancelDays}<InfoHint text={t.halls.minCancelDaysHint} label={t.common.whatIsThis} /></label>
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
    </section>


  </div><!-- /settings-row -->

  <!-- ─── Floor plan: the plan, its templates and its table types, one block ─── -->
  <section class="section fp-block">
    <div class="section-head section-head--row">
      <div>
        <p class="eyebrow">{t.halls.floorplanStatus}</p>
        <h2>{t.halls.floorplan}</h2>
      </div>
      <span class="chip" class:chip-success={!!data.hall.floorplan_json} class:chip-muted={!data.hall.floorplan_json}>
        {data.hall.floorplan_json ? t.status.set : t.status.unset}
      </span>
    </div>
    <div class="fp-plan">
      {#if data.hall.floorplan_json}
        {@const mfState = migrateToMultiFloor(data.hall.floorplan_json)}
        {@const floor0  = mfState.floors[0]}
        <div class="fp-preview">
          <svg viewBox={computeViewBox(floor0)} preserveAspectRatio="xMidYMid meet">
            {#if floor0.bounds}
              <rect x={floor0.bounds.x*10} y={floor0.bounds.y*10} width={floor0.bounds.w*10} height={floor0.bounds.h*10}
                fill="none" stroke="var(--border)" stroke-width="0.6" stroke-dasharray="3 2"/>
            {/if}
            {#each floor0.zones as zone}
              {@const zx = zone.points.reduce((s,p)=>s+p.x,0)/zone.points.length}
              {@const zy = zone.points.reduce((s,p)=>s+p.y,0)/zone.points.length}
              <polygon points={zone.points.map(p => `${p.x*10},${p.y*10}`).join(' ')}
                fill={zone.color ?? 'var(--accent)'} fill-opacity="0.22" stroke={zone.color ?? 'var(--accent)'} stroke-width="0.4" stroke-opacity="0.6"/>
              {#if zone.label}
                <text x={zx*10} y={zy*10} text-anchor="middle" dominant-baseline="middle"
                  font-size="3.4" font-weight="650" fill={zone.color ?? 'var(--accent-ink)'}>{zone.label}</text>
              {/if}
            {/each}
            {#each floor0.walls as wall}
              <polygon points={wall.points.map(p => `${p.x*10},${p.y*10}`).join(' ')} fill="var(--editor-wall)" opacity="0.9"/>
            {/each}
            {#each floor0.tables as tbl}
              {#if tbl.shape === 'round'}
                <circle cx={tbl.x*10} cy={tbl.y*10} r={(tbl.radius??1)*10*0.8} fill="var(--warning)" opacity="0.75"/>
              {:else}
                <rect x={(tbl.x-(tbl.width??2)/2)*10} y={(tbl.y-(tbl.height??1)/2)*10}
                  width={(tbl.width??2)*10} height={(tbl.height??1)*10} rx="2" fill="var(--warning)" opacity="0.75"/>
              {/if}
            {/each}
            {#each floor0.seats ?? [] as seat}
              <circle cx={seat.x*10} cy={seat.y*10} r="2.1" fill="var(--text-muted)" opacity="0.8"/>
            {/each}
          </svg>
          {#if mfState.floors.length > 1}
            <span class="fp-floors-badge">{mfState.floors.length} {t.hallAdmin.floors}</span>
          {/if}
        </div>
      {:else}
        <div class="card--inset fp-empty">
          <span class="icon-tile">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
          </span>
          <p>{t.hallAdmin.noFloorplanDrawn}</p>
        </div>
      {/if}
      <div class="fp-footer">
        <a href="/app/manage/halls/{data.hall.id}/editor" class="btn-primary btn-full">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          {t.event.openLayoutEditor}
        </a>
      </div>
    </div>
    <div class="fp-group">
    <div class="fp-subhead">
      <h2>
        <button class="section-trigger section-head--row" type="button" aria-expanded={templatesOpen} onclick={() => templatesOpen = !templatesOpen}>
          <span class="section-trigger-left">
            {t.halls.templates}
            {#if data.templates.length > 0}<span class="card-count">{data.templates.length}</span>{/if}
          </span>
          <svg class="chevron" class:open={templatesOpen} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </h2>
    </div>
    {#if templatesOpen}
      <div class="section-body" transition:slide={{ duration: 180 }}>
        <div class="templates-bar">
          <p class="templates-hint">{t.hallAdmin.templatesHint}</p>
          <button type="button" class="btn-action btn-sm" onclick={openTmplNew}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            {t.hallAdmin.createTemplate}
          </button>
        </div>
        {#if data.templates.length === 0}
          <div class="card--inset list-empty">
            <span class="icon-tile">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
            </span>
            <span>{t.hallAdmin.templatesEmpty}</span>
          </div>
        {:else}
          <div class="media-grid templates-grid">
            {#each data.templates as tmpl}
              {@const tmplFloor = migrateToMultiFloor(tmpl.layout_json).floors[0]}
              <article class="media-card template-card">
                <a class="media-photo template-preview" href="/app/manage/halls/{data.hall.id}/templates/{tmpl.id}" aria-label="{t.common.edit} {tmpl.name}">
                  <svg viewBox={computeViewBox(tmplFloor)} preserveAspectRatio="xMidYMid meet">
                    {#each tmplFloor.tables as tbl}
                      {#if tbl.shape === 'round'}
                        <circle cx={tbl.x*10} cy={tbl.y*10} r={(tbl.radius??1)*10*0.8} fill="var(--warning)" opacity="0.75"/>
                      {:else}
                        <rect x={(tbl.x-(tbl.width??2)/2)*10} y={(tbl.y-(tbl.height??1)/2)*10}
                          width={(tbl.width??2)*10} height={(tbl.height??1)*10} rx="2" fill="var(--warning)" opacity="0.75"/>
                      {/if}
                    {/each}
                  </svg>
                </a>
                <div class="template-meta">
                  <h3 class="template-name">{tmpl.name}</h3>
                  {#if parseEventTypes(tmpl.event_type).length}
                    <span class="template-types">
                      {#each parseEventTypes(tmpl.event_type) as key}
                        <span class="template-type">{t.eventTypes[key]}</span>
                      {/each}
                    </span>
                  {/if}
                </div>
                <div class="media-bottom template-actions">
                  <a class="btn-edit-tmpl" href="/app/manage/halls/{data.hall.id}/templates/{tmpl.id}">{t.event.editLayout}</a>
                  <form method="POST" action="?/deleteTemplate" use:enhance>
                    <input type="hidden" name="id" value={tmpl.id} />
                    <button class="btn-del" type="submit" aria-label="{t.common.delete} {tmpl.name}"
                      onclick={(e) => { if (!confirm(t.hallAdmin.confirmDeleteTemplate)) e.preventDefault(); }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                    </button>
                  </form>
                </div>
              </article>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
    </div>
    <div class="fp-group">
    <div class="fp-subhead">
      <h2>
        <button class="section-trigger section-head--row" type="button" aria-expanded={tableTypesOpen} onclick={() => tableTypesOpen = !tableTypesOpen}>
          <span class="section-trigger-left">
            {t.halls.tableTypes}
            {#if data.tableTypes.length > 0}<span class="card-count">{data.tableTypes.length}</span>{/if}
          </span>
          <svg class="chevron" class:open={tableTypesOpen} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </h2>
    </div>
    {#if tableTypesOpen}
      <div class="section-body" transition:slide={{ duration: 180 }}>
        {#if form?.tableTypeSuccess}
          <div class="alert alert-success" style="margin:12px 0 0">{t.hallAdmin.tableTypeSaved}</div>
        {/if}
        {#if form?.tableTypeError}
          <div class="alert alert-error" style="margin:12px 0 0">{form.tableTypeError}</div>
        {/if}
        <div class="tt-wrap">
          {#if data.tableTypes.length === 0}
            <div class="card--inset tt-empty">
              <span class="icon-tile">
                <svg class="tt-empty-icon" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="3" y="8" width="18" height="9" rx="2"/><line x1="7" y1="17" x2="7" y2="20"/><line x1="17" y1="17" x2="17" y2="20"/><line x1="3" y1="12" x2="21" y2="12"/></svg>
              </span>
              <div>
                <h3 class="tt-empty-title">{t.hallAdmin.noTableTypes}</h3>
                <p class="tt-empty-sub">{t.hallAdmin.tableTypesEmptySub}</p>
              </div>
              <button type="button" class="btn-save" onclick={openTtNew}>{t.halls.addTableType}</button>
            </div>
          {:else}
            <div class="media-grid tt-grid">
              {#each data.tableTypes as tt}
                <article class="media-card tt-card">
                  <button type="button" class="tt-card-hit" onclick={() => openTtEdit(tt)} aria-label="{t.common.edit} {tt.name}"></button>
                  {#if tt.amount > 0}<span class="tt-qty">×{tt.amount}</span>{/if}
                  <div class="media-photo tt-preview">
                    {@render tablePreview(tt.shape, tt.width, tt.height, tt.max_chairs, tt.color || '#9a6512')}
                  </div>
                  <div class="tt-card-body">
                    <h3 class="tt-card-name">{tt.name}</h3>
                    <span class="tt-card-meta">{ttMeta(tt)}</span>
                  </div>
                  <form class="tt-card-del" method="POST" action="?/deleteTableType" use:enhance>
                    <input type="hidden" name="id" value={tt.id} />
                    <button type="submit" title={t.common.delete} aria-label="{t.common.delete} {tt.name}"
                      onclick={(e) => { if (!confirm(t.hallAdmin.confirmDeleteTableType)) e.preventDefault(); }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                    </button>
                  </form>
                </article>
              {/each}
              <button type="button" class="tt-add-tile" onclick={openTtNew}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                {t.halls.addTableType}
              </button>
            </div>
          {/if}
        </div>
      </div>
    {/if}
    </div>
  </section>

</div><!-- /page -->

{#if savedNotice && !anyDirty}
  <div class="saved-toast" role="status" aria-live="polite" transition:slide={{ duration: 160 }}>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
    {t.settingsPages.changesSaved}
  </div>
{/if}

{#if anyDirty}
  <div class="save-bar" transition:slide={{ duration: 200 }}>
    <span class="save-bar-msg">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      {t.hallAdmin.unsavedChanges}
    </span>
    <div class="save-bar-actions">
      <button type="button" class="save-bar-revert" onclick={revertAll} disabled={savingAll}>
        {t.hallAdmin.revert}
      </button>
      <button type="button" class="save-bar-btn" onclick={saveAll} disabled={savingAll}>
        {savingAll ? t.hallAdmin.saving : t.hallAdmin.saveAllChanges}
      </button>
    </div>
  </div>
{/if}

<!-- ─── Block dialog ──────────────────────────────────────────────────────────── -->
{#if showBlockDialog}
  <div class="dialog-backdrop" onmousedown={(e) => { if (e.target === e.currentTarget) showBlockDialog = false; }} role="presentation">
    <div class="card--raised dialog" onclick={(e) => e.stopPropagation()} role="dialog" tabindex="-1">
      <div class="dialog-header">
        <h2 class="dialog-title">{t.hallAdmin.addDateBlock}</h2>
        <button class="dialog-close" type="button" onclick={() => showBlockDialog=false} aria-label={t.hallAdmin.close}>
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
          <p class="step-label">{t.halls.selectDateRange}</p>
          <DateRangePicker onchange={onRangeChange} startDate={rangeFrom} endDate={rangeTo} eventDates={eventDateStrings} />
        {:else if blockStep === 2}
          <p class="step-label">{t.hallAdmin.whichDaysToBlock}</p>
          <div class="days-grid">
            {#each DAYS_FULL as day, i}
              <div class="day-col">
                <span class="day-name">{day}</span>
                <button type="button" class="day-check" class:checked={blockDays.includes(i)} onclick={() => toggleBlockDay(i)}>
                  {#if blockDays.includes(i)}
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent-contrast)" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                  {/if}
                </button>
              </div>
            {/each}
          </div>
        {:else}
          <p class="step-label">{t.halls.reason} <span class="step-optional">({t.hallAdmin.optionalWord})</span></p>
          <input class="field-input" type="text" bind:value={blockReason} placeholder={t.halls.reasonPlaceholder} />
          <p class="step-hint">{t.hallAdmin.visibleToAdminsOnly}</p>
        {/if}
      </div>

      {#if rangeFrom && rangeTo}
        <div class="dialog-range-bar">
          <span>{formatDate(rangeFrom)} – {formatDate(rangeTo)}</span>
          <span class="range-pill">{daysBetween(rangeFrom, rangeTo)} {t.halls.nDays}</span>
        </div>
      {/if}

      {#if conflictingEvents.length > 0 && rangeFrom && rangeTo}
        <div class="conflict-box">
          <div class="conflict-title">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            {conflictingEvents.length} {t.halls.reservations} {t.hallAdmin.inThisRange}
          </div>
          <ul class="conflict-list">{#each conflictingEvents as ev}<li>{ev.title} — {formatDate(ev.event_date)}</li>{/each}</ul>
          <button type="button" class="btn-ghost-sm" onclick={() => showCancelConfirm=true}>{t.hallAdmin.cancelTheseReservations}</button>
        </div>
      {/if}

      <div class="dialog-footer">
        <button type="button" class="btn-ghost" onclick={() => showBlockDialog=false}>{t.common.cancel}</button>
        <div class="dfr">
          {#if blockStep > 1}
            <button type="button" class="btn-ghost" onclick={() => blockStep--}>{t.common.back}</button>
          {/if}
          {#if blockStep < 3}
            <button type="button" class="btn-save" onclick={() => blockStep++}
              disabled={blockStep===1 && (!rangeFrom || !rangeTo)}>{t.hallAdmin.next}</button>
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
              <button type="submit" class="btn-save">{t.halls.createBlock}</button>
            </form>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- ─── Cancel confirm dialog ─────────────────────────────────────────────────── -->
{#if showCancelConfirm}
  <div class="dialog-backdrop" onmousedown={(e) => { if (e.target === e.currentTarget) showCancelConfirm = false; }} role="presentation">
    <div class="card--raised dialog dialog-sm" onclick={(e) => e.stopPropagation()} role="dialog" tabindex="-1">
      <div class="dialog-header">
        <h2 class="dialog-title">{t.hallAdmin.cancelReservationsQuestion}</h2>
        <button class="dialog-close" type="button" onclick={() => showCancelConfirm=false} aria-label={t.hallAdmin.close}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="dialog-body">
        <p class="confirm-text">{t.hallAdmin.cancelReservationsConfirm}</p>
        <ul class="conflict-list">{#each conflictingEvents as ev}<li>{ev.title} — {formatDate(ev.event_date)}</li>{/each}</ul>
      </div>
      <div class="dialog-footer">
        <button type="button" class="btn-ghost" onclick={() => showCancelConfirm=false}>{t.hallAdmin.goBack}</button>
        <form method="POST" action="?/cancelEvents"
          use:enhance={() => async ({ result, update }) => {
            await update();
            if (result.type === 'success') showCancelConfirm = false;
          }}>
          <input type="hidden" name="ids" value={conflictingEvents.map(e => e.id).join(',')} />
          <button type="submit" class="btn-destructive">{t.hallAdmin.cancelReservationsAction}</button>
        </form>
      </div>
    </div>
  </div>
{/if}

<!-- ─── Table type editor dialog ──────────────────────────────────────────────── -->
{#if ttDialogOpen}
  <div class="dialog-backdrop" onmousedown={(e) => { if (e.target === e.currentTarget) ttDialogOpen = false; }} role="presentation">
    <div class="card--raised dialog dialog-tt" onclick={(e) => e.stopPropagation()} role="dialog" tabindex="-1">
      <div class="dialog-header">
        <h2 class="dialog-title">{ttEditId ? t.hallAdmin.editTableType : t.hallAdmin.newTableType}</h2>
        <button class="dialog-close" type="button" onclick={() => ttDialogOpen=false} aria-label={t.hallAdmin.close}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div class="dialog-body tt-editor">
        {#if form?.tableTypeError}
          <div class="alert alert-error">{form.tableTypeError}</div>
        {/if}

        <div class="tt-editor-preview">
          {@render tablePreview(ttShape, ttWidth, ttHeight, ttMaxChairs, ttColor)}
          <span class="tt-editor-cap">{ttMaxChairs} {t.event.seats}</span>
        </div>

        <form id="tt-editor-form" class="tt-editor-form"
          method="POST" action={ttEditId ? '?/updateTableType' : '?/addTableType'}
          use:enhance={() => async ({ result, update }) => {
            await update({ reset: false });
            if (result.type === 'success') ttDialogOpen = false;
          }}>
          {#if ttEditId}<input type="hidden" name="id" value={ttEditId} />{/if}
          <input type="hidden" name="shape" value={ttShape} />
          <input type="hidden" name="color" value={ttColor} />

          <div class="field">
            <label class="field-label" for="tt-name">{t.common.name} *</label>
            <input class="field-input" id="tt-name" name="name" type="text"
              bind:value={ttName} placeholder={t.hallAdmin.tableNamePlaceholder} required />
          </div>

          <div class="field">
            <span class="field-label">{t.halls.tableShape}</span>
            <div class="shape-toggle">
              <button type="button" class="shape-btn" class:active={ttShape==='rect'} onclick={() => ttShape='rect'}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="6" width="18" height="12" rx="2"/></svg>
                {t.halls.rectangular}
              </button>
              <button type="button" class="shape-btn" class:active={ttShape==='round'} onclick={() => ttShape='round'}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/></svg>
                {t.halls.round}
              </button>
            </div>
          </div>

          {#if ttShape === 'rect'}
            <div class="field-row">
              <div class="field field-grow">
                <label class="field-label" for="tt-w">{t.halls.tableWidth}</label>
                <input class="field-input" id="tt-w" name="width" type="number" min="0.5" max="10" step="0.1" bind:value={ttWidth} />
              </div>
              <div class="field field-grow">
                <label class="field-label" for="tt-h">{t.halls.tableHeight}</label>
                <input class="field-input" id="tt-h" name="height" type="number" min="0.5" max="10" step="0.1" bind:value={ttHeight} />
              </div>
            </div>
          {:else}
            <div class="field">
              <label class="field-label" for="tt-r">{t.halls.tableRadius}</label>
              <input class="field-input" id="tt-r" name="radius" type="number" min="0.3" max="5" step="0.1" bind:value={ttRadius} />
            </div>
          {/if}

          <div class="field-row">
            <div class="field field-grow">
              <label class="field-label" for="tt-chairs">{t.halls.maxChairs}</label>
              <input class="field-input" id="tt-chairs" name="maxChairs" type="number" min="1" max="40" bind:value={ttMaxChairs} />
            </div>
            <div class="field field-grow">
              <label class="field-label" for="tt-amount">{t.hallAdmin.quantity} <span class="field-hint-inline">({t.hallAdmin.zeroUnlimited})</span></label>
              <input class="field-input" id="tt-amount" name="amount" type="number" min="0" max="200" bind:value={ttAmount} />
            </div>
          </div>

        </form>
      </div>

      <div class="dialog-footer">
        {#if ttEditId}
          <form method="POST" action="?/deleteTableType"
            use:enhance={() => async ({ result, update }) => {
              await update();
              if (result.type === 'success') ttDialogOpen = false;
            }}>
            <input type="hidden" name="id" value={ttEditId} />
            <button type="submit" class="btn-del-text"
              onclick={(e) => { if (!confirm(t.hallAdmin.confirmDeleteTableType)) e.preventDefault(); }}>{t.common.delete}</button>
          </form>
        {:else}
          <span></span>
        {/if}
        <div class="dfr">
          <button type="button" class="btn-ghost" onclick={() => ttDialogOpen=false}>{t.common.cancel}</button>
          <button type="submit" form="tt-editor-form" class="btn-save">{ttEditId ? t.hallAdmin.saveChanges : t.halls.addTableType}</button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- ─── Extra editor dialog ───────────────────────────────────────────────────── -->
{#if tmplDialogOpen}
  <div class="dialog-backdrop" onmousedown={(e) => { if (e.target === e.currentTarget) tmplDialogOpen = false; }} role="presentation">
    <div class="card--raised dialog" onclick={(e) => e.stopPropagation()} role="dialog" tabindex="-1">
      <div class="dialog-header">
        <h2 class="dialog-title">{t.hallAdmin.newTemplate}</h2>
        <button class="dialog-close" type="button" onclick={() => tmplDialogOpen = false} aria-label={t.hallAdmin.close}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <form class="dialog-form" method="POST" action="?/createTemplate" use:enhance>
        <p class="dialog-lead">{t.hallAdmin.templateDialogLead}</p>
        {#if form?.templateError}<div class="inline-err">{form.templateError}</div>{/if}
        <div class="field">
          <label class="field-label" for="tmpl-name">{t.common.name}</label>
          <input class="field-input" id="tmpl-name" name="name" bind:value={tmplName} placeholder={t.hallAdmin.templateNamePlaceholder} required />
        </div>
        <div class="field">
          <span class="field-label">{t.hallAdmin.eventTypesOptional}</span>
          <div class="type-chips">
            {#each EVENT_TYPE_KEYS as key}
              <button type="button" class="type-chip" class:on={tmplTypes.has(key)} onclick={() => toggleTmplType(key)}>
                {t.eventTypes[key]}
              </button>
            {/each}
          </div>
          {#each [...tmplTypes] as key}<input type="hidden" name="eventTypes" value={key} />{/each}
        </div>
        <div class="extra-dialog-actions">
          <button type="button" class="btn-ghost" onclick={() => tmplDialogOpen = false}>{t.common.cancel}</button>
          <button type="submit" class="btn-save" disabled={!tmplName.trim()}>{t.hallAdmin.createAndEditLayout}</button>
        </div>
      </form>
    </div>
  </div>
{/if}

{#if extraDialogOpen}
  <div class="dialog-backdrop" onmousedown={(e) => { if (e.target === e.currentTarget) extraDialogOpen = false; }} role="presentation">
    <div class="card--raised dialog" onclick={(e) => e.stopPropagation()} role="dialog" tabindex="-1">
      <div class="dialog-header">
        <h2 class="dialog-title">{extraEditing ? t.hallAdmin.editExtra : t.hallAdmin.newExtra}</h2>
        <button class="dialog-close" type="button" onclick={() => extraDialogOpen = false} aria-label={t.hallAdmin.close}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <form class="dialog-form" method="POST" action={extraEditing ? '?/updateExtra' : '?/addExtra'} use:enhance={() => async ({ result, update }) => {
        await update(); if (result.type === 'success') extraDialogOpen = false;
      }}>
        {#if extraEditing}<input type="hidden" name="id" value={extraEditing.id} />{/if}
        <div class="field">
          <label class="field-label" for="ex-name">{t.common.name}</label>
          <input class="field-input" id="ex-name" name="name" bind:value={exName} placeholder={t.hallProfile.amenityCatering} required />
        </div>
        <div class="field">
          <label class="field-label" for="ex-desc">{t.hallAdmin.descriptionOptional}</label>
          <textarea class="field-input field-textarea" id="ex-desc" name="description" bind:value={exDesc} rows="2" placeholder={t.hallAdmin.whatsIncludedPlaceholder}></textarea>
        </div>
        <div class="field-row">
          <div class="field" style="flex:1">
            <label class="field-label" for="ex-price">{t.hallAdmin.priceEur}</label>
            <input class="field-input" id="ex-price" name="price" type="number" min="0" step="0.01" bind:value={exPrice} placeholder="0.00" />
          </div>
          <div class="field" style="flex:1">
            <label class="field-label" for="ex-pricing">{t.hallProfile.pricing}</label>
            <select class="field-input" id="ex-pricing" name="pricing" bind:value={exPricing}>
              <option value="fixed">{t.hallAdmin.pricingFixed}</option>
              <option value="per_guest">{t.hallAdmin.pricingPerGuest}</option>
            </select>
          </div>
        </div>
        <div class="extra-dialog-actions">
          <button type="button" class="btn-ghost" onclick={() => extraDialogOpen = false}>{t.common.cancel}</button>
          <button type="submit" class="btn-save">{extraEditing ? t.common.save : t.hallAdmin.addExtra}</button>
        </div>
      </form>
    </div>
  </div>
{/if}

<!-- ─── Custom amenity dialog ─────────────────────────────────────────────────── -->
{#if amenityDialogOpen}
  <div class="dialog-backdrop" onmousedown={(e) => { if (e.target === e.currentTarget) amenityDialogOpen = false; }} role="presentation">
    <div class="card--raised dialog" onclick={(e) => e.stopPropagation()} role="dialog" tabindex="-1">
      <div class="dialog-header">
        <h2 class="dialog-title">{t.hallAdmin.customAmenityTitle}</h2>
        <button class="dialog-close" type="button" onclick={() => amenityDialogOpen = false} aria-label={t.hallAdmin.close}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <form class="dialog-form" method="POST" action="?/addAmenity" use:enhance={() => async ({ result, update }) => {
        await update({ reset: false }); if (result.type === 'success') amenityDialogOpen = false;
      }}>
        <p class="field-hint">{t.hallAdmin.customAmenityHint}</p>
        {#if form?.amenityError}<p class="alert alert-error">{form.amenityError}</p>{/if}
        <div class="field">
          <label class="field-label" for="am-sk">{t.hallAdmin.amenityLabelSk}</label>
          <input class="field-input" id="am-sk" name="labelSk" bind:value={newAmenitySk} maxlength="60" />
        </div>
        <div class="field">
          <label class="field-label" for="am-en">{t.hallAdmin.amenityLabelEn}</label>
          <input class="field-input" id="am-en" name="labelEn" bind:value={newAmenityEn} maxlength="60" />
        </div>
        <div class="dialog-actions">
          <button type="button" class="btn-outline btn-sm" onclick={() => amenityDialogOpen = false}>{t.common.cancel}</button>
          <button type="submit" class="btn-action btn-sm" disabled={!newAmenitySk.trim() && !newAmenityEn.trim()}>{t.hallAdmin.addAmenity}</button>
        </div>
      </form>
    </div>
  </div>
{/if}

<!-- Removing an amenity unticks it on every venue that used it, so it is confirmed. -->
{#if amenityDeleting}
  <div class="dialog-backdrop" onmousedown={(e) => { if (e.target === e.currentTarget) amenityDeleting = null; }} role="presentation">
    <div class="card--raised dialog dialog-narrow" onclick={(e) => e.stopPropagation()} role="dialog" tabindex="-1">
      <div class="dialog-header">
        <h2 class="dialog-title">{t.hallAdmin.removeAmenity}</h2>
      </div>
      <form class="dialog-form" method="POST" action="?/deleteAmenity" use:enhance={() => async ({ update }) => {
        await update(); amenityDeleting = null;
      }}>
        <input type="hidden" name="id" value={amenityDeleting.id} />
        <p class="field-hint">{amenityDeleting.label}</p>
        <div class="dialog-actions">
          <button type="button" class="btn-outline btn-sm" onclick={() => amenityDeleting = null}>{t.common.cancel}</button>
          <button type="submit" class="btn-danger">{t.common.delete}</button>
        </div>
      </form>
    </div>
  </div>
{/if}

<!-- ─── Image pickers ─────────────────────────────────────────────────────────── -->
<!-- Both buttons above only flip these flags; the dialogs themselves have to be
     mounted here or nothing ever appears. -->
<ImageUploadDialog
  bind:open={coverDialogOpen}
  onadd={(urls) => { if (urls[0]) profileCoverUrl = urls[0]; }}
/>

<ImageUploadDialog
  bind:open={galleryDialogOpen}
  multiple
  remaining={galleryLeft}
  onadd={addGalleryImages}
/>

<style>
  .saved-toast {
    position: fixed; left: 50%; bottom: 22px; transform: translateX(-50%); z-index: 60;
    display: flex; align-items: center; gap: 8px;
    padding: 10px 16px; border-radius: var(--radius-lg);
    background: var(--success-dim); color: var(--success);
    border: 1px solid color-mix(in srgb, var(--success) 25%, transparent);
    box-shadow: var(--shadow); font-size: 13px; font-weight: 600;
  }

  /* Floor plan is one block: the plan itself, then its templates, then its table
     types as sub-groups. They used to be three separate .section blocks, each with
     its own hairline and full padding, which read as three unrelated areas. */
  .fp-plan { margin-bottom: 4px; }
  .fp-group { border-top: 1px solid var(--border-subtle); padding-top: 14px; margin-top: 14px; }
  .fp-subhead { margin-bottom: 10px; }
  .fp-subhead h2 { font-size: var(--h3-size); font-weight: 600; letter-spacing: -.02em; }

  /* The status card no longer sits in the settings grid, so that row is one column. */
  .settings-row { grid-template-columns: 1fr !important; }

  /* The remaining count sits directly above the button, so an operator sees they
     have one slot left before filling the form rather than after a refused save. */
  .extras-add-wrap { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
  .extras-left { font-size: var(--meta-size); color: var(--text-muted); }

  /* The picker was dropped into an unstyled wrapper, so it inherited the narrow
     form column and its map controls (layers, zoom, scale, attribution) piled up
     on top of each other. Let it use the full width of the section. */
  .map-shell {
    width: 100%;
    min-width: 0;
    margin-top: 4px;
  }
  /* VenueMap draws its own zoom/fit stack (Leaflet's zoomControl is off) and
     repositions it itself below 600px; only Leaflet's bottom furniture is left,
     and at the narrowest widths the scale bar and the attribution share a line. */
  @media (max-width: 520px) {
    .map-shell :global(.leaflet-control-scale),
    .map-shell :global(.leaflet-control-attribution) { font-size: 8px; }
  }

  /* ── Location: geocode actions ──
     Two buttons and a status message on one line. Without this the row had no
     rule at all, so the buttons stacked and the message was indistinguishable
     from the hint above it — including when it was reporting a failure. */
  .geo-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .geo-msg { font-size: 11px; color: var(--text-muted); line-height: 1.5; min-width: 0; }
  .geo-msg.problem { color: var(--danger); }

  /* ── Visibility: the listed-with-a-gap warning ──
     Same shape as .gallery-limit-banner so the two read as one kind of notice.
     It states a gap; it never blocks the save, so it is warning-toned, not danger. */
  .listing-warning {
    display: flex; align-items: flex-start; gap: 8px;
    padding: 9px 12px; border-radius: var(--radius-sm); font-size: 12px; line-height: 1.5;
    background: var(--warning-dim);
    border: 1px solid color-mix(in srgb, var(--warning) 22%, transparent);
    color: var(--text-muted);
  }
  .listing-warning svg { color: var(--warning); flex-shrink: 0; margin-top: 1px; }

  /* ── Cover image ── */
  .sub-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  /* A tinted accent badge, which §3 allows — unlike accent-ink body text. */
  .recommend-pill {
    font-size: 9.5px; font-weight: 650; text-transform: uppercase; letter-spacing: .09em;
    padding: 2px 7px; border-radius: 3px;
    background: var(--accent-dim); color: var(--accent-ink);
    border: 1px solid color-mix(in srgb, var(--accent) 22%, transparent);
  }
  .cover-controls { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }

  /* ── Price band — the control discovery actually filters on ──
     Native radios so the group is keyboard-navigable and posts `priceBand`
     with the rest of the profile; the chrome matches .amenity-item. */
  .pricing-row { display: flex; gap: 16px; align-items: flex-start; }
  .band-field { flex-shrink: 0; width: 184px; }
  .band-row { display: flex; flex-direction: column; gap: 5px; }
  .band-opt {
    display: flex; align-items: center; gap: 8px;
    padding: 6px 10px; border-radius: var(--radius-sm); border: 1.5px solid var(--border);
    background: var(--bg-panel2); cursor: pointer;
    transition: border-color .15s, background .15s;
  }
  .band-opt:hover { border-color: var(--text-subtle); }
  .band-opt:has(input:checked) { border-color: var(--accent); background: var(--accent-dim); }
  .band-opt:focus-within { box-shadow: 0 0 0 3px var(--accent-dim); }
  .band-opt input { width: 14px; height: 14px; margin: 0; accent-color: var(--accent); flex-shrink: 0; }
  .band-sym {
    width: 26px; flex-shrink: 0;
    font-size: 12px; font-weight: 650; letter-spacing: .04em; color: var(--text-base);
  }
  .band-lbl { font-size: 12px; font-weight: 500; color: var(--text-base); }

  .amenity-custom { position: relative; padding-right: 26px; }
  .amenity-remove {
    position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
    display: grid; place-items: center; width: 16px; height: 16px;
    border: none; border-radius: var(--radius-sm); background: transparent;
    color: var(--text-subtle); cursor: pointer;
  }
  .amenity-remove:hover { background: var(--danger-dim); color: var(--danger); }
  .amenity-add { margin-top: 12px; }
  .dialog-narrow { max-width: 380px; }

  /* Extras — a .section; its head and rows come from the shared primitives. */
  .extras-head-text { min-width: 0; }
  .extras-add { display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0; white-space: nowrap; }

  .extras-disclaimer {
    display: flex; align-items: center; gap: 8px;
    margin-bottom: 14px; padding: 9px 12px; border-radius: var(--radius);
    background: var(--bg-panel2); border: 1px solid var(--border);
    font-size: 12px; color: var(--text-muted); line-height: 1.45;
  }
  .extras-disclaimer svg { flex-shrink: 0; color: var(--text-subtle); }

  .extras-empty { display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; color: var(--text-muted); }
  .extras-empty h3 { font-size: 14px; font-weight: 600; letter-spacing: -.03em; color: var(--text-base); margin: 0; }
  .extras-empty p { font-size: 13px; margin: 0; max-width: 40ch; line-height: 1.75; }

  .extra-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 4px 16px; }
  .extra-row .extra-tile-desc { grid-column: 1; }
  .extra-row .extra-tile-foot { grid-column: 2; grid-row: 1 / span 2; }
  .extra-tile-head { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .extra-tile-name { font-size: 13.5px; font-weight: 650; letter-spacing: -.02em; color: var(--text-base); }
  .extra-tile-pill { font-size: 10px; font-weight: 650; text-transform: uppercase; letter-spacing: .06em; padding: 2px 7px; border-radius: 3px; background: var(--bg-panel); border: 1px solid var(--border); color: var(--text-muted); white-space: nowrap; }
  .extra-tile-pill.per-guest { color: var(--accent-ink); border-color: color-mix(in srgb, var(--accent) 40%, var(--border)); background: var(--accent-dim); }
  .extra-tile-desc { font-size: 12px; color: var(--text-muted); line-height: 1.5; margin: 0; }
  .extra-tile-foot { display: flex; align-items: center; justify-content: flex-end; gap: 14px; }
  .extra-tile-price { font-size: 16px; font-weight: 650; letter-spacing: -.03em; color: var(--text-base); }
  .extra-tile-actions { display: flex; align-items: center; gap: 4px; }
  .extra-tile-actions form { margin: 0; display: flex; }
  .extra-icon { background: none; border: none; cursor: pointer; color: var(--text-subtle); padding: 5px; border-radius: var(--radius-sm); display: flex; transition: color .15s, background .15s; }
  .extra-icon:hover { color: var(--accent-ink); background: var(--accent-dim); }
  .extra-icon.danger:hover { color: var(--danger); background: var(--danger-dim); }

  .extras-limit { font-size: 12.5px; color: var(--text-muted); margin: 14px 0 0; }
  .extras-limit a { color: var(--accent-ink); font-weight: 600; }
  .extras-count { font-size: 11.5px; color: var(--text-muted); margin: 12px 0 0; }
  .inline-err { font-size: 12.5px; color: var(--danger); background: var(--danger-dim); border: 1px solid color-mix(in srgb, var(--danger) 24%, transparent); border-radius: var(--radius-sm); padding: 8px 12px; margin-bottom: 12px; }
  /* Padded, evenly-spaced body for the simple form dialogs (extra, template). */
  .dialog-form { padding: 18px 24px 22px; display: flex; flex-direction: column; gap: 14px; }
  /* The amenity dialogs name this one; the extras/template dialogs name the other.
     They are the same footer, and .dialog-actions had no rule at all. */
  .dialog-actions,
  .extra-dialog-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 4px; }
  .dialog-lead { margin: 0; font-size: 13px; color: var(--text-muted); line-height: 1.75; }

  @keyframes pageFadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes fadeSlideUp {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .page { padding-block: 24px; animation: pageFadeIn 0.15s ease both; }

  /* ── Breadcrumb ── */
  .breadcrumb {
    display: flex; align-items: center; gap: 5px; margin-bottom: 16px;
    font-size: 12px; color: var(--text-muted);
    animation: fadeSlideUp 0.3s ease both;
  }
  .locked-banner {
    display: flex; align-items: center; gap: 12px; margin-bottom: 16px;
    padding: 12px 16px; border-radius: var(--radius-lg);
    background: var(--warning-dim);
    border: 1px solid color-mix(in srgb, var(--warning) 30%, transparent);
    color: var(--warning);
  }
  .locked-banner svg { flex-shrink: 0; }
  .locked-banner div { display: flex; flex-direction: column; gap: 2px; flex: 1; }
  .locked-banner strong { font-size: 13px; font-weight: 650; letter-spacing: -.02em; }
  .locked-banner span { font-size: 12px; color: var(--text-muted); }
  .locked-banner form { margin: 0; flex-shrink: 0; }
  .breadcrumb a { color: var(--text-muted); text-decoration: none; transition: color .15s; }
  .breadcrumb a:hover { color: var(--accent-ink); }
  .breadcrumb svg { opacity: .5; flex-shrink: 0; }

  /* ── Shared bits ── */
  .card-count {
    font-size: 10px; font-weight: 650; padding: 2px 7px; border-radius: 3px;
    background: var(--accent-dim);
    color: var(--accent-ink);
  }

  /* ── Profile block (top) ── */
  .profile-block {
    animation: fadeSlideUp 0.35s ease both; animation-delay: 40ms;
  }

  .profile-card-head { align-items: center; gap: 20px; }
  .profile-head-left { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
  .profile-head-right { flex-shrink: 0; }

  .hall-name {
    font-size: var(--display-size); font-weight: 550; color: var(--text-base);
    letter-spacing: -.055em; line-height: 1.08; margin: 0;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .identity-chips { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }

  /* KPI trio */
  .kpi-trio {
    display: flex; border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden;
  }
  .kpi-item {
    display: flex; flex-direction: column; align-items: center;
    padding: 10px 16px; background: var(--bg-panel2);
    min-width: 72px;
  }
  .kpi-item + .kpi-item { border-left: 1px solid var(--border); }
  .kpi-val { font-size: 18px; font-weight: 650; letter-spacing: -.04em; color: var(--text-base); line-height: 1; }
  .kpi-lbl {
    font-size: 9px; font-weight: 600; text-transform: uppercase;
    letter-spacing: .09em; color: var(--text-muted); margin-top: 4px; white-space: nowrap;
  }

  /* ── Chips ── */
  .chip {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 11px; font-weight: 600; border-radius: 3px; padding: 3px 9px; white-space: nowrap;
  }
  .chip-success { background: var(--success-dim); color: var(--success); }
  .chip-closed  { background: var(--danger-dim); color: var(--danger); }
  .chip-muted   { background: var(--bg-panel2); color: var(--text-muted); border: 1px solid var(--border); }
  .chip-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; display: inline-block; }

  /* Side-by-side sections each keep their own hairline: .section drops the rule
     on a container's first child, which would otherwise unbalance these rows. */
  .dual-col > .section:first-child,
  .settings-row > .section:first-child { border-top: 1px solid var(--border); }

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

  .settings-cols {
    display: grid; grid-template-columns: 1fr 1fr; gap: 0 24px;
  }
  .settings-toggles { padding-right: 24px; border-right: 1px solid var(--border-subtle); }
  .settings-fields  { display: flex; flex-direction: column; gap: 12px; }

  /* ── List empty state — a quiet inset block, not a bordered strip. ── */
  .list-empty {
    display: flex; align-items: center; gap: 12px;
    padding: 16px 18px; font-size: 12px; color: var(--text-muted);
  }

  /* ── Reservations list — hairline rows ── */
  .res-row { text-decoration: none; }
  .res-date { font-size: 12px; font-weight: 650; color: var(--accent-ink); width: 60px; flex-shrink: 0; }
  .res-title { flex: 1; font-size: 13px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .res-arrow { color: var(--text-subtle); flex-shrink: 0; opacity: .5; transition: opacity .15s; }
  .res-row:hover .res-arrow { opacity: 1; }
  .res-more { padding: 10px 0 0; font-size: 11px; color: var(--text-muted); }

  /* ── Blocks list — hairline rows ── */
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
    position: absolute; inset: 0; background: var(--border); border-radius: 4px; transition: background .18s;
  }
  .toggle-slider::after {
    content: ''; position: absolute; width: 14px; height: 14px;
    left: 3px; top: 3px; background: var(--bg-panel); border-radius: 50%;
    transition: transform .18s; box-shadow: var(--shadow-xs);
  }
  .toggle-switch input:checked + .toggle-slider { background: var(--accent); }
  .toggle-switch input:checked + .toggle-slider::after { transform: translateX(16px); }

  /* ── Floorplan block ── */
  .fp-preview {
    position: relative; height: 160px; overflow: hidden;
    /* The same canvas token the floor-plan editor and viewer paint on, so the
       thumbnail, the editor and the printable manifest all read as one surface.
       It flips with the theme, and so do the wall/table/seat tokens drawn on it. */
    background: var(--editor-canvas);
    border-radius: var(--radius);
  }
  .fp-preview svg { width: 100%; height: 100%; }
  .fp-floors-badge {
    position: absolute; bottom: 8px; right: 8px;
    font-size: 10px; font-weight: 650; padding: 2px 8px; border-radius: 3px;
    background: var(--bg-panel); border: 1px solid var(--border); color: var(--text-muted);
  }
  .fp-empty {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 8px; color: var(--text-subtle);
  }
  .fp-empty p { font-size: 12px; color: var(--text-muted); margin: 0; }
  .fp-footer { padding-top: 14px; }

  /* ── Field shared ── */
  .field { display: flex; flex-direction: column; gap: 4px; }
  .field-row { display: flex; gap: 10px; align-items: flex-end; }
  .field-grow { flex: 1; min-width: 0; }
  .field-label {
    font-size: 10px; font-weight: 600; text-transform: uppercase;
    letter-spacing: .09em; color: var(--text-muted);
  }
  .field-hint        { font-size: 11px; color: var(--text-muted); line-height: 1.5; }
  .field-hint-inline { text-transform: none; font-weight: 400; letter-spacing: 0; font-size: 10px; }
  .field-input {
    padding: 7px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm);
    background: var(--bg-panel2); font-size: 13px;
    color: var(--text-base); font-family: inherit; outline: none;
    transition: border-color .15s, box-shadow .15s;
  }
  .field-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
  .field-textarea { resize: vertical; }
  .edit-row { display: flex; gap: 12px; align-items: flex-end; }

  .color-picker-row { display: flex; gap: 6px; flex-wrap: wrap; }
  .color-chip {
    width: 28px; height: 28px; border-radius: var(--radius-sm); flex-shrink: 0;
    border: 2px solid transparent;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    transition: transform .2s, box-shadow .15s;
    padding: 0;
  }
  .color-chip:hover { transform: scale(1.13); }
  .color-chip-active { box-shadow: 0 0 0 2px var(--bg-panel), 0 0 0 4px currentColor; }
  .color-chip-custom {
    background: var(--bg-panel2); border-color: var(--border);
    color: var(--text-muted); position: relative; overflow: hidden;
  }
  /* .color-chip-active draws its ring from currentColor. When a custom colour is
     picked the chip's background becomes that colour, but a white currentColor left
     the ring invisible against the panel — so the ring takes ink and only the
     checkmark (hardcoded in the markup) stays white on the chosen swatch. */
  .color-chip-custom.color-chip-active { color: var(--text-base); }
  .color-chip-custom input[type="color"] {
    position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%;
  }

  /* ── Buttons ── */
  .btn-primary {
    display: inline-flex; align-items: center; gap: 7px;
    padding: 8px 16px; border-radius: var(--radius-sm); font-size: 13px; font-weight: 650;
    background: var(--accent); color: var(--accent-contrast); border: none; cursor: pointer;
    font-family: inherit; text-decoration: none;
    transition: transform .2s, background .2s; white-space: nowrap;
  }
  .btn-primary:hover { background: var(--accent-hover); transform: translateY(-2px); text-decoration: none; }
  .btn-primary:active { transform: translateY(0); }
  .btn-full { width: 100%; justify-content: center; box-sizing: border-box; }

  .btn-save {
    padding: 7px 16px; border-radius: var(--radius-sm); font-size: 12px; font-weight: 650;
    background: var(--accent); color: var(--accent-contrast); border: none; cursor: pointer;
    font-family: inherit; transition: transform .2s, background .2s;
  }
  .btn-save:hover { background: var(--accent-hover); transform: translateY(-2px); }
  .btn-save:active { transform: translateY(0); }
  .btn-save:disabled { opacity: .4; cursor: default; transform: none; background: var(--accent); }

  .btn-ghost {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 7px 14px; border-radius: var(--radius-sm); font-size: 12px; font-weight: 500;
    background: none; border: 1px solid var(--border); color: var(--text-muted);
    cursor: pointer; font-family: inherit; transition: background .15s, border-color .15s, color .15s;
    text-decoration: none;
  }
  .btn-ghost:hover { background: var(--bg-hover); border-color: var(--text-subtle); color: var(--text-base); text-decoration: none; }

  .btn-ghost-sm {
    padding: 4px 10px; border-radius: var(--radius-sm); font-size: 11px; font-weight: 500;
    background: none; border: 1px solid var(--border); color: var(--text-muted);
    cursor: pointer; font-family: inherit; transition: background .15s, border-color .15s;
  }
  .btn-ghost-sm:hover { background: var(--bg-hover); border-color: var(--text-subtle); }

  .btn-accent-sm {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 4px 11px; border-radius: var(--radius-sm); font-size: 11px; font-weight: 600;
    background: var(--accent-dim);
    color: var(--accent-ink); border: 1px solid color-mix(in srgb, var(--accent) 22%, transparent);
    cursor: pointer; font-family: inherit; transition: transform .2s, background .2s;
  }
  .btn-accent-sm:hover { background: color-mix(in srgb, var(--accent) 18%, transparent); transform: translateY(-2px); }
  .btn-accent-sm:active { transform: translateY(0); }

  .btn-del {
    width: 30px; height: 30px; border-radius: var(--radius-sm); border: 1px solid var(--border);
    background: var(--bg-panel); color: var(--text-subtle); cursor: pointer;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    transition: color .15s, border-color .15s, background .15s;
  }
  .btn-del:hover {
    color: var(--danger);
    border-color: color-mix(in srgb, var(--danger) 40%, transparent);
    background: var(--danger-dim);
  }

  .btn-destructive {
    padding: 7px 16px; border-radius: var(--radius-sm); font-size: 12px; font-weight: 650;
    background: var(--danger); color: var(--on-danger); border: none;
    cursor: pointer; font-family: inherit; transition: transform .2s, opacity .2s;
  }
  .btn-destructive:hover { opacity: .85; transform: translateY(-2px); }
  .btn-destructive:active { transform: translateY(0); }

  /* ── Alert ── */
  .alert { padding: 9px 13px; border-radius: var(--radius-sm); font-size: 12px; }
  .alert-success {
    background: var(--success-dim);
    border: 1px solid color-mix(in srgb, var(--success) 25%, transparent);
    color: var(--success);
  }
  .alert-error {
    background: var(--danger-dim);
    border: 1px solid color-mix(in srgb, var(--danger) 25%, transparent);
    color: var(--danger);
  }

  /* ── Collapsible sections — the trigger sits inside the .section-head ── */
  /* The button carries the heading's own type, so the h2 can wrap it (a heading
     may not sit inside a button). */
  .section-trigger {
    width: 100%; padding: 0; background: none; border: none; cursor: pointer;
    font: inherit; letter-spacing: inherit; text-align: left; color: inherit;
  }
  .section-trigger:hover { color: var(--accent-ink); }
  .section-trigger-left { display: flex; align-items: center; gap: 8px; }
  .chevron { color: var(--text-subtle); transition: transform .2s; flex-shrink: 0; }
  .chevron.open { transform: rotate(90deg); }
  .section-body { overflow: hidden; }

  /* ── Templates — .media-grid of chrome-free cards ── */
  .templates-grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
  .template-card { display: flex; flex-direction: column; }
  .template-preview { aspect-ratio: 1.5; }
  .template-preview svg { width: 100%; height: 100%; }
  .template-meta { flex: 1; display: flex; flex-direction: column; gap: 3px; margin: 10px 0 10px; }
  .template-name { font-size: 12px; font-weight: 600; letter-spacing: -.01em; color: var(--text-base); margin: 0; }
  .template-types { display: flex; flex-wrap: wrap; gap: 4px; }
  .template-type {
    font-size: 9.5px; font-weight: 650; color: var(--accent-ink);
    text-transform: uppercase; letter-spacing: .09em;
    background: var(--accent-dim); padding: 2px 6px; border-radius: var(--radius-sm);
  }

  /* Event-type multi-select chips (create/edit template dialogs) */
  .type-chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .type-chip {
    font-size: 12px; font-weight: 600; padding: 5px 11px; border-radius: 3px;
    border: 1px solid var(--border); background: transparent;
    color: var(--text-muted); cursor: pointer; transition: background .15s, border-color .15s, color .15s;
  }
  .type-chip:hover { background: var(--bg-hover); border-color: var(--text-subtle); color: var(--text-base); }
  .type-chip.on { background: var(--text-base); border-color: var(--text-base); color: var(--bg-panel); }
  .template-actions { align-items: center; }
  .btn-edit-tmpl {
    font-size: 12px; font-weight: 600; color: var(--accent-ink); text-decoration: none;
    padding: 4px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm);
    transition: background .15s, border-color .15s;
  }
  .btn-edit-tmpl:hover { background: var(--bg-hover); border-color: var(--text-subtle); text-decoration: none; }
  .templates-bar {
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
    padding: 0 0 14px;
  }
  .templates-hint { margin: 0; font-size: 12px; color: var(--text-muted); line-height: 1.75; }

  /* ── Table types ── */
  /* The sub-block overlines inside the profile form are field-group labels, not
     section intros. §3: accent-ink is for the handful of real section overlines
     (there are nine of these in this one form), so they take --text-muted.
     Descendant, not child: two of them sit inside .sub-head / .gallery-header. */
  .profile-section .eyebrow { margin: 0; color: var(--text-muted); }
  .tt-wrap { padding: 14px 0 0; }
  /* Table types — a .media-grid; the table drawing is the card's picture. */
  .tt-grid { grid-template-columns: repeat(auto-fill, minmax(154px, 1fr)); }
  .tt-card { position: relative; display: flex; flex-direction: column; }
  .tt-card-hit { position: absolute; inset: 0; z-index: 1; background: none; border: none; cursor: pointer; padding: 0; }
  .tt-preview {
    aspect-ratio: 1.4; padding: 10px; box-sizing: border-box;
    background: radial-gradient(circle at 50% 42%, var(--bg-panel) 0%, var(--bg-panel2) 95%);
  }
  .tt-svg { width: 100%; height: 100%; display: block; }
  .tt-chair { fill: var(--text-subtle); opacity: .5; }
  .tt-card-body { position: relative; z-index: 0; padding: 10px 0 0; }
  .tt-card-name { display: block; font-size: 12.5px; font-weight: 600; letter-spacing: -.01em; color: var(--text-base); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin: 0; }
  .tt-card-meta { display: block; font-size: 10.5px; color: var(--text-muted); margin-top: 2px; }
  .tt-qty {
    position: absolute; top: 8px; left: 8px; z-index: 2;
    font-size: 10px; font-weight: 650; color: var(--text-base);
    background: var(--bg-panel); border: 1px solid var(--border);
    padding: 1px 7px; border-radius: 3px;
  }
  .tt-card-del { position: absolute; top: 6px; right: 6px; z-index: 3; margin: 0; opacity: 0; transition: opacity .15s; }
  .tt-card:hover .tt-card-del, .tt-card:focus-within .tt-card-del { opacity: 1; }
  .tt-card-del button {
    width: 26px; height: 26px; border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center;
    background: var(--bg-panel); border: 1px solid var(--border); color: var(--text-muted); cursor: pointer;
    transition: color .15s, border-color .15s, background .15s;
  }
  .tt-card-del button:hover { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 45%, var(--border)); background: var(--danger-dim); }

  .tt-add-tile {
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7px;
    min-height: 140px; border: 1.5px dashed var(--border); border-radius: var(--radius);
    background: none; color: var(--text-muted); cursor: pointer; font: inherit; font-size: 12px; font-weight: 600;
    transition: border-color .15s, color .15s, background .15s;
  }
  .tt-add-tile:hover { border-color: var(--accent); color: var(--accent-ink); background: var(--accent-dim); }

  .tt-empty {
    display: flex; flex-direction: column; align-items: center; gap: 14px;
    text-align: center;
  }
  .tt-empty-icon { color: var(--text-subtle); opacity: .55; }
  .tt-empty-title { font-size: 13px; font-weight: 600; letter-spacing: -.02em; color: var(--text-base); margin: 0 0 4px; }
  .tt-empty-sub { font-size: 12px; color: var(--text-muted); max-width: 44ch; margin: 0; line-height: 1.75; }

  /* shape toggle (table-type editor) */
  .shape-toggle { display: flex; gap: 6px; }
  .shape-btn {
    flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px;
    padding: 8px 6px; border-radius: var(--radius-sm); font: inherit; font-size: 11px; font-weight: 600;
    border: 1.5px solid var(--border); background: var(--bg-panel2);
    color: var(--text-muted); cursor: pointer; transition: background .15s, border-color .15s, color .15s;
  }
  .shape-btn.active { background: var(--accent-dim); color: var(--accent-ink); border-color: var(--accent); }

  /* table-type editor dialog */
  .dialog-tt { width: 470px; }
  .tt-editor { display: flex; flex-direction: column; gap: 16px; }
  .tt-editor-preview {
    position: relative; align-self: center; width: 180px; aspect-ratio: 1.3; padding: 12px;
    background: radial-gradient(circle at 50% 42%, var(--bg-panel) 0%, var(--bg-panel2) 95%);
    border: 1px solid var(--border); border-radius: var(--radius-lg);
  }
  .tt-editor-cap { position: absolute; bottom: 7px; right: 10px; font-size: 10px; font-weight: 650; color: var(--text-muted); }
  .tt-editor-form { display: flex; flex-direction: column; gap: 12px; }
  .btn-del-text {
    background: none; border: none; font: inherit; font-size: 12px; font-weight: 600;
    color: var(--danger); cursor: pointer; padding: 6px 2px;
  }
  .btn-del-text:hover { text-decoration: underline; }

  /* ── Dialog ── */
  .dialog-backdrop {
    position: fixed; inset: 0; background: rgba(0,0,0,.45);
    display: flex; align-items: center; justify-content: center; z-index: 100;
    backdrop-filter: blur(2px);
  }
  /* .card--raised supplies the surface, border, radius and shadow; the dialog
     keeps only its measure and its own internal padding. */
  .dialog { width: 520px; max-height: 90vh; overflow-y: auto; padding: 0; }
  .dialog-sm { width: 420px; }
  .dialog-header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 20px 24px 16px; border-bottom: 1px solid var(--border);
  }
  .dialog-title { font-size: 15px; font-weight: 650; letter-spacing: -.045em; color: var(--text-base); }
  .dialog-close {
    width: 28px; height: 28px; border-radius: var(--radius-sm); border: none; background: none;
    color: var(--text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center;
    transition: background .15s;
  }
  .dialog-close:hover { background: var(--bg-hover); }

  .steps-bar { display: flex; align-items: center; justify-content: center; padding: 16px 40px 8px; }
  .step { display: flex; align-items: center; justify-content: center; }
  .step-num {
    width: 26px; height: 26px; border-radius: 50%;
    background: var(--bg-panel2); border: 2px solid var(--border);
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 650; color: var(--text-muted); transition: background .2s, border-color .2s, color .2s;
  }
  .step.active .step-num, .step.done .step-num { background: var(--accent); border-color: var(--accent); color: var(--accent-contrast); }
  .step-line { width: 52px; height: 2px; background: var(--border); transition: background .2s; }
  .step-line.done { background: var(--accent); }

  .dialog-body { padding: 16px 24px 24px; }
  .step-label { font-size: 13px; font-weight: 600; letter-spacing: -.02em; color: var(--text-base); margin: 0 0 12px; }
  .step-optional { font-size: 11px; font-weight: 400; letter-spacing: 0; color: var(--text-muted); }
  .step-hint { font-size: 12px; color: var(--text-muted); margin: 8px 0 0; }

  .days-grid { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; padding: 4px 0; }
  .day-col   { display: flex; flex-direction: column; align-items: center; gap: 5px; }
  .day-name  { font-size: 10px; font-weight: 600; color: var(--text-muted); }
  .day-check {
    width: 28px; height: 28px; border-radius: var(--radius-sm);
    border: 2px solid var(--border); background: var(--bg-panel2);
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    transition: background .15s, border-color .15s;
  }
  .day-check:hover { border-color: var(--text-subtle); }
  .day-check.checked { background: var(--accent); border-color: var(--accent); }

  .dialog-range-bar {
    display: flex; align-items: center; justify-content: space-between;
    margin: 0 24px 4px; padding: 8px 12px;
    background: var(--accent-dim);
    border: 1px solid color-mix(in srgb, var(--accent) 18%, transparent);
    border-radius: var(--radius-sm); font-size: 12px; color: var(--text-base);
  }
  .range-pill {
    font-size: 11px; font-weight: 600; color: var(--accent-ink); padding: 1px 8px; border-radius: 3px;
    background: color-mix(in srgb, var(--accent) 18%, transparent);
  }
  .conflict-box {
    margin: 6px 24px 0; padding: 10px 13px;
    background: var(--warning-dim);
    border: 1px solid color-mix(in srgb, var(--warning) 22%, transparent);
    border-radius: var(--radius);
  }
  .conflict-title {
    display: flex; align-items: center; gap: 6px;
    font-size: 12px; font-weight: 600; letter-spacing: -.01em; color: var(--text-base); margin-bottom: 6px;
  }
  .conflict-title svg { color: var(--warning); flex-shrink: 0; }
  .conflict-list { list-style: none; padding: 0; margin: 0 0 8px; }
  .conflict-list li { font-size: 12px; color: var(--text-muted); padding: 1px 0; line-height: 1.5; }
  .confirm-text { font-size: 13px; color: var(--text-base); margin: 0 0 10px; }

  .dialog-footer {
    display: flex; justify-content: space-between; align-items: center;
    padding: 14px 24px 20px; border-top: 1px solid var(--border);
  }
  .dfr { display: flex; gap: 8px; align-items: center; }

  /* ── Profile editor two-column layout ── */
  .profile-form { display: flex; flex-direction: column; }
  .profile-section {
    padding: 16px 18px 16px 0; border-bottom: 1px solid var(--border-subtle);
    display: flex; flex-direction: column; gap: 12px;
  }
  .slug-row { display: flex; gap: 10px; align-items: stretch; }
  .slug-wrap {
    display: flex; align-items: center; border: 1px solid var(--border);
    border-radius: var(--radius-sm); overflow: hidden; flex: 1; min-width: 0;
    transition: border-color .15s, box-shadow .15s;
  }
  /* The inner input drops its own ring, so the wrapper carries it instead. */
  .slug-wrap:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
  .view-live-btn { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; flex-shrink: 0; }
  .slug-prefix {
    padding: 7px 10px; background: var(--bg-panel2);
    font-size: 12px; color: var(--text-muted); border-right: 1px solid var(--border);
    white-space: nowrap; flex-shrink: 0;
  }
  .slug-input { border: none; border-radius: 0; flex: 1; }
  .slug-input:focus { outline: none; border: none; box-shadow: none; }

  /* The inline uploader this styled is gone — ImageUploadDialog owns the upload and
     the cover button is a plain .btn-outline, so .cover-upload-btn and the
     .uploading states below matched nothing. */
  .cover-row { display: flex; gap: 14px; align-items: flex-start; }
  .cover-thumb { width: 100px; height: 70px; border-radius: var(--radius); overflow: hidden; border: 1px solid var(--border); flex-shrink: 0; }
  .cover-thumb img { width: 100%; height: 100%; object-fit: cover; }

  /* ── Gallery ── */
  .gallery-header {
    display: flex; align-items: center; justify-content: space-between;
  }
  .gallery-count {
    font-size: 11px; font-weight: 600; color: var(--text-muted);
    padding: 1px 8px; border-radius: 3px;
    background: var(--bg-panel2);
    border: 1px solid var(--border);
  }
  .gallery-count.at-limit { color: var(--warning); background: var(--warning-dim); border-color: color-mix(in srgb, var(--warning) 30%, transparent); }

  .gallery-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }

  .gallery-item {
    position: relative;
    aspect-ratio: 4/3;
    border-radius: var(--radius);
    overflow: hidden;
    border: 1px solid var(--border);
    background: var(--bg-panel2);
  }
  .gallery-item img { width: 100%; height: 100%; object-fit: cover; display: block; }

  .gallery-remove {
    position: absolute; top: 5px; right: 5px;
    width: 22px; height: 22px; border-radius: 50%;
    background: rgba(0,0,0,.55); border: none; color: #fff;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    opacity: 0; transition: opacity .15s;
  }
  .gallery-item:hover .gallery-remove { opacity: 1; }

  .gallery-add-slot {
    aspect-ratio: 4/3;
    border-radius: var(--radius);
    border: 1.5px dashed var(--border);
    background: var(--bg-panel2);
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 5px; cursor: pointer; color: var(--text-muted);
    transition: border-color .15s, color .15s, background .15s;
  }
  .gallery-add-slot:hover { border-color: var(--accent); color: var(--accent-ink); background: var(--accent-dim); }
  .gallery-add-slot span { font-size: 11px; font-weight: 500; }

  .gallery-limit-banner {
    display: flex; align-items: center; gap: 7px;
    padding: 8px 12px; border-radius: var(--radius-sm); font-size: 12px;
    background: var(--warning-dim);
    border: 1px solid color-mix(in srgb, var(--warning) 22%, transparent);
    color: var(--text-muted);
  }
  .gallery-limit-banner svg { color: var(--warning); flex-shrink: 0; }
  .gallery-upgrade-link {
    margin-left: auto; font-weight: 600; font-size: 12px;
    color: var(--accent-ink); text-decoration: none;
  }
  .gallery-upgrade-link:hover { text-decoration: underline; }

  .amenities-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; }
  .amenity-item {
    display: flex; align-items: center; gap: 7px;
    padding: 7px 10px; border-radius: var(--radius-sm); border: 1.5px solid var(--border);
    background: var(--bg-panel2); cursor: pointer;
    transition: border-color .15s, background .15s;
  }
  .amenity-item:hover { border-color: var(--text-subtle); }
  .amenity-item:has(input:checked) {
    border-color: var(--accent);
    background: var(--accent-dim);
  }
  .amenity-item input { width: 14px; height: 14px; accent-color: var(--accent); flex-shrink: 0; }
  .amenity-label { font-size: 12px; font-weight: 500; color: var(--text-base); }

  .profile-fields-row { display: flex; gap: 12px; flex-wrap: wrap; }

  .hours-grid { display: flex; flex-direction: column; gap: 6px; }
  .hours-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; }
  .hours-day { width: 82px; font-size: 12px; font-weight: 500; color: var(--text-base); flex-shrink: 0; }
  .time-input { width: 96px; flex-shrink: 0; padding: 5px 8px; font-size: 12px; }
  .hours-sep { font-size: 12px; color: var(--text-muted); flex-shrink: 0; }
  .hours-closed { font-size: 12px; color: var(--text-muted); flex-shrink: 0; }


  /* ── Profile editor two-column layout ── */
  .profile-editor-wrap {
    display: grid;
    grid-template-columns: 1fr 320px;
    align-items: start;
  }
  .profile-preview-col {
    border-left: 1px solid var(--border);
    background: var(--bg-panel2);
  }
  .preview-sticky {
    position: sticky; top: 24px; padding: 16px;
    display: flex; flex-direction: column; gap: 12px;
  }

  /* Section overline — eyebrow motif. */
  .preview-label {
    display: flex; align-items: center; gap: 6px;
    font-size: 10px; font-weight: 650; text-transform: uppercase;
    letter-spacing: .13em; color: var(--text-muted); line-height: 1.7;
  }
  .preview-slug {
    font-size: 10px; font-weight: 500; text-transform: none; letter-spacing: 0;
    color: var(--text-muted); margin-left: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }

  .preview-card {
    border: 1px solid var(--border); border-radius: var(--radius);
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
    font-size: 9px; font-weight: 650; text-transform: uppercase; letter-spacing: .13em;
    color: rgba(255,255,255,.65); position: absolute; top: 8px; right: 10px;
  }
  /* Sits on the photo scrim, not on paper, so it cannot take the themed --success
     token (that one flips dark on a light page). This is the palette's light green. */
  .preview-status.pub { color: #6cc292; }
  .preview-hall-name { font-size: 14px; font-weight: 650; letter-spacing: -.03em; color: #fff; line-height: 1.2; margin: 0; text-shadow: 0 1px 4px rgba(0,0,0,.4); }
  .preview-meta-row { display: flex; gap: 6px; flex-wrap: wrap; }
  .preview-meta-chip {
    display: inline-flex; align-items: center; gap: 3px;
    font-size: 10px; font-weight: 500; color: rgba(255,255,255,.85);
    background: rgba(0,0,0,.25); padding: 2px 7px; border-radius: 3px; backdrop-filter: blur(4px);
  }

  .preview-body { padding: 12px; display: flex; flex-direction: column; gap: 10px; max-height: 400px; overflow-y: auto; }
  .preview-desc { font-size: 11px; color: var(--text-muted); line-height: 1.75; margin: 0; }
  .preview-amenities { display: flex; flex-wrap: wrap; gap: 4px; }
  .preview-amenity-chip {
    font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 3px;
    background: var(--accent-dim); color: var(--accent-ink);
    border: 1px solid color-mix(in srgb, var(--accent) 22%, transparent);
  }
  .preview-block { padding-top: 8px; border-top: 1px solid var(--border); }
  .preview-block-title {
    font-size: 10px; font-weight: 650; text-transform: uppercase; letter-spacing: .13em;
    color: var(--text-muted); margin: 0 0 4px; line-height: 1.7;
  }
  .preview-block-text { font-size: 11px; color: var(--text-muted); line-height: 1.75; margin: 0; white-space: pre-wrap; }
  .preview-contact-list { display: flex; flex-direction: column; gap: 2px; font-size: 11px; color: var(--text-muted); line-height: 1.5; }
  .preview-gallery { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
  .preview-gallery-item { aspect-ratio: 4/3; border-radius: var(--radius-sm); overflow: hidden; }
  .preview-gallery-item img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .preview-hours { display: flex; flex-direction: column; gap: 2px; }
  .preview-hours-row { display: flex; gap: 8px; font-size: 11px; }
  .preview-hours-day { width: 28px; font-weight: 600; color: var(--text-base); flex-shrink: 0; }
  .preview-hours-time { color: var(--text-muted); }
  .preview-hours-closed { color: var(--text-muted); font-style: italic; }
  .preview-empty { font-size: 11px; color: var(--text-muted); text-align: center; padding: 16px 0; margin: 0; line-height: 1.75; }

  /* ── Responsive ── */
  @media (max-width: 900px) {
    .dual-col     { grid-template-columns: 1fr; }
    .settings-row { grid-template-columns: 1fr; }
    .settings-cols { grid-template-columns: 1fr; }
    .settings-toggles { border-right: none; border-bottom: 1px solid var(--border); }
    .profile-card-head { flex-direction: column; align-items: flex-start; gap: 12px; }
    .profile-editor-wrap { grid-template-columns: 1fr; }
    .profile-preview-col { border-left: none; border-top: 1px solid var(--border); }
    .preview-sticky { position: static; }
    .gallery-grid { grid-template-columns: repeat(3, 1fr); }
    .pricing-row { flex-direction: column; }
    .band-field { width: 100%; }
    .band-row { flex-direction: row; flex-wrap: wrap; }
  }

  /* ── Floating save bar ───────────────────────────────────────────────────── */
  .save-bar {
    position: fixed;
    bottom: 0;
    left: var(--sidebar-width, 240px);
    right: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 14px 28px;
    background: var(--bg-panel);
    border-top: 1px solid var(--border);
    /* --shadow, cast upward: the bar floats above the page from its bottom edge. */
    box-shadow: 0 -12px 36px rgba(41, 54, 33, .07);
  }
  .save-bar-msg {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 13px;
    color: var(--text-muted);
  }
  .save-bar-actions { display: flex; align-items: center; gap: 8px; }
  .save-bar-revert {
    padding: 8px 16px;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-muted);
    font-size: 13px;
    font-weight: 500;
    border: 1px solid var(--border);
    cursor: pointer;
    transition: background .15s, color .15s, border-color .15s;
  }
  .save-bar-revert:hover { background: var(--bg-hover); color: var(--text-base); border-color: var(--text-subtle); }
  .save-bar-revert:disabled { opacity: .4; cursor: default; }
  .save-bar-btn {
    padding: 8px 20px;
    border-radius: var(--radius-sm);
    background: var(--accent);
    color: var(--accent-contrast);
    font-size: 13px;
    font-weight: 650;
    border: none;
    cursor: pointer;
    transition: transform .2s, background .2s;
  }
  .save-bar-btn:hover { background: var(--accent-hover); transform: translateY(-2px); }
  .save-bar-btn:active { transform: translateY(0); }
  .save-bar-btn:disabled { opacity: .5; cursor: default; transform: none; background: var(--accent); }

  /* The lift is a transform, so it must be switched off, not merely shortened. */
  @media (prefers-reduced-motion: reduce) {
    .btn-primary:hover,
    .btn-save:hover,
    .btn-accent-sm:hover,
    .btn-destructive:hover,
    .save-bar-btn:hover,
    .color-chip:hover { transform: none; }
  }
</style>
