<script lang="ts">
  import { enhance } from '$app/forms';
  import type { PageData, ActionData } from './$types';

  interface Props { data: PageData; form: ActionData; }
  const { data, form }: Props = $props();

  let domainInput = $state('');
  let confirmDelete = $state<string | null>(null);

  function formatDate(d: Date | string) {
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
</script>

<svelte:head><title>Custom domains – Hallify</title></svelte:head>

<div class="page">

  <div class="page-head">
    <div>
      <h1 class="page-title">Custom domains</h1>
      <p class="page-sub">Point your own domain to your halls — visitors see your branding, not Hallify.</p>
    </div>
  </div>

  {#if !data.cfEnabled}
    <div class="notice-warn">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;margin-top:1px"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      <span>Cloudflare for SaaS is not configured (<code>CF_ZONE_ID</code> / <code>CF_API_TOKEN</code> missing). Domains will be saved but SSL provisioning won't run automatically.</span>
    </div>
  {/if}

  <!-- ── Add domain ── -->
  <div class="card">
    <div class="card-header">
      <span class="card-title">Add a custom domain</span>
    </div>
    <div class="card-body">
      {#if form?.error}
        <div class="alert-error">{form.error}</div>
      {/if}
      <form method="POST" action="?/add" use:enhance class="add-form">
        <div class="add-input-wrap">
          <input
            class="field-input"
            type="text"
            name="domain"
            placeholder="bookings.myvenue.com"
            bind:value={domainInput}
            required
            autocomplete="off"
            spellcheck="false"
          />
        </div>
        <button type="submit" class="btn-primary">Add domain</button>
      </form>
      <div class="dns-instructions">
        <p class="dns-title">After adding, configure your DNS:</p>
        <ol class="dns-steps">
          <li>In your DNS provider, create a <strong>CNAME</strong> record for your domain.</li>
          <li>Point it to your Cloudflare for SaaS fallback hostname (e.g. <code>custom.hallify.app</code>).</li>
          <li>Wait for SSL to provision (~minutes), then click <strong>Refresh status</strong> below.</li>
        </ol>
      </div>
    </div>
  </div>

  <!-- ── Domain list ── -->
  {#if data.domains.length > 0}
    <div class="card">
      <div class="card-header">
        <span class="card-title">Your domains</span>
        <span class="domain-count">{data.domains.length}</span>
      </div>
      <div class="domain-list">
        {#each data.domains as d}
          <div class="domain-row">
            <div class="domain-left">
              <div class="domain-name">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                <a href="https://{d.domain}" target="_blank" rel="noopener">{d.domain}</a>
              </div>
              <div class="domain-meta">
                Added {formatDate(d.created_at)}
                {#if !d.cf_hostname_id}
                  · <span class="meta-note">CF not linked</span>
                {/if}
              </div>
            </div>

            <div class="domain-right">
              <span class="status-pill" class:status-verified={!!d.verified_at} class:status-pending={!d.verified_at}>
                {#if d.verified_at}
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                  Verified
                {:else}
                  <span class="pulse-dot"></span>
                  Pending
                {/if}
              </span>

              {#if d.cf_hostname_id && !d.verified_at}
                <form method="POST" action="?/refresh" use:enhance style="display:contents">
                  <input type="hidden" name="id" value={d.id} />
                  <button type="submit" class="btn-ghost btn-sm">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                    Refresh
                  </button>
                </form>
              {/if}

              {#if confirmDelete === d.id}
                <form method="POST" action="?/delete" use:enhance style="display:contents">
                  <input type="hidden" name="id" value={d.id} />
                  <button type="submit" class="btn-danger btn-sm">Confirm delete</button>
                </form>
                <button type="button" class="btn-ghost btn-sm" onclick={() => confirmDelete = null}>Cancel</button>
              {:else}
                <button type="button" class="btn-ghost btn-sm btn-icon" onclick={() => confirmDelete = d.id} aria-label="Delete domain">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                </button>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {:else}
    <div class="empty-state">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
      <p class="empty-title">No custom domains yet</p>
      <p class="empty-sub">Add a domain above to give guests a branded booking experience.</p>
    </div>
  {/if}

</div>

<style>
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .page { padding: 24px 28px; animation: fadeUp .2s ease both; display: flex; flex-direction: column; gap: 20px; }

  /* ── Header ── */
  .page-head { display: flex; align-items: flex-start; justify-content: space-between; }
  .page-title { font-size: 18px; font-weight: 800; color: var(--text-base); letter-spacing: -.03em; margin: 0 0 4px; }
  .page-sub { font-size: 13px; color: var(--text-muted); margin: 0; }

  /* ── Notice ── */
  .notice-warn {
    display: flex; gap: 10px; align-items: flex-start;
    padding: 11px 14px; border-radius: 9px; font-size: 12px; color: var(--text-muted);
    background: color-mix(in srgb, #f59e0b 8%, transparent);
    border: 1px solid color-mix(in srgb, #f59e0b 22%, transparent);
  }
  .notice-warn svg { color: #f59e0b; }
  .notice-warn code { font-size: 11px; background: rgba(255,255,255,.08); border-radius: 3px; padding: 1px 4px; }

  /* ── Card ── */
  .card {
    background: var(--bg-panel); border: 1px solid var(--border); border-radius: 12px; overflow: hidden;
  }
  .card-header {
    display: flex; align-items: center; gap: 8px;
    padding: 14px 18px; border-bottom: 1px solid var(--border);
  }
  .card-title { font-size: 13px; font-weight: 700; color: var(--text-base); }
  .domain-count {
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 20px; height: 20px; border-radius: 99px; padding: 0 6px;
    font-size: 10px; font-weight: 700;
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    color: var(--accent);
  }
  .card-body { padding: 16px 18px; }

  /* ── Add form ── */
  .add-form { display: flex; gap: 10px; align-items: center; }
  .add-input-wrap { flex: 1; }
  .field-input {
    width: 100%; padding: 8px 11px; border: 1px solid var(--border); border-radius: 8px;
    background: var(--bg-panel2, var(--bg-base)); font-size: 13px;
    color: var(--text-base); font-family: inherit; outline: none; transition: border-color .12s;
    box-sizing: border-box;
  }
  .field-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 12%, transparent); }

  .btn-primary {
    padding: 8px 18px; border-radius: 8px; font-size: 13px; font-weight: 600;
    background: var(--accent); color: #fff; border: none; cursor: pointer;
    white-space: nowrap; font-family: inherit; transition: opacity .12s; flex-shrink: 0;
  }
  .btn-primary:hover { opacity: .88; }

  /* Alert */
  .alert-error {
    padding: 9px 12px; border-radius: 7px; font-size: 12px; margin-bottom: 12px;
    background: color-mix(in srgb, #ef4444 10%, transparent);
    border: 1px solid color-mix(in srgb, #ef4444 22%, transparent);
    color: #ef4444;
  }

  /* DNS instructions */
  .dns-instructions {
    margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--border);
  }
  .dns-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--text-subtle); margin: 0 0 8px; }
  .dns-steps {
    margin: 0; padding-left: 18px;
    display: flex; flex-direction: column; gap: 6px;
  }
  .dns-steps li { font-size: 12px; color: var(--text-muted); line-height: 1.5; }
  .dns-steps code { font-size: 11px; background: var(--bg-panel2, var(--bg-base)); border-radius: 3px; padding: 1px 5px; border: 1px solid var(--border); }

  /* ── Domain list ── */
  .domain-list { }
  .domain-row {
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
    padding: 12px 18px; border-bottom: 1px solid var(--border);
  }
  .domain-row:last-child { border-bottom: none; }

  .domain-left { min-width: 0; flex: 1; }
  .domain-name {
    display: flex; align-items: center; gap: 7px;
    font-size: 13px; font-weight: 600; color: var(--text-base);
  }
  .domain-name svg { color: var(--text-subtle); flex-shrink: 0; }
  .domain-name a { color: var(--text-base); text-decoration: none; transition: color .1s; }
  .domain-name a:hover { color: var(--accent); }
  .domain-meta { font-size: 11px; color: var(--text-subtle); margin-top: 2px; padding-left: 20px; }
  .meta-note { color: var(--text-subtle); }

  .domain-right { display: flex; align-items: center; gap: 7px; flex-shrink: 0; }

  /* Status pill */
  .status-pill {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 3px 9px; border-radius: 99px; font-size: 10px; font-weight: 700; white-space: nowrap;
  }
  .status-verified {
    background: color-mix(in srgb, #22c55e 12%, transparent);
    color: #22c55e;
  }
  .status-pending {
    background: color-mix(in srgb, #f59e0b 12%, transparent);
    color: #f59e0b;
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
    padding: 5px 11px; border-radius: 6px; font-size: 11px; font-weight: 600;
    background: none; border: 1px solid var(--border); color: var(--text-muted);
    cursor: pointer; font-family: inherit; transition: border-color .1s, color .1s; white-space: nowrap;
  }
  .btn-ghost:hover { border-color: var(--accent); color: var(--text-base); }
  .btn-sm { padding: 4px 9px; }
  .btn-icon { padding: 4px 7px; }
  .btn-danger {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 4px 9px; border-radius: 6px; font-size: 11px; font-weight: 600;
    background: color-mix(in srgb, #ef4444 12%, transparent);
    border: 1px solid color-mix(in srgb, #ef4444 30%, transparent);
    color: #ef4444; cursor: pointer; font-family: inherit; white-space: nowrap;
    transition: background .1s;
  }
  .btn-danger:hover { background: color-mix(in srgb, #ef4444 20%, transparent); }

  /* ── Empty ── */
  .empty-state {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 10px; padding: 60px 20px; text-align: center; color: var(--text-subtle);
    background: var(--bg-panel); border: 1px solid var(--border); border-radius: 12px;
  }
  .empty-title { font-size: 14px; font-weight: 700; color: var(--text-muted); margin: 4px 0 0; }
  .empty-sub   { font-size: 12px; color: var(--text-subtle); }

  @media (max-width: 600px) {
    .page { padding: 16px 18px; }
    .add-form { flex-direction: column; align-items: stretch; }
    .btn-primary { text-align: center; }
    .domain-row { flex-direction: column; align-items: flex-start; }
  }
</style>
