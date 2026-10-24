<script lang="ts">
  import { pageTitle } from '$lib/page-title';
  import { t } from '$lib/i18n.svelte';
  import ListingForm from '../ListingForm.svelte';
  import type { ActionData } from './$types';
  let { form }: { form: ActionData } = $props();
  // A refused save shows the form again with what was typed.
  const values = $derived(form?.values ?? null);
</script>

<svelte:head><title>{pageTitle(t.listings.addVenue, t.listings.title)}</title></svelte:head>

<div class="wrap page">
  <a class="back" href="/app/platform/listings">← {t.listings.title}</a>
  <header class="page-header">
    <div>
      <p class="eyebrow">{t.platformOrgs.platformAdmin}</p>
      <h1 class="page-title">{t.listings.addVenue}</h1>
      <p class="page-lead">{t.listings.addLead}</p>
    </div>
  </header>
  <section class="section section--lead">
    {#key form}
      <ListingForm {values} error={form?.error ?? null} submitLabel={t.listings.create} />
    {/key}
  </section>
</div>
