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

  // Stable per-person avatar tint from the user id.
  const AV_COLORS = ['#4f6ef7', '#0ea5e9', '#10b981', '#f59e0b', '#e11d48', '#8b5cf6', '#14b8a6'];
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

<div class="page">

  <div class="page-header">
    <div class="page-header-left">
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

  {#if showInviteForm}
    <div class="invite-panel">
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
    </div>
  {/if}

  <!-- Members roster -->
  <div class="roster">
    {#each data.members as member (member.user_id)}
      {@const isMe = member.user_id === myId}
      <div class="member">
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

  <!-- Pending invites -->
  {#if data.invites.length > 0}
    <div class="section-label">
      <h2>{t.membersAdmin.pendingInvites}</h2>
      <span class="total-badge">{data.invites.length}</span>
    </div>
    <div class="roster">
      {#each data.invites as invite (invite.id)}
        <div class="member invite-row">
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
  {/if}

  <!-- Danger zone -->
  <div class="section-label">
    <h2 class="danger-label">{t.membersAdmin.dangerZone}</h2>
  </div>
  <div class="danger-card">
    <div class="danger-row">
      <div class="danger-text">
        <strong>{t.membersAdmin.leaveOrg}</strong>
        <p>{t.membersAdmin.leaveOrgDescPre} {data.currentOrg?.name}. {t.membersAdmin.leaveOrgDescPost}</p>
      </div>
      <form method="POST" action="?/leave" use:enhance>
        <button type="submit" class="btn-outline btn-sm danger-btn"
          onclick={(e) => { if (!confirm(t.membersAdmin.confirmLeave)) e.preventDefault(); }}>{t.membersAdmin.leave}</button>
      </form>
    </div>

    {#if isOwner}
      <div class="danger-divider"></div>
      <div class="danger-row danger-close">
        <div class="danger-text">
          <strong>{t.membersAdmin.closeOrg}</strong>
          <p>{t.membersAdmin.closeOrgDescPre} <strong>{data.currentOrg?.name}</strong> {t.membersAdmin.closeOrgDescPost}</p>
        </div>
        <form method="POST" action="?/closeOrg" class="close-form" use:enhance
          onsubmit={(e) => { if (!confirm(`${t.membersAdmin.confirmClosePre} ${data.currentOrg?.name}? ${t.membersAdmin.confirmClosePost}`)) e.preventDefault(); }}>
          <input type="text" name="confirm_name" bind:value={confirmName} placeholder={`${t.membersAdmin.confirmTypePre} “${data.currentOrg?.name}” ${t.membersAdmin.confirmTypePost}`} autocomplete="off" />
          <button type="submit" class="btn-danger close-btn" disabled={confirmName.trim() !== data.currentOrg?.name}>{t.membersAdmin.closeOrg}</button>
        </form>
      </div>
    {/if}
  </div>
</div>

<style>
  .page { padding: 24px 28px; }

  /* Header */
  .page-header {
    display: flex; align-items: center; justify-content: space-between;
    gap: 12px; margin-bottom: 18px;
  }
  .page-header-left { display: flex; align-items: center; gap: 10px; }
  .page-title { font-size: 18px; font-weight: 800; color: var(--text-base); letter-spacing: -.025em; margin: 0; }
  .total-badge {
    font-size: 12px; font-weight: 700; color: var(--text-muted);
    background: var(--bg-panel2, var(--bg-base)); border: 1px solid var(--border);
    border-radius: 99px; padding: 1px 9px; line-height: 1.6;
  }

  /* Alerts */
  .alert-success {
    padding: 9px 13px; border-radius: 9px; font-size: 13px; margin-bottom: 14px;
    color: var(--success, #16a34a);
    background: color-mix(in srgb, var(--success, #22c55e) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--success, #22c55e) 28%, transparent);
  }

  /* Invite panel */
  .invite-panel {
    background: var(--bg-panel); border: 1px solid var(--border);
    border-radius: 12px; padding: 16px 18px; margin-bottom: 16px;
  }
  .invite-form { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; }
  .field { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
  .field-grow { flex: 1; min-width: 220px; }
  .field label {
    font-size: 10px; font-weight: 700; text-transform: uppercase;
    letter-spacing: .06em; color: var(--text-subtle);
  }
  .field input, .field select {
    height: 38px; box-sizing: border-box;
    padding: 0 11px; border: 1px solid var(--border); border-radius: 8px;
    background: var(--bg-panel2, var(--bg-base)); font-size: 13px;
    color: var(--text-base); font-family: inherit; outline: none;
    transition: border-color .12s, box-shadow .12s;
  }
  .field input:focus, .field select:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 12%, transparent);
  }
  /* Match the input row height exactly so the button sits inline. */
  .invite-submit {
    flex-shrink: 0; height: 38px; box-sizing: border-box;
    display: inline-flex; align-items: center; padding-top: 0; padding-bottom: 0;
  }

  /* Roster */
  .roster { display: flex; flex-direction: column; gap: 8px; }

  .member {
    display: flex; align-items: center; gap: 14px;
    background: var(--bg-panel); border: 1px solid var(--border);
    border-radius: 12px; padding: 12px 16px;
    transition: border-color .12s, box-shadow .12s;
  }
  .member:hover { border-color: color-mix(in srgb, var(--accent) 40%, var(--border)); box-shadow: var(--shadow-sm); }

  .m-avatar {
    flex-shrink: 0; width: 38px; height: 38px; border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-size: 13px; font-weight: 700; letter-spacing: .02em;
  }
  .invite-avatar {
    background: var(--bg-panel2, var(--bg-base)) !important;
    color: var(--text-subtle); border: 1px dashed var(--border);
  }

  .m-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .m-name-row { display: flex; align-items: center; gap: 8px; }
  .m-name { font-size: 14px; font-weight: 600; color: var(--text-base); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .m-you {
    font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em;
    color: var(--accent); background: var(--accent-dim, color-mix(in srgb, var(--accent) 12%, transparent));
    border-radius: 99px; padding: 1px 7px;
  }
  .m-email { font-size: 12px; color: var(--text-subtle); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .m-joined { font-size: 12px; color: var(--text-subtle); white-space: nowrap; flex-shrink: 0; }

  /* Role control */
  .m-role { display: flex; align-items: center; gap: 7px; flex-shrink: 0; }
  .role-pip { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; background: var(--text-subtle); }
  .role-pip.owner { background: var(--accent); }
  .role-pip.admin { background: #0ea5e9; }
  .role-pip.member { background: var(--text-subtle); }
  .role-select {
    font-size: 12px; font-weight: 600; padding: 5px 9px; border-radius: 8px;
    border: 1px solid var(--border); background: var(--bg-panel2, var(--bg-base));
    color: var(--text-base); font-family: inherit; cursor: pointer;
    transition: border-color .12s;
  }
  .role-select:hover { border-color: color-mix(in srgb, var(--accent) 45%, var(--border)); }
  .role-select:focus { outline: none; border-color: var(--accent); }

  /* Row actions */
  .m-actions { flex-shrink: 0; display: flex; align-items: center; }
  .icon-btn {
    display: flex; align-items: center; justify-content: center;
    width: 32px; height: 32px; border-radius: 8px;
    border: 1px solid var(--border); background: var(--bg-panel);
    color: var(--text-subtle); cursor: pointer; font-family: inherit;
    transition: color .12s, border-color .12s, background .12s;
  }
  .icon-danger:hover {
    color: var(--danger, #ef4444);
    border-color: color-mix(in srgb, var(--danger, #ef4444) 45%, var(--border));
    background: color-mix(in srgb, var(--danger, #ef4444) 7%, transparent);
  }

  .invite-role {
    font-size: 11px; font-weight: 700; text-transform: capitalize;
    color: var(--text-muted); background: var(--bg-panel2, var(--bg-base));
    border: 1px solid var(--border); border-radius: 99px; padding: 2px 10px; flex-shrink: 0;
  }

  /* Section labels */
  .section-label { display: flex; align-items: center; gap: 10px; margin: 30px 0 14px; }
  .section-label h2 { font-size: 14px; font-weight: 700; color: var(--text-base); margin: 0; }
  .danger-label { color: var(--danger, #ef4444); }

  /* Danger zone */
  .danger-card {
    background: var(--bg-panel);
    border: 1px solid color-mix(in srgb, var(--danger, #ef4444) 28%, var(--border));
    border-radius: 12px; padding: 18px 20px;
  }
  .danger-row { display: flex; align-items: center; justify-content: space-between; gap: 24px; }
  .danger-text strong { font-size: 14px; font-weight: 700; color: var(--text-base); }
  .danger-text p { font-size: 12.5px; color: var(--text-muted); margin: 4px 0 0; max-width: 56ch; line-height: 1.5; }
  .danger-divider { height: 1px; background: var(--border); margin: 16px 0; }
  .danger-close { align-items: flex-start; }
  .danger-btn { color: var(--danger, #ef4444); border-color: color-mix(in srgb, var(--danger, #ef4444) 35%, var(--border)); flex-shrink: 0; }
  .danger-btn:hover { background: var(--danger-dim, color-mix(in srgb, var(--danger, #ef4444) 8%, transparent)); }
  .close-form { display: flex; flex-direction: column; gap: 8px; flex-shrink: 0; min-width: 280px; }
  .close-form input {
    font-size: 12.5px; padding: 8px 11px; border: 1px solid var(--border); border-radius: 8px;
    background: var(--bg-panel2, var(--bg-base)); font-family: inherit; color: var(--text-base);
  }
  .close-form input:focus { outline: none; border-color: var(--danger, #ef4444); }
  .close-btn:disabled { opacity: .5; cursor: not-allowed; }

  /* Responsive */
  @media (max-width: 720px) {
    .page { padding: 20px 16px; }
    .member { flex-wrap: wrap; gap: 10px 12px; }
    .m-joined { order: 5; width: 100%; margin-left: 52px; }
    .danger-row, .danger-close { flex-direction: column; align-items: stretch; gap: 14px; }
    .close-form { min-width: 0; }
  }
</style>
