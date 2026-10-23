<script lang="ts">
  /**
   * A payment problem, said on every console page to the person who can fix it.
   * The billing page explains it in full; this only makes sure it is seen.
   */
  import { t } from '$lib/i18n.svelte';
  import type { OrgContext } from '../../app.d';

  const { org }: { org: OrgContext | null | undefined } = $props();
  const show = $derived(
    !!org && org.role === 'owner' && !org.impersonated &&
    (org.subscription.status === 'past_due' || org.subscription.status === 'paused')
  );
</script>

{#if show}
  <!-- Above the page's own .wrap, so it takes the same width. -->
  <div class="wrap">
    <div class="billing-notice" role="status">
      <span>{t.accountPages.consolePaymentBanner}</span>
      <a href="/app/billing">{t.accountPages.billingEmail.cta}</a>
    </div>
  </div>
{/if}

<style>
  .billing-notice {
    display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
    margin: 20px 0 0; padding: 10px 14px; border-radius: var(--radius-sm);
    background: var(--danger-dim); color: var(--danger);
    border: 1px solid color-mix(in srgb, var(--danger) 25%, transparent);
    font-size: 13px; font-weight: 500;
  }
  .billing-notice a { color: inherit; font-weight: 650; text-decoration: underline; white-space: nowrap; }
</style>
