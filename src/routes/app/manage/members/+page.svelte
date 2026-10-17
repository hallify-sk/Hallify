<script lang="ts">
  import { enhance } from '$app/forms';
  import { t } from '$lib/i18n.svelte';
  import type { PageData, ActionData } from './$types';
  let { data, form }: { data: PageData; form: ActionData } = $props();

  let showInviteForm = $state(false);
  let confirmName = $state('');
  const isOwner = $derived(data.currentOrg?.role === 'owner');
  const myId = $derived(data.user?.id);

  function initials(first: string | undefined, last: string | undefined) {
    return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase();
  }

  // Stable per-person avatar tint from the user id. The tints are declared on
  // .page below — deep paper-language inks, each one dark enough that the
  // white initials on top of it stay readable in every theme.
  const AV_COLORS = [
    'var(--tint-rose)', 'var(--tint-blue)', 'var(--tint-green)', 'var(--tint-amber)',
    'var(--tint-red)', 'var(--tint-violet)', 'var(--tint-teal)'
  ];
  function avColor(seed: string | undefined) {
    const s = seed ?? '';
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return AV_COLORS[h % AV_COLORS.length];
  }

  function fmtDate(d: Date | string) {
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
</script>

<svelte:head><title>{t.membersAdmin.pageTitle} – Hallify</title></svelte:head>

<div class="wrap page">

  <div class="page-head">
    <div class="page-head-left">
      <h1 class="page-title">{t.membersAdmin.title}</h1>
      <span class="total-badge">{data.members.length}</span>
    </div>
    <button class="btn-action btn-sm" onclick={() => showInviteForm = !showInviteForm}>
      {showInviteForm ? t.common.cancel : '+ ' + t.membersAdmin.inviteMember}
    </button>
  </div>

  {#if form?.error}
    <div class="alert-error">{form.error}</div>
  {/if}
  {#if form?.message}
    <div class="alert-success">{form.message}</div>
  {/if}

  <!-- Invite a new member -->
  {#if showInviteForm}
    <section class="section section--lead">
      <div class="section-head">
        <h2>{t.membersAdmin.inviteMember}</h2>
      </div>
      <form method="POST" action="?/invite" class="invite-form" use:enhance={() => async ({ update }) => { await update(); showInviteForm = false; }}>
        <div class="field field-grow">
          <label for="email">{t.membersAdmin.emailAddress}</label>
          <input id="email" name="email" type="email" required placeholder={t.membersAdmin.emailPlaceholder} autocomplete="off" />
        </div>
        <div class="field">
          <label for="role">{t.membersAdmin.role}</label>
          <select id="role" name="role">
            <option value="member">{t.membersAdmin.roleMember}</option>
            <option value="admin">{t.membersAdmin.roleAdmin}</option>
          </select>
        </div>
        <button type="submit" class="btn-action invite-submit">{t.membersAdmin.sendInvite}</button>
      </form>
    </section>
  {/if}

  <!-- Members roster -->
  <section class="section" class:section--lead={!showInviteForm}>
    <div class="row-list">
      {#each data.members as member (member.user_id)}
        {@const isMe = member.user_id === myId}
        <div class="row-item member">
          <div class="m-avatar" style="background:{avColor(member.user_id)}">
            {initials(member.user_first_name, member.user_last_name)}
          </div>

          <div class="m-info">
            <div class="m-name-row">
              <span class="m-name">{member.user_first_name} {member.user_last_name}</span>
              {#if isMe}<span class="m-you">{t.membersAdmin.you}</span>{/if}
            </div>
            <span class="m-email">{member.user_email}</span>
          </div>

          <span class="m-joined">{t.membersAdmin.joined} {fmtDate(member.joined_at)}</span>

          <form method="POST" action="?/changeRole" class="m-role" use:enhance>
            <input type="hidden" name="user_id" value={member.user_id} />
            <span class="role-pip" class:owner={member.role === 'owner'} class:admin={member.role === 'admin'} class:member={member.role === 'member'}></span>
            <select name="role" class="role-select" onchange={(e) => (e.currentTarget as HTMLSelectElement).form?.requestSubmit()}>
              <option value="owner" selected={member.role === 'owner'}>{t.membersAdmin.roleOwner}</option>
              <option value="admin" selected={member.role === 'admin'}>{t.membersAdmin.roleAdmin}</option>
              <option value="member" selected={member.role === 'member'}>{t.membersAdmin.roleMember}</option>
            </select>
          </form>

          <div class="m-actions">
            {#if !isMe}
              <form method="POST" action="?/remove" use:enhance>
                <input type="hidden" name="user_id" value={member.user_id} />
                <button type="submit" class="icon-btn icon-danger" title={t.membersAdmin.removeMember}
                  onclick={(e) => { if (!confirm(t.membersAdmin.confirmRemove)) e.preventDefault(); }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                </button>
              </form>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  </section>

  <!-- Pending invites -->
  {#if data.invites.length > 0}
    <section class="section">
      <div class="section-head section-head--row">
        <h2>{t.membersAdmin.pendingInvites}</h2>
        <span class="total-badge">{data.invites.length}</span>
      </div>
      <div class="row-list">
        {#each data.invites as invite (invite.id)}
          <div class="row-item member invite-row">
            <div class="m-avatar invite-avatar">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg>
            </div>
            <div class="m-info">
              <span class="m-name">{invite.email}</span>
              <span class="m-email">{t.membersAdmin.invitationPending}</span>
            </div>
            <span class="invite-role">{invite.role}</span>
            <span class="m-joined">{t.membersAdmin.expires} {fmtDate(invite.expires_at)}</span>
            <div class="m-actions">
              <form method="POST" action="?/revoke" use:enhance>
                <input type="hidden" name="id" value={invite.id} />
                <button type="submit" class="btn-outline btn-sm">{t.membersAdmin.revoke}</button>
              </form>
            </div>
          </div>
        {/each}
      </div>
    </section>
  {/if}

  <!-- The organisation danger zone moved to Settings > Advanced; it is org-level,
       not roster-level. Left as a pointer so anyone who looks for it here finds it. -->
  <section class="section">
    <div class="section-head">
      <p class="eyebrow">{t.membersAdmin.dangerZone}</p>
      <p>{t.membersAdmin.dangerZoneMovedHint}</p>
    </div>
    <a class="btn-outline btn-sm" href="/app/manage/settings/advanced">{t.sidebar.settings}</a>
  </section>
</div>

<style>
  .page {
    padding: 24px 0;

    /* Roster tints. The paper palette carries four semantic inks; a member list
       needs a few more that stay clearly apart from one another. All seven are
       deep fills that hold white text, so they do not flip with the theme.
       Deliberately NOT the value of --accent-ink: that token is recomputed
       per-org by the branding override in +layout.svelte, and a frozen copy of
       it here would silently drift away from the org's real accent. */
    --tint-rose:   #9b2f6b;
    --tint-blue:   #2f5f9e;
    --tint-green:  #2f7a52;
    --tint-amber:  #955f10;
    --tint-red:    #c3362c;
    --tint-violet: #6b4a9e;
    --tint-teal:   #1f6f72;
  }

  /* Header */
  .page-head {
    display: flex; align-items: center; justify-content: space-between;
    gap: 12px; margin-bottom: 18px;
  }
  .page-head-left { display: flex; align-items: center; gap: 10px; }
  .page-title { font-size: var(--display-size); font-weight: 550; color: var(--text-base); letter-spacing: -.055em; margin: 0; }
  .total-badge {
    font-size: 12px; font-weight: 650; color: var(--text-muted);
    background: var(--bg-panel2, var(--bg-base)); border: 1px solid var(--border);
    border-radius: 3px; padding: 1px 9px; line-height: 1.6;
  }

  /* Alerts */
  .alert-success {
    padding: 9px 13px; border-radius: var(--radius-sm); font-size: 13px; margin-bottom: 14px;
    color: var(--success);
    background: var(--success-dim);
    border: 1px solid color-mix(in srgb, var(--success) 28%, transparent);
  }

  /* Invite form */
  .invite-form { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; }
  .field { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
  .field-grow { flex: 1; min-width: 220px; }
  .field label {
    font-size: 10px; font-weight: 600; text-transform: uppercase;
    letter-spacing: .12em; color: var(--text-muted);
  }
  .field input, .field select {
    height: 38px; box-sizing: border-box;
    padding: 0 11px; border: 1px solid var(--border); border-radius: var(--radius-sm);
    background: var(--bg-panel2, var(--bg-base)); font-size: 13px;
    color: var(--text-base); font-family: inherit; outline: none;
    transition: border-color .15s, box-shadow .15s;
  }
  .field input:focus, .field select:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-dim);
  }
  /* Match the input row height exactly so the button sits inline. */
  .invite-submit {
    flex-shrink: 0; height: 38px; box-sizing: border-box;
    display: inline-flex; align-items: center; padding-top: 0; padding-bottom: 0;
  }

  /* Roster rows — .row-item supplies the hairline, the gap and the rhythm. */
  .m-avatar {
    flex-shrink: 0; width: 38px; height: 38px; border-radius: var(--radius);
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-size: 13px; font-weight: 650; letter-spacing: .02em;
  }
  .invite-avatar {
    background: var(--bg-panel2, var(--bg-base)) !important;
    color: var(--text-muted); border: 1px dashed var(--border);
  }

  .m-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .m-name-row { display: flex; align-items: center; gap: 8px; }
  .m-name { font-size: 14px; font-weight: 600; color: var(--text-base); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .m-you {
    font-size: 10px; font-weight: 650; text-transform: uppercase; letter-spacing: .04em;
    color: var(--accent-ink); background: var(--accent-dim);
    border-radius: 3px; padding: 1px 7px;
  }
  .m-email { font-size: 12px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .m-joined { font-size: 12px; color: var(--text-muted); white-space: nowrap; flex-shrink: 0; }

  /* Role control */
  .m-role { display: flex; align-items: center; gap: 7px; flex-shrink: 0; }
  .role-pip { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; background: var(--text-subtle); }
  .role-pip.owner { background: var(--accent); }
  .role-pip.admin { background: var(--tint-blue); }
  .role-pip.member { background: var(--text-subtle); }
  .role-select {
    font-size: 12px; font-weight: 600; padding: 5px 9px; border-radius: var(--radius-sm);
    border: 1px solid var(--border); background: var(--bg-panel2, var(--bg-base));
    color: var(--text-base); font-family: inherit; cursor: pointer;
    transition: border-color .15s;
  }
  .role-select:hover { border-color: color-mix(in srgb, var(--accent) 45%, var(--border)); }
  .role-select:focus { outline: none; border-color: var(--accent); }

  /* Row actions */
  .m-actions { flex-shrink: 0; display: flex; align-items: center; }
  .icon-btn {
    display: flex; align-items: center; justify-content: center;
    width: 32px; height: 32px; border-radius: var(--radius-sm);
    border: 1px solid var(--border); background: var(--bg-panel);
    color: var(--text-muted); cursor: pointer; font-family: inherit;
    transition: color .15s, border-color .15s, background .15s;
  }
  .icon-danger:hover {
    color: var(--danger);
    border-color: color-mix(in srgb, var(--danger) 45%, var(--border));
    background: var(--danger-dim);
  }

  .invite-role {
    font-size: 11px; font-weight: 650; text-transform: capitalize;
    color: var(--text-muted); background: var(--bg-panel2, var(--bg-base));
    border: 1px solid var(--border); border-radius: 3px; padding: 2px 10px; flex-shrink: 0;
  }



  /* Responsive */
  @media (max-width: 720px) {
    .member { flex-wrap: wrap; gap: 10px 12px; }
    .m-joined { order: 5; width: 100%; margin-left: 52px; }
  }
</style>
