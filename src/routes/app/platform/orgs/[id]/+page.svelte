<script lang="ts">
  import { enhance } from '$app/forms';
  import { t, getLocale } from '$lib/i18n.svelte';
  import type { PageData, ActionData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const currentPlan = $derived(data.sub?.plan ?? 'free');
  let selectedPlan = $state(data.sub?.plan ?? 'free');
  $effect(() => { selectedPlan = data.sub?.plan ?? 'free'; });

  const PLAN_IDS = ['free', 'starter', 'professional', 'enterprise'] as const;

  function money(cents: number, currency: string) {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: (currency || 'eur').toUpperCase() }).format(cents / 100);
  }
  function fmtDate(d: string | number) {
    const ms = typeof d === 'number' ? d * 1000 : Date.parse(d);
    return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
</script>

<svelte:head><title>{data.org.name} — {t.platformOrgs.platformAdmin}</title></svelte:head>

<div class="wrap page">
  <a href="/app/platform/orgs" class="back">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
    {t.platformOrgs.allOrganizations}
  </a>

  <section class="section section--lead">
    <div class="section-head section-head--row">
      <div class="head-text">
        <p class="eyebrow">{t.platformOrgs.platformAdmin}</p>
        <h1>{data.org.name}</h1>
        <div class="head-tags">
          <span class="slug">{data.org.slug}</span>
          {#if data.org.suspended_at}<span class="badge badge-suspended">{t.platformOrgs.suspended}</span>{:else}<span class="badge badge-active">{t.platformOrgs.active}</span>{/if}
        </div>
      </div>
      <form method="POST" action="/app/org/switch">
        <input type="hidden" name="org_id" value={data.org.id} />
        <input type="hidden" name="return_to" value="/app/manage" />
        <button type="submit" class="btn-viewas">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          {t.platformOrgs.viewAs}
        </button>
      </form>
    </div>

    {#if form?.planChanged}
      <div class="alert-success">{t.platformOrgs.planSetTo} <b>{form.planChanged}</b>.</div>
    {/if}
    {#if form?.slugChanged}
      <div class="alert-success">{t.platformOrgs.subdomainChangedTo} <b>{form.slugChanged}</b>.</div>
    {/if}
  </section>

  <!-- Subscription / plan override -->
  <section class="section">
    <div class="section-head">
      <p class="eyebrow">{data.org.name}</p>
      <h2>{t.platformOrgs.subscription}</h2>
    </div>

    <div class="row-list">
      <div class="row-item kv">
        <span>{t.platformOrgs.currentPlan}</span>
        <b><span class="badge badge-{currentPlan}">{currentPlan}</span></b>
      </div>
      <div class="row-item kv"><span>{t.platformOrgs.statusLabel}</span><b>{data.sub?.status ?? 'free'}</b></div>
      {#if data.sub?.current_period_end}
        <div class="row-item kv"><span>{t.platformOrgs.renewsEnds}</span><b>{fmtDate(data.sub.current_period_end)}</b></div>
      {/if}
    </div>

    <form method="POST" action="?/setPlan" use:enhance class="plan-form">
      <label for="plan">{t.platformOrgs.overridePlan}</label>
      <div class="plan-row">
        <select id="plan" name="plan" bind:value={selectedPlan}>
          {#each PLAN_IDS as pid}
            <option value={pid}>{data.plans[pid].name}</option>
          {/each}
        </select>
        <button type="submit" class="btn-action" disabled={selectedPlan === currentPlan}>{t.platformOrgs.apply}</button>
      </div>
    </form>
    {#if data.sub?.stripe_subscription_id}
      <p class="warn">
        {t.platformOrgs.stripeOverrideWarn}
      </p>
    {:else}
      <p class="hint">{t.platformOrgs.noStripeHint}</p>
    {/if}
  </section>

  <!-- Org facts -->
  <section class="section">
    <div class="section-head">
      <p class="eyebrow">{data.org.name}</p>
      <h2>{t.platformOrgs.organization}</h2>
    </div>

    <div class="row-list">
      <div class="row-item kv"><span>{t.platformOrgs.members}</span><b>{data.org.member_count}</b></div>
      <div class="row-item kv"><span>{t.platformOrgs.reservations}</span><b>{data.org.reservation_count}</b></div>
      <div class="row-item kv"><span>{t.platformOrgs.created}</span><b>{fmtDate(data.org.created_at)}</b></div>
      <div class="row-item kv"><span>{t.platformOrgs.stripeCustomer}</span><b class="mono">{data.sub?.stripe_customer_id ?? '—'}</b></div>
    </div>

    <form method="POST" action="?/setSlug" use:enhance class="plan-form">
      <label for="slug">{t.platformOrgs.subdomain}</label>
      <div class="plan-row">
        <input id="slug" name="slug" value={data.org.slug} spellcheck="false" autocomplete="off" />
        <button type="submit" class="btn-action">{t.platformOrgs.save}</button>
      </div>
      <span class="sub-suffix">&lt;slug&gt;.hallify.sk</span>
      {#if form?.slugError}<span class="field-err">{form.slugError}</span>{/if}
    </form>

    <form method="POST" action="?/setPartner" use:enhance class="plan-form">
      <label for="partner">Partner Hallify</label>
      <div class="plan-row">
        <label style="display:flex;align-items:center;gap:10px;font-size:12px"><input id="partner" name="partner" type="checkbox" checked={!!data.org.is_hallify_partner} />{getLocale() === 'en' ? 'Eligible for featured venues' : 'Zaradiť medzi partnerov vo výbere priestorov'}</label>
        <button type="submit" class="btn-action">{t.platformOrgs.save}</button>
      </div>
      {#if form?.partnerSaved}<p class="hint">{getLocale() === 'en' ? 'Partner status saved.' : 'Partnerský stav bol uložený.'}</p>{/if}
    </form>

    <div class="danger-row">
      {#if data.org.suspended_at}
        <form method="POST" action="?/unsuspend" use:enhance>
          <button type="submit" class="btn-outline">{t.platformOrgs.unsuspendOrganization}</button>
        </form>
      {:else}
        <form method="POST" action="?/suspend" use:enhance>
          <button type="submit" class="btn-danger"
            onclick={(e) => { if (!confirm(t.platformOrgs.confirmSuspend)) e.preventDefault(); }}>{t.platformOrgs.suspendOrganization}</button>
        </form>
      {/if}
    </div>
  </section>

  <!-- Invoices -->
  <section class="section">
    <div class="section-head">
      <p class="eyebrow">{data.org.name}</p>
      <h2>{t.platformOrgs.invoices} <span class="muted">{t.platformOrgs.towardsUs}</span></h2>
    </div>

    {#if !data.sub?.stripe_customer_id}
      <div class="card--inset empty-state">
        <div class="icon-tile">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        </div>
        <p class="empty">{t.platformOrgs.noStripeCustomer}</p>
      </div>
    {:else if data.invoices.length === 0}
      <div class="card--inset empty-state">
        <div class="icon-tile">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        </div>
        <p class="empty">{t.platformOrgs.noInvoices}</p>
      </div>
    {:else}
      <div class="row-list inv-rows" role="table">
        <div role="row" class="row-item row-head">
          <span role="columnheader">{t.platformOrgs.colInvoice}</span><span role="columnheader">{t.platformOrgs.colDate}</span><span role="columnheader">{t.platformOrgs.colStatus}</span><span role="columnheader" class="r">{t.platformOrgs.colAmount}</span><span role="columnheader" class="r"></span>
        </div>
        {#each data.invoices as inv}
          <div role="row" class="row-item">
            <span role="cell" class="mono">{inv.number ?? inv.id}</span>
            <span role="cell">{fmtDate(inv.created)}</span>
            <span role="cell"><span class="ist ist-{inv.status}">{inv.status ?? '—'}</span></span>
            <span role="cell" class="r">{money(inv.amount_paid || inv.amount_due, inv.currency)}</span>
            <span role="cell" class="r">
              {#if inv.hosted_invoice_url}<a href={inv.hosted_invoice_url} target="_blank" rel="noopener" class="link">{t.platformOrgs.view}</a>{/if}
              {#if inv.invoice_pdf}<a href={inv.invoice_pdf} target="_blank" rel="noopener" class="link">{t.platformOrgs.pdf}</a>{/if}
            </span>
          </div>
        {/each}
      </div>
    {/if}
  </section>
</div>

<style>
  .page { padding-block: 24px; max-width: 1000px; }
  .back { display: inline-flex; align-items: center; gap: 5px; font-size: 13px; font-weight: 600; color: var(--text-muted); text-decoration: none; margin-bottom: 14px; }
  .back:hover { color: var(--accent-ink); }

  h1 { font-size: var(--display-size); font-weight: 550; letter-spacing: -.055em; line-height: 1.08; margin: 0; }
  .head-text .eyebrow { display: block; margin-bottom: 12px; }
  .head-tags { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 8px; }
  .slug { font-size: 13px; color: var(--text-muted); }
  .muted { color: var(--text-muted); font-weight: 400; }

  /* ── Hairline key/value rows ── */
  .kv { justify-content: space-between; font-size: 13px; padding: 7px 0; }
  .kv > span { color: var(--text-muted); }
  .mono { font-family: ui-monospace, monospace; font-size: 12px; }

  .plan-form { margin-top: 14px; }
  .plan-form > label { display: block; font-size: 10px; font-weight: 650; text-transform: uppercase; letter-spacing: .13em; color: var(--text-muted); margin-bottom: 6px; }
  .plan-row { display: flex; gap: 8px; }
  .plan-row select, .plan-row input { flex: 1; padding: 9px 13px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-panel2); color: var(--text-base); font-size: 13px; font-family: inherit; transition: border-color .15s, box-shadow .15s; }
  .plan-row select:focus, .plan-row input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
  .sub-suffix { display: block; font-size: 11px; color: var(--text-subtle); margin-top: 5px; }
  .field-err { display: block; font-size: 11.5px; color: var(--danger); margin-top: 5px; }

  .warn { font-size: 11.5px; line-height: 1.6; color: var(--warning); background: var(--warning-dim); border: 1px solid color-mix(in srgb, var(--warning) 30%, transparent); border-radius: var(--radius-sm); padding: 9px 12px; margin: 12px 0 0; }
  .hint { font-size: 11.5px; color: var(--text-subtle); margin: 12px 0 0; }

  .danger-row { margin-top: 16px; }

  /* ── Invoice rows ── */
  .inv-rows .row-item { display: grid; grid-template-columns: 1.4fr 1fr .8fr .8fr auto; gap: 12px; align-items: center; font-size: 13px; }
  .row-head { font-size: 10px; font-weight: 650; color: var(--text-muted); text-transform: uppercase; letter-spacing: .13em; border-bottom-color: var(--border); padding-bottom: 9px; }
  .r { text-align: right; }
  .link { color: var(--accent-ink); font-weight: 600; text-decoration: none; margin-left: 10px; }
  .link:hover { text-decoration: underline; }

  .empty-state { display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; }
  .empty { font-size: 13px; color: var(--text-subtle); margin: 0; }

  .badge { display: inline-block; padding: 2px 9px; border-radius: 3px; font-size: .7rem; font-weight: 650; text-transform: uppercase; letter-spacing: .03em; }
  .badge-free { background: var(--bg-panel2); color: var(--text-muted); }
  .badge-starter { background: var(--accent-dim); color: var(--accent-ink); }
  .badge-professional { background: var(--warning-dim); color: var(--warning); }
  .badge-enterprise { background: var(--accent-action-dim); color: var(--accent-ink); }
  .badge-active { background: var(--success-dim); color: var(--success); }
  .badge-suspended { background: var(--danger-dim); color: var(--danger); }

  .ist { font-size: 11px; font-weight: 650; text-transform: uppercase; letter-spacing: .03em; }
  .ist-paid { color: var(--success); }
  .ist-open { color: var(--warning); }
  .ist-void, .ist-uncollectible { color: var(--danger); }
  .ist-draft { color: var(--text-muted); }

  .btn-action { padding: 10px 20px; border-radius: var(--radius-sm); font-size: 13px; font-weight: 650; background: var(--accent); color: var(--accent-contrast); border: 1px solid var(--accent); cursor: pointer; font-family: inherit; transition: transform .2s, background .2s; }
  .btn-action:hover { background: var(--accent-hover); border-color: var(--accent-hover); transform: translateY(-2px); }
  .btn-action:active { transform: translateY(0); }
  .btn-action:disabled { opacity: .5; cursor: default; transform: none; }
  .btn-outline { padding: 10px 20px; border-radius: var(--radius-sm); font-size: 13px; font-weight: 600; background: var(--bg-panel); color: var(--text-base); border: 1px solid var(--border); cursor: pointer; font-family: inherit; transition: background .15s, border-color .15s; }
  .btn-outline:hover { background: var(--bg-hover); border-color: var(--text-subtle); }
  .btn-danger { padding: 10px 20px; border-radius: var(--radius-sm); font-size: 13px; font-weight: 600; background: var(--danger-dim); color: var(--danger); border: 1px solid color-mix(in srgb, var(--danger) 20%, transparent); cursor: pointer; font-family: inherit; transition: background .15s; }
  .btn-danger:hover { background: color-mix(in srgb, var(--danger) 15%, transparent); }
  .btn-viewas { display: inline-flex; align-items: center; gap: 5px; padding: 9px 16px; border-radius: var(--radius-sm); font-size: 13px; font-weight: 600; background: var(--accent); color: var(--accent-contrast); border: none; cursor: pointer; font-family: inherit; transition: transform .2s, background .2s; }
  .btn-viewas:hover { background: var(--accent-hover); transform: translateY(-2px); }
  .btn-viewas:active { transform: translateY(0); }

  .alert-success { padding: 10px 14px; border-radius: var(--radius-sm); font-size: 13px; margin-top: 16px; color: var(--success); background: var(--success-dim); border: 1px solid color-mix(in srgb, var(--success) 25%, transparent); }

  @media (max-width: 760px) {
    .inv-rows .row-item { grid-template-columns: 1fr 1fr; row-gap: 6px; }
    .row-head { display: none; }
  }

  @media (prefers-reduced-motion: reduce) {
    .btn-action:hover, .btn-viewas:hover { transform: none; }
  }
</style>
