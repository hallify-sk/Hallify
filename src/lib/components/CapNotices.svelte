<script lang="ts">
  /**
   * Halls whose month is full under the plan's monthly reservation cap (M17): the
   * venue site no longer takes bookings for that month, and clients who tried are
   * counted. The upgrade link is for whoever can change the plan.
   */
  import { t, getLocale } from '$lib/i18n.svelte';
  import { planName } from '$lib/plans';

  interface Notice { hallId: string; hallName: string; month: string; booked: number; cap: number; turnedAway: number }
  interface Props {
    caps: { notices: Notice[]; plan: string; next: { id: string; name: string; cap: number } | null } | null | undefined;
    canUpgrade: boolean;
  }
  const { caps, canUpgrade }: Props = $props();

  const monthLabel = (m: string) => {
    const [y, mo] = m.split('-').map(Number);
    return new Date(Date.UTC(y, mo - 1, 15)).toLocaleDateString(getLocale() === 'en' ? 'en-GB' : 'sk-SK', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  };
</script>

{#if caps && caps.notices.length}
  <div class="cap-notices" role="status">
    {#each caps.notices as n (n.hallId + n.month)}
      <div class="cap-row">
        <strong>{t.adminPages.capFullTitle(n.hallName, monthLabel(n.month))}</strong>
        <span>
          {t.adminPages.capFullBody(n.booked, n.cap, planName(caps.plan))}
          {#if n.turnedAway > 0}<b class="cap-refused">{t.adminPages.capTurnedAway(n.turnedAway)}</b>{/if}
        </span>
      </div>
    {/each}
    {#if caps.next}
      {#if canUpgrade}
        <a class="cap-cta" href="/app/billing">
          {caps.next.cap === -1 ? t.adminPages.capUpgradeUnlimited(caps.next.name) : t.adminPages.capUpgrade(caps.next.name, caps.next.cap)}
        </a>
      {:else}
        <span class="cap-owner">{t.adminPages.capAskOwner}</span>
      {/if}
    {/if}
  </div>
{/if}

<style>
  .cap-notices {
    display: flex; flex-direction: column; gap: 8px;
    margin: 0 0 20px; padding: 12px 14px; border-radius: var(--radius-sm);
    background: var(--warning-dim);
    border: 1px solid color-mix(in srgb, var(--warning) 30%, transparent);
    font-size: 13px; color: var(--text-base);
  }
  .cap-row { display: flex; flex-direction: column; gap: 2px; }
  .cap-row strong { font-weight: 650; }
  .cap-row span { color: var(--text-muted); line-height: 1.5; }
  .cap-refused { display: block; color: var(--text-base); font-weight: 600; }
  .cap-cta { align-self: flex-start; font-weight: 650; color: var(--accent-ink); text-decoration: underline; }
  .cap-owner { color: var(--text-muted); font-size: 12.5px; }
</style>
