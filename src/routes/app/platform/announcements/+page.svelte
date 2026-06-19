<script lang="ts">
  import { enhance } from '$app/forms';
  import type { PageData, ActionData } from './$types';
  import { t } from '$lib/i18n.svelte';
  let { data, form }: { data: PageData; form: ActionData } = $props();

  let level = $state('info');
  let audience = $state<'all' | 'specific'>('all');
  let selectedOrgs = $state<string[]>([]);
  let emailCopy = $state(false);
  let body = $state('');
  let title = $state('');

  const LEVELS = $derived([
    { id: 'info', label: t.platformMisc.levelInfo, hint: t.platformMisc.levelInfoHint },
    { id: 'success', label: t.platformMisc.levelResolved, hint: t.platformMisc.levelResolvedHint },
    { id: 'warning', label: t.platformMisc.levelWarning, hint: t.platformMisc.levelWarningHint },
    { id: 'error', label: t.platformMisc.levelMajor, hint: t.platformMisc.levelMajorHint },
  ]);

  function toggleOrg(id: string) {
    selectedOrgs = selectedOrgs.includes(id) ? selectedOrgs.filter((o) => o !== id) : [...selectedOrgs, id];
  }
  function fmtDate(d: string) {
    return new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
</script>

<svelte:head><title>{t.platformMisc.announcementsHeadTitle}</title></svelte:head>

<div class="page">
  <h1>{t.platformMisc.announcementsTitle}</h1>
  <p class="sub">{t.platformMisc.announcementsSub}</p>

  {#if form?.created}
    <div class="alert-success">{form.emailed ? t.platformMisc.announcementPublishedEmailed : t.platformMisc.announcementPublished}</div>
  {/if}
  {#if form?.error}<div class="alert-err">{form.error}</div>{/if}

  <form method="POST" action="?/create" class="card" use:enhance={() => async ({ update }) => {
    await update();
    title = ''; body = ''; audience = 'all'; selectedOrgs = []; emailCopy = false; level = 'info';
  }}>
    <div class="field">
      <span class="lbl">{t.platformMisc.level}</span>
      <div class="levels">
        {#each LEVELS as l}
          <label class="level-opt level-{l.id}" class:on={level === l.id}>
            <input type="radio" name="level" value={l.id} bind:group={level} />
            <span class="level-name">{l.label}</span>
            <span class="level-hint">{l.hint}</span>
          </label>
        {/each}
      </div>
    </div>

    <div class="field">
      <label class="lbl" for="title">{t.platformMisc.titleLabel}</label>
      <input id="title" name="title" bind:value={title} maxlength="120" placeholder={t.platformMisc.titlePlaceholder} />
    </div>

    <div class="field">
      <label class="lbl" for="body">{t.platformMisc.messageLabel}</label>
      <textarea id="body" name="body" bind:value={body} rows="4" placeholder={t.platformMisc.messagePlaceholder}></textarea>
    </div>

    <div class="field">
      <span class="lbl">{t.platformMisc.audience}</span>
      <div class="aud">
        <label class="aud-opt"><input type="radio" name="audience" value="all" bind:group={audience} /> {t.platformMisc.allOrganizations}</label>
        <label class="aud-opt"><input type="radio" name="audience" value="specific" bind:group={audience} /> {t.platformMisc.specificOrganizations}</label>
      </div>
      {#if audience === 'specific'}
        <div class="orgs">
          {#each data.orgs as o}
            <label class="org-chip" class:on={selectedOrgs.includes(o.id)}>
              <input type="checkbox" name="orgIds" value={o.id} checked={selectedOrgs.includes(o.id)} onchange={() => toggleOrg(o.id)} />
              {o.name}
            </label>
          {/each}
          {#if data.orgs.length === 0}<span class="muted">{t.platformMisc.noOrgsYet}</span>{/if}
        </div>
      {/if}
    </div>

    <label class="email-opt">
      <input type="checkbox" name="emailCopy" bind:checked={emailCopy} />
      {t.platformMisc.emailCopyLabel}
    </label>

    <div class="actions">
      <button type="submit" class="btn-action" disabled={!title.trim() || !body.trim() || (audience === 'specific' && selectedOrgs.length === 0)}>
        {t.platformMisc.publishAnnouncement}
      </button>
    </div>
  </form>

  <h2 class="recent-title">{t.platformMisc.recent}</h2>
  {#if data.announcements.length === 0}
    <p class="muted">{t.platformMisc.nothingPublished}</p>
  {:else}
    <div class="list">
      {#each data.announcements as a}
        <div class="row row-{a.level}">
          <div class="row-main">
            <div class="row-head">
              <span class="row-level level-{a.level}">{a.level}</span>
              <strong>{a.title}</strong>
            </div>
            <p class="row-body">{a.body}</p>
            <div class="row-meta">
              {a.audience === 'all' ? t.platformMisc.allOrgs : `${a.target_count} ${t.platformMisc.orgsCount}`}
              · {a.read_count} {t.platformMisc.readCount}
              {#if a.email_sent}· {t.platformMisc.emailedTag}{/if}
              · {fmtDate(a.created_at)}
            </div>
          </div>
          <form method="POST" action="?/delete" use:enhance>
            <input type="hidden" name="id" value={a.id} />
            <button type="submit" class="del" title={t.platformMisc.deleteTitle}
              onclick={(e) => { if (!confirm(t.platformMisc.confirmDeleteAnnouncement)) e.preventDefault(); }}>✕</button>
          </form>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .page { padding: 2rem; }
  h1 { font-size: 1.4rem; margin: 0; }
  .sub { font-size: 13px; color: var(--text-muted); margin: 4px 0 18px; }

  .card { background: var(--bg-panel); border: 1px solid var(--border); border-radius: 14px; padding: 20px; display: flex; flex-direction: column; gap: 16px; }
  .field { display: flex; flex-direction: column; gap: 7px; }
  .lbl { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--text-subtle); }
  #title, #body, textarea {
    width: 100%; box-sizing: border-box; padding: 9px 11px; border: 1px solid var(--border); border-radius: 9px;
    background: var(--bg-panel); color: var(--text-base); font: inherit; font-size: 13px;
  }
  textarea { resize: vertical; line-height: 1.5; }
  input:focus, textarea:focus { outline: none; border-color: var(--accent); }

  .levels { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }
  .level-opt { display: flex; flex-direction: column; gap: 2px; padding: 9px 11px; border: 1px solid var(--border); border-radius: 10px; cursor: pointer; }
  .level-opt input { display: none; }
  .level-opt.on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, transparent); }
  .level-opt.level-warning.on { border-color: #f59e0b; background: color-mix(in srgb, #f59e0b 10%, transparent); }
  .level-opt.level-error.on { border-color: #dc2626; background: color-mix(in srgb, #dc2626 9%, transparent); }
  .level-opt.level-success.on { border-color: #16a34a; background: color-mix(in srgb, #16a34a 9%, transparent); }
  .level-name { font-size: 13px; font-weight: 700; color: var(--text-base); }
  .level-hint { font-size: 11px; color: var(--text-muted); }

  .aud { display: flex; gap: 18px; }
  .aud-opt { font-size: 13px; display: flex; align-items: center; gap: 6px; cursor: pointer; }
  .orgs { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 6px; }
  .org-chip { font-size: 12px; font-weight: 600; padding: 5px 11px; border: 1px solid var(--border); border-radius: 99px; cursor: pointer; color: var(--text-muted); }
  .org-chip input { display: none; }
  .org-chip.on { border-color: var(--accent); background: var(--accent-dim, color-mix(in srgb, var(--accent) 12%, transparent)); color: var(--accent); }

  .email-opt { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-muted); }
  .actions { display: flex; justify-content: flex-end; }

  .recent-title { font-size: 15px; font-weight: 700; margin: 26px 0 12px; }
  .list { display: flex; flex-direction: column; gap: 10px; }
  .row { display: flex; gap: 12px; align-items: flex-start; padding: 14px 16px; background: var(--bg-panel); border: 1px solid var(--border); border-left-width: 3px; border-radius: 12px; }
  .row-info { border-left-color: var(--accent); }
  .row-success { border-left-color: #16a34a; }
  .row-warning { border-left-color: #f59e0b; }
  .row-error { border-left-color: #dc2626; }
  .row-main { flex: 1; min-width: 0; }
  .row-head { display: flex; align-items: center; gap: 8px; }
  .row-level { font-size: 10px; font-weight: 700; text-transform: uppercase; padding: 1px 7px; border-radius: 99px; }
  .row-level.level-info { background: var(--accent-dim, color-mix(in srgb, var(--accent) 14%, transparent)); color: var(--accent); }
  .row-level.level-success { background: color-mix(in srgb, #16a34a 14%, transparent); color: #16a34a; }
  .row-level.level-warning { background: color-mix(in srgb, #f59e0b 16%, transparent); color: #b45309; }
  .row-level.level-error { background: color-mix(in srgb, #dc2626 14%, transparent); color: #dc2626; }
  .row-body { font-size: 12.5px; color: var(--text-muted); line-height: 1.5; margin: 5px 0; white-space: pre-wrap; }
  .row-meta { font-size: 11px; color: var(--text-subtle); }
  .del { background: none; border: none; color: var(--text-subtle); cursor: pointer; font-size: 14px; padding: 2px 6px; border-radius: 6px; }
  .del:hover { color: #dc2626; background: color-mix(in srgb, #dc2626 10%, transparent); }

  .muted { color: var(--text-muted); font-size: 13px; }
  .alert-success { padding: 10px 14px; border-radius: 9px; font-size: 13px; margin-bottom: 16px; color: var(--success, #16a34a); background: color-mix(in srgb, var(--success, #22c55e) 12%, transparent); border: 1px solid color-mix(in srgb, var(--success, #22c55e) 26%, transparent); }
  .alert-err { padding: 10px 14px; border-radius: 9px; font-size: 13px; margin-bottom: 16px; color: #dc2626; background: color-mix(in srgb, #ef4444 10%, transparent); border: 1px solid color-mix(in srgb, #ef4444 26%, transparent); }
</style>
