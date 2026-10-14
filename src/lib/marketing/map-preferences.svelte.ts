export type MapStyle = 'street' | 'light' | 'dark' | 'auto';
export const mapPreferences = $state<{ style: MapStyle; loaded: boolean }>({ style: 'light', loaded: false });
export function loadMapPreferences() {
  if (mapPreferences.loaded || typeof localStorage === 'undefined') return;
  mapPreferences.loaded = true;
  try { const value = localStorage.getItem('hallify-map-style'); if (value && ['street','light','dark','auto'].includes(value)) mapPreferences.style = value as MapStyle; } catch { /* Storage may be unavailable. */ }
}
export function saveMapStyle(value: MapStyle) {
  mapPreferences.style = value;
  try { localStorage.setItem('hallify-map-style', value); } catch { /* The switch still works in this page. */ }
}
