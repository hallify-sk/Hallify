<script lang="ts">
  import VenueMap from './VenueMap.svelte';
  import { hasCoordinates } from '$lib/venue-location';
  let { latitude = $bindable<number | null>(null), longitude = $bindable<number | null>(null), english = false }: {
    latitude?: number | null; longitude?: number | null; english?: boolean;
  } = $props();
  const points = $derived(hasCoordinates({ latitude, longitude }) ? [{ id: 'location', name: english ? 'Venue location' : 'Poloha priestoru', latitude: latitude!, longitude: longitude! }] : []);
  function select(lat: number, lng: number) { latitude = Math.round(lat * 1000000) / 1000000; longitude = Math.round(lng * 1000000) / 1000000; }
</script>
<div class="location-picker">
  <div class="picker-heading"><h3>{english ? 'Location on the map' : 'Poloha na mape'}</h3>{#if points.length}<button type="button" onclick={() => { latitude = null; longitude = null; }}>{english ? 'Clear location' : 'Odstrániť polohu'}</button>{/if}</div>
  <p>{english ? 'Click the exact location or drag the marker. Venues without a position remain in the directory.' : 'Kliknite na presné miesto alebo posuňte značku. Bez polohy zostane priestor v zozname.'}</p>
  <div class="picker-map"><VenueMap {points} selected="location" onpick={select} {english} /></div>
  <details><summary>{english ? 'Enter coordinates manually' : 'Zadať súradnice ručne'}</summary><div class="coordinate-fields"><label>{english ? 'Latitude' : 'Zemepisná šírka'}<input type="number" step="any" min="-90" max="90" value={latitude ?? ""} oninput={(event) => latitude = event.currentTarget.value === "" ? null : Number(event.currentTarget.value)} /></label><label>{english ? 'Longitude' : 'Zemepisná dĺžka'}<input type="number" step="any" min="-180" max="180" value={longitude ?? ""} oninput={(event) => longitude = event.currentTarget.value === "" ? null : Number(event.currentTarget.value)} /></label></div></details>
</div>
<style>
  .picker-heading{display:flex;align-items:center;justify-content:space-between;gap:15px}.picker-heading h3{font-size:13px;font-weight:600}.picker-heading button{background:none;border:0;color:var(--text-muted);font-size:11px;cursor:pointer}.location-picker p{font-size:11px;color:var(--text-muted);line-height:1.7;margin:9px 0 15px}.picker-map{position:relative;height:clamp(300px,38vh,460px);overflow:hidden;border-radius:var(--radius-sm);border:1px solid var(--border)}details{margin-top:12px}summary{font-size:11px;color:var(--text-muted);cursor:pointer}.coordinate-fields{display:grid;grid-template-columns:1fr 1fr;gap:14px;padding-top:12px}.coordinate-fields label{font-size:11px;color:var(--text-muted)}.coordinate-fields input{display:block;width:100%;padding:9px;margin-top:7px;background:var(--bg-panel);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-base)}
</style>
