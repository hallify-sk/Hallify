// Tiny client-side sound helper. Sounds live in /static and are played on
// notable events (purchase, new message, announcement). Playback can be blocked
// by the browser's autoplay policy without a prior user gesture — we swallow
// those errors silently rather than surfacing them.

export type SoundName = 'order' | 'ticket' | 'announcement';

let muted = false;

/** Persisted mute toggle (so users can silence notification sounds). */
export function setSoundsMuted(v: boolean) {
	muted = v;
	if (typeof localStorage !== 'undefined') localStorage.setItem('hallify-sounds-muted', v ? '1' : '0');
}
export function soundsMuted(): boolean {
	if (typeof localStorage !== 'undefined') return localStorage.getItem('hallify-sounds-muted') === '1';
	return muted;
}

export function playSound(name: SoundName) {
	if (typeof Audio === 'undefined') return;
	if (soundsMuted()) return;
	try {
		const audio = new Audio(`/${name}.wav`);
		audio.volume = 0.5;
		void audio.play().catch(() => { /* autoplay blocked — ignore */ });
	} catch {
		/* ignore */
	}
}
