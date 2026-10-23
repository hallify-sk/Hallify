<script lang="ts">
  import Icon from './Icon.svelte';
  import MapLayers from './MapLayers.svelte';
  import { getContext, onMount, tick, untrack } from 'svelte';
  import type * as Leaflet from 'leaflet';
  import 'leaflet/dist/leaflet.css';
  import { DEFAULT_CENTER, type MapCenter } from './discovery';
  import { clusterPins } from './map-clusters';
  import { sk, en } from '$lib/i18n';
  import { userLocation, locateUser } from './user-location.svelte';
  import { createPointerKindDetector } from '$lib/pointer-kind';
  import { mapPreferences, loadMapPreferences } from './map-preferences.svelte';

  export interface MapPoint { id: string; name: string; latitude: number; longitude: number; label?: string; demo?: boolean }
  let { points = [], selected = null, selectionRevision = 0, onselect, onpick, onlocation, english = false, fitKey = '', areaCenter = null, areaLabel = null, radiusKm = 50, explorerHref = '', theme, fullScreen = false }: {
    points?: MapPoint[]; selected?: string | null; onselect?: (id: string) => void;
    onpick?: (lat: number, lng: number) => void; english?: boolean; fitKey?: string;
    areaCenter?: MapCenter | null;
    /** Names the place the area is centred on, when it came from a search rather
     *  than the visitor's own position. Without it the badge claims "around you"
     *  even when the map is centred on a city they typed. */
    areaLabel?: string | null;
    radiusKm?: number; explorerHref?: string; theme?: 'light' | 'dark';
    selectionRevision?: number;
    onlocation?: (center: MapCenter) => void;
    fullScreen?: boolean;
  } = $props();
  const themeContext = getContext<(() => 'light' | 'dark') | undefined>('marketing-theme');
  const mapTheme = $derived(theme ?? themeContext?.() ?? 'light');
  const tileStyle = $derived(mapPreferences.style === 'auto' ? mapTheme : mapPreferences.style);
  let trackpadEnabled = $state(untrack(() => fullScreen));
  let container: HTMLDivElement;
  let map = $state.raw<Leaflet.Map | null>(null), library = $state.raw<typeof Leaflet | null>(null);
  let status = $state<'loading' | 'ready' | 'error'>('loading'), zoom = $state(6);
  const markers = new Map<string, Leaflet.Marker>();
  const clusterMarkers: Leaflet.Marker[] = [];
  /** From this zoom on every pin is drawn on its own. */
  const CLUSTER_UNTIL_ZOOM = 16;
  const clusterLabel = (count: number) => (english ? en : sk).appHalls.mapCluster(count);
  let previousFit = '', previousSelection: string | null = null;
  let locationMarker: Leaflet.CircleMarker | null = null;
  let radiusCircle: Leaflet.Circle | null = null;
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const valid = (p: MapPoint) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180;

  function fit() {
    if (!map || !library) return;
    const compact = map.getSize().y < 360;
    const paddingBottom = onpick || !selected ? 30 : compact ? 95 : 115;
    if (areaCenter) map.fitBounds(library.latLng(areaCenter.latitude, areaCenter.longitude).toBounds(radiusKm * 2000), {
      paddingTopLeft: [30, compact ? 55 : 75], paddingBottomRight: [60, paddingBottom], animate: !reduced(),
    });
    else {
      const positions = points.filter(valid);
      if (positions.length === 1) map.setView([positions[0].latitude, positions[0].longitude], onpick ? 16 : 12, { animate: !reduced() });
      else if (positions.length) map.fitBounds(library.latLngBounds(positions.map(p => [p.latitude, p.longitude])), { paddingTopLeft: [40,75], paddingBottomRight: [55,paddingBottom], maxZoom: 13, animate: !reduced() });
      else {
        // Nothing to fit: a city the query names, otherwise the whole of Slovakia.
        const q = fitKey.toLowerCase();
        const city: [number, number] | null = q.includes('bratis') ? [48.1486,17.1077] : q.includes('brno') ? [49.1951,16.6068] : null;
        if (city) map.setView(city, 10, { animate: !reduced() });
        else map.setView([DEFAULT_CENTER.latitude, DEFAULT_CENTER.longitude], 7, { animate: !reduced() });
      }
    }
  }
  function retry() {
    if (!map) { window.location.reload(); return; }
    status = 'loading'; map.eachLayer(layer => { if ('redraw' in layer) (layer as Leaflet.TileLayer).redraw(); });
  }
  async function useLocation() {
    await locateUser();
    if (userLocation.center) { onlocation?.(userLocation.center); await tick(); fit(); }
  }

  onMount(() => {
    loadMapPreferences();
    let disposed = false, resize: ResizeObserver | undefined;
    let frame = 0, dx = 0, dy = 0;
    const pointerKind = createPointerKindDetector();
    const wheel = (event: WheelEvent) => {
      // Let Leaflet debounce and animate pinch zoom, retaining the current tiles.
      // This listener is registered first so ordinary scrolling can pan the map
      // or continue through the page without also triggering Leaflet wheel zoom.
      if (event.ctrlKey || event.metaKey) return;

      // A trackpad has two gestures: two-finger scroll pans, pinch zooms. A mouse
      // has only the wheel, so panning with it left no way to zoom at all. Hand the
      // wheel back to Leaflet's own scrollWheelZoom, which zooms.
      //
      // It obeys the same activation gate as the pan: until the map has been clicked
      // (or it is the full-screen explorer), scrollWheelZoom stays disabled and the
      // event passes through, so scrolling PAST the map on the landing page scrolls
      // the page instead of silently zooming a map nobody was using.
      if (pointerKind.classify(event, event.timeStamp) === 'mouse') return;

      event.stopImmediatePropagation();
      if (!map || map.getZoom() === undefined || !trackpadEnabled) return;
      event.preventDefault();
      const factor = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? container.clientHeight : 1;
      dx += event.deltaX * factor * 1.8; dy += event.deltaY * factor * 1.8;
      if (!frame) frame = requestAnimationFrame(() => {
        frame = 0;
        if (map && (dx || dy)) map.panBy([dx,dy],{animate:false});
        dx = 0; dy = 0;
      });
    };
    const activate = () => { trackpadEnabled = true; map?.scrollWheelZoom.enable(); };
    const deactivate = () => { if (!fullScreen) { trackpadEnabled = false; map?.scrollWheelZoom.disable(); } };
    container.addEventListener('wheel',wheel,{passive:false});
    container.addEventListener('pointerdown',activate);
    container.addEventListener('pointerleave',deactivate);
    import('leaflet').then(L => {
      if (disposed) return;
      library = L;
      const instance = L.map(container, { scrollWheelZoom:untrack(() => fullScreen), wheelDebounceTime:16, wheelPxPerZoomLevel:12, zoomAnimation:!reduced(), fadeAnimation:!reduced(), zoomControl:false, minZoom:3, maxZoom:19, zoomSnap:0, zoomDelta:1, touchZoom:true });
      instance.attributionControl.setPrefix(false);
      L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(instance);
      const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors', maxZoom: 19, updateWhenZooming:false, keepBuffer:3,
      });
      let failed = false;
      tiles.on('loading', () => { failed = false; });
      tiles.on('tileload', () => { if (!failed) status = 'ready'; });
      tiles.on('tileerror', () => { failed = true; status = 'error'; });
      tiles.on('load', () => { status = failed ? 'error' : 'ready'; });
      tiles.addTo(instance);
      if (onpick) instance.on('click', (event: Leaflet.LeafletMouseEvent) => onpick?.(event.latlng.lat, event.latlng.lng));
      instance.on('zoomend', () => zoom = instance.getZoom());
      map = instance;
      resize = new ResizeObserver(() => instance.invalidateSize({ pan: false })); resize.observe(container);
    }).catch(() => { if (!disposed) status = 'error'; });
    return () => { disposed = true; resize?.disconnect(); container.removeEventListener('wheel',wheel); container.removeEventListener('pointerdown',activate); container.removeEventListener('pointerleave',deactivate); if (frame) cancelAnimationFrame(frame); map?.remove(); markers.clear(); clusterMarkers.length = 0; };
  });

  $effect(() => {
    const L = library, instance = map; if (!L || !instance) return;
    const positions = points.filter(valid), ids = new Set(positions.map(p => p.id));
    // Group pins that would overlap at this zoom (re-run on every zoomend through
    // `zoom`). The location picker has one pin, and from street level on, pins that
    // still overlap share a building: grouping them would only ever zoom in again.
    void zoom;
    const current = instance.getZoom() as number | undefined;
    const groups = onpick || current === undefined || current >= CLUSTER_UNTIL_ZOOM
      ? positions.map(point => ({ items: [point] }))
      : clusterPins(positions.map(point => { const at = instance.project([point.latitude, point.longitude], current); return { item: point, x: at.x, y: at.y }; }), { keep: selected });
    const single = new Set(groups.filter(group => group.items.length === 1).map(group => group.items[0].id));
    for (const [id, marker] of markers) {
      if (!ids.has(id)) { marker.remove(); markers.delete(id); }
      else if (!single.has(id)) marker.remove();
    }
    for (const marker of clusterMarkers) marker.remove();
    clusterMarkers.length = 0;
    for (const group of groups) {
      if (group.items.length < 2) continue;
      const bounds = L.latLngBounds(group.items.map(point => [point.latitude, point.longitude] as [number, number]));
      const label = clusterLabel(group.items.length);
      const inner = document.createElement('span'); inner.className = 'venue-map-cluster-inner'; inner.textContent = String(group.items.length);
      const cluster = L.marker(bounds.getCenter(), { keyboard: true, title: label, icon: L.divIcon({ html: inner, className: 'venue-map-cluster', iconSize: [46, 46], iconAnchor: [23, 23] }) });
      cluster.on('add', () => cluster.getElement()?.setAttribute('aria-label', label));
      cluster.on('click', () => {
        if (bounds.getNorthEast().equals(bounds.getSouthWest())) instance.setView(bounds.getCenter(), Math.min(instance.getZoom() + 3, CLUSTER_UNTIL_ZOOM), { animate: !reduced() });
        else instance.fitBounds(bounds, { padding: [70, 70], maxZoom: CLUSTER_UNTIL_ZOOM, animate: !reduced() });
      });
      cluster.addTo(instance);
      clusterMarkers.push(cluster);
    }
    for (const point of positions) {
      if (!single.has(point.id)) continue;
      let marker = markers.get(point.id);
      if (!marker) {
        marker = L.marker([point.latitude,point.longitude], { keyboard: true, draggable: !!onpick, title: point.name });
        const label = document.createElement('span'); label.className = 'venue-map-pin-inner'; label.textContent = point.label || point.name;
        marker.setIcon(L.divIcon({ html: label, className: 'venue-map-pin', iconSize: [120,36], iconAnchor: [60,43] }));
        const updateA11y = () => { const el = marker!.getElement(); el?.setAttribute('aria-label', `${point.name}${point.demo ? (english ? ', sample venue' : ', ukážkový priestor') : ''}`); el?.setAttribute('aria-pressed', String(point.id === selected)); el?.classList.toggle('is-selected',point.id === selected); };
        marker.on('add', updateA11y); marker.on('click', () => onselect?.(point.id));
        if (onpick) marker.on('dragend', () => { const pos = marker!.getLatLng(); onpick?.(pos.lat,pos.lng); });
        markers.set(point.id,marker);
      }
      marker.setLatLng([point.latitude,point.longitude]); marker.setZIndexOffset(point.id === selected ? 500 : 0);
      if (!instance.hasLayer(marker)) marker.addTo(instance);
      const el = marker.getElement(); el?.classList.toggle('is-selected',point.id === selected);
      el?.setAttribute('aria-pressed',String(point.id === selected));
      el?.setAttribute('aria-label', `${point.name}${point.demo ? (english ? ', sample venue' : ', ukážkový priestor') : ''}`);
      el?.setAttribute('title', point.name);
      const label = el?.querySelector('.venue-map-pin-inner'); if (label) label.textContent = point.label || point.name;
    }
  });
  $effect(() => {
    if (!map) return;
    const key = `${fitKey}:${areaCenter?.latitude}:${areaCenter?.longitude}:${radiusKm}:${onpick ? '' : userLocation.revision}:${points.map(p => p.id).join(',')}`;
    if (key !== previousFit) { previousFit = key; fit(); }
  });
  /**
   * Bring the chosen venue to the middle of the map.
   *
   * This used to be `panInside`, which moves the map by the SMALLEST amount that
   * brings a point inside the padded view — so a pin already on screen never
   * moved at all. Picking a venue from the list then did nothing visible except
   * recolour a pin that might be in a corner, or underneath another one.
   *
   * Centred, not merely visible, and never further out than FOCUS_ZOOM: two pins
   * that overlap at country zoom separate at street zoom, and somebody who has
   * panned to the other side of the world gets taken back. A deliberate close-up
   * is left alone — the zoom only ever increases.
   */
  const FOCUS_ZOOM = 13;
  /** The detail card covers the bottom, so the visual centre sits above the
   *  geometric one. Same insets the fit uses, applied as an offset. */
  const FOCUS_PAD = { top: 80, bottom: 115, left: 30, right: 65 };

  $effect(() => {
    const point = points.find(p => p.id === selected);
    const selection = `${selected}:${selectionRevision}`;
    const instance = map, L = library;
    if (!instance || !L || !point || onpick || instance.getZoom() === undefined) return;
    if (selection === previousSelection) return;
    previousSelection = selection;

    const targetZoom = Math.max(instance.getZoom(), FOCUS_ZOOM);
    const pin = instance.project([point.latitude, point.longitude], targetZoom);
    const offset = L.point((FOCUS_PAD.right - FOCUS_PAD.left) / 2, (FOCUS_PAD.bottom - FOCUS_PAD.top) / 2);
    const centre = instance.unproject(pin.add(offset), targetZoom);

    // flyTo arcs out and back in, which reads as a journey when the jump is a long
    // one and stays short when it is not. Reduced motion gets the destination.
    if (reduced()) instance.setView(centre, targetZoom, { animate: false });
    else instance.flyTo(centre, targetZoom, { duration: 0.9 });
  });
  /**
   * The notice over the map.
   *
   * `transient` separates a report from a problem. "Your location is
   * unavailable" is finished business the moment it has been read — it used to
   * sit there for the rest of the session because it was derived straight from a
   * status that never changes back. A tile failure is not transient: it has a
   * Retry button and stays until the retry is taken.
   */
  const mapMessage = $derived.by((): { text: string; transient: boolean; retry?: boolean } | null => {
    if (!onpick && userLocation.status === 'loading') {
      return { text: english ? 'Finding your approximate location…' : 'Hľadám vašu približnú polohu…', transient: false };
    }
    if (!onpick && userLocation.status === 'denied') {
      return { text: english ? 'Location access was declined. You can still search by city.' : 'Prístup k polohe nebol povolený. Stále môžete hľadať podľa mesta.', transient: true };
    }
    if (!onpick && userLocation.status === 'unavailable') {
      return { text: english ? 'Your location is unavailable. Try searching by city.' : 'Polohu sa nepodarilo zistiť. Skúste vyhľadávanie podľa mesta.', transient: true };
    }
    if (status === 'loading') {
      return { text: english ? 'Loading the map…' : 'Načítavam mapu…', transient: false };
    }
    if (status !== 'ready') {
      return { text: english ? 'Some map tiles could not load.' : 'Niektoré mapové podklady sa nenačítali.', transient: false, retry: true };
    }
    return null;
  });

  let messageDismissed = $state(false);
  $effect(() => {
    const current = mapMessage;
    // A new message is a new message: whatever was dismissed before does not
    // suppress it.
    messageDismissed = false;
    if (!current?.transient) return;
    const timer = setTimeout(() => (messageDismissed = true), 6000);
    return () => clearTimeout(timer);
  });

  $effect(() => {
    const center = userLocation.center, area = areaCenter, L = library, instance = map;
    if (!instance || !L || onpick) return;
    locationMarker?.remove(); radiusCircle?.remove();
    locationMarker = null; radiusCircle = null;
    if (center) locationMarker = L.circleMarker([center.latitude,center.longitude],{radius:6,color:'#f5dce8',weight:2,fillColor:'#f05ca1',fillOpacity:1}).addTo(instance).bindTooltip(english ? 'Your approximate location' : 'Vaša približná poloha');
    // The ring marks the area being ranked, which is the place that was searched for
    // when there is one -- so it must not depend on the visitor's own position being
    // known, or a typed city gets a label and a map view but no visible area.
    if (area) radiusCircle = L.circle([area.latitude,area.longitude],{radius:radiusKm * 1000,color:'#f05ca1',weight:1,dashArray:'4 7',fillOpacity:.015,interactive:false}).addTo(instance);
  });
</script>

<div class="venue-map-container" data-map-theme={mapTheme} data-map-style={tileStyle} class:with-expand={!!explorerHref} class:picker={!!onpick}>
  <div bind:this={container} class="venue-map-surface" title={english ? 'Click to pan with two fingers. Pinch to zoom.' : 'Kliknite pre posun dvoma prstami. Priblížte roztiahnutím prstov.'} aria-label={english ? 'Interactive venue map' : 'Interaktívna mapa priestorov'}></div>
  {#if !onpick && areaCenter}<div class="map-area-label">{areaLabel ? (english ? `Around ${areaLabel}` : `Okolie: ${areaLabel}`) : (english ? 'Around you' : 'Vo vašom okolí')} · {radiusKm} km</div>{/if}
  {#if explorerHref}<a class="map-expand" href={explorerHref}>{english ? 'All venues' : 'Všetky priestory'} <span aria-hidden="true"><Icon name="expand" /></span></a>{/if}
  <MapLayers {english} websiteTheme={mapTheme} raised={!!selected && !onpick} />
  <div class="map-actions" aria-label={english ? 'Map controls' : 'Ovládanie mapy'}>
    {#if !onpick}<button type="button" class="location-control" class:location-active={!!areaCenter} disabled={userLocation.status === 'loading'} onclick={useLocation} aria-label={english ? `Use my location and show a ${radiusKm} km area` : `Použiť moju polohu a zobraziť okolie ${radiusKm} km`} title={english ? 'Use my location' : 'Použiť moju polohu'}><Icon name="locate" /></button>{/if}
    <button type="button" onclick={fit} title={english ? 'Show all venues' : 'Zobraziť všetky priestory'} aria-label={english ? 'Reset map view' : 'Obnoviť pohľad na mapu'}><Icon name="expand" /></button>

    <div class="zoom-controls"><button type="button" onclick={() => map?.zoomIn()} disabled={!map || zoom >= 19} aria-label={english ? 'Zoom in' : 'Priblížiť'}><Icon name="plus" /></button><button type="button" onclick={() => map?.zoomOut()} disabled={!map || zoom <= 3} aria-label={english ? 'Zoom out' : 'Oddialiť'}><Icon name="minus" /></button></div>
  </div>

  {#if mapMessage && !messageDismissed}
    <div class="map-message" class:is-transient={mapMessage.transient} role="status">
      <span>{mapMessage.text}</span>
      {#if mapMessage.retry}
        <button type="button" onclick={retry}>{english ? 'Retry' : 'Skúsiť znova'}</button>
      {:else if mapMessage.transient}
        <button
          type="button" class="map-message-close"
          onclick={() => (messageDismissed = true)}
          aria-label={english ? 'Dismiss' : 'Zavrieť'}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .venue-map-container{--map-bg:#e8e9e5;--map-panel:#f9f9f6;--map-ink:#252725;--map-muted:#686c65;--map-border:#d2d5cb;--map-accent:#a6225e;position:absolute;inset:0;isolation:isolate;z-index:0;background:var(--map-bg);color:var(--map-ink);font-family:Inter,Arial,sans-serif}
  .venue-map-container[data-map-theme=dark]{--map-panel:#1e201e;--map-ink:#f2f1ee;--map-muted:#b2b4af;--map-border:#3c3f3b;--map-accent:#f05ca1}
  .venue-map-container[data-map-style=dark]{--map-bg:#20221f}
  .venue-map-surface{height:100%;width:100%;background:var(--map-bg)}
  .map-area-label{position:absolute;z-index:1000;top:14px;left:14px;background:var(--map-panel);border:1px solid var(--map-border);border-radius:4px;padding:7px 10px;font-size:10px;color:var(--map-muted)}
  .map-expand{position:absolute;top:14px;right:14px;z-index:1000;display:flex;align-items:center;gap:10px;min-height:36px;padding:8px 11px;background:var(--map-panel);border:1px solid var(--map-border);border-radius:4px;color:var(--map-ink);font-size:11px;text-decoration:none}
  .map-expand span{color:var(--map-accent)}
  .map-actions{position:absolute;bottom:34px;right:14px;z-index:1000;display:flex;flex-direction:column;border:1px solid var(--map-border);border-radius:4px;overflow:hidden;background:var(--map-panel)}
  .map-actions button{display:grid;place-items:center;width:36px;height:36px;padding:0;border:0;background:transparent;color:var(--map-ink);cursor:pointer}
  .map-actions button:hover{background:var(--map-bg)}
  .map-actions button:disabled{opacity:.4;cursor:default}
  .map-actions button.location-active{color:var(--map-accent)}
  .zoom-controls{border-top:1px solid var(--map-border)}
  /* A notice, not a banner. `right:70px` stretched it the full width of the map, which made a one-line status read as a page-level alert. */.map-message{position:absolute;top:62px;left:20px;right:auto;max-width:min(430px,calc(100% - 100px));display:flex;align-items:center;gap:10px;z-index:1000;padding:10px 13px;border:1px solid var(--map-border);background:var(--map-panel);color:var(--map-muted);border-radius:3px;font-size:10px;line-height:1.7}.map-message-close{display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-left:auto;padding:2px;background:none;border:0;color:var(--map-muted);cursor:pointer;opacity:.65}.map-message-close:hover{opacity:1}.map-message button{background:none;border:0;color:var(--map-accent);font-size:10px;font-weight:600;cursor:pointer;margin-left:8px}
  .picker .map-message{top:15px}.picker .map-actions{bottom:35px}
  button:focus-visible,a:focus-visible{outline:3px solid var(--map-accent);outline-offset:3px}
  .with-expand .map-message{top:62px}
  /* Filter individual images, not the entire transformed tile pane. */
  :global(.venue-map-surface .leaflet-tile){filter:none}
  :global([data-map-style=light] .venue-map-surface .leaflet-tile){filter:grayscale(1) brightness(1.03) contrast(1.12)}
  :global([data-map-style=dark] .venue-map-surface .leaflet-tile){filter:grayscale(1) invert(1) brightness(.92) contrast(1.04)}
  :global(.venue-map-surface .leaflet-control-attribution){font-size:9px;background:var(--map-panel);color:var(--map-muted);border-top:1px solid var(--map-border);padding:4px 8px}
  :global(.venue-map-surface .leaflet-control-attribution a){color:var(--map-muted)}
  :global(.venue-map-surface .leaflet-control-scale-line){font-size:9px;background:var(--map-panel);color:var(--map-muted);border-color:var(--map-border)}
  :global(.venue-map-pin){display:flex;align-items:center;justify-content:center;background:none;border:0;cursor:pointer}
  :global(.venue-map-pin-inner){position:relative;display:block;background:var(--map-panel);color:var(--map-ink);padding:10px 13px;border:1px solid var(--map-border);border-radius:3px;font:600 11px/1.2 Inter,sans-serif;white-space:nowrap;max-width:165px;box-shadow:0 5px 13px #11151120}
  :global(.venue-map-pin-inner::after){content:'';position:absolute;bottom:-5px;left:calc(50% - 4px);width:8px;height:8px;background:inherit;transform:rotate(45deg);border-bottom:1px solid var(--map-border);border-right:1px solid var(--map-border)}
  :global(.venue-map-pin.is-selected .venue-map-pin-inner){background:#f05ca1;color:#28111c;border-color:#f05ca1}
  :global(.venue-map-pin.is-selected .venue-map-pin-inner::after){border-color:#f05ca1}
  :global(.venue-map-pin:focus-visible){outline:3px solid var(--map-accent);outline-offset:4px;border-radius:3px}
  /* A group of pins that would overlap: a counted disc that zooms in when chosen. */
  :global(.venue-map-cluster){display:flex;align-items:center;justify-content:center;background:none;border:0;cursor:pointer}
  :global(.venue-map-cluster-inner){display:grid;place-items:center;width:46px;height:46px;border-radius:50%;background:var(--map-panel);color:var(--map-ink);border:2px solid #f05ca1;font:700 13px/1 Inter,sans-serif;box-shadow:0 5px 13px #11151126;transition:background .15s,color .15s,transform .15s}
  :global(.venue-map-cluster:hover .venue-map-cluster-inner){background:#f05ca1;color:#28111c;transform:scale(1.06)}
  :global(.venue-map-cluster:focus-visible){outline:3px solid var(--map-accent);outline-offset:4px;border-radius:50%}
  @media (prefers-reduced-motion: reduce){:global(.venue-map-cluster-inner){transition:none}:global(.venue-map-cluster:hover .venue-map-cluster-inner){transform:none}}

  /* Hover. The pins had a selected state and a focus ring but nothing for the
     pointer, so nothing on the map reacted to the mouse at all. Transform and
     colour only, so it stays cheap while Leaflet is panning. */
  :global(.venue-map-pin-inner){transition:background .15s,border-color .15s,color .15s,transform .15s,box-shadow .15s}
  :global(.venue-map-pin:hover){z-index:600}
  :global(.venue-map-pin:hover .venue-map-pin-inner){
    border-color:#f05ca1;
    transform:translateY(-2px);
    box-shadow:0 9px 20px #11151133;
  }
  :global(.venue-map-pin:hover .venue-map-pin-inner::after){border-color:#f05ca1}
  /* Already selected: deepen rather than restate the accent. */
  :global(.venue-map-pin.is-selected:hover .venue-map-pin-inner){background:#e54a93;border-color:#e54a93}
  :global(.venue-map-pin.is-selected:hover .venue-map-pin-inner::after){border-color:#e54a93}
  :global(.venue-map-pin:active .venue-map-pin-inner){transform:translateY(0)}

  @media (prefers-reduced-motion: reduce){
    :global(.venue-map-pin-inner){transition:none}
    :global(.venue-map-pin:hover .venue-map-pin-inner){transform:none}
  }
  @media(max-width:600px){.venue-map-container:has(:global(.layers-panel)){z-index:1100}}
  :global(.venue-map-surface .leaflet-zoom-anim .leaflet-zoom-animated){transition-duration:100ms}
  @media(prefers-reduced-motion:reduce){:global(.venue-map-surface .leaflet-zoom-anim .leaflet-zoom-animated){transition:none}}
  @media(max-width:600px){.map-actions{right:12px;bottom:30px}.map-expand{top:12px;right:12px;font-size:10px}.map-area-label{left:12px;top:12px}.map-message{left:12px;right:auto;max-width:calc(100% - 72px);top:62px}.with-expand .map-message{top:62px}}
</style>
