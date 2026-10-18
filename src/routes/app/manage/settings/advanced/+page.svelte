<script lang="ts">
  import { enhance } from '$app/forms';
  import { t } from '$lib/i18n.svelte';
  import RecipientPicker from './RecipientPicker.svelte';
  import type { PageData, ActionData } from './$types';

  interface Props { data: PageData; form: ActionData; }
  const { data, form }: Props = $props();

  // ── Email ──────────────────────────────────────────────────────────
  const teamItems = $derived([
    { key: 'newReservation', title: t.settingsPages.notifyNewBookingTitle, desc: t.settingsPages.notifyNewBookingDesc },
    { key: 'guestMessage',   title: t.settingsPages.notifyGuestMessageTitle, desc: t.settingsPages.notifyGuestMessageDesc },
    { key: 'guestCancel',    title: t.settingsPages.notifyGuestCancelTitle, desc: t.settingsPages.notifyGuestCancelDesc },
    { key: 'guestEdit',      title: t.settingsPages.notifyGuestEditTitle, desc: t.settingsPages.notifyGuestEditDesc },
  ] as const);

  const guestItems = $derived([
    { key: 'statusChange', title: t.settingsPages.notifyStatusUpdateTitle, desc: t.settingsPages.notifyStatusUpdateDesc },
    { key: 'newMessage',   title: t.settingsPages.notifyRepliesTitle, desc: t.settingsPages.notifyRepliesDesc },
  ] as const);

  // ── Webhooks ───────────────────────────────────────────────────────
  const ALL_EVENTS = $derived([
    { id: 'channel_message.new',        label: t.settingsPages.eventChannelMessage },
    { id: 'ticket.new',                 label: t.settingsPages.eventTicketNew },
    { id: 'ticket.reply',               label: t.settingsPages.eventTicketReply },
    { id: 'reservation.new',            label: t.settingsPages.eventReservationNew },
    { id: 'reservation.status_changed', label: t.settingsPages.eventReservationStatus },
  ]);

  let showCreate = $state(false);
  let showSecret = $state<string | null>(null);

  // ── Danger zone ────────────────────────────────────────────────────
  let confirmName = $state('');

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

<svelte:head><title>{t.settingsPages.tabAdvanced} – {t.settings.title} – Hallify</title></svelte:head>

<p class="tab-intro">{t.settingsPages.advancedSub}</p>

{#if form?.error}
  <div class="alert-error">{form.error}</div>
{/if}

<!-- ══ Email ══════════════════════════════════════════════════════ -->
<section class="section section--lead" id="email">
  <div class="section-head">
    <h2>{t.settings.emailNotifications}</h2>
    <p>{t.settingsPages.emailIntroPre} <strong>noreply@hallify.sk</strong>. {t.settingsPages.emailIntroPost}</p>
  </div>

  {#if form?.success}
    <div class="alert-success">{t.settings.saved}</div>
  {/if}

  <form method="POST" action="?/saveNotifications" use:enhance={() => async ({ update }) => { await update({ reset: false }); }}>
    <h3 class="group-title">{t.settingsPages.notifyTeam}</h3>
    <p class="group-sub">{t.settingsPages.recipientsHint}</p>
    <div class="row-list">
      {#each teamItems as item (item.key)}
        <div class="row-item notify-row">
          <span class="notify-text">
            <span class="notify-title" id="notify-{item.key}">{item.title}</span>
            <span class="notify-desc">{item.desc}</span>
          </span>
          <RecipientPicker
            name={item.key}
            staff={data.staff}
            selected={data.recipients[item.key]}
            labelledBy="notify-{item.key}"
          />
        </div>
      {/each}
    </div>

    <h3 class="group-title">{t.settingsPages.notifyGuests}</h3>
    <p class="group-sub">{t.settingsPages.notifyGuestsSub}</p>
    <div class="row-list">
      {#each guestItems as item (item.key)}
        <label class="row-item notify-row toggle-row">
          <span class="notify-text">
            <span class="notify-title">{item.title}</span>
            <span class="notify-desc">{item.desc}</span>
          </span>
          <input type="checkbox" name={item.key} checked={data.notifications[item.key]} />
          <span class="switch" aria-hidden="true"></span>
        </label>
      {/each}
    </div>

    <div class="save-row">
      <button type="submit" class="btn-action">{t.common.save}</button>
    </div>
  </form>
</section>

<!-- ══ Webhooks ═══════════════════════════════════════════════════ -->
<section class="section" id="webhooks">
  <div class="section-head section-head--row">
    <div>
      <h2>{t.settingsPages.webhooks}</h2>
      <p>{t.settingsPages.webhooksDesc}</p>
    </div>
    {#if !data.locked}
      <button class="btn-action btn-sm" type="button" onclick={() => showCreate = !showCreate}>
        {showCreate ? t.common.cancel : '+ ' + t.settingsPages.addWebhook}
      </button>
    {/if}
  </div>

  {#if data.locked}
    <div class="card--inset locked-card">
      <div class="icon-tile">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      </div>
      <h3>{t.settingsPages.webhooksLockedTitle}</h3>
      <p>{t.settingsPages.upgradeTo} <strong>Starter</strong> {t.settingsPages.webhooksLockedHint}</p>
      <a href="/app/billing" class="btn-action locked-cta">{t.settingsPages.viewPlans}</a>
    </div>
  {:else}
    {#if showCreate}
      <div class="card--inset create-card">
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
              <span class="field-label">{t.settingsPages.eventsToSend}</span>
              <div class="event-grid">
                {#each ALL_EVENTS as ev (ev.id)}
                  <label class="event-check">
                    <input type="checkbox" name="event_{ev.id}" />
                    <span>{ev.label}</span>
                  </label>
                {/each}
              </div>
            </div>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn-action btn-sm">{t.common.create}</button>
            <button type="button" class="btn-outline btn-sm" onclick={() => showCreate = false}>{t.common.cancel}</button>
          </div>
        </form>
      </div>
    {/if}

    {#if data.webhooks.length === 0 && !showCreate}
      <div class="card--inset empty">
        <div class="icon-tile">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
        </div>
        <p>{t.settingsPages.noWebhooks}</p>
      </div>
    {:else}
      <div class="row-list">
        {#each data.webhooks as wh (wh.id)}
          <div class="row-item wh-row" class:disabled={!wh.enabled}>
            <div class="wh-info">
              <span class="wh-name">{wh.name}</span>
              <span class="wh-url">{wh.url}</span>

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

            <div class="wh-actions">
              <span class="wh-status" class:enabled={wh.enabled}>{wh.enabled ? t.settingsPages.whActive : t.settingsPages.whPaused}</span>

              <form method="POST" action="?/toggle" use:enhance style="display:contents">
                <input type="hidden" name="id" value={wh.id} />
                <button type="submit" class="btn-outline btn-sm">{wh.enabled ? t.settingsPages.whPause : t.settingsPages.whResume}</button>
              </form>

              <form method="POST" action="?/delete" use:enhance style="display:contents">
                <input type="hidden" name="id" value={wh.id} />
                <button type="submit" class="btn-danger btn-sm"
                  onclick={(e) => { if (!confirm(t.settingsPages.confirmDeleteWebhook)) e.preventDefault(); }}>
                  {t.common.delete}
                </button>
              </form>
            </div>
          </div>
        {/each}
      </div>
    {/if}

    {#if data.recentDeliveries.length > 0}
      <h3 class="group-title">{t.settingsPages.recentDeliveries}</h3>
      <div class="deliveries-table">
        <div class="dt-head">
          <span>{t.settingsPages.colWebhook}</span>
          <span>{t.adminReservations.event}</span>
          <span>{t.common.status}</span>
          <span>{t.settingsPages.colCode}</span>
          <span>{t.settingsPages.colWhen}</span>
        </div>
        {#each data.recentDeliveries as d (d.id)}
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
    {/if}
  {/if}
</section>

<!-- ══ Danger zone ════════════════════════════════════════════════ -->
<section class="section danger-section">
  <div class="section-head">
    <h2 class="danger-label">{t.membersAdmin.dangerZone}</h2>
    <p>{t.settingsPages.dangerZoneSub}</p>
  </div>

  <!-- A platform admin viewing this org is not a member of it: both actions are
       refused server-side, so say so here instead of letting the click fail. -->
  {#if data.impersonated}
    <p class="danger-note">{t.serverErrors.impersonationBlockThisOrg}</p>
  {/if}

  <div class="row-list">
    <div class="row-item danger-row">
      <div class="danger-text">
        <strong>{t.membersAdmin.leaveOrg}</strong>
        <p>{t.membersAdmin.leaveOrgDescPre} {data.orgName}. {t.membersAdmin.leaveOrgDescPost}</p>
      </div>
      <form method="POST" action="?/leave" use:enhance>
        <button type="submit" class="btn-outline btn-sm danger-btn" disabled={data.impersonated}
          onclick={(e) => { if (!confirm(t.membersAdmin.confirmLeave)) e.preventDefault(); }}>{t.membersAdmin.leave}</button>
      </form>
    </div>

    {#if data.isOwner}
      <div class="row-item danger-row danger-close">
        <div class="danger-text">
          <strong>{t.membersAdmin.closeOrg}</strong>
          <p>{t.membersAdmin.closeOrgDescPre} <strong>{data.orgName}</strong> {t.membersAdmin.closeOrgDescPost}</p>
        </div>
        <form method="POST" action="?/closeOrg" class="close-form" use:enhance
          onsubmit={(e) => { if (!confirm(`${t.membersAdmin.confirmClosePre} ${data.orgName}? ${t.membersAdmin.confirmClosePost}`)) e.preventDefault(); }}>
          <input type="text" name="confirm_name" bind:value={confirmName} placeholder={`${t.membersAdmin.confirmTypePre} “${data.orgName}” ${t.membersAdmin.confirmTypePost}`} autocomplete="off" />
          <button type="submit" class="btn-danger close-btn" disabled={data.impersonated || confirmName.trim() !== data.orgName}>{t.membersAdmin.closeOrg}</button>
        </form>
      </div>
    {/if}
  </div>
</section>

<style>
  /* The page shell, title and tab strip live in the Settings layout. */
  .tab-intro { font-size: 13px; color: var(--text-muted); line-height: 1.7; margin: 20px 0 0; max-width: 70ch; }

  /* A sub-heading inside a section — smaller than the section's own h2. */
  .group-title {
    font-size: 13px; font-weight: 650; letter-spacing: -.02em; color: var(--text-base);
    margin: 24px 0 2px;
  }
  .group-sub { font-size: 12px; color: var(--text-muted); line-height: 1.6; margin: 0 0 6px; max-width: 70ch; }

  .save-row { margin-top: 20px; }

  /* ── Notification rows ── */
  .notify-row { justify-content: space-between; gap: 18px; }
  .notify-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .notify-title { font-size: 13px; font-weight: 600; color: var(--text-base); }
  .notify-desc { font-size: 11.5px; color: var(--text-muted); line-height: 1.45; }

  /* Switch — a physical-metaphor control, so it keeps its curve. */
  .toggle-row { cursor: pointer; }
  .toggle-row input { position: absolute; opacity: 0; width: 0; height: 0; }
  .switch {
    flex-shrink: 0;
    position: relative;
    width: 38px; height: 22px;
    border-radius: 99px;
    background: var(--bg-hover);
    border: 1px solid var(--border);
    transition: background .15s, border-color .15s;
  }
  .switch::after {
    content: '';
    position: absolute;
    top: 2px; left: 2px;
    width: 16px; height: 16px;
    border-radius: 50%;
    background: var(--text-subtle);
    transition: transform .15s, background .15s;
  }
  .toggle-row input:checked ~ .switch { background: var(--accent); border-color: var(--accent); }
  .toggle-row input:checked ~ .switch::after { transform: translateX(16px); background: var(--bg-panel); }
  .toggle-row input:focus-visible ~ .switch { box-shadow: 0 0 0 3px var(--accent-dim); }

  /* ── Alerts ── */
  .alert-success {
    padding: 10px 14px; border-radius: var(--radius-sm); font-size: 13px; font-weight: 500; margin-bottom: 16px;
    color: var(--success);
    background: var(--success-dim);
    border: 1px solid color-mix(in srgb, var(--success) 25%, transparent);
  }

  /* ── Webhooks ── */
  .locked-card { text-align: center; max-width: 460px; margin: 8px auto 0; }
  .locked-card .icon-tile { width: 52px; height: 52px; margin: 0 auto 16px; }
  .locked-card h3 { font-size: 16px; font-weight: 650; letter-spacing: -.03em; color: var(--text-base); margin: 0 0 8px; }
  .locked-card p { font-size: 13px; color: var(--text-muted); line-height: 1.6; margin: 0 0 20px; }
  .locked-cta { display: inline-flex; text-decoration: none; }

  .create-card { margin-bottom: 20px; }
  .card-title { font-size: 14px; font-weight: 650; letter-spacing: -.03em; margin: 0 0 16px; color: var(--text-base); }

  .fields { display: flex; flex-direction: column; gap: 14px; }
  .field { display: flex; flex-direction: column; gap: 5px; }
  .field label, .field-label { font-size: 12px; font-weight: 600; color: var(--text-muted); }
  .field input {
    height: 38px; box-sizing: border-box;
    padding: 0 11px; border-radius: var(--radius-sm); border: 1px solid var(--border);
    background: var(--bg-panel2); font-size: 13px; color: var(--text-base);
    font-family: inherit; outline: none; transition: border-color .15s, box-shadow .15s;
  }
  .field input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
  .optional { font-weight: 400; color: var(--text-subtle); }

  .event-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .event-check { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-base); cursor: pointer; }
  .event-check input { cursor: pointer; accent-color: var(--accent); }

  .form-actions { display: flex; gap: 8px; margin-top: 16px; }

  .empty {
    text-align: center; color: var(--text-muted); font-size: 13px;
    display: flex; flex-direction: column; align-items: center; gap: 10px;
  }
  .empty p { margin: 0; }

  .wh-row { align-items: flex-start; justify-content: space-between; }
  .wh-row.disabled { opacity: .6; }
  .wh-info { flex: 1; min-width: 0; }
  .wh-name { display: block; font-size: 14px; font-weight: 600; color: var(--text-base); }
  .wh-url {
    display: block; font-size: 11px; color: var(--text-subtle);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 2px;
  }
  .wh-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

  .wh-status {
    font-size: 10px; font-weight: 650; text-transform: uppercase; letter-spacing: .08em; border-radius: var(--radius-sm);
    padding: 1px 8px;
    background: var(--bg-panel2); color: var(--text-subtle);
  }
  .wh-status.enabled { background: var(--success-dim); color: var(--success); }

  .wh-events { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px; }
  .event-tag {
    font-size: 10px; font-weight: 500; padding: 2px 8px; border-radius: var(--radius-sm);
    background: var(--accent-dim); color: var(--accent-ink); white-space: nowrap;
  }

  .wh-secret-row { display: flex; align-items: center; gap: 8px; margin-top: 8px; font-size: 11px; color: var(--text-subtle); }
  .wh-secret-label { color: var(--text-muted); }
  .wh-secret-val { font-family: monospace; font-size: 11px; color: var(--text-base); }
  .link-btn {
    background: none; border: none; color: var(--accent-ink); font-size: 11px;
    cursor: pointer; padding: 0; font-family: inherit;
  }
  .link-btn:hover { text-decoration: underline; }

  .deliveries-table { font-size: 12px; }
  .dt-head, .dt-row {
    display: grid;
    grid-template-columns: 140px 1fr 80px 50px 80px;
    gap: 12px;
    padding: 8px 0;
    align-items: center;
  }
  .dt-head {
    font-size: 10px; font-weight: 650; text-transform: uppercase; letter-spacing: .1em;
    color: var(--text-subtle); border-bottom: 1px solid var(--border);
  }
  .dt-row { border-bottom: 1px solid var(--border-subtle); }
  .dt-row:last-child { border-bottom: none; }
  .dt-row:hover { background: var(--bg-hover); }
  .dt-name { font-weight: 500; color: var(--text-base); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dt-event { font-size: 10px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dt-status { font-weight: 600; }
  .dt-status.success { color: var(--success); }
  .dt-status.fail    { color: var(--danger); }
  .dt-code { color: var(--text-muted); }
  .dt-when { color: var(--text-subtle); }

  /* ── Analytics ── */
  /* Field and button are one control: equal heights, no stray chip. */


  /* ── Danger zone ── */
  .danger-section { border-top-color: color-mix(in srgb, var(--danger) 30%, var(--border)); }
  .danger-label { color: var(--danger); }
  .danger-row { justify-content: space-between; gap: 24px; }
  .danger-text strong { font-size: 14px; font-weight: 650; color: var(--text-base); }
  .danger-text p { font-size: 12.5px; color: var(--text-muted); margin: 4px 0 0; max-width: 56ch; line-height: 1.5; }
  .danger-close { align-items: flex-start; }
  .danger-btn { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 35%, var(--border)); flex-shrink: 0; }
  .danger-btn:hover:not(:disabled) { background: var(--danger-dim); }
  .danger-btn:disabled { opacity: .5; cursor: not-allowed; }
  .danger-note {
    font-size: 12.5px; line-height: 1.5; color: var(--text-muted); margin: 0 0 14px;
    padding: 9px 12px; border-radius: var(--radius-sm);
    background: var(--warning-dim);
    border: 1px solid color-mix(in srgb, var(--warning) 25%, transparent);
  }
  .close-form { display: flex; flex-direction: column; gap: 8px; flex-shrink: 0; min-width: 280px; }
  .close-form input {
    font-size: 12.5px; height: 34px; box-sizing: border-box; padding: 0 11px;
    border: 1px solid var(--border); border-radius: var(--radius-sm);
    background: var(--bg-panel2); font-family: inherit; color: var(--text-base);
  }
  .close-form input:focus { outline: none; border-color: var(--danger); box-shadow: 0 0 0 3px var(--danger-dim); }
  .close-btn { justify-content: center; }
  .close-btn:disabled { opacity: .5; cursor: not-allowed; }

  @media (max-width: 720px) {
    .notify-row { flex-wrap: wrap; }
    .danger-row, .danger-close { flex-direction: column; align-items: stretch; gap: 14px; }
    .close-form { min-width: 0; }
    .event-grid { grid-template-columns: 1fr; }
    .dt-head, .dt-row { grid-template-columns: 1fr 70px 60px; }
    .dt-event, .dt-code { display: none; }
  }

  @media (prefers-reduced-motion: reduce) {
    .btn-action:hover { transform: none; }
  }
</style>
