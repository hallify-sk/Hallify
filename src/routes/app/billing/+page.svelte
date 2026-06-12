<script lang="ts">
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();

  const currentPlan = $derived(data.currentOrg?.subscription.plan ?? 'free');
  const currentStatus = $derived(data.currentOrg?.subscription.status ?? 'active');

  const PLAN_ORDER = ['free', 'starter', 'professional', 'enterprise'] as const;
</script>

<div class="page-wrap">
  <div class="page-header">
    <h1>Billing &amp; Plan</h1>
    <p class="subtitle">{data.currentOrg?.name}</p>
  </div>

  {#if data.success}
    <div class="alert-success">Subscription updated successfully!</div>
  {/if}
  {#if data.cancelled}
    <div class="alert-warning">Checkout was cancelled — no changes were made.</div>
  {/if}

  <!-- Current subscription -->
  <div class="card current-plan">
    <div class="plan-info">
      <span class="plan-name">{data.plans[currentPlan].name}</span>
      <span class="plan-status status-{currentStatus}">{currentStatus}</span>
    </div>
    {#if data.currentOrg?.subscription.currentPeriodEnd}
      <p class="period-end">
        Renews on {new Date(data.currentOrg.subscription.currentPeriodEnd).toLocaleDateString()}
      </p>
    {/if}
    {#if data.currentOrg?.subscription.stripeCustomerId}
      <form method="POST" action="?/manage" style="margin-top:1rem">
        <button type="submit" class="btn-outline btn-sm">Manage billing in Stripe</button>
      </form>
    {/if}
  </div>

  <!-- Plan comparison -->
  <h2>Plans</h2>
  <div class="plans-grid">
    {#each PLAN_ORDER as planId}
      {@const plan = data.plans[planId]}
      <div class="plan-card" class:current={planId === currentPlan}>
        {#if planId === currentPlan}
          <div class="current-badge">Current plan</div>
        {/if}
        <h3 class="plan-title">{plan.name}</h3>
        <div class="plan-price">
          {#if plan.priceMonthly === null}
            <span class="price">Contact us</span>
          {:else if plan.priceMonthly === 0}
            <span class="price">Free</span>
          {:else}
            <span class="price">€{plan.priceMonthly}</span>
            <span class="period">/month</span>
          {/if}
        </div>
        <ul class="plan-features">
          {#each plan.features as feature}
            <li>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              {feature}
            </li>
          {/each}
        </ul>

        {#if planId !== currentPlan}
          {#if planId === 'enterprise'}
            <a href="mailto:sales@hallify.io" class="btn-outline" style="display:block;text-align:center;margin-top:auto">
              Contact sales
            </a>
          {:else if planId !== 'free'}
            <form method="POST" action="?/upgrade" style="margin-top:auto">
              <input type="hidden" name="plan" value={planId} />
              <button type="submit" class="btn-action" style="width:100%">
                {currentPlan === 'free' ? 'Upgrade' : 'Switch'} to {plan.name}
              </button>
            </form>
          {/if}
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .page-wrap { padding: 2rem; max-width: 1000px; }
  .page-header { margin-bottom: 1.5rem; }
  h1 { font-size: 1.4rem; margin: 0 0 .25rem; }
  .subtitle { color: var(--text-muted); font-size: .875rem; margin: 0; }
  h2 { font-size: 1rem; font-weight: 700; margin: 2rem 0 1rem; }

  .current-plan { padding: 1.5rem; margin-bottom: 1.5rem; }
  .plan-info { display: flex; align-items: center; gap: .75rem; }
  .plan-name { font-size: 1.25rem; font-weight: 700; }
  .plan-status { font-size: .75rem; font-weight: 700; padding: 2px 8px; border-radius: 20px; text-transform: uppercase; }
  .status-active { background: #dcfce7; color: #166534; }
  .status-trialing { background: var(--accent-dim); color: var(--accent); }
  .status-past_due { background: #fee2e2; color: #991b1b; }
  .status-cancelled { background: var(--bg-panel2); color: var(--text-muted); }
  .period-end { font-size: .875rem; color: var(--text-muted); margin: .5rem 0 0; }

  .plans-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; }
  .plan-card {
    background: var(--bg-panel); border: 2px solid var(--border);
    border-radius: 14px; padding: 1.5rem;
    display: flex; flex-direction: column; position: relative;
  }
  .plan-card.current { border-color: var(--accent); }
  .current-badge {
    position: absolute; top: -12px; left: 50%; transform: translateX(-50%);
    background: var(--accent); color: white; font-size: .7rem; font-weight: 700;
    padding: 3px 10px; border-radius: 20px; white-space: nowrap;
  }
  .plan-title { font-size: 1rem; font-weight: 700; margin: 0 0 .75rem; }
  .plan-price { margin-bottom: 1rem; }
  .price { font-size: 1.75rem; font-weight: 800; color: var(--text-base); }
  .period { font-size: .875rem; color: var(--text-muted); }
  .plan-features { list-style: none; padding: 0; margin: 0 0 1.5rem; display: flex; flex-direction: column; gap: .5rem; flex: 1; }
  .plan-features li { display: flex; align-items: center; gap: .5rem; font-size: .8rem; color: var(--text-muted); }
  .plan-features svg { color: var(--success); flex-shrink: 0; }

  .alert-success { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; border-radius: 8px; padding: .75rem 1rem; margin-bottom: 1rem; }
</style>
