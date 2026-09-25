<script lang="ts">
  import { t } from '$lib/i18n.svelte';
  import type { ActionData, PageData } from './$types';
  let { data, form }: { data: PageData; form: ActionData } = $props();

  const currentPlan = $derived(data.currentOrg?.subscription.plan ?? 'free');
  const currentStatus = $derived(data.currentOrg?.subscription.status ?? 'active');

  const PLAN_ORDER = ['free', 'starter', 'professional', 'enterprise'] as const;
  const POPULAR = 'starter';

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function money(cents: number) {
    return '€' + (cents / 100).toFixed(2);
  }

  // ─── Plan-change confirm dialog ───
  let confirmPlan = $state<string | null>(null);
  const target = $derived(confirmPlan ? data.plans[confirmPlan as keyof typeof data.plans] : null);
  const isFirstSub = $derived(currentPlan === 'free');
  const targetIsUpgrade = $derived(
    !!target && (target.priceMonthly ?? 0) >= (data.plans[currentPlan].priceMonthly ?? 0)
  );
  const preview = $derived(confirmPlan ? data.previews?.[confirmPlan] : undefined);
  const periodEndStr = $derived(
    data.currentOrg?.subscription.currentPeriodEnd ? fmtDate(data.currentOrg.subscription.currentPeriodEnd) : null
  );
</script>

<svelte:head><title>{t.accountPages.billingTitle} – Hallify</title></svelte:head>

<div class="page">
  <div class="page-header">
    <div class="page-header-left">
      <h1 class="page-title">{t.accountPages.billingTitle}</h1>
      {#if data.currentOrg?.name}<span class="org-chip">{data.currentOrg.name}</span>{/if}
    </div>
  </div>

  {#if data.success}
    <div class="alert-success">{t.accountPages.subscriptionUpdated}</div>
  {/if}
  {#if data.upgraded}
    <div class="alert-success">{t.accountPages.planUpgradedNotice}</div>
  {/if}
  {#if data.downgradeScheduled}
    <div class="alert-success">{t.accountPages.downgradeScheduledNotice}</div>
  {/if}
  {#if data.changeReverted}
    <div class="alert-success">{t.accountPages.changeRevertedNotice}</div>
  {/if}
  {#if data.resumed}
    <div class="alert-success">{t.accountPages.resumedNotice}</div>
  {/if}
  {#if data.cancelScheduled}
    <div class="alert-warning">{t.accountPages.cancelScheduledNotice}</div>
  {/if}
  {#if data.cancelled}
    <div class="alert-warning">{t.accountPages.checkoutCancelledNotice}</div>
  {/if}
  {#if form?.error}
    <div class="alert-error">{form.error}</div>
  {/if}

  <!-- Current subscription -->
  <div class="current-card">
    <div class="current-left">
      <span class="current-label">{t.accountPages.currentPlan}</span>
      <div class="current-row">
        <span class="current-name">{data.plans[currentPlan].name}</span>
        <span class="status-pill status-{currentStatus}">{currentStatus}</span>
        {#if data.cancelAtPeriodEnd}<span class="status-pill status-cancelled">{t.accountPages.cancelsSoon}</span>{/if}
      </div>
      {#if currentPlan !== 'free' && data.currentOrg?.subscription.currentPeriodEnd}
        <span class="current-renew">
          {data.cancelAtPeriodEnd ? t.accountPages.endsOn : t.accountPages.renewsOn}
          {new Date(data.currentOrg.subscription.currentPeriodEnd).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        </span>
      {/if}
      {#if data.pendingDowngrade}
        <span class="pending-change">
          {t.accountPages.scheduledToSwitchTo} <b>{data.pendingDowngrade.planName}</b> {t.accountPages.onDate} {fmtDate(data.pendingDowngrade.effective)}
          <form method="POST" action="?/cancelScheduledChange" class="pending-form">
            <button type="submit" class="pending-undo">{t.accountPages.keepPlan} {data.plans[currentPlan].name}</button>
          </form>
        </span>
      {/if}
    </div>

    {#if data.currentOrg?.subscription.stripeCustomerId}
      <div class="current-actions">
        {#if data.cancelAtPeriodEnd}
          <form method="POST" action="?/resume">
            <button type="submit" class="btn-accent-sm">{t.accountPages.resumeSubscription}</button>
          </form>
        {:else if currentPlan !== 'free'}
          <form method="POST" action="?/cancel">
            <button type="submit" class="btn-outline danger-outline"
              onclick={(e) => { if (!confirm(t.accountPages.confirmCancelSubscription)) e.preventDefault(); }}>
              {t.accountPages.cancelPlan}
            </button>
          </form>
        {/if}
        <form method="POST" action="?/manage">
          <button type="submit" class="btn-outline">{t.accountPages.manageBilling}</button>
        </form>
      </div>
    {/if}
  </div>

  <!-- Plans -->
  <div class="plans-grid">
    {#each PLAN_ORDER as planId}
      {@const plan = data.plans[planId]}
      {@const isCurrent = planId === currentPlan}
      {@const isPopular = planId === POPULAR}
      <div class="plan-card" class:popular={isPopular} class:current={isCurrent}>
        {#if isPopular}<span class="ribbon">{t.accountPages.mostPopular}</span>{/if}

        <div class="plan-head">
          <span class="plan-name">{plan.name}</span>
          {#if isCurrent}<span class="current-tag">{t.accountPages.currentTag}</span>{/if}
        </div>

        <div class="plan-price">
          {#if plan.priceMonthly === null}
            <span class="price">{t.accountPages.priceCustom}</span>
            <span class="cadence">{t.accountPages.contactUs}</span>
          {:else if plan.priceMonthly === 0}
            <span class="price">{t.accountPages.priceFree}</span>
            <span class="cadence">{t.accountPages.forever}</span>
          {:else}
            <span class="price">€{plan.priceMonthly}</span>
            <span class="cadence">{t.accountPages.perMonth}</span>
          {/if}
        </div>

        <div class="plan-cta">
          {#if isCurrent}
            <span class="cta-current">{t.accountPages.yourCurrentPlan}</span>
          {:else if planId === 'enterprise'}
            <a href="mailto:sales@hallify.sk" class="btn-ghost-cta">{t.accountPages.contactSales}</a>
          {:else if planId === 'free'}
            <span class="cta-spacer"></span>
          {:else}
            <button type="button" class={isPopular ? 'btn-accent-cta' : 'btn-ghost-cta'}
              onclick={() => (confirmPlan = planId)}>
              {currentPlan === 'free' ? t.accountPages.upgradeTo : t.accountPages.switchTo} {plan.name}
            </button>
          {/if}
        </div>

        <ul class="features">
          {#each plan.features as feature}
            <li>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
              {feature}
            </li>
          {/each}
        </ul>
      </div>
    {/each}
  </div>
</div>

<!-- Plan-change confirm dialog -->
{#if confirmPlan && target}
  <div class="modal-backdrop" role="presentation" onclick={() => (confirmPlan = null)}>
    <div class="modal" role="dialog" aria-modal="true" onclick={(e) => e.stopPropagation()}>
      <h2 class="modal-title">
        {isFirstSub ? t.accountPages.subscribeTo : targetIsUpgrade ? t.accountPages.upgradeTo : t.accountPages.switchTo} {target.name}
      </h2>

      {#if isFirstSub}
        <p class="modal-body">
          {t.accountPages.checkoutIntroPre}
          <b>{target.name}</b> {t.accountPages.planAtPrice} €{target.priceMonthly}{t.accountPages.perMonthSuffix}.
        </p>
        <label class="consent">
          <input type="checkbox" name="acceptTerms" form="upgrade-form" required />
          <span>{t.legalConsent.agreeOnBehalfPre}<a href="/terms" target="_blank" rel="noopener">{t.legalConsent.termsLink}</a>{t.legalConsent.including}<a href="/dpa" target="_blank" rel="noopener">{t.legalConsent.dpaLink}</a>{t.legalConsent.end}</span>
        </label>
      {:else if targetIsUpgrade}
        <div class="charge-line">
          <span>{t.accountPages.chargedNow}</span>
          <b>{preview ? (preview.exact ? '' : '≈ ') + money(preview.amountDue) : '—'}</b>
        </div>
        <p class="modal-body">
          {t.accountPages.proratedExplain}
          {t.accountPages.thenWord} <b>{target.name}</b> {t.accountPages.renewsAt} €{target.priceMonthly}{t.accountPages.perMonthSuffix}{periodEndStr ? ` ${t.accountPages.fromDate} ${periodEndStr}` : ''}.
        </p>
        {#if preview && !preview.exact}
          <p class="modal-note">{t.accountPages.approximateNote}</p>
        {/if}
      {:else}
        <div class="charge-line"><span>{t.accountPages.chargedNow}</span><b>€0.00</b></div>
        <p class="modal-body">
          {t.accountPages.youKeep} <b>{data.plans[currentPlan].name}</b> {t.accountPages.untilWord} {periodEndStr ?? t.accountPages.endOfThisPeriod},
          {t.accountPages.thenMoveTo} <b>{target.name}</b>. {t.accountPages.noChargeToday}
        </p>
      {/if}

      <div class="modal-actions">
        <button type="button" class="btn-outline" onclick={() => (confirmPlan = null)}>{t.common.cancel}</button>
        <form method="POST" action="?/upgrade" id="upgrade-form">
          <input type="hidden" name="plan" value={confirmPlan} />
          <button type="submit" class="btn-accent-sm">
            {#if isFirstSub}{t.accountPages.continueToCheckout}
            {:else if targetIsUpgrade}{t.accountPages.payPrefix} {preview ? money(preview.amountDue) : ''} {t.accountPages.andUpgrade}
            {:else}{t.accountPages.scheduleSwitch}{/if}
          </button>
        </form>
      </div>
    </div>
  </div>
{/if}

<style>
  .page { padding: 24px 28px; }

  .page-header { margin-bottom: 18px; }
  .page-header-left { display: flex; align-items: center; gap: 10px; }
  .page-title { font-size: 18px; font-weight: 800; color: var(--text-base); letter-spacing: -.025em; margin: 0; }
  .org-chip {
    font-size: 12px; font-weight: 600; color: var(--text-muted);
    background: var(--bg-panel2, var(--bg-base)); border: 1px solid var(--border);
    border-radius: 99px; padding: 2px 10px;
  }

  /* Current subscription */
  .current-card {
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
    background: var(--bg-panel); border: 1px solid var(--border); border-radius: 14px;
    padding: 18px 20px; margin-bottom: 24px;
  }
  .current-left { display: flex; flex-direction: column; gap: 5px; }
  .current-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--text-subtle); }
  .current-row { display: flex; align-items: center; gap: 10px; }
  .current-name { font-size: 20px; font-weight: 800; color: var(--text-base); letter-spacing: -.02em; }
  .current-renew { font-size: 12px; color: var(--text-muted); }
  .pending-change {
    display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap;
    margin-top: 4px; font-size: 12px; color: var(--warning, #b45309);
    background: color-mix(in srgb, var(--warning, #f59e0b) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--warning, #f59e0b) 28%, transparent);
    border-radius: 8px; padding: 5px 10px;
  }
  .pending-form { margin: 0; }
  .pending-undo {
    font-size: 11px; font-weight: 700; color: var(--accent);
    background: none; border: none; cursor: pointer; font-family: inherit;
    text-decoration: underline; padding: 0;
  }
  .status-pill { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; padding: 2px 9px; border-radius: 99px; }
  .status-active   { color: var(--success, #16a34a); background: color-mix(in srgb, var(--success, #22c55e) 14%, transparent); }
  .status-trialing { color: var(--accent); background: var(--accent-dim, color-mix(in srgb, var(--accent) 14%, transparent)); }
  .status-past_due, .status-unpaid { color: var(--danger, #dc2626); background: color-mix(in srgb, var(--danger, #ef4444) 12%, transparent); }
  .status-cancelled { color: var(--text-muted); background: var(--bg-panel2, var(--bg-base)); }

  /* Plans grid */
  .plans-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; align-items: stretch; }

  .plan-card {
    position: relative;
    display: flex; flex-direction: column;
    background: var(--bg-panel); border: 1px solid var(--border);
    border-radius: 16px; padding: 24px 20px;
    transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease;
  }
  .plan-card:hover { transform: translateY(-3px); box-shadow: 0 16px 40px rgba(0,0,0,.1); border-color: color-mix(in srgb, var(--accent) 30%, var(--border)); }

  /* Popular card POP */
  .plan-card.popular {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent), 0 18px 44px color-mix(in srgb, var(--accent) 22%, transparent);
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--accent) 10%, transparent), transparent 42%),
      var(--bg-panel);
  }
  .plan-card.popular:hover { transform: translateY(-5px); }
  .plan-card.current { border-color: color-mix(in srgb, var(--accent) 55%, var(--border)); }

  .ribbon {
    position: absolute; top: -11px; left: 50%; transform: translateX(-50%);
    background: var(--accent); color: #fff; font-size: 10px; font-weight: 800;
    text-transform: uppercase; letter-spacing: .05em; padding: 4px 12px; border-radius: 99px;
    white-space: nowrap; box-shadow: 0 6px 16px color-mix(in srgb, var(--accent) 40%, transparent);
  }

  .plan-head { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
  .plan-name { font-size: 15px; font-weight: 700; color: var(--text-base); }
  .current-tag {
    font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em;
    color: var(--accent); background: var(--accent-dim, color-mix(in srgb, var(--accent) 14%, transparent));
    border-radius: 99px; padding: 1px 7px;
  }

  .plan-price { display: flex; align-items: baseline; gap: 5px; margin-bottom: 18px; }
  .price { font-size: 32px; font-weight: 800; letter-spacing: -.03em; color: var(--text-base); }
  .cadence { font-size: 13px; color: var(--text-subtle); }

  .plan-cta { margin-bottom: 18px; min-height: 38px; }
  .plan-cta form { margin: 0; }
  .btn-accent-cta, .btn-ghost-cta {
    display: block; width: 100%; text-align: center; box-sizing: border-box;
    padding: 10px 14px; border-radius: 9px; font-size: 13px; font-weight: 700;
    cursor: pointer; font-family: inherit; text-decoration: none; transition: opacity .12s, background .12s, border-color .12s;
  }
  .btn-accent-cta { background: var(--accent); color: #fff; border: 1px solid var(--accent); box-shadow: 0 6px 18px color-mix(in srgb, var(--accent) 30%, transparent); }
  .btn-accent-cta:hover { opacity: .92; }
  .btn-ghost-cta { background: transparent; color: var(--text-base); border: 1px solid var(--border); }
  .btn-ghost-cta:hover { border-color: var(--accent); color: var(--accent); }
  .cta-current { display: block; text-align: center; padding: 10px 14px; font-size: 13px; font-weight: 600; color: var(--text-subtle); }
  .cta-spacer { display: block; height: 38px; }

  .features { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 9px; border-top: 1px solid var(--border-subtle, var(--border)); padding-top: 16px; }
  .features li { display: flex; align-items: flex-start; gap: 9px; font-size: 12.5px; color: var(--text-muted); line-height: 1.4; }
  .features svg { color: var(--accent); flex-shrink: 0; margin-top: 2px; }

  .current-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
  .current-actions form { margin: 0; }

  .btn-outline {
    padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600;
    background: var(--bg-panel); color: var(--text-base); border: 1px solid var(--border);
    cursor: pointer; font-family: inherit; white-space: nowrap; transition: border-color .12s, color .12s, background .12s;
  }
  .btn-outline:hover { border-color: var(--accent); color: var(--accent); }
  .danger-outline:hover { border-color: var(--danger, #dc2626); color: var(--danger, #dc2626); background: color-mix(in srgb, var(--danger, #ef4444) 6%, transparent); }

  .btn-accent-sm {
    padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 700;
    background: var(--accent); color: #fff; border: 1px solid var(--accent);
    cursor: pointer; font-family: inherit; white-space: nowrap; transition: opacity .12s;
  }
  .btn-accent-sm:hover { opacity: .9; }

  .alert-success { padding: 10px 14px; border-radius: 9px; font-size: 13px; font-weight: 500; margin-bottom: 16px; color: var(--success, #16a34a); background: color-mix(in srgb, var(--success, #22c55e) 12%, transparent); border: 1px solid color-mix(in srgb, var(--success, #22c55e) 26%, transparent); }
  .alert-warning { padding: 10px 14px; border-radius: 9px; font-size: 13px; font-weight: 500; margin-bottom: 16px; color: var(--warning, #b45309); background: color-mix(in srgb, var(--warning, #f59e0b) 14%, transparent); border: 1px solid color-mix(in srgb, var(--warning, #f59e0b) 30%, transparent); }
  .alert-error { padding: 10px 14px; border-radius: 9px; font-size: 13px; font-weight: 500; margin-bottom: 16px; color: var(--danger, #dc2626); background: color-mix(in srgb, var(--danger, #ef4444) 10%, transparent); border: 1px solid color-mix(in srgb, var(--danger, #ef4444) 26%, transparent); }

  /* Plan-change dialog */
  .modal-backdrop {
    position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center;
    background: rgba(15, 23, 42, 0.5); padding: 20px; backdrop-filter: blur(2px);
  }
  .modal {
    width: 100%; max-width: 420px; background: var(--bg-panel); border: 1px solid var(--border);
    border-radius: 16px; padding: 24px; box-shadow: 0 24px 60px rgba(0,0,0,0.3);
  }
  .modal-title { font-size: 18px; font-weight: 800; letter-spacing: -.02em; color: var(--text-base); margin: 0 0 14px; }
  .charge-line {
    display: flex; align-items: baseline; justify-content: space-between; gap: 12px;
    padding: 12px 14px; border-radius: 10px; background: var(--bg-panel2, var(--bg-base)); border: 1px solid var(--border); margin-bottom: 12px;
  }
  .charge-line span { font-size: 13px; font-weight: 600; color: var(--text-muted); }
  .charge-line b { font-size: 22px; font-weight: 800; color: var(--text-base); letter-spacing: -.02em; }
  .modal-body { font-size: 13px; line-height: 1.5; color: var(--text-muted); margin: 0 0 6px; }
  .modal-note { font-size: 11.5px; color: var(--text-subtle); margin: 0; }
  .consent { display: flex; align-items: flex-start; gap: 9px; margin-top: 14px; font-size: 12.5px; line-height: 1.45; color: var(--text-muted); cursor: pointer; }
  .consent input { margin-top: 2px; flex-shrink: 0; accent-color: var(--accent); }
  .consent a { color: var(--accent); font-weight: 600; text-decoration: none; }
  .consent a:hover { text-decoration: underline; }
  .modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
  .modal-actions form { margin: 0; }

  @media (max-width: 980px) {
    .plans-grid { grid-template-columns: repeat(2, 1fr); }
    .plan-card.popular { transform: none; }
  }
  @media (max-width: 560px) {
    .plans-grid { grid-template-columns: 1fr; }
    .current-card { flex-direction: column; align-items: flex-start; }
  }
</style>
