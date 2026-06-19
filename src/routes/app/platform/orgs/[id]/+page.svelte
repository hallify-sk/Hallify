<script lang="ts">
  import { enhance } from '$app/forms';
  import { t } from '$lib/i18n.svelte';
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

<div class="page-wrap">
  <a href="/app/platform/orgs" class="back">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
    {t.platformOrgs.allOrganizations}
  </a>

  <div class="head">
    <div class="head-left">
      <h1>{data.org.name}</h1>
      <span class="slug">{data.org.slug}</span>
      {#if data.org.suspended_at}<span class="badge badge-suspended">{t.platformOrgs.suspended}</span>{:else}<span class="badge badge-active">{t.platformOrgs.active}</span>{/if}
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

  <div class="grid">
    <!-- Subscription / plan override -->
    <section class="card">
      <h2>{t.platformOrgs.subscription}</h2>
      <div class="kv">
        <span>{t.platformOrgs.currentPlan}</span>
        <b><span class="badge badge-{currentPlan}">{currentPlan}</span></b>
      </div>
      <div class="kv"><span>{t.platformOrgs.statusLabel}</span><b>{data.sub?.status ?? 'free'}</b></div>
      {#if data.sub?.current_period_end}
        <div class="kv"><span>{t.platformOrgs.renewsEnds}</span><b>{fmtDate(data.sub.current_period_end)}</b></div>
      {/if}

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
    <section class="card">
      <h2>{t.platformOrgs.organization}</h2>
      <div class="kv"><span>{t.platformOrgs.members}</span><b>{data.org.member_count}</b></div>
      <div class="kv"><span>{t.platformOrgs.reservations}</span><b>{data.org.reservation_count}</b></div>
      <div class="kv"><span>{t.platformOrgs.created}</span><b>{fmtDate(data.org.created_at)}</b></div>
      <div class="kv"><span>{t.platformOrgs.stripeCustomer}</span><b class="mono">{data.sub?.stripe_customer_id ?? '—'}</b></div>

      <form method="POST" action="?/setSlug" use:enhance class="plan-form">
        <label for="slug">{t.platformOrgs.subdomain}</label>
        <div class="plan-row">
          <input id="slug" name="slug" value={data.org.slug} spellcheck="false" autocomplete="off" />
          <button type="submit" class="btn-action">{t.platformOrgs.save}</button>
        </div>
        <span class="sub-suffix">&lt;slug&gt;.hallify.sk</span>
        {#if form?.slugError}<span class="field-err">{form.slugError}</span>{/if}
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
  </div>

  <!-- Invoices -->
  <section class="card">
    <h2>{t.platformOrgs.invoices} <span class="muted">{t.platformOrgs.towardsUs}</span></h2>
    {#if !data.sub?.stripe_customer_id}
      <p class="empty">{t.platformOrgs.noStripeCustomer}</p>
    {:else if data.invoices.length === 0}
      <p class="empty">{t.platformOrgs.noInvoices}</p>
    {:else}
      <table class="table">
        <thead>
          <tr><th>{t.platformOrgs.colInvoice}</th><th>{t.platformOrgs.colDate}</th><th>{t.platformOrgs.colStatus}</th><th class="r">{t.platformOrgs.colAmount}</th><th></th></tr>
        </thead>
        <tbody>
          {#each data.invoices as inv}
            <tr>
              <td class="mono">{inv.number ?? inv.id}</td>
              <td>{fmtDate(inv.created)}</td>
              <td><span class="ist ist-{inv.status}">{inv.status ?? '—'}</span></td>
              <td class="r">{money(inv.amount_paid || inv.amount_due, inv.currency)}</td>
              <td class="r">
                {#if inv.hosted_invoice_url}<a href={inv.hosted_invoice_url} target="_blank" rel="noopener" class="link">{t.platformOrgs.view}</a>{/if}
                {#if inv.invoice_pdf}<a href={inv.invoice_pdf} target="_blank" rel="noopener" class="link">{t.platformOrgs.pdf}</a>{/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </section>
</div>

<style>
  .page-wrap { padding: 2rem; max-width: 1000px; }
  .back { display: inline-flex; align-items: center; gap: 5px; font-size: 13px; font-weight: 600; color: var(--text-muted); text-decoration: none; margin-bottom: 14px; }
  .back:hover { color: var(--accent); }

  .head { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
  .head-left { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  h1 { font-size: 1.5rem; margin: 0; }
  .slug { font-size: 13px; color: var(--text-muted); }

  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
  @media (max-width: 760px) { .grid { grid-template-columns: 1fr; } }

  .card { background: var(--bg-panel); border: 1px solid var(--border); border-radius: 14px; padding: 18px 20px; }
  .card h2 { font-size: 14px; font-weight: 700; margin: 0 0 12px; }
  .muted { color: var(--text-muted); font-weight: 400; }

  .kv { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 6px 0; font-size: 13px; border-bottom: 1px solid var(--border-subtle, var(--border)); }
  .kv:last-of-type { border-bottom: none; }
  .kv span { color: var(--text-muted); }
  .mono { font-family: ui-monospace, monospace; font-size: 12px; }

  .plan-form { margin-top: 14px; }
  .plan-form label { display: block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--text-subtle); margin-bottom: 6px; }
  .plan-row { display: flex; gap: 8px; }
  .plan-row select, .plan-row input { flex: 1; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-panel); color: var(--text-base); font-size: 13px; font-family: inherit; }
  .sub-suffix { display: block; font-size: 11px; color: var(--text-subtle); margin-top: 5px; }
  .field-err { display: block; font-size: 11.5px; color: #dc2626; margin-top: 5px; }

  .warn { font-size: 11.5px; line-height: 1.5; color: var(--warning, #b45309); background: color-mix(in srgb, var(--warning, #f59e0b) 10%, transparent); border: 1px solid color-mix(in srgb, var(--warning, #f59e0b) 26%, transparent); border-radius: 8px; padding: 8px 10px; margin: 12px 0 0; }
  .hint { font-size: 11.5px; color: var(--text-subtle); margin: 12px 0 0; }

  .danger-row { margin-top: 16px; }

  .table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .table th { text-align: left; padding: .5rem .75rem; font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: .04em; border-bottom: 1px solid var(--border); }
  .table td { padding: .6rem .75rem; border-bottom: 1px solid var(--border); }
  .table tr:last-child td { border-bottom: none; }
  .r { text-align: right; }
  .link { color: var(--accent); font-weight: 600; text-decoration: none; margin-left: 10px; }
  .link:hover { text-decoration: underline; }
  .empty { font-size: 13px; color: var(--text-subtle); padding: 8px 0; }

  .badge { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: .7rem; font-weight: 700; text-transform: uppercase; }
  .badge-free { background: var(--bg-panel2); color: var(--text-muted); }
  .badge-starter { background: var(--accent-dim); color: var(--accent); }
  .badge-professional { background: #fef3c7; color: #92400e; }
  .badge-enterprise { background: var(--accent-action-dim); color: var(--accent-action); }
  .badge-active { background: #dcfce7; color: #166534; }
  .badge-suspended { background: #fee2e2; color: #991b1b; }

  .ist { font-size: 11px; font-weight: 700; text-transform: uppercase; }
  .ist-paid { color: #166534; }
  .ist-open { color: #b45309; }
  .ist-void, .ist-uncollectible { color: #991b1b; }
  .ist-draft { color: var(--text-muted); }

  .btn-action { padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 700; background: var(--accent); color: #fff; border: 1px solid var(--accent); cursor: pointer; font-family: inherit; }
  .btn-action:disabled { opacity: .5; cursor: default; }
  .btn-outline { padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; background: var(--bg-panel); color: var(--text-base); border: 1px solid var(--border); cursor: pointer; font-family: inherit; }
  .btn-outline:hover { border-color: var(--accent); color: var(--accent); }
  .btn-danger { padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; background: color-mix(in srgb, #ef4444 8%, transparent); color: #dc2626; border: 1px solid color-mix(in srgb, #ef4444 30%, transparent); cursor: pointer; font-family: inherit; }
  .btn-danger:hover { background: color-mix(in srgb, #ef4444 16%, transparent); }
  .btn-viewas { display: inline-flex; align-items: center; gap: 5px; padding: 7px 13px; border-radius: 8px; font-size: 13px; font-weight: 600; background: var(--accent); color: #fff; border: none; cursor: pointer; font-family: inherit; }
  .btn-viewas:hover { background: var(--accent-hover); }

  .alert-success { padding: 10px 14px; border-radius: 9px; font-size: 13px; margin-bottom: 16px; color: var(--success, #16a34a); background: color-mix(in srgb, var(--success, #22c55e) 12%, transparent); border: 1px solid color-mix(in srgb, var(--success, #22c55e) 26%, transparent); }
</style>
