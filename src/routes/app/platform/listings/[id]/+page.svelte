<script lang="ts">
  import { pageTitle } from '$lib/page-title';
  import { enhance } from '$app/forms';
  import { t } from '$lib/i18n.svelte';
  import { confirmFirst } from '$lib/forms';
  import { venuePagePath } from '$lib/marketing/types';
  import ListingForm from '../ListingForm.svelte';
  import type { ActionData, PageData } from './$types';
  let { data, form }: { data: PageData; form: ActionData } = $props();

  const v = $derived(data.venue);
  // A refused save shows what was typed; otherwise the venue as stored.
  const values = $derived(form && 'values' in form && form.values ? form.values : v);
</script>

<svelte:head><title>{pageTitle(v.name, t.listings.title)}</title></svelte:head>

<div class="wrap page">
  <a class="back" href="/app/platform/listings">← {t.listings.title}</a>
  <header class="page-header">
    <div>
      <p class="eyebrow">{t.listings.typeExternal}</p>
      <h1 class="page-title">{v.name}</h1>
      {#if data.last30}
        <p class="page-lead">{t.listings.last30Summary(data.last30.impressions, data.last30.detail_views, data.last30.clicks)}</p>
      {/if}
    </div>
    <div class="page-actions">
      {#if v.is_public && v.slug}<a class="btn-outline btn-sm" href={venuePagePath(v.org_slug, v.slug)} target="_blank" rel="noopener">{t.listings.viewPage}</a>{/if}
    </div>
  </header>

  {#if form && 'saved' in form && form.saved}<p class="lv-ok" role="status">{t.listings.saved}</p>{/if}

  <section class="section section--lead">
    {#key form}
      <ListingForm {values} error={form && 'error' in form ? form.error ?? null : null} submitLabel={t.listings.save} />
    {/key}
  </section>

  <section class="section">
    <div class="section-head">
      <h2>{t.listings.deleteTitle}</h2>
      <p>{t.listings.deleteHint}</p>
    </div>
    <form method="POST" action="?/delete" use:enhance={confirmFirst(() => t.listings.confirmDelete(v.name))}>
      <button type="submit" class="btn-danger btn-sm">{t.listings.deleteVenue}</button>
    </form>
  </section>
</div>

<style>
  .lv-ok { margin: 0 0 12px; font-size: 13px; color: var(--success); }
</style>
