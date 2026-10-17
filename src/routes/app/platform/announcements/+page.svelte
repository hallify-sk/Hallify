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

<div class="wrap page">
  <section class="section section--lead">
    <div class="section-head">
      <p class="eyebrow">{t.platformOrgs.platformAdmin}</p>
      <h1>{t.platformMisc.announcementsTitle}</h1>
      <p>{t.platformMisc.announcementsSub}</p>
    </div>

    {#if form?.created}
      <div class="alert-success">{form.emailed ? t.platformMisc.announcementPublishedEmailed : t.platformMisc.announcementPublished}</div>
    {/if}
    {#if form?.error}<div class="alert-err">{form.error}</div>{/if}

    <form method="POST" action="?/create" class="compose" use:enhance={() => async ({ update }) => {
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
  </section>

  <section class="section">
    <div class="section-head">
      <p class="eyebrow">{t.platformMisc.announcementsTitle}</p>
      <h2>{t.platformMisc.recent}</h2>
    </div>

    {#if data.announcements.length === 0}
      <div class="card--inset empty-state">
        <div class="icon-tile">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 11l18-8v18l-18-8z"/><path d="M7 13v5a2 2 0 0 0 4 0v-3"/></svg>
        </div>
        <p class="muted">{t.platformMisc.nothingPublished}</p>
      </div>
    {:else}
      <div class="row-list">
        {#each data.announcements as a}
          <div class="row-item ann-row row-{a.level}">
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
  </section>
</div>

<style>
  .page { padding-block: 24px; }
  h1 { font-size: var(--display-size); font-weight: 550; letter-spacing: -.055em; line-height: 1.08; margin: 0; }

  /* ── Compose form: fields on the page, no panel ── */
  .compose { display: flex; flex-direction: column; gap: 16px; }
  .field { display: flex; flex-direction: column; gap: 7px; }
  .lbl { font-size: 10px; font-weight: 650; text-transform: uppercase; letter-spacing: .13em; color: var(--text-muted); }
  #title, #body, textarea {
    width: 100%; box-sizing: border-box; padding: 9px 13px; border: 1px solid var(--border); border-radius: var(--radius-sm);
    background: var(--bg-panel2); color: var(--text-base); font: inherit; font-size: 13px;
    transition: border-color .15s, box-shadow .15s;
  }
  textarea { resize: vertical; line-height: 1.5; }
  input:focus, textarea:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }

  .levels { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }
  .level-opt { display: flex; flex-direction: column; gap: 2px; padding: 10px 13px; border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; transition: background .15s, border-color .15s; }
  .level-opt input { display: none; }
  .level-opt.on { border-color: var(--accent); background: var(--accent-dim); }
  .level-opt.level-warning.on { border-color: var(--warning); background: var(--warning-dim); }
  .level-opt.level-error.on { border-color: var(--danger); background: var(--danger-dim); }
  .level-opt.level-success.on { border-color: var(--success); background: var(--success-dim); }
  .level-name { font-size: 13px; font-weight: 600; color: var(--text-base); }
  .level-hint { font-size: 11px; color: var(--text-muted); }

  .aud { display: flex; gap: 18px; }
  .aud-opt { font-size: 13px; display: flex; align-items: center; gap: 6px; cursor: pointer; }
  .orgs { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 6px; }
  .org-chip { font-size: 12px; font-weight: 600; padding: 6px 13px; border: 1px solid var(--border); border-radius: 3px; cursor: pointer; color: var(--text-muted); transition: background .15s, border-color .15s, color .15s; }
  .org-chip input { display: none; }
  .org-chip.on { border-color: var(--accent); background: var(--accent-dim); color: var(--accent-ink); }

  .email-opt { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-muted); }
  .actions { display: flex; justify-content: flex-end; }

  /* ── Published announcements: hairline rows with a level marker ── */
  .ann-row { align-items: flex-start; gap: 12px; padding-left: 12px; border-left: 2px solid transparent; }
  .row-info { border-left-color: var(--accent); }
  .row-success { border-left-color: var(--success); }
  .row-warning { border-left-color: var(--warning); }
  .row-error { border-left-color: var(--danger); }
  .row-main { flex: 1; min-width: 0; }
  .row-head { display: flex; align-items: center; gap: 8px; }
  .row-level { font-size: 10px; font-weight: 650; text-transform: uppercase; letter-spacing: .03em; padding: 1px 8px; border-radius: 3px; }
  .row-level.level-info { background: var(--accent-dim); color: var(--accent-ink); }
  .row-level.level-success { background: var(--success-dim); color: var(--success); }
  .row-level.level-warning { background: var(--warning-dim); color: var(--warning); }
  .row-level.level-error { background: var(--danger-dim); color: var(--danger); }
  .row-body { font-size: 12.5px; color: var(--text-muted); line-height: 1.6; margin: 5px 0; white-space: pre-wrap; }
  .row-meta { font-size: 11px; color: var(--text-subtle); }
  .del { background: none; border: none; color: var(--text-subtle); cursor: pointer; font-size: 14px; padding: 2px 6px; border-radius: var(--radius-sm); transition: background .15s, color .15s; }
  .del:hover { color: var(--danger); background: var(--danger-dim); }

  .empty-state { display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; }
  .empty-state .muted { margin: 0; }
  .muted { color: var(--text-muted); font-size: 13px; }
  .alert-success { padding: 10px 14px; border-radius: var(--radius-sm); font-size: 13px; margin-bottom: 16px; color: var(--success); background: var(--success-dim); border: 1px solid color-mix(in srgb, var(--success) 25%, transparent); }
  .alert-err { padding: 10px 14px; border-radius: var(--radius-sm); font-size: 13px; margin-bottom: 16px; color: var(--danger); background: var(--danger-dim); border: 1px solid color-mix(in srgb, var(--danger) 25%, transparent); }
</style>
