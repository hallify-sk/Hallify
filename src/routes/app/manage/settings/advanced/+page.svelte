<script lang="ts">
  import { enhance } from '$app/forms';
  import { t, getLocale } from '$lib/i18n.svelte';
  import { confirmFirst } from '$lib/forms';
  import { timeAgo, formatDateTime } from '$lib/format';
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
    { id: 'hall.archived',              label: t.settingsPages.eventHallArchived },
    { id: 'hall.restored',              label: t.settingsPages.eventHallRestored },
    { id: 'hall.deleted',               label: t.settingsPages.eventHallDeleted },
  ]);
  const eventLabel = (id: string) =>
    id === 'webhook.test' ? t.settingsPages.eventWebhookTest : (ALL_EVENTS.find((e) => e.id === id)?.label ?? id);
  const statusLabel = (s: string) =>
    s === 'delivered' ? t.settingsPages.whStatusDelivered
    : s === 'failed' ? t.settingsPages.whStatusFailed
    : t.settingsPages.whStatusPending;

  let showCreate = $state(false);
  let editId = $state<string | null>(null);
  let showSecret = $state<string | null>(null);

  /** What the server sent back when a create/edit was refused, so the form keeps it. */
  const echoed = (formId: string) =>
    form && 'webhookForm' in form && form.webhookForm === formId ? form.values : null;
  const webhookError = (formId: string) =>
    form && 'webhookForm' in form && form.webhookForm === formId ? form.webhookError : null;

  /** Close a create/edit form only once the server has accepted it. A refused form
   *  stays open with what was typed (it used to close before the request). */
  const saveWebhook = () => async ({ result, update }: { result: { type: string }; update: (o?: { reset?: boolean }) => Promise<void> }) => {
    if (result.type === 'success') {
      showCreate = false;
      editId = null;
      await update();
    } else {
      await update({ reset: false });
    }
  };

  const webhookResult = $derived(form && 'webhookResult' in form ? form.webhookResult : null);

  function prettyPayload(raw: string): string {
    try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return raw; }
  }

  // ── Danger zone ────────────────────────────────────────────────────
  let confirmName = $state('');
  const dangerError = $derived(form && 'dangerError' in form ? form.dangerError : null);

  /** Everything closing will do, said again in the confirm dialog. */
  const closeConfirmText = () => [
    `${t.membersAdmin.confirmClosePre} ${data.orgName}?`,
    data.upcomingClients > 0 ? t.membersAdmin.closeOrgWillEmailClients(data.upcomingClients) : '',
    data.hasSubscription ? t.membersAdmin.closeOrgWillCancelBilling : '',
    t.membersAdmin.confirmClosePost,
  ].filter(Boolean).join('\n\n');
</script>

<svelte:head><title>{t.settingsPages.tabAdvanced} – {t.settings.title} – Hallify</title></svelte:head>

{#if data.canManage}
  <p class="tab-intro">{t.settingsPages.advancedSub}</p>
{:else}
  <p class="tab-intro">{t.settingsPages.leaveOnlyHint}</p>
{/if}

{#if form && 'error' in form && form.error}
  <div class="alert-error" role="alert">{form.error}</div>
{/if}

{#if data.canManage && data.notifications && data.recipients}
<!-- ══ Email ══════════════════════════════════════════════════════ -->
<section class="section section--lead" id="email">
  <div class="section-head">
    <h2>{t.settings.emailNotifications}</h2>
    <p>{t.settingsPages.emailIntroPre} <strong>noreply@hallify.sk</strong>. {t.settingsPages.emailIntroPost}</p>
  </div>

  {#if form && 'success' in form && form.success}
    <div class="alert-success" role="status">{t.settings.saved}</div>
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
{#snippet webhookFields(prefix: string, values: { name?: string; url?: string; events?: string[] } | null, editing: boolean)}
  <div class="fields">
    <div class="field">
      <label for="{prefix}-name">{t.common.name}</label>
      <input id="{prefix}-name" name="name" value={values?.name ?? ''} placeholder={t.settingsPages.webhookNamePlaceholder} maxlength="100" required />
    </div>
    <div class="field">
      <label for="{prefix}-url">{t.settingsPages.endpointUrl}</label>
      <input id="{prefix}-url" name="url" type="url" value={values?.url ?? ''} placeholder="https://hooks.slack.com/…" pattern="https://.*" required />
    </div>
    <div class="field">
      <label for="{prefix}-secret">{t.settingsPages.secret} <span class="optional">{t.settingsPages.optionalParen}</span></label>
      <input id="{prefix}-secret" name="secret" type="password" maxlength="64" placeholder={editing ? t.settingsPages.whSecretKeep : t.settingsPages.secretPlaceholder} autocomplete="new-password" />
      {#if editing}
        <label class="event-check"><input type="checkbox" name="clear_secret" /> <span>{t.settingsPages.whSecretClear}</span></label>
      {/if}
    </div>
    <div class="field">
      <span class="field-label">{t.settingsPages.eventsToSend}</span>
      <div class="event-grid">
        {#each ALL_EVENTS as ev (ev.id)}
          <label class="event-check">
            <input type="checkbox" name="event_{ev.id}" checked={values?.events?.includes(ev.id) ?? false} />
            <span>{ev.label}</span>
          </label>
        {/each}
      </div>
    </div>
  </div>
{/snippet}

<section class="section" id="webhooks">
  <div class="section-head section-head--row">
    <div>
      <h2>{t.settingsPages.webhooks}</h2>
      <p>{t.settingsPages.webhooksDesc}</p>
    </div>
    {#if !data.locked}
      <button class="btn-action btn-sm" type="button" onclick={() => { showCreate = !showCreate; editId = null; }}>
        {showCreate ? t.common.cancel : '+ ' + t.settingsPages.addWebhook}
      </button>
    {/if}
  </div>

  {#if form && 'webhookSaved' in form && form.webhookSaved}
    <div class="alert-success" role="status">{t.settingsPages.whSaved}</div>
  {/if}

  {#if data.locked}
    <div class="card--inset locked-card">
      <div class="icon-tile">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      </div>
      <h3>{t.settingsPages.webhooksLockedTitle}</h3>
      <p>{t.settingsPages.upgradeTo} <strong>Starter</strong> {t.settingsPages.webhooksLockedHint}</p>
      <a href="/app/billing" class="btn-action locked-cta">{t.settingsPages.viewPlans}</a>
    </div>
    {#if data.webhooks.length > 0}
      <!-- Kept after a downgrade: stored, not sent. They used to disappear from here. -->
      <p class="group-sub locked-list-hint">{t.settingsPages.webhookLockedListHint}</p>
      <div class="row-list">
        {#each data.webhooks as wh (wh.id)}
          <div class="row-item wh-row disabled">
            <div class="wh-info">
              <span class="wh-name">{wh.name}</span>
              <span class="wh-url">{wh.url}</span>
            </div>
            <div class="wh-actions">
              <span class="wh-status">{t.settingsPages.whPausedByPlan}</span>
              <form method="POST" action="?/delete" use:enhance={confirmFirst(() => t.settingsPages.confirmDeleteWebhook)} style="display:contents">
                <input type="hidden" name="id" value={wh.id} />
                <button type="submit" class="btn-danger btn-sm">{t.common.delete}</button>
              </form>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {:else}
    {#if showCreate}
      <div class="card--inset create-card">
        <h3 class="card-title">{t.settingsPages.newWebhook}</h3>
        <form method="POST" action="?/create" use:enhance={saveWebhook}>
          {#if webhookError('create')}
            <div class="alert-error" role="alert">{webhookError('create')}</div>
          {/if}
          {@render webhookFields('wh-new', echoed('create'), false)}
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
          <div class="row-item wh-block" class:disabled={!wh.enabled && editId !== wh.id}>
            <div class="wh-row">
              <div class="wh-info">
                <span class="wh-name">{wh.name}</span>
                <span class="wh-url">{wh.url}</span>

                <div class="wh-events">
                  {#each wh.events as ev}
                    <span class="event-tag">{eventLabel(ev)}</span>
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

                {#if webhookResult && webhookResult.id === wh.id}
                  <p class="wh-result" class:ok={webhookResult.status === 'delivered'} role="status">
                    {webhookResult.status === 'delivered'
                      ? t.settingsPages.whTestOk(webhookResult.responseCode)
                      : t.settingsPages.whTestFailed(webhookResult.error ?? String(webhookResult.responseCode ?? ''))}
                  </p>
                {/if}
              </div>

              <div class="wh-actions">
                <span class="wh-status" class:enabled={wh.enabled}>{wh.enabled ? t.settingsPages.whActive : t.settingsPages.whPaused}</span>

                <form method="POST" action="?/test" use:enhance={() => async ({ update }) => { await update({ reset: false }); }} style="display:contents">
                  <input type="hidden" name="id" value={wh.id} />
                  <button type="submit" class="btn-outline btn-sm">{t.settingsPages.whTest}</button>
                </form>

                <button type="button" class="btn-outline btn-sm" aria-expanded={editId === wh.id}
                  onclick={() => { editId = editId === wh.id ? null : wh.id; showCreate = false; }}>
                  {editId === wh.id ? t.common.cancel : t.settingsPages.whEdit}
                </button>

                <form method="POST" action="?/toggle" use:enhance style="display:contents">
                  <input type="hidden" name="id" value={wh.id} />
                  <button type="submit" class="btn-outline btn-sm">{wh.enabled ? t.settingsPages.whPause : t.settingsPages.whResume}</button>
                </form>

                <form method="POST" action="?/delete" use:enhance={confirmFirst(() => t.settingsPages.confirmDeleteWebhook)} style="display:contents">
                  <input type="hidden" name="id" value={wh.id} />
                  <button type="submit" class="btn-danger btn-sm">{t.common.delete}</button>
                </form>
              </div>
            </div>

            {#if editId === wh.id}
              <form method="POST" action="?/update" class="wh-edit" use:enhance={saveWebhook}>
                <h3 class="card-title">{t.settingsPages.whEditTitle}</h3>
                {#if webhookError(wh.id)}
                  <div class="alert-error" role="alert">{webhookError(wh.id)}</div>
                {/if}
                <input type="hidden" name="id" value={wh.id} />
                {@render webhookFields(`wh-${wh.id}`, echoed(wh.id) ?? wh, true)}
                <div class="form-actions">
                  <button type="submit" class="btn-action btn-sm">{t.common.save}</button>
                  <button type="button" class="btn-outline btn-sm" onclick={() => editId = null}>{t.common.cancel}</button>
                </div>
              </form>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

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
        <details class="dt-item">
          <summary class="dt-row">
            <span class="dt-name">{d.webhook_name}</span>
            <span class="dt-event">{eventLabel(d.event)}</span>
            <span class="dt-status" class:success={d.status === 'delivered'} class:fail={d.status === 'failed'}>
              {statusLabel(d.status)}
            </span>
            <span class="dt-code">{d.response_code ?? '—'}</span>
            <span class="dt-when" title={formatDateTime(d.delivered_at, getLocale())}>{timeAgo(d.delivered_at, getLocale())}</span>
          </summary>
          <div class="dt-detail">
            <p class="dt-meta"><code>{d.event}</code> · {formatDateTime(d.delivered_at, getLocale())}</p>
            {#if d.error}
              <p class="dt-error"><strong>{t.settingsPages.whError}:</strong> {d.error}</p>
            {/if}
            <span class="field-label">{t.settingsPages.whPayload}</span>
            <pre class="dt-payload">{prettyPayload(d.payload)}</pre>
            {#if !data.locked}
              <form method="POST" action="?/retry" use:enhance={() => async ({ update }) => { await update({ reset: false }); }}>
                <input type="hidden" name="delivery_id" value={d.id} />
                <button type="submit" class="btn-outline btn-sm">{t.settingsPages.whRetry}</button>
              </form>
            {/if}
          </div>
        </details>
      {/each}
    </div>
  {/if}
</section>
{/if}

<!-- ══ Danger zone ════════════════════════════════════════════════ -->
<section class="section danger-section" id="danger" class:section--lead={!data.canManage}>
  <div class="section-head">
    <h2 class="danger-label">{t.membersAdmin.dangerZone}</h2>
    <p>{t.settingsPages.dangerZoneSub}</p>
  </div>

  <!-- A platform admin viewing this org is not a member of it: both actions are
       refused server-side, so say so here instead of letting the click fail. -->
  {#if data.impersonated}
    <p class="danger-note">{t.serverErrors.impersonationBlockThisOrg}</p>
  {/if}

  <!-- Errors from leaving or closing appear here, next to the buttons that caused
       them, not at the top of a long page. -->
  {#if dangerError}
    <div class="alert-error" role="alert">{dangerError}</div>
  {/if}

  <div class="row-list">
    {#if data.isOwner && !data.impersonated}
      <div class="row-item danger-row">
        <div class="danger-text">
          <strong>{t.settingsPages.exportTitle}</strong>
          <p>{t.settingsPages.exportDesc}</p>
        </div>
        <div class="export-actions">
          <a class="btn-outline btn-sm" href="/app/manage/settings/advanced/export?format=json" download>{t.settingsPages.exportJson}</a>
          <a class="btn-outline btn-sm" href="/app/manage/settings/advanced/export?format=csv" download>{t.settingsPages.exportCsv}</a>
        </div>
      </div>
    {/if}

    <div class="row-item danger-row">
      <div class="danger-text">
        <strong>{t.membersAdmin.leaveOrg}</strong>
        <p>{t.membersAdmin.leaveOrgDescPre} {data.orgName}. {t.membersAdmin.leaveOrgDescPost}</p>
      </div>
      <form method="POST" action="?/leave" use:enhance={confirmFirst(() => t.membersAdmin.confirmLeave)}>
        <button type="submit" class="btn-outline btn-sm danger-btn" disabled={data.impersonated}>{t.membersAdmin.leave}</button>
      </form>
    </div>

    {#if data.isOwner}
      <div class="row-item danger-row danger-close">
        <div class="danger-text">
          <strong>{t.membersAdmin.closeOrg}</strong>
          <p>{t.membersAdmin.closeOrgDescPre} <strong>{data.orgName}</strong> {t.membersAdmin.closeOrgDescPost}</p>
          <ul class="danger-consequences">
            <li>{data.upcomingClients > 0 ? t.membersAdmin.closeOrgWillEmailClients(data.upcomingClients) : t.membersAdmin.closeOrgNoUpcoming}</li>
            {#if data.hasSubscription}<li>{t.membersAdmin.closeOrgWillCancelBilling}</li>{/if}
          </ul>
        </div>
        <!-- confirmFirst, not onsubmit+preventDefault: enhance ignores
             defaultPrevented, so Cancel used to close the organisation anyway. -->
        <form method="POST" action="?/closeOrg" class="close-form" use:enhance={confirmFirst(closeConfirmText)}>
          <input type="text" name="confirm_name" bind:value={confirmName} aria-label={t.membersAdmin.closeOrg} placeholder={`${t.membersAdmin.confirmTypePre} “${data.orgName}” ${t.membersAdmin.confirmTypePost}`} autocomplete="off" />
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

  .wh-block { flex-direction: column; align-items: stretch; }
  .wh-block.disabled .wh-row { opacity: .6; }
  .wh-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; }
  .wh-row.disabled { opacity: .6; }
  .wh-edit { padding: 14px 0 4px; border-top: 1px solid var(--border-subtle); margin-top: 4px; }
  .wh-actions { flex-wrap: wrap; justify-content: flex-end; }
  .wh-result { font-size: 12px; margin: 8px 0 0; color: var(--danger); }
  .wh-result.ok { color: var(--success); }
  .locked-list-hint { margin-top: 20px; }
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
  .dt-item { border-bottom: 1px solid var(--border-subtle); }
  .dt-item:last-child { border-bottom: none; }
  .dt-row { cursor: pointer; list-style: none; }
  .dt-row::-webkit-details-marker { display: none; }
  .dt-row:hover { background: var(--bg-hover); }
  .dt-row:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .dt-detail { padding: 4px 0 14px; display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
  .dt-meta, .dt-error { margin: 0; font-size: 12px; color: var(--text-muted); }
  .dt-error { color: var(--danger); }
  .dt-payload {
    width: 100%; box-sizing: border-box; margin: 0; max-height: 260px; overflow: auto;
    padding: 10px 12px; border-radius: var(--radius-sm); background: var(--bg-panel2);
    border: 1px solid var(--border); font-size: 11px; line-height: 1.5; color: var(--text-base);
  }
  .dt-name { font-weight: 500; color: var(--text-base); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dt-event { font-size: 10px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dt-status { font-weight: 600; }
  .dt-status.success { color: var(--success); }
  .dt-status.fail    { color: var(--danger); }
  .dt-code { color: var(--text-muted); }
  .dt-when { color: var(--text-subtle); }

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
  .danger-consequences { margin: 8px 0 0; padding-left: 18px; font-size: 12.5px; line-height: 1.5; color: var(--text-base); max-width: 56ch; }
  .export-actions { display: flex; gap: 8px; flex-shrink: 0; flex-wrap: wrap; }
  .export-actions a { text-decoration: none; }
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
