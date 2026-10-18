<script lang="ts">
  import { enhance } from '$app/forms';
  import { getLocale, t } from '$lib/i18n.svelte';
  import { ELEVATED, PERMISSION_GROUPS, type Permission } from '$lib/permissions';
  import type { PageData, ActionData } from './$types';
  let { data, form }: { data: PageData; form: ActionData } = $props();

  // One member's permission panel at a time: three stacked tri-state editors would
  // bury the roster they belong to.
  let openId = $state<string | null>(null);
  const toggle = (id: string) => (openId = openId === id ? null : id);

  function initials(first: string, last: string) {
    return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase();
  }

  // Stable per-person avatar tint from the user id. The tints are declared on
  // .page below — deep paper-language inks, each one dark enough that the
  // white initials on top of it stay readable in every theme.
  const AV_COLORS = [
    'var(--tint-rose)', 'var(--tint-blue)', 'var(--tint-green)', 'var(--tint-amber)',
    'var(--tint-red)', 'var(--tint-violet)', 'var(--tint-teal)'
  ];
  function avColor(seed: string) {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return AV_COLORS[h % AV_COLORS.length];
  }

  // Dates follow the interface language, the same way the dashboard does it.
  const dateLocale = $derived(getLocale() === 'en' ? 'en-GB' : 'sk-SK');
  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString(dateLocale, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  // A role's colour is free text in the database. Only a plain hex reaches a style
  // attribute; anything else falls back, so a stray value cannot redecorate the page.
  function roleColor(c: string | null) {
    return c && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(c) ? c : 'var(--text-subtle)';
  }

  const roleById = $derived(new Map(data.roles.map((r) => [r.id, r])));
  const groupLabel = (key: string) => (t.peopleArea.permGroups as Record<string, string>)[key] ?? key;
  const grantable = $derived(new Set<string>(data.actor.grantable));

  function overrideState(p: { allow: string[]; deny: string[] }, perm: Permission) {
    if (p.deny.includes(perm)) return 'deny';
    if (p.allow.includes(perm)) return 'allow';
    return 'inherit';
  }
</script>

<svelte:head><title>{t.peopleArea.tabMembers} – Hallify</title></svelte:head>

{#if form?.error}
  <div class="alert-error top-alert">{form.error}</div>
{/if}
{#if form?.message}
  <div class="alert-success top-alert">{form.message}</div>
{/if}

<section class="section section--lead page">
  <div class="section-head section-head--row">
    <div>
      <h2>{t.peopleArea.membersTitle}</h2>
      <p>{t.peopleArea.membersSub}</p>
    </div>
    <span class="total-badge">{data.people.length}</span>
  </div>

  {#if data.people.length === 0}
    <div class="card--inset state-block">
      <span class="icon-tile" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></svg>
      </span>
      <h3>{t.peopleArea.membersEmpty}</h3>
      <p>{t.peopleArea.membersEmptyBody}</p>
    </div>
  {/if}

  <div class="row-list">
    {#each data.people as p (p.userId)}
      <div class="row-item member" class:is-open={openId === p.userId}>
        <div class="m-avatar" style="background:{avColor(p.userId)}">{initials(p.firstName, p.lastName)}</div>

        <div class="m-info">
          <div class="m-name-row">
            <span class="m-name">{p.firstName} {p.lastName}</span>
            {#if p.isMe}<span class="m-you">{t.peopleArea.you}</span>{/if}
            {#if p.isOwner}<span class="m-owner">{t.peopleArea.owner}</span>{/if}
          </div>
          <span class="m-email">{p.email}</span>
        </div>

        <div class="m-roles">
          {#if p.isOwner}
            <!-- The owner is not a role and holds no role rows; saying what they
                 have beats an empty gap that reads as "nothing configured". -->
            <span class="m-allperms" title={t.peopleArea.ownerNote}>{t.peopleArea.allPermissions}</span>
          {:else if p.roleIds.length === 0}
            <span class="m-norole">{t.peopleArea.noRoles}</span>
          {:else}
            {#each p.roleIds as rid (rid)}
              {@const role = roleById.get(rid)}
              {#if role}
                <span class="role-chip">
                  <span class="role-dot" style="background:{roleColor(role.color)}"></span>
                  {role.name}
                  {#if role.isDefault}<span class="role-def">{t.peopleArea.defaultRole}</span>{/if}
                </span>
              {/if}
            {/each}
          {/if}
        </div>

        <span class="m-joined">{t.peopleArea.joined} {fmtDate(p.joinedAt)}</span>

        {#if p.canManage}
          <form method="POST" action="?/changeRole" class="m-access" use:enhance>
            <input type="hidden" name="user_id" value={p.userId} />
            <span class="role-pip" class:admin={p.legacyRole === 'admin'}></span>
            <select
              name="role"
              class="role-select"
              aria-label={t.peopleArea.accessLevel}
              title={t.peopleArea.accessLevelHint}
              onchange={(e) => (e.currentTarget as HTMLSelectElement).form?.requestSubmit()}
            >
              <option value="admin" selected={p.legacyRole === 'admin'}>{t.membersAdmin.roleAdmin}</option>
              <option value="member" selected={p.legacyRole === 'member'}>{t.membersAdmin.roleMember}</option>
            </select>
          </form>
        {:else}
          <span class="m-access-static">
            {p.legacyRole === 'owner'
              ? t.membersAdmin.roleOwner
              : p.legacyRole === 'admin'
                ? t.membersAdmin.roleAdmin
                : t.membersAdmin.roleMember}
          </span>
        {/if}

        <div class="m-actions">
          <button
            type="button"
            class="btn-outline btn-sm"
            aria-expanded={openId === p.userId}
            onclick={() => toggle(p.userId)}
          >{openId === p.userId ? t.peopleArea.hide : t.peopleArea.details}</button>

          {#if p.canManage}
            <form method="POST" action="?/remove" use:enhance>
              <input type="hidden" name="user_id" value={p.userId} />
              <button type="submit" class="icon-btn icon-danger" title={t.peopleArea.removeMember}
                onclick={(e) => { if (!confirm(t.peopleArea.confirmRemove)) e.preventDefault(); }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
              </button>
            </form>
          {/if}
        </div>
      </div>

      {#if openId === p.userId}
        <div class="panel card--inset">
          <!-- What this person can actually do. Computed with effectivePermissions on
               the server, so it is the same answer the guards will give. -->
          <div class="panel-block">
            <div class="panel-head">
              <h3>{t.peopleArea.effectiveTitle}</h3>
              <span class="count">{t.peopleArea.effectiveCount(p.effective.length, data.totalPermissions)}</span>
            </div>
            <p class="hint">{t.peopleArea.effectiveSub}</p>
            {#if p.isOwner}
              <p class="owner-note">{t.peopleArea.ownerNote}</p>
            {:else if p.effective.length === 0}
              <p class="hint">{t.peopleArea.effectiveNone}</p>
            {/if}
            <div class="eff-list">
              {#each p.effective as perm (perm)}
                <span class="eff-chip" class:eff-chip--allow={p.allow.includes(perm)}>
                  {t.peopleArea.perm[perm]}
                </span>
              {/each}
            </div>
          </div>

          {#if !p.isOwner && !p.canManage}
            <p class="panel-note">{t.peopleArea.cannotManage}</p>
          {/if}

          {#if !p.isOwner && p.canManage}
            <!-- Roles ------------------------------------------------------- -->
            <form method="POST" action="?/setRoles" class="panel-block" use:enhance>
              <input type="hidden" name="user_id" value={p.userId} />
              <div class="panel-head"><h3>{t.peopleArea.assignRoles}</h3></div>
              <p class="hint">{t.peopleArea.assignRolesHint}</p>

              {#if data.roles.filter((r) => !r.isDefault).length === 0}
                <p class="hint">{t.peopleArea.noAssignableRoles}</p>
              {:else}
                <div class="role-picks">
                  {#each data.roles.filter((r) => !r.isDefault) as role (role.id)}
                    <label class="role-pick" class:locked={!role.assignable}>
                      <input
                        type="checkbox"
                        name="role_ids"
                        value={role.id}
                        checked={p.explicitRoleIds.includes(role.id)}
                        disabled={!role.assignable}
                      />
                      <span class="role-dot" style="background:{roleColor(role.color)}"></span>
                      <span class="role-pick-name">{role.name}</span>
                      {#if !role.assignable}
                        <span class="lock" title={t.peopleArea.errors.roleOutranksYou}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="11" width="16" height="10" rx="1"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
                        </span>
                      {/if}
                    </label>
                  {/each}
                </div>
              {/if}
              <button type="submit" class="btn-action btn-sm">{t.peopleArea.saveRoles}</button>
            </form>

            <!-- Per-member overrides ---------------------------------------- -->
            <form method="POST" action="?/setOverrides" class="panel-block" use:enhance>
              <input type="hidden" name="user_id" value={p.userId} />
              <div class="panel-head"><h3>{t.peopleArea.overridesTitle}</h3></div>
              <p class="hint">{t.peopleArea.overridesSub}</p>

              {#each PERMISSION_GROUPS as group (group.key)}
                <div class="perm-group">
                  <p class="perm-group-name">{groupLabel(group.key)}</p>
                  {#each group.permissions as perm (perm)}
                    {@const state = overrideState(p, perm)}
                    {@const editable = grantable.has(perm)}
                    <div class="perm-row" class:locked={!editable}>
                      <div class="perm-label">
                        <span class="perm-name">
                          {t.peopleArea.perm[perm]}
                          {#if ELEVATED.includes(perm)}
                            <span class="tag-elev" title={t.peopleArea.elevatedHint}>{t.peopleArea.elevated}</span>
                          {/if}
                        </span>
                        <span class="perm-sub">
                          {p.inherited.includes(perm) ? t.peopleArea.inheritedYes : t.peopleArea.inheritedNo}
                          {#if !editable} · {t.peopleArea.lockedHint}{/if}
                        </span>
                      </div>

                      <!-- Three states, not a checkbox: "off" and "denied" are
                           different answers, and only one of them survives a role
                           being added later. -->
                      <div class="tri" role="radiogroup" aria-label={t.peopleArea.perm[perm]}>
                        <label class="tri-opt tri-inherit">
                          <input type="radio" name="p:{perm}" value="inherit" checked={state === 'inherit'} disabled={!editable} />
                          <span>{t.peopleArea.stateInherit}</span>
                        </label>
                        <label class="tri-opt tri-allow">
                          <input type="radio" name="p:{perm}" value="allow" checked={state === 'allow'} disabled={!editable} />
                          <span>{t.peopleArea.stateAllow}</span>
                        </label>
                        <label class="tri-opt tri-deny">
                          <input type="radio" name="p:{perm}" value="deny" checked={state === 'deny'} disabled={!editable} />
                          <span>{t.peopleArea.stateDeny}</span>
                        </label>
                      </div>
                    </div>
                  {/each}
                </div>
              {/each}

              <button type="submit" class="btn-action btn-sm">{t.peopleArea.saveOverrides}</button>
            </form>
          {/if}
        </div>
      {/if}
    {/each}
  </div>
</section>

<style>
  .page {
    /* Roster tints — deep fills that hold white text, so they do not flip with the
       theme. Deliberately NOT --accent-ink: that token is recomputed per-org by the
       branding override, and a frozen copy here would drift from the org's accent. */
    --tint-rose:   #9b2f6b;
    --tint-blue:   #2f5f9e;
    --tint-green:  #2f7a52;
    --tint-amber:  #955f10;
    --tint-red:    #c3362c;
    --tint-violet: #6b4a9e;
    --tint-teal:   #1f6f72;
  }

  .top-alert { margin-top: 16px; }
  .alert-success {
    padding: 9px 13px; border-radius: var(--radius-sm); font-size: 13px; margin: 16px 0 0;
    color: var(--success);
    background: var(--success-dim);
    border: 1px solid color-mix(in srgb, var(--success) 28%, transparent);
  }

  .total-badge {
    font-size: 12px; font-weight: 650; color: var(--text-muted);
    background: var(--bg-panel2, var(--bg-base)); border: 1px solid var(--border);
    border-radius: var(--radius-sm); padding: 1px 9px; line-height: 1.6;
  }

  /* ── Roster row ─────────────────────────────────────────────────────────── */
  .member.is-open { background: var(--bg-hover); border-bottom-color: transparent; }

  .m-avatar {
    flex-shrink: 0; width: 38px; height: 38px; border-radius: var(--radius);
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-size: 13px; font-weight: 650; letter-spacing: .02em;
  }

  .m-info { flex: 1 1 190px; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .m-name-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .m-name { font-size: 14px; font-weight: 600; color: var(--text-base); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .m-you {
    font-size: 10px; font-weight: 650; text-transform: uppercase; letter-spacing: .04em;
    color: var(--accent-ink); background: var(--accent-dim);
    border-radius: var(--radius-sm); padding: 1px 7px;
  }
  /* The owner badge is the one solid accent fill on this page: it must be the thing
     you see first. Text on an accent fill is --accent-contrast, never the pink. */
  .m-owner {
    font-size: 10px; font-weight: 650; text-transform: uppercase; letter-spacing: .04em;
    color: var(--accent-contrast); background: var(--accent);
    border-radius: var(--radius-sm); padding: 1px 7px;
  }
  .m-email { font-size: 12px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .m-roles { display: flex; flex-wrap: wrap; gap: 5px; flex: 1 1 160px; min-width: 0; }
  .m-norole { font-size: 12px; color: var(--text-subtle); }
  .role-chip {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 11px; font-weight: 600; color: var(--text-base);
    background: var(--bg-panel2, var(--bg-base));
    border: 1px solid var(--border); border-radius: var(--radius-sm);
    padding: 2px 8px; white-space: nowrap;
  }
  .m-allperms { font-size: 12px; font-weight: 600; color: var(--text-muted); }
  .role-def { font-size: 10px; font-weight: 600; color: var(--text-subtle); }
  .role-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }

  .m-joined { font-size: 12px; color: var(--text-muted); white-space: nowrap; flex-shrink: 0; }

  .m-access { display: flex; align-items: center; gap: 7px; flex-shrink: 0; }
  .m-access-static { font-size: 12px; font-weight: 600; color: var(--text-muted); flex-shrink: 0; }
  .role-pip { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; background: var(--text-subtle); }
  .role-pip.admin { background: var(--status-blue); }
  .role-select {
    font-size: 12px; font-weight: 600; padding: 5px 9px; border-radius: var(--radius-sm);
    border: 1px solid var(--border); background: var(--bg-panel2, var(--bg-base));
    color: var(--text-base); font-family: inherit; cursor: pointer;
    transition: border-color .15s;
  }
  .role-select:hover { border-color: color-mix(in srgb, var(--accent) 45%, var(--border)); }
  .role-select:focus { outline: none; border-color: var(--accent); }

  .m-actions { flex-shrink: 0; display: flex; align-items: center; gap: 8px; }
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

  /* ── Permission panel ───────────────────────────────────────────────────── */
  .panel {
    padding: 20px;
    margin: 0 calc(var(--row-inset, 10px) * -1) 14px;
    display: flex; flex-direction: column; gap: 22px;
  }
  .panel-block { display: flex; flex-direction: column; gap: 10px; align-items: flex-start; }
  .panel-head { display: flex; align-items: baseline; gap: 10px; }
  .panel-head h3 { font-size: var(--h3-size); font-weight: 600; letter-spacing: -.03em; margin: 0; }
  .count { font-size: 11px; font-weight: 600; color: var(--text-muted); }
  .hint { font-size: 12px; color: var(--text-muted); line-height: 1.6; margin: 0; max-width: 72ch; }
  .panel-note, .owner-note {
    font-size: 12px; color: var(--text-muted); margin: 0;
    background: var(--bg-panel); border: 1px solid var(--border);
    border-radius: var(--radius-sm); padding: 8px 11px;
  }

  .eff-list { display: flex; flex-wrap: wrap; gap: 5px; }
  .eff-chip {
    font-size: 11px; font-weight: 600; color: var(--text-base);
    background: var(--bg-panel); border: 1px solid var(--border);
    border-radius: var(--radius-sm); padding: 2px 8px;
  }
  /* An explicit allow is worth seeing apart from one that came with a role. */
  .eff-chip--allow {
    color: var(--success);
    background: var(--success-dim);
    border-color: color-mix(in srgb, var(--success) 28%, transparent);
  }

  .role-picks { display: flex; flex-wrap: wrap; gap: 6px; }
  .role-pick {
    display: inline-flex; align-items: center; gap: 7px;
    font-size: 12px; font-weight: 600; color: var(--text-base);
    background: var(--bg-panel); border: 1px solid var(--border);
    border-radius: var(--radius-sm); padding: 6px 10px; cursor: pointer;
  }
  .role-pick:hover { border-color: var(--text-subtle); }
  .role-pick.locked { cursor: not-allowed; color: var(--text-subtle); background: transparent; }
  .role-pick input { accent-color: var(--accent); margin: 0; }
  .role-pick-name { white-space: nowrap; }
  .lock { display: inline-flex; color: var(--text-subtle); }

  .perm-group { width: 100%; }
  .perm-group-name {
    font-size: var(--meta-size); font-weight: 600; text-transform: uppercase;
    letter-spacing: .08em; color: var(--text-muted);
    margin: 14px 0 6px; padding-bottom: 6px; border-bottom: 1px solid var(--border);
  }
  .perm-row {
    display: flex; align-items: center; justify-content: space-between; gap: 14px;
    padding: 8px 0; border-bottom: 1px solid var(--border-subtle);
  }
  .perm-row:last-child { border-bottom: none; }
  .perm-label { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .perm-name { font-size: 13px; font-weight: 600; color: var(--text-base); display: flex; align-items: center; gap: 7px; }
  .perm-row.locked .perm-name { color: var(--text-muted); }
  .perm-sub { font-size: 11px; color: var(--text-muted); }
  .tag-elev {
    font-size: 9px; font-weight: 650; text-transform: uppercase; letter-spacing: .08em;
    color: var(--warning); background: var(--warning-dim);
    border: 1px solid color-mix(in srgb, var(--warning) 30%, transparent);
    border-radius: var(--radius-sm); padding: 0 5px;
  }

  /* Tri-state: a square segmented control. The off state is deliberately NOT the
     same shape as the denied state — that is the whole point of the control. */
  .tri {
    display: inline-flex; flex-shrink: 0;
    border: 1px solid var(--border); border-radius: var(--radius-sm);
    background: var(--bg-panel); overflow: hidden;
  }
  .tri-opt { position: relative; display: inline-flex; }
  .tri-opt input {
    position: absolute; inset: 0; opacity: 0; width: 100%; height: 100%;
    margin: 0; cursor: pointer;
  }
  .tri-opt input:disabled { cursor: not-allowed; }
  .tri-opt span {
    display: inline-flex; align-items: center; justify-content: center;
    padding: 5px 11px; font-size: 11px; font-weight: 600;
    color: var(--text-muted); white-space: nowrap;
    border-left: 1px solid var(--border);
  }
  .tri-opt:first-child span { border-left: none; }
  .tri-opt:hover span { background: var(--bg-hover); color: var(--text-base); }
  .tri-opt input:focus-visible + span { outline: 2px solid var(--accent); outline-offset: -2px; }
  /* Driven by :checked, not by a class computed on the server: the segment has to
     light up the moment it is clicked, otherwise the control reads as dead until
     the form is saved — and a tri-state whose state you cannot see is a checkbox. */
  .tri-opt input:checked + span { background: var(--bg-hover); color: var(--text-base); }
  .tri-allow input:checked + span { background: var(--success); color: var(--on-success); }
  .tri-deny input:checked + span { background: var(--danger); color: var(--on-danger); }
  .perm-row.locked .tri { opacity: .72; }

  /* ── Responsive ─────────────────────────────────────────────────────────── */
  @media (max-width: 860px) {
    .member { flex-wrap: wrap; gap: 10px 12px; }
    .m-joined, .m-roles { width: 100%; margin-left: 52px; }
    .perm-row { flex-direction: column; align-items: flex-start; gap: 8px; }
  }
</style>
