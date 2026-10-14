import type { MapCenter } from './discovery';

// Browser memory only. Coordinates are not put in URLs, analytics or storage.
export const userLocation = $state<{ center: MapCenter | null; revision: number; status: 'idle' | 'loading' | 'ready' | 'denied' | 'unavailable' }>({ center: null, revision: 0, status: 'idle' });
let pending: Promise<void> | null = null;

export function locateUser(): Promise<void> {
  if (pending) return pending;
  if (typeof navigator === 'undefined' || !navigator.geolocation) { userLocation.status = 'unavailable'; return Promise.resolve(); }
  userLocation.status = 'loading';
  pending = new Promise<void>(resolve => {
    navigator.geolocation.getCurrentPosition(position => {
      userLocation.center = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      userLocation.revision += 1;
      userLocation.status = 'ready'; resolve();
    }, error => { userLocation.status = error.code === 1 ? 'denied' : 'unavailable'; resolve(); }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
  }).finally(() => { pending = null; });
  return pending;
}

/** Reuse an existing grant; new permission prompts happen only after a button click. */
export async function locateIfGranted(): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.permissions || userLocation.center) return;
  try { if ((await navigator.permissions.query({ name: 'geolocation' })).state === 'granted') await locateUser(); } catch { /* Use the explicit location button. */ }
}
