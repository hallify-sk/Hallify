<script lang="ts">
  // A directory card's way to the venue when it is booked directly with them, not
  // through Hallify: the website if there is one, else the phone, else the e-mail.
  // The click is counted (first-party and GA4) before the browser follows it.
  import { t } from '$lib/i18n.svelte';
  import { mailHref, telHref } from '$lib/listings';
  import { trackListingClick } from '$lib/listing-tracker';
  import { venueListingRef, type PublicVenue } from './types';
  let { venue, class: className = '' }: { venue: PublicVenue; class?: string } = $props();
  const contact = $derived(venue.booking_mode === 'external' ? venue.contact ?? null : null);
  const ref = $derived(venueListingRef(venue));
  function count(kind: 'website' | 'phone' | 'email') { if (ref) trackListingClick(ref, kind); }
</script>

{#if contact?.website}
  <a class={className} href={contact.website} target="_blank" rel="noopener nofollow" onclick={() => count('website')} aria-label={`${t.listings.visitWebsite}: ${venue.name}`}>{t.listings.visitWebsite}</a>
{:else if contact?.phone}
  <a class={className} href={telHref(contact.phone)} onclick={() => count('phone')} aria-label={`${t.listings.call}: ${venue.name}`}>{t.listings.call}</a>
{:else if contact?.email}
  <a class={className} href={mailHref(contact.email)} onclick={() => count('email')} aria-label={`${t.listings.writeEmail}: ${venue.name}`}>{t.listings.writeEmail}</a>
{/if}
