<script lang="ts">
  import { pageTitle } from '$lib/page-title';
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { t, getLocale } from '$lib/i18n.svelte';
  import { formatDate as fmt, timeAgo } from '$lib/format';
  import { claimExpiresAt, type DnsRecord } from '$lib/custom-domain';
  import type { PageData, ActionData } from './$types';

  interface Props { data: PageData; form: ActionData; }
  const { data, form }: Props = $props();

  let domainInput = $state('');
  let confirmDelete = $state<string | null>(null);
  let copied = $state<string | null>(null);

  const formatDate = (d: string | Date) => fmt(d, getLocale());

  const purposeLabel = (p: DnsRecord['purpose']) =>
    p === 'routing' ? t.settingsPages.recordPurposeRouting
    : p === 'ownership' ? t.settingsPages.recordPurposeOwnership
    : t.settingsPages.recordPurposeCertificate;

  /** A root domain (kastiel.sk) cannot hold a plain CNAME at most providers. */
  const isApex = (domain: string) => domain.split('.').length === 2;

  async function copy(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      copied = key;
      setTimeout(() => { if (copied === key) copied = null; }, 1500);
    } catch { /* clipboard blocked: the value stays selectable */ }
  }

  // While a domain waits for verification, reload the page data every half minute:
  // the load re-checks pending domains with Cloudflare, so the status (and the moment
  // the domain goes live) shows up without pressing anything. Paused in background tabs.
  const anyPending = $derived(data.cfEnabled && data.domains.some((d) => d.state === 'pending'));
  $effect(() => {
    if (!anyPending) return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') invalidateAll();
    }, 30_000);
    return () => clearInterval(timer);
  });
</script>

<svelte:head><title>{pageTitle(t.settingsPages.domains, t.settings.title)}</title></svelte:head>

<p class="tab-intro">{t.settingsPages.domainsSub}</p>

<!-- ── Free subdomain (always available) ── -->
  <section class="section section--lead">
    <div class="section-head section-head--row">
      <h2>{t.settingsPages.freeAddress}</h2>
      <span class="status-pill status-verified">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
        {t.settingsPages.active}
      </span>
    </div>
    <div class="domain-name">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
      <a href="https://{data.subdomain}" target="_blank" rel="noopener">{data.subdomain}</a>
    </div>
    <p class="dns-title" style="margin-top:10px">{t.settingsPages.includedEveryPlan}</p>
  </section>

  <!-- ── Add custom domain (paid only) ── -->
  {#if data.customDomainsAllowed}
    <section class="section">
      <div class="section-head">
        <h2>{t.settingsPages.addCustomDomain}</h2>
      </div>
      {#if form?.error}
        <div class="alert-error" role="alert">{form.error}</div>
      {/if}
      <!-- Automatic connection needs Cloudflare for SaaS on our side. Without it the
           owner is told plainly what happens, not which environment variable is missing. -->
      {#if !data.cfEnabled}
        <div class="notice-warn notice-top">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;margin-top:1px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span>{t.settingsPages.domainsManualSetup}</span>
        </div>
      {/if}
      <form method="POST" action="?/add" use:enhance class="add-form">
        <div class="add-input-wrap">
          <input
            class="field-input"
            type="text"
            name="domain"
            placeholder="bookings.myvenue.com"
            aria-label={t.settingsPages.addCustomDomain}
            bind:value={domainInput}
            required
            autocomplete="off"
            spellcheck="false"
          />
        </div>
        <button type="submit" class="btn-primary">{t.settingsPages.addDomain}</button>
      </form>
      <div class="dns-instructions">
        <p class="dns-title">{t.settingsPages.dnsConfigTitle}</p>
        <ol class="dns-steps">
          <li>{t.settingsPages.dnsStep1Pre} <strong>CNAME</strong> {t.settingsPages.dnsStep1Post}</li>
          <li>{t.settingsPages.dnsStep2Pre} <code>{data.cnameTarget}</code>.</li>
          {#if data.cfEnabled}
            <li>{t.settingsPages.dnsStep3Pre} <strong>{t.settingsPages.refreshStatus}</strong> {t.settingsPages.dnsStep3Post}</li>
          {:else}
            <li>{t.settingsPages.dnsStep3Manual}</li>
          {/if}
        </ol>
      </div>
    </section>
  {:else}
    <section class="section">
      <div class="card--inset upgrade-card">
        <div>
          <p class="upgrade-title">{t.settingsPages.connectOwnDomain}</p>
          <p class="upgrade-sub">{t.settingsPages.connectOwnDomainPre} <code>bookings.myvenue.com</code> {t.settingsPages.connectOwnDomainPost}</p>
        </div>
        <a class="btn-primary" href="/app/billing">{t.settingsPages.upgradePlan}</a>
      </div>
    </section>
  {/if}

  <!-- ── Domain list ── -->
  {#if data.domains.length > 0}
    <section class="section">
      <div class="section-head section-head--row">
        <h2>{t.settingsPages.yourDomains}</h2>
        <span class="domain-count">{data.domains.length}</span>
      </div>
      {#if form?.refreshed}
        {#if form.verified}
          <div class="alert-success">{t.settingsPages.domainNowVerified}</div>
        {:else}
          <div class="notice-warn notice-inline">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;margin-top:1px"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <span>{t.settingsPages.domainStillPending}</span>
          </div>
        {/if}
      {/if}
      <div class="row-list">
        {#each data.domains as d}
          <div class="row-item domain-row">
            <div class="domain-left">
              <div class="domain-name">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                <a href="https://{d.domain}" target="_blank" rel="noopener">{d.domain}</a>
              </div>
              <div class="domain-meta">
                {t.settingsPages.added} {formatDate(d.created_at)}
                {#if d.checked_at && d.state !== 'not_configured'}
                  · {t.settingsPages.lastChecked(timeAgo(d.checked_at, getLocale()))}
                {/if}
              </div>
              {#if d.state === 'pending'}
                <p class="domain-pending">{t.settingsPages.domainPendingHint}</p>
                {#if d.check_error}
                  <p class="domain-pending domain-problem">{t.settingsPages.cloudflareReports} {d.check_error}</p>
                {/if}
                {@const expires = claimExpiresAt(d.created_at)}
                {#if expires}
                  <p class="domain-pending">{t.settingsPages.domainExpiresOn(formatDate(expires))}</p>
                {/if}
              {:else if d.state === 'not_configured'}
                <p class="domain-pending">{t.settingsPages.domainNotConfiguredHint}</p>
              {/if}
              {#if d.state !== 'verified' && d.records.length > 0}
                <div class="dns-records">
                  <p class="dns-title">{t.settingsPages.dnsRecordsTitle}</p>
                  <table class="dns-table">
                    <thead>
                      <tr><th>{t.settingsPages.recordType}</th><th>{t.settingsPages.recordName}</th><th>{t.settingsPages.recordValue}</th></tr>
                    </thead>
                    <tbody>
                      {#each d.records as r, i (r.type + r.name + r.value)}
                        {@const key = `${d.id}:${i}`}
                        <tr>
                          <td data-label={t.settingsPages.recordType}><strong>{r.type}</strong></td>
                          <td data-label={t.settingsPages.recordName}><code>{r.name}</code></td>
                          <td data-label={t.settingsPages.recordValue}>
                            <span class="dns-value">
                              <code>{r.value}</code>
                              <button type="button" class="btn-ghost btn-sm" onclick={() => copy(key, r.value)}>
                                {copied === key ? t.settingsPages.valueCopied : t.settingsPages.copyValue}
                              </button>
                            </span>
                            <span class="dns-purpose">{purposeLabel(r.purpose)}</span>
                          </td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                  {#if isApex(d.domain)}
                    <p class="domain-pending">{t.settingsPages.apexDomainHint}</p>
                  {/if}
                </div>
              {/if}
            </div>

            <div class="domain-right">
              <span class="status-pill" class:status-verified={d.state === 'verified'} class:status-pending={d.state === 'pending'} class:status-off={d.state === 'not_configured'}>
                {#if d.state === 'verified'}
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                  {t.settingsPages.verified}
                {:else if d.state === 'pending'}
                  <span class="pulse-dot"></span>
                  {t.status.pending}
                {:else}
                  {t.settingsPages.cfNotLinked}
                {/if}
              </span>

              {#if d.state === 'pending'}
                <form method="POST" action="?/refresh" use:enhance style="display:contents">
                  <input type="hidden" name="id" value={d.id} />
                  <button type="submit" class="btn-ghost btn-sm">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                    {t.settingsPages.refresh}
                  </button>
                </form>
              {/if}

              {#if confirmDelete === d.id}
                <form method="POST" action="?/delete" use:enhance style="display:contents">
                  <input type="hidden" name="id" value={d.id} />
                  <button type="submit" class="btn-danger btn-sm">{t.settingsPages.confirmDelete}</button>
                </form>
                <button type="button" class="btn-ghost btn-sm" onclick={() => confirmDelete = null}>{t.common.cancel}</button>
              {:else}
                <button type="button" class="btn-ghost btn-sm btn-icon" onclick={() => confirmDelete = d.id} aria-label={t.settingsPages.deleteDomain}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                </button>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </section>
  {:else if data.customDomainsAllowed}
    <section class="section">
      <div class="card--inset empty-state">
        <div class="icon-tile">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
        </div>
        <p class="empty-title">{t.settingsPages.noCustomDomains}</p>
        <p class="empty-sub">{t.settingsPages.noCustomDomainsSub}</p>
      </div>
    </section>
  {/if}

<style>
  /* The page shell, title and tab strip live in the Settings layout. */
  .tab-intro { font-size: 13px; color: var(--text-muted); line-height: 1.7; margin: 20px 0 0; max-width: 70ch; }

  /* ── Notice ── */
  .notice-warn {
    display: flex; gap: 10px; align-items: flex-start; margin-top: 16px;
    padding: 11px 14px; border-radius: var(--radius); font-size: 12px; color: var(--text-muted);
    background: var(--warning-dim);
    border: 1px solid color-mix(in srgb, var(--warning) 25%, transparent);
  }
  .notice-warn svg { color: var(--warning); }
  .notice-warn code { font-size: 11px; background: var(--bg-panel2); border-radius: var(--radius-sm); padding: 1px 4px; }

  .domain-count {
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 20px; height: 20px; border-radius: var(--radius-sm); padding: 0 6px;
    font-size: 10px; font-weight: 650;
    background: var(--accent-dim);
    color: var(--accent-ink);
  }

  /* ── Add form ── */
  /* The field and its button are one control: both are locked to the same
     height so the button never reads as a smaller chip beside the input. */
  .add-form { display: flex; gap: 10px; align-items: stretch; }
  .add-input-wrap { flex: 1; }
  .field-input {
    width: 100%; height: 38px; padding: 0 11px; border: 1px solid var(--border); border-radius: var(--radius-sm);
    background: var(--bg-panel2); font-size: 13px;
    color: var(--text-base); font-family: inherit; outline: none; transition: border-color .15s, box-shadow .15s;
    box-sizing: border-box;
  }
  .field-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }

  .btn-primary {
    display: inline-flex; align-items: center; justify-content: center;
    height: 38px; box-sizing: border-box;
    padding: 0 18px; border-radius: var(--radius-sm); font-size: 13px; font-weight: 650;
    background: var(--accent); color: var(--accent-contrast); border: none; cursor: pointer;
    white-space: nowrap; font-family: inherit; transition: transform .2s, background .2s; flex-shrink: 0;
  }
  .btn-primary:hover { background: var(--accent-hover); transform: translateY(-2px); }
  .btn-primary:active { transform: translateY(0); }

  /* Alert */
  .alert-error {
    padding: 9px 12px; border-radius: var(--radius-sm); font-size: 12px; margin-bottom: 12px;
    background: var(--danger-dim);
    border: 1px solid color-mix(in srgb, var(--danger) 25%, transparent);
    color: var(--danger);
  }
  .alert-success {
    padding: 9px 12px; border-radius: var(--radius-sm); font-size: 12px; margin-bottom: 12px;
    background: var(--success-dim);
    border: 1px solid color-mix(in srgb, var(--success) 25%, transparent);
    color: var(--success);
  }
  /* The same warning block, used above a list rather than after a field. */
  .notice-inline { margin-top: 0; margin-bottom: 12px; }

  /* DNS instructions */
  .dns-instructions {
    margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--border-subtle);
  }
  .dns-title { font-size: 10px; font-weight: 650; text-transform: uppercase; letter-spacing: .13em; line-height: 1.7; color: var(--text-muted); margin: 0 0 8px; }
  .dns-steps {
    margin: 0; padding-left: 18px;
    display: flex; flex-direction: column; gap: 6px;
  }
  .dns-steps li { font-size: 12px; color: var(--text-muted); line-height: 1.5; }
  .dns-steps code { font-size: 11px; background: var(--bg-panel2); border-radius: var(--radius-sm); padding: 1px 5px; border: 1px solid var(--border); }

  /* ── Domain list ── */
  .domain-row { justify-content: space-between; }

  .domain-left { min-width: 0; flex: 1; }
  .domain-name {
    display: flex; align-items: center; gap: 7px;
    font-size: 13px; font-weight: 600; color: var(--text-base);
  }
  .domain-name svg { color: var(--text-subtle); flex-shrink: 0; }
  .domain-name a { color: var(--text-base); text-decoration: none; transition: color .15s; }
  .domain-name a:hover { color: var(--accent-ink); }
  .domain-meta { font-size: 11px; color: var(--text-subtle); margin-top: 2px; padding-left: 20px; }
  .domain-pending { font-size: 11.5px; line-height: 1.5; color: var(--text-muted); margin: 4px 0 0; padding-left: 20px; max-width: 60ch; }
  .notice-top { margin: 0 0 14px; }
  .domain-problem { color: var(--warning); }

  /* DNS records Cloudflare asks for, one row per record. */
  .dns-records { margin: 10px 0 0; padding-left: 20px; }
  .dns-records .dns-title { margin-bottom: 6px; }
  .dns-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .dns-table th {
    text-align: left; font-size: 10px; font-weight: 650; color: var(--text-subtle);
    padding: 4px 8px 4px 0; border-bottom: 1px solid var(--border-subtle);
  }
  .dns-table td { padding: 6px 8px 6px 0; vertical-align: top; border-bottom: 1px solid var(--border-subtle); color: var(--text-base); }
  .dns-table code {
    font-size: 11px; background: var(--bg-panel2); border-radius: var(--radius-sm); padding: 1px 5px;
    border: 1px solid var(--border); word-break: break-all; user-select: all;
  }
  .dns-value { display: flex; align-items: flex-start; gap: 6px; }
  .dns-purpose { display: block; margin-top: 3px; font-size: 11px; color: var(--text-subtle); }

  .domain-right { display: flex; align-items: center; gap: 7px; flex-shrink: 0; }

  /* Status pill */
  .status-pill {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 3px 9px; border-radius: var(--radius-sm); font-size: 10px; font-weight: 650; white-space: nowrap;
  }
  .status-verified {
    background: var(--success-dim);
    color: var(--success);
  }
  .status-pending {
    background: var(--warning-dim);
    color: var(--warning);
  }
  .status-off {
    background: var(--bg-panel2);
    color: var(--text-muted);
  }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .4; } }
  .pulse-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: currentColor; display: inline-block;
    animation: pulse 1.4s ease-in-out infinite;
  }

  /* Buttons */
  .btn-ghost {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 5px 11px; border-radius: var(--radius-sm); font-size: 11px; font-weight: 600;
    background: none; border: 1px solid var(--border); color: var(--text-muted);
    cursor: pointer; font-family: inherit; transition: background .15s, border-color .15s, color .15s; white-space: nowrap;
  }
  .btn-ghost:hover { background: var(--bg-hover); border-color: var(--text-subtle); color: var(--text-base); }
  .btn-sm { padding: 4px 9px; }
  .btn-icon { padding: 4px 7px; }
  .btn-danger {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 4px 9px; border-radius: var(--radius-sm); font-size: 11px; font-weight: 600;
    background: var(--danger-dim);
    border: 1px solid color-mix(in srgb, var(--danger) 20%, transparent);
    color: var(--danger); cursor: pointer; font-family: inherit; white-space: nowrap;
    transition: background .15s;
  }
  .btn-danger:hover { background: color-mix(in srgb, var(--danger) 15%, transparent); }

  /* ── Upgrade prompt (free plan) ── */
  .upgrade-card { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  .upgrade-title { font-size: 13px; font-weight: 650; letter-spacing: -.03em; color: var(--text-base); margin: 0 0 4px; }
  .upgrade-sub { font-size: 12px; color: var(--text-muted); margin: 0; line-height: 1.5; }
  .upgrade-sub code { font-size: 11px; background: var(--bg-panel2); border-radius: var(--radius-sm); padding: 1px 5px; border: 1px solid var(--border); }
  .upgrade-card .btn-primary { text-decoration: none; flex-shrink: 0; }

  /* ── Empty ── */
  .empty-state {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 10px; text-align: center; color: var(--text-subtle);
  }
  .empty-title { font-size: 14px; font-weight: 650; letter-spacing: -.03em; color: var(--text-muted); margin: 4px 0 0; }
  .empty-sub   { font-size: 12px; color: var(--text-subtle); margin: 0; }

  @media (max-width: 600px) {
    .add-form { flex-direction: column; align-items: stretch; }
    .btn-primary { text-align: center; }
    .domain-row { flex-direction: column; align-items: flex-start; }
    .domain-left { width: 100%; }
    .dns-records { padding-left: 0; }
    .dns-table thead { display: none; }
    .dns-table tr { display: block; padding: 6px 0; border-bottom: 1px solid var(--border-subtle); }
    .dns-table td { display: block; border: none; padding: 2px 0; }
    .dns-table td::before { content: attr(data-label); display: block; font-size: 10px; color: var(--text-subtle); }
  }

  @media (prefers-reduced-motion: reduce) {
    .btn-primary:hover { transform: none; }
  }
</style>
