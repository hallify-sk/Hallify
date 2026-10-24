<script lang="ts">
  import { pageTitle } from '$lib/page-title';
  import { enhance } from '$app/forms';
  import { t, getLocale } from '$lib/i18n.svelte';
  import { confirmFirst } from '$lib/forms';
  import { formatDate, formatDateTime, formatMoney, localeTag } from '$lib/format';
  import { planName } from '$lib/plans';
  import { PLAN_ORDER, planTone } from '$lib/platform-ui';
  import type { PageData, ActionData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const currentPlan = $derived(data.sub?.plan ?? 'free');
  let selectedPlan = $state(data.sub?.plan ?? 'free');
  $effect(() => { selectedPlan = data.sub?.plan ?? 'free'; });

  /** Stripe sends invoice dates as Unix seconds. */
  const stripeDate = (secs: number) => formatDate(new Date(secs * 1000), getLocale());
  const credits = (n: number) => n.toLocaleString(localeTag(getLocale()), { maximumFractionDigits: 2 });
  const INVOICE_TONE: Record<string, 'success' | 'warning' | 'danger' | undefined> = {
    paid: 'success', open: 'warning', void: 'danger', uncollectible: 'danger',
  };
  const keep = () => async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => { await update({ reset: false }); };
</script>

<svelte:head><title>{pageTitle(data.org.name, t.platformOrgs.platformAdmin)}</title></svelte:head>

<div class="wrap page">
  <a href="/app/platform/orgs" class="back">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
    {t.platformOrgs.allOrganizations}
  </a>

  <header class="page-header">
    <div class="cell-main">
      <p class="eyebrow">{t.platformOrgs.platformAdmin}</p>
      <div class="page-header-left">
        <h1 class="page-title">{data.org.name}</h1>
        {#if data.org.suspended_at}
          <span class="pf-tag" data-tone="danger">{t.platformOrgs.suspended}</span>
        {:else}
          <span class="pf-tag" data-tone="success">{t.platformOrgs.active}</span>
        {/if}
        <span class="pf-tag" data-tone={planTone(currentPlan)}>{planName(currentPlan)}</span>
      </div>
      <p class="page-lead mono">{data.org.slug}.hallify.sk</p>
    </div>
    {#if !data.org.suspended_at}
      <form method="POST" action="/app/org/switch" class="page-actions">
        <input type="hidden" name="org_id" value={data.org.id} />
        <input type="hidden" name="return_to" value="/app/manage" />
        <button type="submit" class="btn-action btn-sm view-as" title={t.platformOrgs.viewAsTooltip}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          {t.platformOrgs.viewAs}
        </button>
      </form>
    {/if}
  </header>

  {#if form?.planChanged}
    <div class="alert-success" role="status">{t.platformOrgs.planSetTo} <b>{planName(form.planChanged)}</b>.</div>
  {/if}
  {#if form?.slugChanged}
    <div class="alert-success" role="status">{t.platformOrgs.subdomainChangedTo} <b>{form.slugChanged}</b>.</div>
  {/if}
  {#if form?.error}<div class="alert-error" role="alert">{form.error}</div>{/if}

  <!-- Subscription / plan override -->
  <section class="section section--lead">
    <div class="section-head"><h2>{t.platformOrgs.subscription}</h2></div>

    <div class="row-list">
      <div class="row-item kv"><span class="k">{t.platformOrgs.currentPlan}</span><span class="v"><span class="pf-tag" data-tone={planTone(currentPlan)}>{planName(currentPlan)}</span></span></div>
      <div class="row-item kv"><span class="k">{t.platformOrgs.statusLabel}</span><span class="v">{data.sub?.status ? ((t.accountPages.statusLabels as Record<string, string>)[data.sub.status] ?? data.sub.status) : '—'}</span></div>
      {#if data.sub?.current_period_end}
        <div class="row-item kv"><span class="k">{t.platformOrgs.renewsEnds}</span><span class="v">{formatDate(data.sub.current_period_end, getLocale())}</span></div>
      {/if}
      <div class="row-item kv"><span class="k">{t.platformOrgs.stripeCustomer}</span><span class="v mono">{data.sub?.stripe_customer_id ?? '—'}</span></div>
    </div>

    <form method="POST" action="?/setPlan" class="sub-form"
      use:enhance={confirmFirst(() => t.platformOrgs.confirmPlanChange(planName(selectedPlan)), keep())}>
      <label class="form-label" for="plan">{t.platformOrgs.overridePlan}</label>
      <div class="control-row">
        <select id="plan" name="plan" bind:value={selectedPlan}>
          {#each PLAN_ORDER as pid}
            <option value={pid}>{data.plans[pid].name}</option>
          {/each}
        </select>
        <button type="submit" class="btn-action btn-sm" disabled={selectedPlan === currentPlan}>{t.platformOrgs.apply}</button>
      </div>
      {#if data.sub?.stripe_subscription_id}
        <p class="alert-warning form-note">{t.platformOrgs.stripeOverrideWarn}</p>
      {:else}
        <p class="hint">{t.platformOrgs.noStripeHint}</p>
      {/if}
    </form>
  </section>

  <!-- Org facts and settings -->
  <section class="section">
    <div class="section-head"><h2>{t.platformOrgs.organization}</h2></div>

    <div class="row-list">
      <div class="row-item kv"><span class="k">{t.platformOrgs.members}</span><span class="v num">{data.org.member_count}</span></div>
      <div class="row-item kv"><span class="k">{t.platformOrgs.reservations}</span><span class="v num">{data.org.reservation_count}</span></div>
      <div class="row-item kv"><span class="k">{t.platformOrgs.created}</span><span class="v">{formatDate(data.org.created_at, getLocale())}</span></div>
    </div>

    <!-- Changing the subdomain breaks every link to the old one at once (there is no
         redirect), so it asks first and says so. -->
    <form method="POST" action="?/setSlug" class="sub-form"
      use:enhance={confirmFirst(() => t.platformOrgs.confirmSlugChange(data.org.slug), keep())}>
      <label class="form-label" for="slug">{t.platformOrgs.subdomain}</label>
      <div class="control-row">
        <input id="slug" name="slug" type="text" value={data.org.slug} spellcheck="false" autocomplete="off" maxlength="63" pattern="[a-z0-9]([a-z0-9-]*[a-z0-9])?" />
        <button type="submit" class="btn-action btn-sm">{t.platformOrgs.save}</button>
      </div>
      <span class="hint mono">&lt;slug&gt;.hallify.sk</span>
      {#if form?.slugError}<span class="field-err" role="alert">{form.slugError}</span>{/if}
    </form>

    <form method="POST" action="?/setPartner" use:enhance={keep} class="sub-form">
      <span class="form-label">{t.platformOrgs.partnerLabel}</span>
      <div class="partner-row">
        <label class="ui-switch">
          <input id="partner" name="partner" type="checkbox" checked={!!data.org.is_hallify_partner} />
          <span class="ui-switch-track" aria-hidden="true"></span>
        </label>
        <label class="partner-copy" for="partner">{t.platformOrgs.partnerHint}</label>
        <button type="submit" class="btn-outline btn-sm">{t.platformOrgs.save}</button>
      </div>
      {#if form?.partnerSaved}<p class="hint" role="status">{t.platformOrgs.partnerSaved}</p>{/if}
    </form>

    <div class="danger-row">
      {#if data.org.suspended_at}
        <form method="POST" action="?/unsuspend" use:enhance>
          <button type="submit" class="btn-outline btn-sm">{t.platformOrgs.unsuspendOrganization}</button>
        </form>
        <span class="hint">{t.platformOrgs.suspended} · {formatDateTime(data.org.suspended_at, getLocale())}</span>
      {:else}
        <form method="POST" action="?/suspend" use:enhance={confirmFirst(() => t.platformOrgs.confirmSuspend)}>
          <button type="submit" class="btn-danger btn-sm">{t.platformOrgs.suspendOrganization}</button>
        </form>
      {/if}
    </div>
  </section>

  <!-- AI credits: grants and corrections without editing the database. -->
  <section class="section">
    <div class="section-head">
      <h2>{t.platformOrgs.creditsTitle}</h2>
      <p>{t.platformOrgs.creditsLead}</p>
    </div>
    <div class="row-list">
      <div class="row-item kv"><span class="k">{t.platformOrgs.creditsBalance}</span><span class="v num">{data.aiBalance == null ? '—' : credits(data.aiBalance)}</span></div>
    </div>
    <form method="POST" action="?/adjustCredits" class="sub-form"
      use:enhance={confirmFirst(() => t.platformOrgs.confirmCredits, async ({ update }) => { await update(); })}>
      <label class="form-label" for="credits">{t.platformOrgs.creditsAmount}</label>
      <div class="control-row">
        <input id="credits" name="credits" type="number" step="1" min="-100000" max="100000" required placeholder="100" class="credits-input" />
        <input name="reason" type="text" maxlength="160" required placeholder={t.platformOrgs.creditsReason} aria-label={t.platformOrgs.creditsReason} class="reason-input" />
        <button type="submit" class="btn-action btn-sm">{t.platformOrgs.apply}</button>
      </div>
      <span class="hint">{t.platformOrgs.creditsHint}</span>
      {#if form?.creditsError}<span class="field-err" role="alert">{form.creditsError}</span>{/if}
      {#if form && 'creditsApplied' in form && form.creditsApplied != null}<p class="alert-success form-note" role="status">{t.platformOrgs.creditsDone(form.creditsApplied)}</p>{/if}
    </form>
  </section>

  <!-- What platform admins did to this organisation. -->
  <section class="section">
    <div class="section-head section-head--row">
      <h2>{t.platformOrgs.auditTitle}</h2>
      <a class="lf-clear" href="/app/platform/audit">{t.platformExtra.auditLink}</a>
    </div>
    {#if data.audit.length === 0}
      <p class="hint">{t.platformOrgs.auditEmpty}</p>
    {:else}
      <div class="row-list">
        {#each data.audit as row (row.id)}
          <div class="row-item audit-row">
            <span class="muted nowrap">{formatDateTime(row.created_at, getLocale())}</span>
            <span class="cell-main">
              <span>{t.platformExtra.auditActions[row.action] ?? row.action}</span>
              {#if row.details}<span class="cell-sub mono" title={row.details}>{row.details}</span>{/if}
            </span>
            <span class="muted ellipsis" title={row.actor_email ?? ''}>{row.actor_email ?? '—'}</span>
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <!-- Invoices -->
  <section class="section">
    <div class="section-head">
      <h2>{t.platformOrgs.invoices} <span class="muted">{t.platformOrgs.towardsUs}</span></h2>
    </div>

    {#if !data.sub?.stripe_customer_id || data.invoices.length === 0}
      <div class="card--inset state-block">
        <span class="icon-tile" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        </span>
        <h3>{!data.sub?.stripe_customer_id ? t.platformOrgs.noStripeCustomer : t.platformOrgs.noInvoices}</h3>
      </div>
    {:else}
      <div class="table-scroll">
        <div class="row-list inv-table" role="table" aria-label={t.platformOrgs.invoices}>
          <div role="row" class="row-item row-head inv-row">
            <span role="columnheader">{t.platformOrgs.colInvoice}</span>
            <span role="columnheader">{t.platformOrgs.colDate}</span>
            <span role="columnheader">{t.platformOrgs.colStatus}</span>
            <span role="columnheader" class="num">{t.platformOrgs.colAmount}</span>
            <span role="columnheader"><span class="sr-only">{t.platformOrgs.view}</span></span>
          </div>
          {#each data.invoices as inv (inv.id)}
            <div role="row" class="row-item inv-row">
              <span role="cell" class="mono ellipsis">{inv.number ?? inv.id}</span>
              <span role="cell" class="nowrap">{stripeDate(inv.created)}</span>
              <span role="cell"><span class="pf-tag" data-tone={INVOICE_TONE[inv.status ?? '']}>{inv.status ? ((t.platformOrgs.invoiceStatus as Record<string, string>)[inv.status] ?? inv.status) : '—'}</span></span>
              <span role="cell" class="num nowrap">{formatMoney(inv.amount_paid || inv.amount_due, getLocale(), (inv.currency || 'eur').toUpperCase())}</span>
              <span role="cell" class="row-actions">
                {#if inv.hosted_invoice_url}<a href={inv.hosted_invoice_url} target="_blank" rel="noopener" class="lf-clear">{t.platformOrgs.view}</a>{/if}
                {#if inv.invoice_pdf}<a href={inv.invoice_pdf} target="_blank" rel="noopener" class="lf-clear">{t.platformOrgs.pdf}</a>{/if}
              </span>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </section>
</div>

<style>
  .view-as { display: inline-flex; align-items: center; gap: 6px; }

  .sub-form { margin-top: 18px; max-width: 640px; }
  .form-label { display: block; font-size: var(--meta-size); font-weight: 600; text-transform: uppercase; letter-spacing: .08em; color: var(--text-muted); margin-bottom: 6px; }
  .control-row > select, .control-row > input { flex: 1 1 200px; width: auto; min-width: 0; }
  .control-row > .credits-input { flex: 0 1 120px; }
  .hint { display: block; font-size: 11.5px; color: var(--text-muted); margin: 6px 0 0; }
  .field-err { display: block; font-size: 11.5px; color: var(--danger); margin-top: 6px; }
  .form-note { margin: 12px 0 0; line-height: 1.6; }

  .partner-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .partner-copy { font-size: 13px; cursor: pointer; margin: 0; flex: 1 1 200px; }

  .danger-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 24px; padding-top: 18px; border-top: 1px solid var(--border-subtle); }
  .danger-row .hint { margin: 0; }

  .audit-row { display: grid; grid-template-columns: 150px minmax(0, 1fr) minmax(0, 220px); gap: 14px; align-items: start; }
  .inv-table { min-width: 600px; }
  .inv-row { display: grid; grid-template-columns: minmax(140px, 1.4fr) 120px 120px 110px 110px; gap: 14px; align-items: center; }

  @media (max-width: 640px) {
    .audit-row { grid-template-columns: minmax(0, 1fr); row-gap: 2px; }
  }
</style>
