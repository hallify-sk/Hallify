<script lang="ts">
  import { CREDITS_PER_EUR } from '$lib/ai-credits';
  import { creditAmount } from '$lib/assistant/credits';
  import { enhance } from '$app/forms';
  import { t, getLocale } from '$lib/i18n.svelte';
  import type { PageData } from './$types';

  const { data }: { data: PageData } = $props();

  const dateLocale = $derived(getLocale() === 'en' ? 'en-GB' : 'sk-SK');
  const credits = (mc: number) => creditAmount(mc, getLocale());
  const fmtDate = (d: string | null, withTime = false) =>
    d
      ? new Date(d.includes('T') ? d : `${d.replace(' ', 'T')}Z`).toLocaleString(dateLocale, {
          day: 'numeric', month: 'short', year: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {})
        })
      : '—';
  const eur = (credits: number) =>
    new Intl.NumberFormat(dateLocale, { style: 'currency', currency: 'EUR' }).format(credits / CREDITS_PER_EUR);
  type KindKey = keyof typeof t.ai.ledgerKinds;
  const kindLabel = (k: string) => (k in t.ai.ledgerKinds ? t.ai.ledgerKinds[k as KindKey] : k);

  let toggleForm = $state<HTMLFormElement | null>(null);
</script>

<svelte:head><title>{t.ai.settingsTitle} – {t.settings.title} – Hallify</title></svelte:head>

<section class="section section--lead">
  <div class="section-head">
    <h2>{t.ai.settingsTitle} <span class="beta" title={t.ai.betaHint}>{t.ai.beta}</span></h2>
    <p>{t.ai.settingsHint}</p>
  </div>

  {#if data.topupDone}<p class="alert-success topup">{t.ai.topupDone}</p>{/if}

  <form method="POST" action="?/toggle" bind:this={toggleForm} use:enhance={() => async ({ update }) => update({ reset: false })}>
    <label class="toggle-row">
      <span class="ui-switch">
        <input type="checkbox" name="enabled" checked={data.enabled} onchange={() => toggleForm?.requestSubmit()} />
        <span class="ui-switch-track" aria-hidden="true"></span>
      </span>
      <span class="toggle-text">
        <strong>{t.ai.enabledLabel}</strong>
        <span>{t.ai.enabledHint}</span>
        {#if data.enabled && data.enabledBy}
          <span class="by">{t.ai.enabledBy(data.enabledBy, fmtDate(data.enabledAt))}</span>
        {/if}
      </span>
    </label>
  </form>

  <dl class="stats">
    <div><dt>{t.ai.balanceLabel}</dt><dd>{credits(Math.max(0, data.balanceMc))}</dd></div>
    <div><dt>{t.ai.allowanceLabel}</dt><dd>{t.ai.allowanceValue(data.allowance)}</dd></div>
    <div><dt>{t.ai.spentLabel}</dt><dd>{credits(data.spentMc)}</dd></div>
    <div><dt>{t.ai.purchasedLabel}</dt><dd>{credits(data.purchasedMc)}</dd></div>
    <div><dt>{t.ai.renewsLabel}</dt><dd>{fmtDate(data.periodEnd)}</dd></div>
  </dl>
</section>

<section class="section">
  <div class="section-head">
    <h2>{t.ai.buyTitle}</h2>
    <p>{t.ai.buyHint}</p>
  </div>
  {#if data.canBuy}
    <div class="packs">
      {#each data.packs as p (p)}
        <form method="POST" action="?/buy">
          <input type="hidden" name="credits" value={p} />
          <button type="submit" class="btn-outline">{t.ai.buyPack(p, eur(p))}</button>
        </form>
      {/each}
    </div>
  {:else}
    <p class="muted">{t.ai.buyOwnerOnly}</p>
  {/if}
</section>

<section class="section">
  <div class="section-head">
    <h2>{t.ai.usageTitle}</h2>
  </div>
  {#if data.ledger.length === 0}
    <p class="muted">{t.ai.noUsage}</p>
  {:else}
    <div class="row-list">
      {#each data.ledger as l (l.id)}
        <div class="row-item ledger-row">
          <span class="muted nowrap">{fmtDate(l.created_at, true)}</span>
          <span>{kindLabel(l.kind)}{#if l.user_name}<span class="muted">{' · '}{l.user_name}</span>{/if}</span>
          <span class="amt" class:neg={l.amount_mc < 0}>{l.amount_mc > 0 ? '+' : '−'}{credits(Math.abs(l.amount_mc))}</span>
        </div>
      {/each}
    </div>
  {/if}
</section>

<style>
  /* The assistant is in beta: said wherever it is offered. */
  .beta {
    display: inline-flex; align-items: center; padding: 1px 6px; border-radius: var(--radius-sm);
    font-size: 9.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; line-height: 1.5;
    background: var(--accent-dim); color: var(--accent-ink); vertical-align: middle;
  }

  .muted { color: var(--text-muted); }
  .nowrap { white-space: nowrap; }
  .topup { margin: 0 0 16px; }

  .toggle-row { display: flex; gap: 14px; align-items: flex-start; cursor: pointer; max-width: 640px; }
  .toggle-row .ui-switch { margin-top: 2px; }
  .toggle-text { display: flex; flex-direction: column; gap: 3px; }
  .toggle-text strong { font-size: 13.5px; font-weight: 600; }
  .toggle-text span { font-size: 12.5px; font-weight: 400; color: var(--text-muted); line-height: 1.5; }
  .toggle-text .by { color: var(--text-subtle); font-size: 11.5px; }

  .stats {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px;
    margin: 24px 0 0;
  }
  .stats div { padding: 12px 14px; border: 1px solid var(--border); border-radius: var(--radius-sm); }
  .stats dt { font-size: 10px; font-weight: 650; text-transform: uppercase; letter-spacing: .09em; color: var(--text-muted); }
  .stats dd { margin: 6px 0 0; font-size: 18px; font-weight: 600; letter-spacing: -.03em; font-variant-numeric: tabular-nums; }

  .packs { display: flex; gap: 10px; flex-wrap: wrap; }
  .packs form { margin: 0; }

  .ledger-row { display: grid; grid-template-columns: 170px minmax(0, 1fr) auto; gap: 12px; font-size: 13px; }
  .amt { font-variant-numeric: tabular-nums; font-weight: 600; color: var(--success); }
  .amt.neg { color: var(--text-base); }
  @media (max-width: 640px) {
    .ledger-row { grid-template-columns: minmax(0, 1fr) auto; }
    .ledger-row > :first-child { grid-column: 1 / -1; }
  }
</style>
