<script lang="ts">
  import { venueTitle } from '$lib/page-title';
  /**
   * The builder's preview, rendered inside an iframe on the public-site settings
   * page.
   *
   * `+page@.svelte` resets to the root layout, so none of the app chrome (sidebar,
   * impersonation banner) appears around it — the iframe shows the public site and
   * nothing else.
   *
   * It renders the same SiteShell and SiteSections the live bubble renders. The
   * draft arrives over postMessage rather than as query parameters: an operator
   * typing a tagline would otherwise reload this route on every keystroke, and a
   * 600-character introduction does not belong in a URL.
   */
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n.svelte';
  import SiteShell from '$lib/site/SiteShell.svelte';
  import SiteSections from '$lib/site/SiteSections.svelte';
  import { resolveTemplate, templateStyle } from '$lib/site-templates';
  import { resolveSections, visibleSections, type SiteSection } from '$lib/site-sections';
  import type { PageData } from './$types';

  interface Props { data: PageData; }
  const { data }: Props = $props();

  interface Draft {
    template: string;
    tagline: string;
    intro: string;
    sections: SiteSection[];
  }

  let draft = $state<Draft>({
    template: 'hallify',
    tagline: '',
    intro: '',
    sections: resolveSections(null)
  });

  onMount(() => {
    function onMessage(e: MessageEvent) {
      // Same-origin only. The preview reflects whatever it is told to render, so
      // the one thing it must never do is accept a draft from another site.
      if (e.origin !== window.location.origin) return;
      const msg = e.data as { type?: string; draft?: Partial<Draft> } | null;
      if (msg?.type !== 'hallify:site-draft' || !msg.draft) return;

      // Without a paid plan the live site shows the default page with no texts
      // (src/routes/halls/+layout.server.ts), so the preview does the same rather
      // than showing an arrangement no visitor will see.
      draft = {
        template: String(msg.draft.template ?? draft.template),
        tagline: data.allowPremium ? String(msg.draft.tagline ?? '') : '',
        intro: data.allowPremium ? String(msg.draft.intro ?? '') : '',
        sections: resolveSections(data.allowPremium ? msg.draft.sections : null)
      };
    }

    window.addEventListener('message', onMessage);
    // The parent may have posted before this listener existed, so ask for the
    // current draft rather than waiting for the next edit.
    window.parent?.postMessage({ type: 'hallify:preview-ready' }, window.location.origin);
    return () => window.removeEventListener('message', onMessage);
  });

  // The plan rule is applied here too. Picking a locked template must preview the
  // fallback a visitor would really be served, not the one the operator cannot have.
  const template = $derived(resolveTemplate(draft.template, data.allowPremium));

  const AMENITY_LABELS = $derived<Record<string, string>>({
    parking: t.hallDir.amenityParking, catering: t.hallDir.amenityCatering, av: t.hallDir.amenityAv,
    wifi: t.hallDir.amenityWifi, ac: t.hallDir.amenityAc, accessible: t.hallDir.amenityAccessible,
    outdoor: t.hallDir.amenityOutdoor, stage: t.hallDir.amenityStage,
    dancefloor: t.hallDir.amenityDancefloor, bar: t.hallDir.amenityBar
  });

  const halls = $derived(data.halls ?? []);

  const sections = $derived(
    visibleSections(draft.sections, {
      hallCount: halls.length,
      hasContact: halls.some(
        (h) => h.contact_phone || h.contact_email || h.contact_website || h.address
      ),
      hasIntro: !!draft.intro
    })
  );

  const labels = $derived({
    guests: t.hallDir.guests,
    viewVenue: t.hallDir.viewVenue,
    allVenues: t.nav.halls,
    about: t.hallDir.aboutHeading,
    amenities: t.hallProfile.amenities,
    contact: t.hallDir.contactHeading,
    ctaTitle: t.hallDir.ctaTitle,
    ctaBody: t.hallDir.ctaBody,
    ctaButton: t.hallDir.viewVenue,
    searchPlaceholder: t.hallDir.searchPlaceholder,
    minGuests: t.hallDir.minGuests,
    noMatches: t.hallDir.noHallsMatch
  });
</script>

<svelte:head>
  <title>{venueTitle(data.org.name)}</title>
  <!-- Never let a search engine index the preview as if it were the live site. -->
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<SiteShell
  org={data.org}
  templateStyle={templateStyle(template)}
  template={template.id}
  inert
>
  {#if data.org.logoUrl}
    <img class="site-logo" src={data.org.logoUrl} alt={data.org.name} width="56" height="56" />
  {/if}

  {#if halls.length === 0}
    <p class="pv-empty">{t.settingsPages.sitePreviewNoHalls}</p>
  {/if}

  <SiteSections
    {sections}
    org={data.org}
    {halls}
    tagline={draft.tagline}
    intro={draft.intro}
    amenityLabels={AMENITY_LABELS}
    {labels}
    inert
  />
</SiteShell>

<style>
  .site-logo { display: block; width: 56px; height: 56px; object-fit: contain; margin-bottom: 4px; }
  .pv-empty {
    padding: 28px;
    border: 1px dashed var(--border);
    border-radius: var(--radius);
    color: var(--text-muted);
    font-size: var(--body-size);
    text-align: center;
  }
</style>
