<script lang="ts">
  import Icon from './Icon.svelte';
  import { getContext, onMount, tick, untrack } from 'svelte';
  import type * as Leaflet from 'leaflet';
  import 'leaflet/dist/leaflet.css';
  import type { MapCenter } from './discovery';
  import { userLocation, locateUser } from './user-location.svelte';
  import { mapPreferences, loadMapPreferences, saveMapStyle, type MapStyle } from './map-preferences.svelte';

  export interface MapPoint { id: string; name: string; latitude: number; longitude: number; label?: string; demo?: boolean }
  let { points = [], selected = null, selectionRevision = 0, onselect, onpick, onlocation, english = false, fitKey = '', areaCenter = null, radiusKm = 50, explorerHref = '', theme, fullScreen = false }: {
    points?: MapPoint[]; selected?: string | null; onselect?: (id: string) => void;
    onpick?: (lat: number, lng: number) => void; english?: boolean; fitKey?: string;
    areaCenter?: MapCenter | null; radiusKm?: number; explorerHref?: string; theme?: 'light' | 'dark';
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
  let previousFit = '', previousSelection: string | null = null;
  let locationMarker: Leaflet.CircleMarker | null = null;
  let radiusCircle: Leaflet.Circle | null = null;
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const valid = (p: MapPoint) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180;

  function fit() {
    if (!map || !library) return;
    const compact = map.getSize().y < 360;
    const paddingBottom = onpick ? 25 : compact ? 85 : 145;
    if (areaCenter) map.fitBounds(library.latLng(areaCenter.latitude, areaCenter.longitude).toBounds(radiusKm * 2000), {
      paddingTopLeft: [30, compact ? 55 : 75], paddingBottomRight: [60, paddingBottom], animate: !reduced(),
    });
    else {
      const positions = points.filter(valid);
      if (positions.length === 1) map.setView([positions[0].latitude, positions[0].longitude], onpick ? 16 : 12, { animate: !reduced() });
      else if (positions.length) map.fitBounds(library.latLngBounds(positions.map(p => [p.latitude, p.longitude])), { paddingTopLeft: [40,75], paddingBottomRight: [55,paddingBottom], maxZoom: 13, animate: !reduced() });
      else { const q = fitKey.toLowerCase(); const city: [number, number] = q.includes('bratis') ? [48.1486,17.1077] : q.includes('brno') ? [49.1951,16.6068] : [50.0755,14.4378]; map.setView(city, 10, { animate: !reduced() }); }
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
    const wheel = (event: WheelEvent) => {
      // Let Leaflet debounce and animate pinch zoom, retaining the current tiles.
      // This listener is registered first so ordinary scrolling can pan the map
      // or continue through the page without also triggering Leaflet wheel zoom.
      if (event.ctrlKey || event.metaKey) return;
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
    const activate = () => { trackpadEnabled = true; };
    container.addEventListener('wheel',wheel,{passive:false});
    container.addEventListener('pointerdown',activate);
    import('leaflet').then(L => {
      if (disposed) return;
      library = L;
      const instance = L.map(container, { scrollWheelZoom:true, wheelDebounceTime:40, wheelPxPerZoomLevel:60, zoomAnimation:!reduced(), fadeAnimation:!reduced(), zoomControl:false, minZoom:3, maxZoom:19, zoomSnap:0, zoomDelta:.5, touchZoom:true });
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
    return () => { disposed = true; resize?.disconnect(); container.removeEventListener('wheel',wheel); container.removeEventListener('pointerdown',activate); if (frame) cancelAnimationFrame(frame); map?.remove(); markers.clear(); };
  });

  $effect(() => {
    const L = library, instance = map; if (!L || !instance) return;
    const positions = points.filter(valid), ids = new Set(positions.map(p => p.id));
    for (const [id, marker] of markers) if (!ids.has(id)) { marker.remove(); markers.delete(id); }
    for (const point of positions) {
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
  $effect(() => {
    const point = points.find(p => p.id === selected);
    const selection = `${selected}:${selectionRevision}`;
    if (map && map.getZoom() !== undefined && point && !onpick && selection !== previousSelection) {
      map.panInside([point.latitude,point.longitude], { paddingTopLeft:[30,80], paddingBottomRight:[75,155], animate:!reduced() });
      previousSelection = selection;
    }
  });
  $effect(() => {
    const center = userLocation.center, L = library, instance = map;
    if (!instance || !L || onpick) return;
    locationMarker?.remove(); radiusCircle?.remove();
    if (center) {
      const coords: [number,number] = [center.latitude,center.longitude];
      locationMarker = L.circleMarker(coords,{radius:6,color:'#f5dce8',weight:2,fillColor:'#f05ca1',fillOpacity:1}).addTo(instance).bindTooltip(english ? 'Your approximate location' : 'Vaša približná poloha');
      if (areaCenter) radiusCircle = L.circle([areaCenter.latitude,areaCenter.longitude],{radius:radiusKm * 1000,color:'#f05ca1',weight:1,dashArray:'4 7',fillOpacity:.015,interactive:false}).addTo(instance);
    }
  });
</script>

<div class="venue-map-container" data-map-theme={mapTheme} data-map-style={tileStyle} class:with-expand={!!explorerHref} class:picker={!!onpick}>
  <div bind:this={container} class="venue-map-surface" aria-label={english ? 'Interactive venue map' : 'Interaktívna mapa priestorov'}></div>
  {#if !onpick}<div class="map-heading"><span>{areaCenter ? `${english ? 'Around you' : 'Vo vašom okolí'} / ${radiusKm} km` : (english ? 'Find your venue' : 'Nájdite svoj priestor')}</span><small>{points.length} {english ? 'on the map' : 'na mape'}</small></div>{/if}
  {#if explorerHref}<a class="map-expand" href={explorerHref}>{english ? 'All venues' : 'Všetky priestory'} <span aria-hidden="true"><Icon name="expand" /></span></a>{/if}
  <div class="map-style-picker"><label><span class="sr-only">{english ? 'Map theme' : 'Štýl mapy'}</span><span class="select-wrap"><select value={mapPreferences.style} onchange={(event) => saveMapStyle(event.currentTarget.value as MapStyle)}><option value="street">{english ? 'Street map' : 'Farebná mapa'}</option><option value="light">{english ? 'Light map' : 'Svetlá mapa'}</option><option value="dark">{english ? 'Dark map' : 'Tmavá mapa'}</option><option value="auto">{english ? 'Match website' : 'Podľa stránky'}</option></select><Icon name="chevron" /></span></label></div>
  <div class="map-actions" aria-label={english ? 'Map controls' : 'Ovládanie mapy'}>
    {#if !onpick}<button type="button" class="location-control" class:location-active={!!areaCenter} disabled={userLocation.status === 'loading'} onclick={useLocation} aria-label={english ? `Use my location and show a ${radiusKm} km area` : `Použiť moju polohu a zobraziť okolie ${radiusKm} km`} title={english ? 'Use my location' : 'Použiť moju polohu'}><Icon name="locate" /></button>{/if}
    <button type="button" onclick={fit} title={english ? 'Show all venues' : 'Zobraziť všetky priestory'} aria-label={english ? 'Reset map view' : 'Obnoviť pohľad na mapu'}><Icon name="expand" /></button>
    <button type="button" class="trackpad-control" class:location-active={trackpadEnabled} aria-pressed={trackpadEnabled} onclick={() => trackpadEnabled = !trackpadEnabled} title={english ? 'Two fingers to pan; pinch to zoom. Toggle map scrolling.' : 'Dva prsty na posun, roztiahnutie na priblíženie. Zapnúť alebo vypnúť posúvanie mapy.'} aria-label={english ? 'Toggle trackpad navigation' : 'Zapnúť ovládanie trackpadom'}><Icon name="hand" /></button>
    <div class="zoom-controls"><button type="button" onclick={() => map?.zoomIn()} disabled={!map || zoom >= 19} aria-label={english ? 'Zoom in' : 'Priblížiť'}><Icon name="plus" /></button><button type="button" onclick={() => map?.zoomOut()} disabled={!map || zoom <= 3} aria-label={english ? 'Zoom out' : 'Oddialiť'}><Icon name="minus" /></button></div>
  </div>
  {#if !onpick}<p class="trackpad-hint">{trackpadEnabled ? (english ? 'Two fingers to pan. Pinch to zoom.' : 'Dva prsty na posun. Roztiahnutie na priblíženie.') : (english ? 'Click the map to use trackpad navigation.' : 'Kliknite na mapu pre ovládanie trackpadom.')}</p>{/if}
  {#if status !== 'ready' || (!onpick && ['loading','denied','unavailable'].includes(userLocation.status))}
    <div class="map-message" role="status">
      {#if !onpick && userLocation.status === 'loading'}{english ? 'Finding your approximate location…' : 'Hľadám vašu približnú polohu…'}
      {:else if !onpick && userLocation.status === 'denied'}{english ? 'Location access was declined. You can still search by city.' : 'Prístup k polohe nebol povolený. Stále môžete hľadať podľa mesta.'}
      {:else if !onpick && userLocation.status === 'unavailable'}{english ? 'Your location is unavailable. Try searching by city.' : 'Polohu sa nepodarilo zistiť. Skúste vyhľadávanie podľa mesta.'}
      {:else if status === 'loading'}{english ? 'Loading the map…' : 'Načítavam mapu…'}
      {:else}{english ? 'Some map tiles could not load.' : 'Niektoré mapové podklady sa nenačítali.'} <button type="button" onclick={retry}>{english ? 'Retry' : 'Skúsiť znova'}</button>{/if}
    </div>
  {/if}
</div>

<style>
  .venue-map-container{--map-bg:#e8e9e5;--map-panel:#f9f9f6;--map-ink:#252725;--map-muted:#686c65;--map-border:#d2d5cb;--map-accent:#a6225e;position:absolute;inset:0;isolation:isolate;z-index:0;background:var(--map-bg);color:var(--map-ink);font-family:Inter,Arial,sans-serif}
  .venue-map-container[data-map-theme=dark]{--map-panel:#1e201e;--map-ink:#f2f1ee;--map-muted:#b2b4af;--map-border:#3c3f3b;--map-accent:#f05ca1}
  .venue-map-container[data-map-style=dark]{--map-bg:#20221f}
  .venue-map-surface{height:100%;width:100%;background:var(--map-bg)}
  .map-heading{position:absolute;z-index:1000;top:20px;left:20px;border:1px solid var(--map-border);background:var(--map-panel);padding:12px 15px;border-radius:3px;max-width:calc(100% - 190px)}
  .map-heading span{font-size:11px;font-weight:600;display:block}.map-heading small{font-size:9px;color:var(--map-muted);display:block;margin-top:5px}
  .map-expand{position:absolute;top:20px;right:20px;z-index:1000;padding:13px 14px;background:var(--map-panel);color:var(--map-ink);border:1px solid var(--map-border);border-radius:3px;font-size:10px;display:flex;gap:17px;align-items:center;text-decoration:none;min-height:44px}.map-expand span{color:var(--map-accent);font-size:17px}
  .map-actions{position:absolute;bottom:47px;right:16px;z-index:1000;display:grid;gap:8px}
  .map-actions button{width:36px;height:36px;display:grid;place-items:center;border:1px solid var(--map-border);background:var(--map-panel);color:var(--map-ink);border-radius:3px;font-family:inherit;font-size:21px;cursor:pointer}.map-actions button:disabled{opacity:.45;cursor:default}.map-actions button.location-active{color:var(--map-accent);border-color:var(--map-accent)}.zoom-controls{display:grid}.zoom-controls button+button{border-top:0;border-radius:0 0 3px 3px}.zoom-controls button:first-child{border-radius:3px 3px 0 0}
  .map-message{position:absolute;top:92px;left:20px;right:70px;z-index:1000;padding:10px 13px;border:1px solid var(--map-border);background:var(--map-panel);color:var(--map-muted);border-radius:3px;font-size:10px;line-height:1.7}.map-message button{background:none;border:0;color:var(--map-accent);font-size:10px;font-weight:600;cursor:pointer;margin-left:8px}
  .picker .map-message{top:15px}.picker .map-actions{bottom:35px}
  button:focus-visible,a:focus-visible,select:focus-visible{outline:3px solid var(--map-accent);outline-offset:3px}
  .map-style-picker{position:absolute;right:20px;top:20px;width:142px;z-index:1000}
  .with-expand .map-style-picker{top:80px}
  .map-style-picker .select-wrap{display:block;position:relative}
  .map-style-picker select{appearance:none;-webkit-appearance:none;display:block;width:100%;min-height:36px;padding:9px 31px 9px 12px;border:1px solid var(--map-border);border-radius:3px;background:var(--map-panel);color:var(--map-ink);font:400 10px/1.5 Inter,sans-serif;cursor:pointer}
  .map-style-picker option{background:var(--map-panel);color:var(--map-ink)}
  .map-style-picker .select-wrap>:global(.ui-icon){position:absolute;right:9px;top:50%;transform:translateY(-50%);color:var(--map-muted);pointer-events:none}
  .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
  .with-expand .map-message{top:126px}
  .trackpad-hint{position:absolute;left:110px;bottom:10px;z-index:1000;font-size:8px;line-height:1.6;color:var(--map-muted);background:var(--map-panel);padding:4px 7px;border-radius:3px;max-width:calc(100% - 300px);margin:0;pointer-events:none}
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
  @media(max-width:480px){.map-heading{left:12px;top:12px;padding:10px;max-width:calc(100% - 150px)}.map-expand{right:12px;top:12px;padding:11px 10px;gap:10px;font-size:9px}.map-actions{right:12px}.map-message{top:80px;left:12px}}
  @media(max-width:480px){.map-style-picker{top:12px;right:12px;width:127px}.with-expand .map-style-picker{top:73px}.map-heading{max-width:calc(100% - 160px)}.map-actions{grid-template-columns:repeat(2,32px);gap:5px;bottom:35px}.map-actions button{width:32px;height:32px}.map-actions .trackpad-control{display:none}.zoom-controls{display:flex;grid-column:span 2}.zoom-controls button+button{border-top:1px solid var(--map-border);border-left:0}.trackpad-hint{display:none}.with-expand .map-message{top:117px}}
</style>
