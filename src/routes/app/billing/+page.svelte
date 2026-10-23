<script lang="ts">
  import { pageTitle } from '$lib/page-title';
  import { onMount } from 'svelte';
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { saas } from '$lib/analytics';
  import { t, getLocale } from '$lib/i18n.svelte';
  import { reveal } from '$lib/reveal';
  import { formatDate, formatMoney } from '$lib/format';
  import { confirmFirst } from '$lib/forms';
  import { dialog } from '$lib/actions/dialog';
  import { planFeatureList } from '$lib/plan-features';
  import { planName } from '$lib/billing';
  import SetupServiceCard from '$lib/components/SetupServiceCard.svelte';
  import type { ActionData, PageData } from './$types';
  let { data, form }: { data: PageData; form: ActionData } = $props();

  onMount(() => {
    saas.viewPlans(data.currentOrg?.subscription?.plan ?? 'free');
    // Coming back from Stripe with the browser's Back button restores this page from
    // the back/forward cache with its buttons still busy. Release them.
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) busy = null; };
    addEventListener('pageshow', onShow);
    return () => removeEventListener('pageshow', onShow);
  });

  const locale = $derived(getLocale());
  const currentPlan = $derived(data.currentOrg?.subscription.plan ?? 'free');
  const currentStatus = $derived(data.currentOrg?.subscription.status ?? 'active');
  const statusLabel = $derived(t.accountPages.statusLabels[currentStatus as keyof typeof t.accountPages.statusLabels] ?? currentStatus);
  const hasCustomer = $derived(!!data.currentOrg?.subscription.stripeCustomerId);

  const PLAN_ORDER = ['free', 'starter', 'professional', 'enterprise'] as const;
  const POPULAR = 'starter';

  const fmtDate = (iso: string) => formatDate(iso, locale);
  const money = (cents: number) => formatMoney(cents, locale);
  const planPrice = (p: { priceMonthly: number | null }) => money(Math.round((p.priceMonthly ?? 0) * 100));

  // Every form that ends at Stripe is enhanced, so the redirect happens as a script
  // navigation. A plain form POST answered with a 303 to checkout.stripe.com is a
  // form submission to another origin, which the CSP's form-action blocked in Chrome
  // and Edge: the page just sat there. Enhanced, a refusal from Stripe also comes
  // back as a message on this page instead of the error page.
  let busy = $state<string | null>(null);
  const viaStripe = (key: string): SubmitFunction => () => {
    busy = key;
    return async ({ update }) => {
      await update(); // an external redirect never returns from here
      busy = null;
    };
  };

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
  const closeDialog = () => { if (!busy) confirmPlan = null; };

  // ─── Usage against the plan's limits ───
  const limits = $derived(data.plans[currentPlan].limits);
  const meters = $derived([
    { key: 'halls', label: t.accountPages.usageHalls, used: data.usage.activeHalls, limit: limits.maxHalls, hint: null },
    { key: 'members', label: t.accountPages.usageMembers, used: data.usage.members, limit: limits.maxMembers, hint: null },
    { key: 'reservations', label: t.accountPages.usageReservations, used: data.usage.reservationsMax, limit: limits.maxReservationsPerHallMonth, hint: t.accountPages.usageReservationsHint },
    { key: 'gallery', label: t.accountPages.usageGallery, used: data.usage.galleryMax, limit: limits.maxGalleryImages, hint: t.accountPages.usagePerVenueHint },
    { key: 'extras', label: t.accountPages.usageExtras, used: data.usage.extrasMax, limit: limits.maxExtrasPerHall, hint: t.accountPages.usagePerVenueHint },
  ]);
  const num = (n: number, digits = 0) =>
    new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'sk-SK', { maximumFractionDigits: digits }).format(n);
  const pct = (used: number, limit: number) => Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
</script>

<svelte:head><title>{pageTitle(t.accountPages.billingTitle)}</title></svelte:head>

<div class="wrap page">
  <div class="page-header">
    <div class="page-header-left">
      <h1 class="page-title">{t.accountPages.billingTitle}</h1>
      {#if data.currentOrg?.name}<span class="org-chip">{data.currentOrg.name}</span>{/if}
    </div>
  </div>

  {#if form?.error && !confirmPlan}
    <div class="alert-error" role="alert">{form.error}</div>
  {/if}
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

  <!-- Payment problems come first: they are the one thing on this page that costs
       the organisation something if nobody acts. -->
  {#if currentStatus === 'past_due' || data.suspendedPlan}
    <div class="alert-error pay-alert" role="status">
      <span>
        {#if currentStatus === 'past_due'}
          {t.accountPages.pastDueBanner}
        {:else if data.stripeStatus === 'incomplete'}
          {t.accountPages.incompleteBanner(planName(data.suspendedPlan))}
        {:else}
          {t.accountPages.suspendedBanner(planName(data.suspendedPlan))}
        {/if}
      </span>
      {#if data.canManage && hasCustomer}
        <form method="POST" action="?/manage" use:enhance={viaStripe('pay')}>
          <button type="submit" class="btn-outline btn-sm" disabled={busy !== null}>{t.accountPages.updatePayment}</button>
        </form>
      {/if}
    </div>
  {/if}
  {#if data.usage.lockedHalls > 0}
    <div class="alert-warning">{t.accountPages.lockedHallsNotice(data.usage.lockedHalls)}</div>
  {/if}

  <!-- Current subscription — a hairline section, not a boxed card. -->
  <section class="section section--lead section--flush">
    <div class="section-head section-head--row">
      <div class="current-left">
        <p class="eyebrow">{t.accountPages.currentPlan}</p>
        <div class="current-row">
          <span class="current-name">{data.plans[currentPlan].name}</span>
          <span class="status-pill status-{currentStatus}">{statusLabel}</span>
          {#if data.cancelAtPeriodEnd}<span class="status-pill status-cancelled">{t.accountPages.cancelsSoon}</span>{/if}
        </div>
        {#if currentPlan !== 'free' && data.currentOrg?.subscription.currentPeriodEnd}
          <span class="current-renew">
            {data.cancelAtPeriodEnd ? t.accountPages.endsOn : t.accountPages.renewsOn}
            {fmtDate(data.currentOrg.subscription.currentPeriodEnd)}
          </span>
        {/if}
        {#if data.pendingDowngrade}
          <span class="pending-change">
            {t.accountPages.scheduledToSwitchTo} <b>{data.pendingDowngrade.planName}</b> {t.accountPages.onDate} {fmtDate(data.pendingDowngrade.effective)}
            {#if data.canManage}
              <form method="POST" action="?/cancelScheduledChange" class="pending-form" use:enhance={viaStripe('revert')}>
                <button type="submit" class="pending-undo" disabled={busy !== null}>{t.accountPages.keepPlan} {data.plans[currentPlan].name}</button>
              </form>
            {/if}
          </span>
        {/if}
        {#if !data.canManage}
          <span class="owner-only">{t.accountPages.ownerOnlyNotice}</span>
        {/if}
      </div>

      {#if data.canManage && hasCustomer}
        <div class="current-actions">
          {#if data.cancelAtPeriodEnd}
            <form method="POST" action="?/resume" use:enhance={viaStripe('resume')}>
              <button type="submit" class="btn-accent-sm" disabled={busy !== null}>{t.accountPages.resumeSubscription}</button>
            </form>
          {:else if currentPlan !== 'free'}
            <form method="POST" action="?/cancel"
              use:enhance={confirmFirst(() => t.accountPages.confirmCancelSubscription, async ({ update }) => { await update(); })}>
              <button type="submit" class="btn-outline danger-outline" disabled={busy !== null}>
                {t.accountPages.cancelPlan}
              </button>
            </form>
          {/if}
          <form method="POST" action="?/manage" use:enhance={viaStripe('manage')}>
            <button type="submit" class="btn-outline" disabled={busy !== null}>{t.accountPages.manageBilling}</button>
          </form>
        </div>
      {/if}
    </div>
  </section>

  <!-- Usage: where the organisation stands against the plan it is on. -->
  <section class="section" use:reveal>
    <div class="section-head">
      <h2>{t.accountPages.usageTitle}</h2>
      <p>{t.accountPages.usageLead}</p>
    </div>
    <div class="usage-grid">
      {#each meters as m (m.key)}
        <div class="meter">
          <span class="meter-label">{m.label}</span>
          <span class="meter-value">
            {#if m.limit === -1}{num(m.used)} <span class="meter-unl">· {t.accountPages.usageUnlimited}</span>
            {:else}{t.accountPages.usageOf(num(m.used), num(m.limit))}{/if}
          </span>
          {#if m.limit !== -1}
            <span class="meter-bar" aria-hidden="true"><span class:full={m.used >= m.limit} style="width: {pct(m.used, m.limit)}%"></span></span>
          {/if}
          {#if m.hint}<span class="meter-hint">{m.hint}</span>{/if}
        </div>
      {/each}
      {#if data.ai}
        <div class="meter">
          <span class="meter-label">{t.accountPages.usageAi}</span>
          <span class="meter-value">{num(data.ai.balanceMc / 1000, 2)}</span>
          <span class="meter-bar" aria-hidden="true"><span style="width: {pct(data.ai.balanceMc / 1000, data.ai.allowance)}%"></span></span>
          <span class="meter-hint">
            {t.accountPages.usageAiHint(num(data.ai.allowance))}
            {#if data.canManageSettings}· <a href="/app/manage/settings/ai">{t.accountPages.usageAiLink}</a>{/if}
          </span>
        </div>
      {/if}
    </div>
  </section>

  <!-- Plans -->
  <section class="section" use:reveal>
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
              <span class="price">{planPrice(plan)}</span>
              <span class="cadence">{t.accountPages.perMonth}</span>
            {/if}
          </div>

          <div class="plan-cta">
            {#if isCurrent}
              <span class="cta-current">{t.accountPages.yourCurrentPlan}</span>
            {:else if planId === 'enterprise'}
              <a href="mailto:sales@hallify.sk" class="btn-ghost-cta">{t.accountPages.contactSales}</a>
            {:else if planId === 'free' || !data.canManage}
              <span class="cta-spacer"></span>
            {:else}
              <button type="button" class={isPopular ? 'btn-accent-cta' : 'btn-ghost-cta'}
                onclick={() => (confirmPlan = planId)}>
                {currentPlan === 'free' ? t.accountPages.upgradeTo : t.accountPages.switchTo} {plan.name}
              </button>
            {/if}
          </div>

          <ul class="features">
            {#each planFeatureList(plan, t.accountPages.planFeatures) as feature}
              <li>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
                {feature}
              </li>
            {/each}
          </ul>
        </div>
      {/each}
    </div>
  </section>
  <!-- Add-ons. Work we do for an organisation, as opposed to the plans above,
       which are what the software costs. -->
  <section class="section" use:reveal>
    <div class="section-head">
      <h2>{t.setupService.addonsTitle}</h2>
      <p>{t.setupService.addonsLead}</p>
    </div>

    <h3 class="addon-name">{t.setupService.title}</h3>
    <p class="addon-lead">{t.setupService.lead}</p>
    {#if form?.setupCancelled}
      <div class="alert-success">{t.setupService.cancelledNotice}</div>
    {/if}
    <!-- Asking for (or withdrawing) the service is settings.manage; without it the
         buttons would only end on a 403 page. -->
    {#if data.canManageSettings || data.setupRequest}
      <SetupServiceCard priceCents={data.setupPriceCents} pending={data.setupRequest} canAct={data.canManageSettings} />
    {/if}

    <h3 class="addon-name addon-name--spaced">{t.floorplanService.addonTitle}</h3>
    <p class="addon-lead">{t.floorplanService.addonLead}</p>
    <div class="card--inset addon-row">
      <span class="addon-price">{t.floorplanService.addonPrice}</span>
      {#if data.totalVenues === 0}
        <a class="addon-note" href="/app/manage/halls">{t.floorplanService.addonNoVenues}</a>
      {:else if data.unmappedVenues > 0}
        <a class="btn-outline btn-sm" href="/app/manage/halls">{t.floorplanService.addonCta}</a>
      {:else}
        <span class="addon-note">{t.floorplanService.addonAllMapped}</span>
      {/if}
    </div>
  </section>

  {#if data.isPlatformAdmin && data.canManage}
    <!-- A live €1 payment that proves Checkout, the webhook and plan activation end to
         end. Platform admins only; never shown to customers. -->
    <section class="section" use:reveal>
      <div class="section-head">
        <h2>{t.billingTest.title}</h2>
        <p>{t.billingTest.lead}</p>
      </div>
      <div class="card--inset addon-row">
        <span class="addon-price">{t.billingTest.price}</span>
        {#if currentPlan === 'free'}
          <form method="POST" action="?/testPayment" use:enhance={viaStripe('test')}>
            <button type="submit" class="btn-outline btn-sm" disabled={!!busy}>{busy === 'test' ? t.billingTest.opening : t.billingTest.cta}</button>
          </form>
        {:else}
          <span class="addon-note">{t.billingTest.onlyFromFree}</span>
        {/if}
      </div>
    </section>
  {/if}
</div>

<!-- Plan-change confirm dialog -->
{#if confirmPlan && target}
  <div class="modal-backdrop" role="presentation" onclick={closeDialog}>
    <div class="card card--raised modal" role="dialog" aria-modal="true" aria-labelledby="plan-dialog-title"
      onclick={(e) => e.stopPropagation()}
      use:dialog={{ onclose: closeDialog }}>
      <h2 class="modal-title" id="plan-dialog-title">
        {isFirstSub ? t.accountPages.subscribeTo : targetIsUpgrade ? t.accountPages.upgradeTo : t.accountPages.switchTo} {target.name}
      </h2>

      {#if form?.error}
        <div class="alert-error" role="alert">{form.error}</div>
      {/if}

      {#if isFirstSub}
        <p class="modal-body">
          {t.accountPages.checkoutIntroPre}
          <b>{target.name}</b> {t.accountPages.planAtPrice} {planPrice(target)}{t.accountPages.perMonthSuffix}.
        </p>
      {:else if targetIsUpgrade}
        <div class="charge-line">
          <span>{t.accountPages.chargedNow}</span>
          <b>{preview ? (preview.exact ? '' : '≈ ') + money(preview.amountDue) : '—'}</b>
        </div>
        <p class="modal-body">
          {t.accountPages.proratedExplain}
          {t.accountPages.thenWord} <b>{target.name}</b> {t.accountPages.renewsAt} {planPrice(target)}{t.accountPages.perMonthSuffix}{periodEndStr ? ` ${t.accountPages.fromDate} ${periodEndStr}` : ''}.
        </p>
        {#if preview && !preview.exact}
          <p class="modal-note">{t.accountPages.approximateNote}</p>
        {/if}
      {:else}
        <div class="charge-line"><span>{t.accountPages.chargedNow}</span><b>{money(0)}</b></div>
        <p class="modal-body">
          {t.accountPages.youKeep} <b>{data.plans[currentPlan].name}</b> {t.accountPages.untilWord} {periodEndStr ?? t.accountPages.endOfThisPeriod},
          {t.accountPages.thenMoveTo} <b>{target.name}</b>. {t.accountPages.noChargeToday}
        </p>
      {/if}

      <div class="modal-actions">
        <button type="button" class="btn-outline" disabled={busy !== null} onclick={closeDialog}>{t.common.cancel}</button>
        <form method="POST" action="?/upgrade" use:enhance={viaStripe('upgrade')}>
          <input type="hidden" name="plan" value={confirmPlan} />
          <button type="submit" class="btn-accent-sm" disabled={busy !== null}>
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
  .page { padding: 32px 0 0; }

  .page-header { margin-bottom: 26px; }
  .page-header-left { display: flex; align-items: center; gap: 12px; }
  .page-title { font-size: var(--display-size); font-weight: 550; color: var(--text-base); letter-spacing: -.055em; line-height: 1.08; margin: 0; }
  .org-chip {
    font-size: 12px; font-weight: 600; color: var(--text-muted);
    background: var(--bg-panel2); border: 1px solid var(--border);
    border-radius: 3px; padding: 3px 11px;
  }

  /* Current subscription */
  .current-left { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
  .current-left .eyebrow { display: block; margin-bottom: 7px; }
  .current-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  /* The plan name is the value of the eyebrow label, not a heading: as an h2 it
     would render at --h2-size and shadow the page h1. */
  .current-name { font-size: 22px; font-weight: 550; letter-spacing: -.045em; line-height: 1.14; color: var(--text-base); }
  .current-renew { font-size: 12px; color: var(--text-muted); }
  .pending-change {
    display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap;
    margin-top: 4px; font-size: 12px; color: var(--warning);
    background: var(--warning-dim);
    border-radius: var(--radius-sm); padding: 6px 11px;
  }
  .pending-form { margin: 0; }
  .pending-undo {
    font-size: 11px; font-weight: 650; color: var(--accent-ink);
    background: none; border: none; cursor: pointer; font-family: inherit;
    text-decoration: underline; padding: 0;
  }
  .status-pill { font-size: 10px; font-weight: 650; text-transform: uppercase; letter-spacing: .08em; padding: 3px 10px; border-radius: 3px; }
  .status-active   { color: var(--success); background: var(--success-dim); }
  .status-trialing { color: var(--accent-ink); background: var(--accent-dim); }
  .status-past_due, .status-unpaid { color: var(--danger); background: var(--danger-dim); }
  .status-paused { color: var(--warning); background: var(--warning-dim); }
  .owner-only { font-size: 12px; color: var(--text-subtle); margin-top: 4px; max-width: 520px; line-height: 1.6; }

  /* Payment problems and suspended halls: a message with its one action beside it. */
  .pay-alert { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; }
  .pay-alert form { margin: 0; }
  .pay-alert .btn-outline { background: var(--bg-base); }

  /* Usage meters */
  .usage-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px; }
  .meter { display: flex; flex-direction: column; gap: 6px; padding: 13px 15px; border: 1px solid var(--border); border-radius: var(--radius-sm); min-width: 0; }
  .meter-label { font-size: 10px; font-weight: 650; text-transform: uppercase; letter-spacing: .09em; color: var(--text-muted); }
  .meter-value { font-size: 17px; font-weight: 600; letter-spacing: -.03em; font-variant-numeric: tabular-nums; color: var(--text-base); }
  .meter-unl { font-size: 12px; font-weight: 500; letter-spacing: 0; color: var(--text-subtle); }
  .meter-bar { display: block; height: 4px; border-radius: 2px; background: var(--bg-panel2); overflow: hidden; }
  .meter-bar > span { display: block; height: 100%; background: var(--accent); border-radius: 2px; }
  .meter-bar > span.full { background: var(--warning); }
  .meter-hint { font-size: 11px; color: var(--text-subtle); line-height: 1.5; }
  .meter-hint a { color: var(--accent-ink); }
  .status-cancelled { color: var(--text-muted); background: var(--bg-panel2); }

  /* Plans — the landing page's .plan treatment: a rule above each column,
     a large light price, a muted feature list, no box. */
  .plans-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--grid-gap); align-items: stretch; }

  .plan-card {
    position: relative;
    display: flex; flex-direction: column;
    padding: 26px 0 0;
    border-top: 1px solid var(--border);
    transition: border-color .2s;
  }
  .plan-card.popular { border-top-color: var(--accent); }
  .plan-card.current { border-top-color: color-mix(in srgb, var(--accent) 55%, var(--border)); }

  .ribbon {
    position: absolute; top: -9px; left: 0;
    background: var(--accent); color: var(--accent-contrast); font-size: 10px; font-weight: 650;
    text-transform: uppercase; letter-spacing: .13em; padding: 4px 11px; border-radius: 3px;
    white-space: nowrap;
  }

  .plan-head { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
  .plan-name { font-size: 17px; font-weight: 550; letter-spacing: -.03em; color: var(--text-base); }
  .current-tag {
    font-size: 9.5px; font-weight: 650; text-transform: uppercase; letter-spacing: .1em;
    color: var(--accent-ink); background: var(--accent-dim);
    border-radius: 3px; padding: 2px 8px;
  }

  .plan-price { display: flex; align-items: baseline; gap: 6px; margin-bottom: 24px; }
  .price { font-size: 30px; font-weight: 450; letter-spacing: -.05em; line-height: 1.4; color: var(--text-base); }
  .cadence { font-size: 10px; color: var(--text-muted); }

  .plan-cta { margin-bottom: 22px; min-height: 38px; }
  .btn-accent-cta, .btn-ghost-cta {
    display: block; width: 100%; text-align: center; box-sizing: border-box;
    padding: 11px 14px; border-radius: var(--radius-sm); font-size: 12px; font-weight: 650;
    cursor: pointer; font-family: inherit; text-decoration: none; transition: transform .2s, background .15s, border-color .15s, color .15s;
  }
  .btn-accent-cta { background: var(--accent); color: var(--accent-contrast); border: 1px solid var(--accent); }
  .btn-accent-cta:hover { background: var(--accent-hover); border-color: var(--accent-hover); transform: translateY(-2px); }
  .btn-accent-cta:active { transform: translateY(0); }
  .btn-ghost-cta { background: transparent; color: var(--text-base); border: 1px solid var(--border); }
  .btn-ghost-cta:hover { border-color: var(--accent); color: var(--accent-ink); background: var(--bg-hover); }
  .cta-current { display: block; text-align: center; padding: 11px 14px; font-size: 12px; font-weight: 600; color: var(--text-subtle); }
  .cta-spacer { display: block; height: 38px; }

  .features { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
  .features li { display: flex; align-items: flex-start; gap: 9px; font-size: 11px; color: var(--text-muted); line-height: 2; }
  .features svg { color: var(--accent-ink); flex-shrink: 0; margin-top: 6px; }

  .current-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
  .current-actions form { margin: 0; }

  .btn-outline {
    padding: 10px 18px; border-radius: var(--radius-sm); font-size: 13px; font-weight: 600;
    background: transparent; color: var(--text-base); border: 1px solid var(--border);
    cursor: pointer; font-family: inherit; white-space: nowrap; transition: border-color .15s, color .15s, background .15s;
  }
  .btn-outline:hover { border-color: var(--text-subtle); background: var(--bg-hover); }
  .btn-outline:disabled, .btn-accent-sm:disabled, .pending-undo:disabled { opacity: .6; cursor: progress; transform: none; }
  .btn-sm { padding: 7px 13px; font-size: 12px; }
  .danger-outline:hover { border-color: var(--danger); color: var(--danger); background: var(--danger-dim); }

  .btn-accent-sm {
    padding: 10px 18px; border-radius: var(--radius-sm); font-size: 13px; font-weight: 650;
    background: var(--accent); color: var(--accent-contrast); border: 1px solid var(--accent);
    cursor: pointer; font-family: inherit; white-space: nowrap; transition: transform .2s, background .15s, border-color .15s;
  }
  .btn-accent-sm:hover { background: var(--accent-hover); border-color: var(--accent-hover); transform: translateY(-2px); }
  .btn-accent-sm:active { transform: translateY(0); }

  .alert-success { padding: 10px 14px; border-radius: var(--radius-sm); font-size: 13px; font-weight: 500; margin-bottom: 16px; color: var(--success); background: var(--success-dim); }
  .alert-warning { padding: 10px 14px; border-radius: var(--radius-sm); font-size: 13px; font-weight: 500; margin-bottom: 16px; color: var(--warning); background: var(--warning-dim); }
  .alert-error { padding: 10px 14px; border-radius: var(--radius-sm); font-size: 13px; font-weight: 500; margin-bottom: 16px; color: var(--danger); background: var(--danger-dim); }

  /* Plan-change dialog — genuinely floating, so it opts back into .card--raised. */
  .modal-backdrop {
    position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center;
    background: rgba(16, 24, 16, .55); padding: 20px; backdrop-filter: blur(5px);
  }
  .modal { width: 100%; max-width: 420px; padding: 28px; }
  .modal-title { font-size: 20px; font-weight: 550; letter-spacing: -.045em; line-height: 1.14; color: var(--text-base); margin: 0 0 16px; }
  .charge-line {
    display: flex; align-items: baseline; justify-content: space-between; gap: 12px;
    padding: 13px 15px; border-radius: var(--radius-sm); background: var(--bg-hover); margin-bottom: 12px;
  }
  .charge-line span { font-size: 13px; font-weight: 600; color: var(--text-muted); }
  .charge-line b { font-size: 22px; font-weight: 550; color: var(--text-base); letter-spacing: -.045em; }
  .modal-body { font-size: 13px; line-height: 1.75; color: var(--text-muted); margin: 0 0 6px; }
  .modal-note { font-size: 11.5px; color: var(--text-subtle); margin: 0; }
  .modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
  .modal-actions form { margin: 0; }

  @media (max-width: 980px) {
    .plans-grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 560px) {
    .plans-grid { grid-template-columns: 1fr; }
  }

  @media (prefers-reduced-motion: reduce) {
    .btn-accent-cta:hover, .btn-accent-sm:hover { transform: none; }
  }
  /* ── Add-ons ───────────────────────────────── */
  .addon-name { font-size: 15px; font-weight: 650; letter-spacing: -.03em; margin: 0 0 4px; }
  .addon-name--spaced { margin-top: 34px; }
  .addon-lead { font-size: var(--meta-size); color: var(--text-muted); margin: 0 0 14px; line-height: 1.6; }
  .addon-row { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 15px 18px; }
  .addon-price { font-size: 13px; font-weight: 600; }
  .addon-note { font-size: var(--meta-size); color: var(--text-subtle); }
  a.addon-note { color: var(--accent-ink); text-align: right; }
</style>
