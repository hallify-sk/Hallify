<script lang="ts">
  import { enhance } from '$app/forms';
  import { t } from '$lib/i18n.svelte';
  import SectionHeader from '$lib/components/SectionHeader.svelte';
  import type { PageData } from './$types';

  interface Props { data: PageData; }
  const { data }: Props = $props();

  const ALL_EVENTS = $derived([
    { id: 'channel_message.new',       label: t.settingsPages.eventChannelMessage },
    { id: 'ticket.new',                label: t.settingsPages.eventTicketNew },
    { id: 'ticket.reply',              label: t.settingsPages.eventTicketReply },
    { id: 'reservation.new',           label: t.settingsPages.eventReservationNew },
    { id: 'reservation.status_changed',label: t.settingsPages.eventReservationStatus },
  ]);

  let showCreate = $state(false);
  let showSecret = $state<string | null>(null);

  function timeAgo(d: Date | string) {
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t.settingsPages.justNow;
    if (mins < 60) return `${mins}${t.settingsPages.minutesAgo}`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}${t.settingsPages.hoursAgo}`;
    return `${Math.floor(hrs / 24)}${t.settingsPages.daysAgo}`;
  }
</script>

<svelte:head><title>{t.settingsPages.webhooks} – Hallify</title></svelte:head>

<div class="page">
  <div class="page-top">
    <SectionHeader overline={t.settings.title} title={t.settingsPages.webhooks} />
    {#if !data.locked}
      <button class="btn-primary" type="button" onclick={() => showCreate = !showCreate}>
        + {t.settingsPages.addWebhook}
      </button>
    {/if}
  </div>

  <p class="page-desc">
    {t.settingsPages.webhooksDesc}
  </p>

  {#if data.locked}
    <div class="locked-card">
      <div class="locked-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      </div>
      <h3>{t.settingsPages.webhooksLockedTitle}</h3>
      <p>{t.settingsPages.upgradeTo} <strong>Starter</strong> {t.settingsPages.webhooksLockedHint}</p>
      <a href="/app/billing" class="btn-primary locked-cta">{t.settingsPages.viewPlans}</a>
    </div>
  {:else}

  <!-- Create form -->
  {#if showCreate}
    <div class="card create-card">
      <h3 class="card-title">{t.settingsPages.newWebhook}</h3>
      <form method="POST" action="?/create" use:enhance={() => {
        showCreate = false;
        return async ({ update }) => update();
      }}>
        <div class="fields">
          <div class="field">
            <label for="wh-name">{t.common.name}</label>
            <input id="wh-name" name="name" placeholder={t.settingsPages.webhookNamePlaceholder} required />
          </div>
          <div class="field">
            <label for="wh-url">{t.settingsPages.endpointUrl}</label>
            <input id="wh-url" name="url" type="url" placeholder="https://hooks.slack.com/…" required />
          </div>
          <div class="field">
            <label for="wh-secret">{t.settingsPages.secret} <span class="optional">{t.settingsPages.optionalParen}</span></label>
            <input id="wh-secret" name="secret" type="password" placeholder={t.settingsPages.secretPlaceholder} autocomplete="new-password" />
          </div>
          <div class="field">
            <label>{t.settingsPages.eventsToSend}</label>
            <div class="event-grid">
              {#each ALL_EVENTS as ev}
                <label class="event-check">
                  <input type="checkbox" name="event_{ev.id}" />
                  <span>{ev.label}</span>
                </label>
              {/each}
            </div>
          </div>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn-primary">{t.common.create}</button>
          <button type="button" class="btn-outline" onclick={() => showCreate = false}>{t.common.cancel}</button>
        </div>
      </form>
    </div>
  {/if}

  <!-- Webhook list -->
  {#if data.webhooks.length === 0 && !showCreate}
    <div class="empty">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
      <p>{t.settingsPages.noWebhooks}</p>
    </div>
  {:else}
    <div class="webhooks-list">
      {#each data.webhooks as wh}
        <div class="wh-card" class:disabled={!wh.enabled}>
          <div class="wh-header">
            <div class="wh-info">
              <span class="wh-name">{wh.name}</span>
              <span class="wh-url">{wh.url}</span>
            </div>
            <div class="wh-actions">
              <span class="wh-status" class:enabled={wh.enabled}>{wh.enabled ? t.settingsPages.whActive : t.settingsPages.whPaused}</span>

              <form method="POST" action="?/toggle" use:enhance style="display:contents">
                <input type="hidden" name="id" value={wh.id} />
                <button type="submit" class="btn-sm btn-outline">{wh.enabled ? t.settingsPages.whPause : t.settingsPages.whResume}</button>
              </form>

              <form method="POST" action="?/delete" use:enhance style="display:contents">
                <input type="hidden" name="id" value={wh.id} />
                <button type="submit" class="btn-sm btn-danger"
                  onclick={(e) => { if (!confirm(t.settingsPages.confirmDeleteWebhook)) e.preventDefault(); }}>
                  {t.common.delete}
                </button>
              </form>
            </div>
          </div>

          <div class="wh-events">
            {#each wh.events as ev}
              {@const evLabel = ALL_EVENTS.find(e => e.id === ev)?.label ?? ev}
              <span class="event-tag">{evLabel}</span>
            {/each}
          </div>

          {#if wh.secret}
            <div class="wh-secret-row">
              <span class="wh-secret-label">{t.settingsPages.secretLabel}</span>
              {#if showSecret === wh.id}
                <code class="wh-secret-val">{wh.secret}</code>
                <button class="link-btn" type="button" onclick={() => showSecret = null}>{t.settingsPages.hide}</button>
              {:else}
                <code class="wh-secret-val">••••••••</code>
                <button class="link-btn" type="button" onclick={() => showSecret = wh.id}>{t.settingsPages.reveal}</button>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <!-- Recent deliveries -->
  {#if data.recentDeliveries.length > 0}
    <div class="deliveries-section">
      <h3 class="section-title">{t.settingsPages.recentDeliveries}</h3>
      <div class="deliveries-table">
        <div class="dt-head">
          <span>{t.settingsPages.colWebhook}</span>
          <span>{t.adminReservations.event}</span>
          <span>{t.common.status}</span>
          <span>{t.settingsPages.colCode}</span>
          <span>{t.settingsPages.colWhen}</span>
        </div>
        {#each data.recentDeliveries as d}
          <div class="dt-row" title={d.error ?? ''}>
            <span class="dt-name">{d.webhook_name}</span>
            <code class="dt-event">{d.event}</code>
            <span class="dt-status" class:success={d.status === 'delivered'} class:fail={d.status === 'failed'}>
              {d.status}
            </span>
            <span class="dt-code">{d.response_code ?? '—'}</span>
            <span class="dt-when">{timeAgo(d.delivered_at)}</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}
  {/if}
</div>

<style>
  .page { padding: 28px 32px; }

  .locked-card {
    background: var(--bg-panel); border: 1px solid var(--border); border-radius: 16px;
    padding: 40px 28px; text-align: center; max-width: 460px; margin: 8px auto 0;
  }
  .locked-icon {
    width: 52px; height: 52px; border-radius: 14px; margin: 0 auto 16px;
    display: flex; align-items: center; justify-content: center;
    background: var(--accent-dim, color-mix(in srgb, var(--accent) 12%, transparent)); color: var(--accent);
  }
  .locked-card h3 { font-size: 16px; font-weight: 700; color: var(--text-base); margin: 0 0 8px; }
  .locked-card p { font-size: 13px; color: var(--text-muted); line-height: 1.6; margin: 0 0 20px; }
  .locked-cta { display: inline-block; text-decoration: none; }

  .page-top {
    display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;
  }

  .page-desc {
    font-size: 13px; color: var(--text-muted); margin: 0 0 24px;
  }

  .btn-primary {
    padding: 8px 18px; border-radius: 8px; font-size: 13px; font-weight: 600;
    background: var(--accent); color: #fff; border: none; cursor: pointer; white-space: nowrap;
  }
  .btn-primary:hover { opacity: .9; }

  .btn-outline {
    padding: 6px 14px; border-radius: 7px; font-size: 12px; font-weight: 500;
    border: 1px solid var(--border); background: var(--bg-panel); color: var(--text-muted);
    cursor: pointer; white-space: nowrap;
  }
  .btn-outline:hover { color: var(--text-base); }

  .btn-sm { padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 500; cursor: pointer; border: 1px solid var(--border); background: var(--bg-panel); color: var(--text-muted); white-space: nowrap; }
  .btn-sm:hover { color: var(--text-base); }
  .btn-danger { border-color: transparent; background: color-mix(in srgb, var(--danger, #ef4444) 10%, transparent); color: var(--danger, #ef4444); }
  .btn-danger:hover { background: color-mix(in srgb, var(--danger, #ef4444) 18%, transparent); }

  /* Create form */
  .create-card { padding: 20px; margin-bottom: 20px; }
  .card { background: var(--bg-panel); border: 1px solid var(--border); border-radius: 12px; }
  .card-title { font-size: 14px; font-weight: 700; margin: 0 0 16px; color: var(--text-base); }

  .fields { display: flex; flex-direction: column; gap: 14px; }

  .field { display: flex; flex-direction: column; gap: 5px; }
  .field label {
    font-size: 12px; font-weight: 600; color: var(--text-muted);
  }
  .field input {
    padding: 7px 10px; border-radius: 7px; border: 1px solid var(--border);
    background: var(--bg-panel2, var(--bg-base)); font-size: 13px; color: var(--text-base);
    font-family: inherit; outline: none;
  }
  .field input:focus { border-color: var(--accent); }
  .optional { font-weight: 400; color: var(--text-subtle); }

  .event-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .event-check {
    display: flex; align-items: center; gap: 6px;
    font-size: 12px; color: var(--text-base); cursor: pointer;
  }
  .event-check input { cursor: pointer; }

  .form-actions { display: flex; gap: 8px; margin-top: 16px; }

  /* Webhook list */
  .empty {
    text-align: center; padding: 60px 20px;
    color: var(--text-muted); font-size: 13px;
    display: flex; flex-direction: column; align-items: center; gap: 10px;
  }

  .webhooks-list { display: flex; flex-direction: column; gap: 10px; margin-bottom: 32px; }

  .wh-card {
    background: var(--bg-panel); border: 1px solid var(--border);
    border-radius: 10px; padding: 14px 18px;
    transition: opacity .12s;
  }
  .wh-card.disabled { opacity: .6; }

  .wh-header {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
  }
  .wh-info { flex: 1; min-width: 0; }
  .wh-name { display: block; font-size: 14px; font-weight: 600; color: var(--text-base); }
  .wh-url {
    display: block; font-size: 11px; color: var(--text-subtle);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 2px;
  }
  .wh-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

  .wh-status {
    font-size: 10px; font-weight: 700; text-transform: uppercase; border-radius: 99px;
    padding: 1px 8px;
    background: var(--bg-panel2, var(--bg-base)); color: var(--text-subtle);
  }
  .wh-status.enabled {
    background: color-mix(in srgb, var(--success, #22c55e) 14%, transparent);
    color: var(--success, #22c55e);
  }

  .wh-events { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 10px; }
  .event-tag {
    font-size: 10px; font-weight: 500; padding: 2px 8px; border-radius: 5px;
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    color: var(--accent); white-space: nowrap;
  }

  .wh-secret-row {
    display: flex; align-items: center; gap: 8px; margin-top: 8px;
    font-size: 11px; color: var(--text-subtle);
  }
  .wh-secret-label { color: var(--text-muted); }
  .wh-secret-val { font-family: monospace; font-size: 11px; color: var(--text-base); }
  .link-btn {
    background: none; border: none; color: var(--accent); font-size: 11px;
    cursor: pointer; padding: 0; font-family: inherit;
  }
  .link-btn:hover { text-decoration: underline; }

  /* Deliveries */
  .deliveries-section { margin-top: 8px; }
  .section-title { font-size: 14px; font-weight: 700; color: var(--text-base); margin: 0 0 10px; }

  .deliveries-table {
    background: var(--bg-panel); border: 1px solid var(--border); border-radius: 10px;
    overflow: hidden; font-size: 12px;
  }

  .dt-head, .dt-row {
    display: grid;
    grid-template-columns: 140px 1fr 80px 50px 80px;
    gap: 12px;
    padding: 8px 14px;
    align-items: center;
  }
  .dt-head {
    font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em;
    color: var(--text-subtle); border-bottom: 1px solid var(--border); background: var(--bg-panel2, var(--bg-base));
  }
  .dt-row { border-bottom: 1px solid var(--border-subtle, var(--border)); }
  .dt-row:last-child { border-bottom: none; }
  .dt-row:hover { background: var(--bg-hover); }

  .dt-name { font-weight: 500; color: var(--text-base); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dt-event { font-size: 10px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dt-status { font-weight: 600; }
  .dt-status.success { color: var(--success, #22c55e); }
  .dt-status.fail    { color: var(--danger, #ef4444); }
  .dt-code { color: var(--text-muted); }
  .dt-when { color: var(--text-subtle); }
</style>
