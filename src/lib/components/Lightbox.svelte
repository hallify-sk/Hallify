<script lang="ts">
  /**
   * A gallery viewer you can walk through.
   *
   * The galleries used to open one photo at a time: to see the next one you had
   * to close the viewer and click the next thumbnail, which for a six-photo
   * venue is eleven clicks to look at six pictures. Arrows, arrow keys and a
   * swipe all move between them now, and the index says how far through you are.
   *
   * Shared by the public venue page and the signed-in one so the two cannot
   * drift; both had their own idea of what opening a photo meant.
   */
  import { t } from '$lib/i18n.svelte';

  interface Props {
    images: string[];
    /** Index of the open photo; null closes the viewer. */
    index: number | null;
    onclose: () => void;
    onindex: (i: number) => void;
    alt?: string;
  }

  const { images, index, onclose, onindex, alt = '' }: Props = $props();

  const open = $derived(index !== null && index >= 0 && index < images.length);
  const many = $derived(images.length > 1);

  // Wraps on purpose: at the last photo the right arrow returns to the first
  // rather than dead-ending, which is what a gallery of six is for.
  const step = (by: number) => {
    if (index === null || images.length === 0) return;
    onindex((index + by + images.length) % images.length);
  };

  function onKeydown(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === 'Escape') { onclose(); return; }
    if (!many) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
  }

  // Swipe. A photo viewer on a phone that only answers to a 44px arrow is a
  // photo viewer nobody pages through.
  let touchX = 0;
  let touchY = 0;
  function onTouchStart(e: TouchEvent) {
    touchX = e.changedTouches[0].clientX;
    touchY = e.changedTouches[0].clientY;
  }
  function onTouchEnd(e: TouchEvent) {
    if (!many) return;
    const dx = e.changedTouches[0].clientX - touchX;
    const dy = e.changedTouches[0].clientY - touchY;
    // Horizontal intent only, so a scroll-ish drag does not change the photo.
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
  }

  let dialog = $state<HTMLDivElement | null>(null);
  $effect(() => {
    if (open) dialog?.focus();
  });

  // The page behind must not scroll while the viewer is over it.
  $effect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  });
</script>

<svelte:window onkeydown={onKeydown} />

{#if open && index !== null}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    bind:this={dialog}
    class="lb"
    role="dialog"
    aria-modal="true"
    aria-label={alt || t.hallProfile.gallery}
    tabindex="-1"
    ontouchstart={onTouchStart}
    ontouchend={onTouchEnd}
  >
    <!-- The backdrop closes; the photo and the controls on top of it do not. -->
    <button type="button" class="lb-backdrop" aria-label={t.common.cancel} onclick={onclose}></button>

    <figure class="lb-figure">
      <img src={images[index]} alt={alt} />
    </figure>

    {#if many}
      <button type="button" class="lb-arrow lb-prev" onclick={() => step(-1)} aria-label={t.gallery.previous} title={t.gallery.previous}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <button type="button" class="lb-arrow lb-next" onclick={() => step(1)} aria-label={t.gallery.next} title={t.gallery.next}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </button>

      <p class="lb-count" aria-live="polite">{index + 1} {t.common.of} {images.length}</p>

      <div class="lb-dots" role="tablist" aria-label={t.hallProfile.gallery}>
        {#each images as _, i (i)}
          <button
            type="button" class="lb-dot" class:is-active={i === index}
            role="tab" aria-selected={i === index}
            aria-label={`${i + 1} ${t.common.of} ${images.length}`}
            onclick={() => onindex(i)}
          ></button>
        {/each}
      </div>
    {/if}

    <button type="button" class="lb-close" onclick={onclose} aria-label={t.gallery.close} title={t.gallery.close}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  </div>
{/if}

<style>
  .lb {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: grid;
    place-items: center;
  }
  .lb:focus { outline: none; }

  /* A real button so the backdrop is reachable and announced, stretched behind
     everything rather than wrapping it — a click on the photo must not close. */
  .lb-backdrop {
    position: absolute;
    inset: 0;
    border: 0;
    padding: 0;
    background: rgba(16, 24, 16, .88);
    backdrop-filter: blur(5px);
    cursor: zoom-out;
  }

  .lb-figure {
    position: relative;
    margin: 0;
    /* Room for the arrows beside the photo and the index underneath it. The
       calc guarantees that chrome its space on a short window, where a flat
       82vh would leave the counter sitting on the photo. */
    max-width: min(92vw, 1400px);
    max-height: min(82vh, calc(100vh - 150px));
    display: grid;
    place-items: center;
  }
  .lb-figure img {
    display: block;
    max-width: min(92vw, 1400px);
    max-height: min(82vh, calc(100vh - 150px));
    width: auto;
    height: auto;
    border-radius: var(--radius-lg);
    box-shadow: 0 18px 60px rgba(0, 0, 0, .45);
  }

  .lb-arrow,
  .lb-close {
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(255, 255, 255, .22);
    border-radius: var(--radius);
    background: rgba(22, 22, 24, .62);
    color: #fff;
    cursor: pointer;
    transition: background .15s, border-color .15s, transform .15s;
  }
  .lb-arrow:hover,
  .lb-close:hover { background: rgba(40, 40, 44, .9); border-color: rgba(255, 255, 255, .4); }
  .lb-arrow:focus-visible,
  .lb-close:focus-visible,
  .lb-dot:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }

  .lb-arrow { top: 50%; width: 46px; height: 64px; transform: translateY(-50%); }
  .lb-prev { left: 18px; }
  .lb-next { right: 18px; }
  .lb-prev:hover { transform: translateY(-50%) translateX(-2px); }
  .lb-next:hover { transform: translateY(-50%) translateX(2px); }

  .lb-close { top: 18px; right: 18px; width: 38px; height: 38px; }

  .lb-count {
    position: absolute;
    bottom: 54px;
    left: 50%;
    transform: translateX(-50%);
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: .02em;
    color: rgba(255, 255, 255, .75);
    font-variant-numeric: tabular-nums;
  }

  .lb-dots {
    position: absolute;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 7px;
    max-width: 80vw;
    overflow-x: auto;
    padding: 4px;
  }
  .lb-dot {
    width: 7px;
    height: 7px;
    flex-shrink: 0;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: rgba(255, 255, 255, .32);
    cursor: pointer;
    transition: background .15s, transform .15s;
  }
  .lb-dot:hover { background: rgba(255, 255, 255, .6); }
  .lb-dot.is-active { background: #fff; transform: scale(1.25); }

  @media (prefers-reduced-motion: reduce) {
    .lb-prev:hover { transform: translateY(-50%); }
    .lb-next:hover { transform: translateY(-50%); }
    .lb-dot.is-active { transform: none; }
  }

  /* On a phone the arrows sit over the photo rather than beside it; there is no
     room for both, and a swipe is the main gesture there anyway. */
  @media (max-width: 680px) {
    .lb-arrow { width: 40px; height: 54px; }
    .lb-prev { left: 6px; }
    .lb-next { right: 6px; }
    .lb-figure img { max-width: 96vw; max-height: min(74vh, calc(100vh - 140px)); }
  }
</style>
