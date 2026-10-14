<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n.svelte';
  import {
    initAnalytics, readConsent, setConsent,
    CONSENT_ALL, CONSENT_NONE, consentUi, type ConsentState,
  } from '$lib/analytics';

  interface Props {
    /** GTM container for this surface, or null when analytics is not configured. */
    containerId: string | null;
  }
  const { containerId }: Props = $props();

  let open = $state(false);
  /** Collapsed = first visit (Accept all / Reject all). Expanded = per-category. */
  let showDetail = $state(false);
  let analytics = $state(false);
  let marketing = $state(false);

  onMount(() => {
    // Consent Mode defaults first; GTM only loads if something was already accepted.
    initAnalytics(containerId);
    const stored = readConsent();
    if (stored) { analytics = stored.analytics; marketing = stored.marketing; }
    // Nothing to consent to when no container is configured — don't nag.
    if (containerId && stored === null) open = true;
  });

  // Reopening from the footer link. Withdrawal has to be as reachable as granting.
  $effect(() => {
    if (consentUi.requestedAt > 0) {
      const stored = readConsent();
      analytics = stored?.analytics ?? false;
      marketing = stored?.marketing ?? false;
      showDetail = true;
      open = true;
    }
  });

  function apply(state: ConsentState) {
    setConsent(state, containerId);
    open = false;
    showDetail = false;
  }
</script>

{#if open}
  <div class="consent" role="dialog" aria-modal="false" aria-label={t.consent.title}>
    <div class="consent-body">
      <div class="consent-head">
        <h2>{t.consent.title}</h2>
        <p>{t.consent.body} <a href="/privacy">{t.consent.privacyLink}</a></p>
      </div>

      {#if showDetail}
        <div class="cats">
          <label class="cat cat-locked">
            <input type="checkbox" checked disabled />
            <span>
              <strong>{t.consent.necessary}</strong>
              <em>{t.consent.necessaryDesc}</em>
            </span>
          </label>
          <label class="cat">
            <input type="checkbox" bind:checked={analytics} />
            <span>
              <strong>{t.consent.analytics}</strong>
              <em>{t.consent.analyticsDesc}</em>
            </span>
          </label>
          <label class="cat">
            <input type="checkbox" bind:checked={marketing} />
            <span>
              <strong>{t.consent.marketing}</strong>
              <em>{t.consent.marketingDesc}</em>
            </span>
          </label>
        </div>
      {/if}

      <div class="consent-actions">
        {#if showDetail}
          <button type="button" class="btn btn-ghost" onclick={() => apply(CONSENT_NONE)}>{t.consent.rejectAll}</button>
          <button type="button" class="btn btn-accept" onclick={() => apply({ analytics, marketing })}>{t.consent.save}</button>
        {:else}
          <button type="button" class="btn btn-link" onclick={() => (showDetail = true)}>{t.consent.customise}</button>
          <!-- Reject must be exactly as easy as accept: one click, equal weight. -->
          <button type="button" class="btn btn-ghost" onclick={() => apply(CONSENT_NONE)}>{t.consent.rejectAll}</button>
          <button type="button" class="btn btn-accept" onclick={() => apply(CONSENT_ALL)}>{t.consent.acceptAll}</button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .consent {
    position: fixed;
    left: 16px; right: 16px; bottom: 16px;
    z-index: 9999;
    display: flex; justify-content: center;
    pointer-events: none;
  }
  .consent-body {
    pointer-events: auto;
    max-width: 720px; width: 100%;
    padding: 16px 18px;
    border-radius: 12px;
    background: var(--bg-panel, #111726);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
    box-shadow: 0 10px 34px rgba(0, 0, 0, 0.35);
    font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif;
  }
  .consent-head h2 { font-size: 0.95rem; font-weight: 620; margin: 0 0 4px; color: var(--text-primary, rgba(255,255,255,.92)); }
  .consent-head p { margin: 0; font-size: 0.85rem; line-height: 1.55; color: var(--text-secondary, rgba(255,255,255,.66)); }
  .consent-head a { color: var(--accent, #4f6ef7); }

  .cats { display: flex; flex-direction: column; gap: 8px; margin: 14px 0 4px; }
  .cat { display: flex; gap: 10px; align-items: flex-start; font-size: 0.82rem; cursor: pointer; }
  .cat input { margin-top: 3px; flex-shrink: 0; }
  .cat strong { display: block; font-weight: 580; color: var(--text-primary, rgba(255,255,255,.9)); }
  .cat em { font-style: normal; color: var(--text-secondary, rgba(255,255,255,.55)); line-height: 1.5; }
  .cat-locked { opacity: 0.65; cursor: default; }

  .consent-actions { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; margin-top: 14px; }
  .btn {
    padding: 8px 16px; border-radius: 8px;
    font-size: 0.85rem; font-weight: 560;
    cursor: pointer; font-family: inherit;
    border: 1px solid transparent; white-space: nowrap;
  }
  .btn-accept { background: var(--accent, #4f6ef7); color: #fff; }
  .btn-ghost {
    background: transparent;
    color: var(--text-secondary, rgba(255,255,255,.7));
    border-color: var(--border, rgba(255,255,255,.16));
  }
  .btn-link { background: none; color: var(--text-secondary, rgba(255,255,255,.6)); text-decoration: underline; margin-right: auto; padding-left: 0; }

  @media (max-width: 560px) {
    .consent-actions { justify-content: stretch; }
    .btn-link { margin-right: 0; width: 100%; text-align: left; }
    .btn-ghost, .btn-accept { flex: 1; }
  }
</style>
