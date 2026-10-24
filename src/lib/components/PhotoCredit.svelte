<script lang="ts">
  // The source of a cover photo, as a small caption in the photo's corner. The parent
  // is the positioned box around the photo. Inside a link or a button (a directory
  // card), `link` is false: a link cannot sit inside another.
  import { t } from '$lib/i18n.svelte';
  import { photoCredit } from '$lib/photo-credit';
  let { credit, link = true }: { credit: string | null | undefined; link?: boolean } = $props();
  const c = $derived(photoCredit(credit));
</script>

{#if c}
  <span class="photo-credit">{t.listings.photoCredit}:{' '}{#if link && c.href}<a href={c.href} target="_blank" rel="noopener nofollow">{c.label}</a>{:else}{c.label}{/if}</span>
{/if}

<style>
  .photo-credit {
    position: absolute; left: 8px; bottom: 8px; z-index: 1; max-width: calc(100% - 16px);
    padding: 2px 7px; border-radius: 4px; background: rgb(0 0 0 / 0.58); color: #fff;
    font-size: 10.5px; line-height: 1.5; font-weight: 500; letter-spacing: 0.01em;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none;
  }
  .photo-credit a { color: inherit; text-decoration: underline; text-underline-offset: 2px; pointer-events: auto; }
  .photo-credit a:hover { text-decoration-thickness: 2px; }
</style>
