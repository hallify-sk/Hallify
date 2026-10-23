<script lang="ts">
  import { enhance } from '$app/forms';
  import { confirmFirst } from '$lib/forms';
  import { formatDate } from '$lib/format';
  import { getLocale, t } from '$lib/i18n.svelte';
  import type { PageData, ActionData } from './$types';
  let { data, form }: { data: PageData; form: ActionData } = $props();

  let showForm = $state(false);

  const roleById = $derived(new Map(data.roles.map((r) => [r.id, r])));
  // Pre-assignable roles only: the same rule as assigning to an existing member,
  // and the default role needs no granting because everybody holds it.
  const pickableRoles = $derived(data.roles.filter((r) => r.assignable && !r.isDefault));

  // Dates follow the interface language, the same way the dashboard does it.
  function fmtDate(d: string) {
    return formatDate(d, getLocale());
  }

  // Which link was just copied (an invite id, or 'result' for the banner), so the
  // button can say so for a moment. Without a clipboard (an http preview, an old
  // browser) the link is offered in a prompt the person can copy from by hand.
  let copiedKey = $state<string | null>(null);
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;
  async function copyLink(key: string, link: string) {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      window.prompt(t.peopleArea.inviteLinkLabel, link);
      return;
    }
    copiedKey = key;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => (copiedKey = null), 2000);
  }

  // A role's colour is free text in the database; only a plain hex reaches a style
  // attribute, so a stray value cannot redecorate the page.
  function roleColor(c: string | null) {
    return c && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(c) ? c : 'var(--text-subtle)';
  }
</script>

<svelte:head><title>{t.peopleArea.tabInvites} – Hallify</title></svelte:head>

{#if form?.error}
  <div class="alert-error top-alert">{form.error}</div>
{/if}
{#if form?.message && form?.emailFailed}
  <!-- The invite exists but its e-mail did not go: a failure, not a success, and
       the link to send another way is right here. -->
  <div class="alert-error top-alert link-alert" role="alert">
    <p class="link-alert-msg">{form.message}</p>
    {#if form.inviteLink}
      <p class="link-alert-hint">{t.peopleArea.inviteLinkHint}</p>
      <div class="link-row">
        <input
          class="link-input"
          type="text"
          readonly
          value={form.inviteLink}
          aria-label={t.peopleArea.inviteLinkLabel}
          onfocus={(e) => e.currentTarget.select()}
        />
        <button type="button" class="btn-outline btn-sm" onclick={() => copyLink('result', form?.inviteLink ?? '')}>
          {copiedKey === 'result' ? t.peopleArea.linkCopied : t.peopleArea.copyLink}
        </button>
      </div>
    {/if}
  </div>
{:else if form?.message}
  <div class="alert-success top-alert">{form.message}</div>
{/if}

<section class="section section--lead">
  <div class="section-head section-head--row">
    <div>
      <h2>{t.peopleArea.invitesTitle}</h2>
      <p>{t.peopleArea.invitesSub}</p>
    </div>
    {#if data.canInvite}
      <button class="btn-action btn-sm" onclick={() => (showForm = !showForm)}>
        {showForm ? t.common.cancel : '+ ' + t.peopleArea.newInvite}
      </button>
    {/if}
  </div>

  {#if showForm && data.canInvite}
    <form
      method="POST"
      action="?/invite"
      class="invite-form card--inset"
      use:enhance={() => async ({ update, result }) => {
        await update();
        if (result.type === 'success') showForm = false;
      }}
    >
      <p class="hint">{t.peopleArea.newInviteSub}</p>

      <div class="grid">
        <div class="f f-wide">
          <label for="email">{t.peopleArea.email}</label>
          <input id="email" name="email" type="email" required placeholder={t.peopleArea.emailPlaceholder} autocomplete="off" />
        </div>
        <div class="f">
          <label for="first_name">{t.peopleArea.firstName} <span class="opt">{t.peopleArea.optional}</span></label>
          <input id="first_name" name="first_name" type="text" maxlength="80" autocomplete="off" />
        </div>
        <div class="f">
          <label for="last_name">{t.peopleArea.lastName} <span class="opt">{t.peopleArea.optional}</span></label>
          <input id="last_name" name="last_name" type="text" maxlength="80" autocomplete="off" />
        </div>
        <div class="f">
          <label for="role">{t.peopleArea.accessLevel}</label>
          <select id="role" name="role">
            <option value="member">{t.membersAdmin.roleMember}</option>
            <option
              value="admin"
              disabled={!data.canGrantAdmin}
              title={data.canGrantAdmin ? undefined : t.peopleArea.errors.adminBeyondYou}
            >{t.membersAdmin.roleAdmin}</option>
          </select>
        </div>
      </div>

      <div class="f">
        <span class="lbl">{t.peopleArea.rolesOnAccept}</span>
        {#if pickableRoles.length === 0}
          <p class="hint">{t.peopleArea.noAssignableRoles}</p>
        {:else}
          <div class="role-picks">
            {#each pickableRoles as role (role.id)}
              <label class="role-pick">
                <input type="checkbox" name="role_ids" value={role.id} />
                <span class="role-dot" style="background:{roleColor(role.color)}"></span>
                <span>{role.name}</span>
              </label>
            {/each}
          </div>
        {/if}
      </div>

      <div><button type="submit" class="btn-action btn-sm">{t.peopleArea.sendInvite}</button></div>
    </form>
  {/if}

  {#if data.invites.length === 0}
    <div class="card--inset state-block">
      <span class="icon-tile" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg>
      </span>
      <h3>{t.peopleArea.pendingEmpty}</h3>
      <p>{t.peopleArea.pendingEmptyBody}</p>
    </div>
  {:else}
    <div class="row-list">
      {#each data.invites as invite (invite.id)}
        <div class="row-item invite-row">
          <div class="i-avatar" aria-hidden="true">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg>
          </div>

          <div class="i-info">
            <span class="i-name">
              {#if invite.firstName || invite.lastName}{invite.firstName} {invite.lastName} · {/if}{invite.email}
            </span>
            <span class="i-sub">
              {t.peopleArea.invitedBy} {invite.invitedBy || t.peopleArea.unknownInviter}
            </span>
          </div>

          <div class="i-roles">
            {#if invite.roleIds.length === 0}
              <span class="i-norole">{t.peopleArea.inviteRolesNone}</span>
            {:else}
              {#each invite.roleIds as rid (rid)}
                {@const role = roleById.get(rid)}
                {#if role}
                  <span class="role-chip">
                    <span class="role-dot" style="background:{roleColor(role.color)}"></span>
                    {role.name}
                  </span>
                {/if}
              {/each}
            {/if}
            <span class="i-level">
              {invite.legacyRole === 'admin' ? t.membersAdmin.roleAdmin : t.membersAdmin.roleMember}
            </span>
          </div>

          {#if invite.expired}
            <span class="i-expires i-expired">{t.peopleArea.expiredBadge}</span>
          {:else}
            <span class="i-expires">{t.peopleArea.expires} {fmtDate(invite.expiresAt)}</span>
          {/if}

          <div class="i-actions">
            {#if data.canInvite}
              {#if !invite.expired}
                <button type="button" class="btn-outline btn-sm" onclick={() => copyLink(invite.id, invite.link)}>
                  {copiedKey === invite.id ? t.peopleArea.linkCopied : t.peopleArea.copyLink}
                </button>
              {/if}
              <form method="POST" action="?/resend" use:enhance>
                <input type="hidden" name="id" value={invite.id} />
                <button type="submit" class="btn-outline btn-sm">{t.peopleArea.resend}</button>
              </form>
              <form method="POST" action="?/revoke" use:enhance={confirmFirst(() => t.peopleArea.confirmRevoke)}>
                <input type="hidden" name="id" value={invite.id} />
                <button type="submit" class="btn-outline btn-sm">{t.peopleArea.revoke}</button>
              </form>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</section>

<style>
  .top-alert { margin-top: 16px; }
  .alert-success {
    padding: 9px 13px; border-radius: var(--radius-sm); font-size: 13px; margin: 16px 0 0;
    color: var(--success);
    background: var(--success-dim);
    border: 1px solid color-mix(in srgb, var(--success) 28%, transparent);
  }

  /* ── Create form ────────────────────────────────────────────────────────── */
  .invite-form {
    display: flex; flex-direction: column; gap: 14px;
    padding: 20px; margin-bottom: 20px;
  }
  .hint { font-size: 12px; color: var(--text-muted); line-height: 1.6; margin: 0; max-width: 72ch; }
  .grid {
    display: grid; gap: 12px;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  }
  .f { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
  .f-wide { grid-column: span 2; }
  .f label, .f .lbl {
    font-size: var(--meta-size); font-weight: 600; text-transform: uppercase;
    letter-spacing: .12em; color: var(--text-muted);
  }
  .opt { text-transform: none; letter-spacing: 0; color: var(--text-subtle); font-weight: 500; }
  .f input, .f select {
    height: var(--control-h); box-sizing: border-box;
    padding: 0 11px; border: 1px solid var(--border); border-radius: var(--radius-sm);
    background: var(--bg-panel); font-size: 13px;
    color: var(--text-base); font-family: inherit; outline: none;
    transition: border-color .15s, box-shadow .15s;
  }
  .f input:focus, .f select:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-dim);
  }

  .role-picks { display: flex; flex-wrap: wrap; gap: 6px; }
  .role-pick {
    display: inline-flex; align-items: center; gap: 7px;
    font-size: 12px; font-weight: 600; color: var(--text-base);
    background: var(--bg-panel); border: 1px solid var(--border);
    border-radius: var(--radius-sm); padding: 6px 10px; cursor: pointer;
    text-transform: none; letter-spacing: 0;
  }
  .role-pick:hover { border-color: var(--text-subtle); }
  .role-pick input { accent-color: var(--accent); margin: 0; }

  /* ── Pending rows ───────────────────────────────────────────────────────── */
  .i-avatar {
    flex-shrink: 0; width: 38px; height: 38px; border-radius: var(--radius);
    display: flex; align-items: center; justify-content: center;
    background: var(--bg-panel2, var(--bg-base)); color: var(--text-muted);
    border: 1px dashed var(--border);
  }
  .i-info { flex: 1 1 200px; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .i-name { font-size: 14px; font-weight: 600; color: var(--text-base); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .i-sub { font-size: 12px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .i-roles { display: flex; flex-wrap: wrap; gap: 5px; flex: 1 1 160px; min-width: 0; align-items: center; }
  .i-norole { font-size: 12px; color: var(--text-subtle); }
  .role-chip {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 11px; font-weight: 600; color: var(--text-base);
    background: var(--bg-panel2, var(--bg-base));
    border: 1px solid var(--border); border-radius: var(--radius-sm);
    padding: 2px 8px; white-space: nowrap;
  }
  .role-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .i-level { font-size: 11px; font-weight: 600; color: var(--text-muted); }

  .i-expires { font-size: 12px; color: var(--text-muted); white-space: nowrap; flex-shrink: 0; }
  .i-expired { font-weight: 600; color: var(--warning); }
  .i-actions { flex-shrink: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }

  /* ── Failed-send banner ─────────────────────────────────────────────────── */
  .link-alert { display: flex; flex-direction: column; gap: 8px; margin-bottom: 0; }
  .link-alert-msg { margin: 0; font-weight: 600; }
  .link-alert-hint { margin: 0; color: var(--text-muted); font-size: 12px; line-height: 1.6; }
  .link-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .link-input {
    flex: 1 1 260px; min-width: 0; height: var(--control-h); box-sizing: border-box;
    padding: 0 11px; border: 1px solid var(--border); border-radius: var(--radius-sm);
    background: var(--bg-panel); color: var(--text-base); font-size: 12px; font-family: inherit;
  }
  .link-input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }

  @media (max-width: 820px) {
    .invite-row { flex-wrap: wrap; gap: 10px 12px; }
    .i-roles, .i-expires { width: 100%; margin-left: 52px; }
    .f-wide { grid-column: span 1; }
  }
</style>
