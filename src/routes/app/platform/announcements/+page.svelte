<script lang="ts">
  import { pageTitle } from '$lib/page-title';
  import { enhance } from '$app/forms';
  import type { PageData, ActionData } from './$types';
  import { t, getLocale } from '$lib/i18n.svelte';
  import { confirmFirst } from '$lib/forms';
  import { formatDateTime, formatDate } from '$lib/format';
  let { data, form }: { data: PageData; form: ActionData } = $props();

  let level = $state('info');
  let audience = $state<'all' | 'specific'>('all');
  let selectedOrgs = $state<string[]>([]);
  let emailCopy = $state(false);
  let body = $state('');
  let title = $state('');
  let expires = $state('');
  let orgQuery = $state('');
  let editId = $state<string | null>(null);

  const LEVELS = $derived([
    { id: 'info', label: t.platformMisc.levelInfo, hint: t.platformMisc.levelInfoHint },
    { id: 'success', label: t.platformMisc.levelResolved, hint: t.platformMisc.levelResolvedHint },
    { id: 'warning', label: t.platformMisc.levelWarning, hint: t.platformMisc.levelWarningHint },
    { id: 'error', label: t.platformMisc.levelMajor, hint: t.platformMisc.levelMajorHint },
  ]);
  const levelLabel = (id: string) => LEVELS.find((l) => l.id === id)?.label ?? id;

  function toggleOrg(id: string) {
    selectedOrgs = selectedOrgs.includes(id) ? selectedOrgs.filter((o) => o !== id) : [...selectedOrgs, id];
  }

  // 60+ organisations, several with the same name: filter by name or subdomain, and
  // show the subdomain on each chip so two "Sála" orgs can be told apart.
  const filteredOrgs = $derived.by(() => {
    const q = orgQuery.trim().toLowerCase();
    if (!q) return data.orgs;
    return data.orgs.filter((o) => o.name.toLowerCase().includes(q) || o.slug.toLowerCase().includes(q));
  });

  const today = new Date().toISOString().slice(0, 10);
  const dateOnly = (v: string | null) => (v ? v.slice(0, 10) : '');

  const createdMessage = $derived.by(() => {
    if (!form || !('created' in form) || !form.created) return null;
    const e = form.emails;
    if (!e) return { ok: true, text: t.platformMisc.announcementPublished };
    if (e.delivered === 0 && e.failed > 0) return { ok: false, text: t.platformMisc.announcementEmailAllFailed };
    return { ok: e.failed === 0, text: t.platformMisc.announcementEmailResult(e.delivered, e.failed) };
  });
</script>

<svelte:head><title>{pageTitle(t.platformMisc.announcementsHeadTitle)}</title></svelte:head>

{#snippet preview(lvl: string, ttl: string, txt: string)}
  <div class="pv ann-row row-{lvl}">
    <div class="row-main">
      <div class="row-head">
        <span class="row-level level-{lvl}">{levelLabel(lvl)}</span>
        <strong>{ttl}</strong>
      </div>
      <p class="row-body">{txt}</p>
      <div class="row-meta">{t.accountExtra.announcementSignature}</div>
    </div>
  </div>
{/snippet}

<div class="wrap page">
  <section class="section section--lead">
    <div class="section-head">
      <p class="eyebrow">{t.platformOrgs.platformAdmin}</p>
      <h1>{t.platformMisc.announcementsTitle}</h1>
      <p>{t.platformMisc.announcementsSub}</p>
    </div>

    {#if createdMessage}
      <div class={createdMessage.ok ? 'alert-success' : 'alert-err'} role="status">{createdMessage.text}</div>
    {/if}
    {#if form && 'updated' in form && form.updated}
      <div class="alert-success" role="status">{t.platformMisc.announcementUpdated}</div>
    {/if}
    {#if form && 'error' in form && form.error && !('editId' in form && form.editId)}<div class="alert-err" role="alert">{form.error}</div>{/if}

    <form method="POST" action="?/create" class="compose" use:enhance={() => async ({ result, update }) => {
      await update({ reset: false });
      if (result.type === 'success') {
        title = ''; body = ''; audience = 'all'; selectedOrgs = []; emailCopy = false; level = 'info'; expires = ''; orgQuery = '';
      }
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
        <textarea id="body" name="body" bind:value={body} rows="4" maxlength="4000" placeholder={t.platformMisc.messagePlaceholder}></textarea>
      </div>

      <div class="field">
        <label class="lbl" for="expires">{t.platformMisc.expiresLabel}</label>
        <input id="expires" class="date-input" name="expires" type="date" min={today} bind:value={expires} />
        <span class="muted small">{t.platformMisc.expiresHint}</span>
      </div>

      <div class="field">
        <span class="lbl">{t.platformMisc.audience}</span>
        <div class="aud">
          <label class="aud-opt"><input type="radio" name="audience" value="all" bind:group={audience} /> {t.platformMisc.allOrganizations}</label>
          <label class="aud-opt"><input type="radio" name="audience" value="specific" bind:group={audience} /> {t.platformMisc.specificOrganizations}</label>
        </div>
        {#if audience === 'all'}
          <span class="muted small">{t.platformMisc.allOrgsNote}</span>
        {:else}
          <div class="org-search">
            <input type="search" class="search-input" bind:value={orgQuery} placeholder={t.platformMisc.searchOrgs} aria-label={t.platformMisc.searchOrgs} />
            <span class="muted small">{t.platformMisc.selectedCount(selectedOrgs.length)}</span>
          </div>
          <!-- Selected orgs stay in the form even when the filter hides their chip. -->
          {#each selectedOrgs as id (id)}<input type="hidden" name="orgIds" value={id} />{/each}
          <div class="orgs">
            {#each filteredOrgs as o (o.id)}
              <label class="org-chip" class:on={selectedOrgs.includes(o.id)}>
                <input type="checkbox" checked={selectedOrgs.includes(o.id)} onchange={() => toggleOrg(o.id)} />
                {o.name} <span class="chip-slug">{o.slug}</span>
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

      {#if title.trim() || body.trim()}
        <div class="field">
          <span class="lbl">{t.platformMisc.previewLabel}</span>
          <span class="muted small">{t.platformMisc.previewHint}</span>
          {@render preview(level, title, body)}
        </div>
      {/if}

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
        {#each data.announcements as a (a.id)}
          <div class="row-item ann-row row-{a.level}" class:is-expired={a.expired}>
            {#if editId === a.id}
              <form method="POST" action="?/update" class="compose edit-form" use:enhance={() => async ({ result, update }) => {
                await update({ reset: false });
                if (result.type === 'success') editId = null;
              }}>
                <input type="hidden" name="id" value={a.id} />
                {#if form && 'editId' in form && form.editId === a.id && form.error}
                  <div class="alert-err" role="alert">{form.error}</div>
                {/if}
                <div class="field">
                  <label class="lbl" for="lvl-{a.id}">{t.platformMisc.level}</label>
                  <select id="lvl-{a.id}" name="level" class="select-input" value={a.level}>
                    {#each LEVELS as l}<option value={l.id}>{l.label}</option>{/each}
                  </select>
                </div>
                <div class="field">
                  <label class="lbl" for="ttl-{a.id}">{t.platformMisc.titleLabel}</label>
                  <input id="ttl-{a.id}" class="text-input" name="title" value={a.title} maxlength="120" required />
                </div>
                <div class="field">
                  <label class="lbl" for="bdy-{a.id}">{t.platformMisc.messageLabel}</label>
                  <textarea id="bdy-{a.id}" name="body" rows="4" maxlength="4000" required>{a.body}</textarea>
                </div>
                <div class="field">
                  <label class="lbl" for="exp-{a.id}">{t.platformMisc.expiresLabel}</label>
                  <input id="exp-{a.id}" class="date-input" name="expires" type="date" value={dateOnly(a.expires_at)} />
                </div>
                <div class="edit-actions">
                  <button type="submit" class="btn-action btn-sm">{t.platformMisc.saveAnnouncement}</button>
                  <button type="button" class="btn-outline btn-sm" onclick={() => (editId = null)}>{t.common.cancel}</button>
                </div>
              </form>
            {:else}
              <div class="row-main">
                <div class="row-head">
                  <span class="row-level level-{a.level}">{levelLabel(a.level)}</span>
                  <strong>{a.title}</strong>
                </div>
                <p class="row-body">{a.body}</p>
                <div class="row-meta">
                  {a.audience === 'all' ? t.platformMisc.allOrgs : `${a.target_count} ${t.platformMisc.orgsCount}`}
                  {#if a.audience === 'all'}({a.target_count}){/if}
                  · {a.read_count} {t.platformMisc.readCount}
                  {#if a.emails_delivered != null}
                    · <span class:warn={!!a.emails_failed}>{t.platformMisc.emailsTag(a.emails_delivered, a.emails_failed ?? 0)}</span>
                  {:else if a.email_sent}· {t.platformMisc.emailedTag}{/if}
                  · {formatDateTime(a.created_at, getLocale())}
                  {#if a.updated_at}· {t.platformMisc.editedTag}{/if}
                  {#if a.expires_at}
                    · {a.expired ? t.platformMisc.expiredTag : t.platformMisc.expiresTag(formatDate(dateOnly(a.expires_at), getLocale()))}
                  {/if}
                </div>
              </div>
              <button type="button" class="edit" onclick={() => (editId = a.id)}>{t.platformMisc.editAnnouncement}</button>
              <form method="POST" action="?/delete" use:enhance={confirmFirst(() => t.platformMisc.confirmDeleteAnnouncement)}>
                <input type="hidden" name="id" value={a.id} />
                <button type="submit" class="del" title={t.platformMisc.deleteTitle} aria-label={t.platformMisc.deleteTitle}>✕</button>
              </form>
            {/if}
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
  .edit { background: none; border: none; color: var(--text-muted); cursor: pointer; font: inherit; font-size: 12px; padding: 2px 6px; border-radius: var(--radius-sm); }
  .edit:hover { color: var(--accent-ink); background: var(--bg-hover); }
  .ann-row.is-expired .row-main { opacity: .6; }
  .edit-form { flex: 1; min-width: 0; }
  .edit-actions { display: flex; gap: 8px; }
  .pv { padding: 12px 14px; border: 1px dashed var(--border); border-radius: var(--radius-sm); display: flex; }
  .small { font-size: 11.5px; }
  .warn { color: var(--danger); }
  .chip-slug { font-weight: 400; color: var(--text-subtle); margin-left: 4px; }
  .org-search { display: flex; align-items: center; gap: 12px; margin-top: 6px; flex-wrap: wrap; }
  .date-input, .search-input, .select-input, .text-input {
    height: 36px; box-sizing: border-box; padding: 0 11px; border: 1px solid var(--border); border-radius: var(--radius-sm);
    background: var(--bg-panel2); color: var(--text-base); font: inherit; font-size: 13px;
  }
  .date-input { max-width: 200px; }
  .search-input { flex: 1; min-width: 200px; max-width: 360px; }
  .select-input { max-width: 220px; }
  .text-input { width: 100%; }

  .empty-state { display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; }
  .empty-state .muted { margin: 0; }
  .muted { color: var(--text-muted); font-size: 13px; }
  .alert-success { padding: 10px 14px; border-radius: var(--radius-sm); font-size: 13px; margin-bottom: 16px; color: var(--success); background: var(--success-dim); border: 1px solid color-mix(in srgb, var(--success) 25%, transparent); }
  .alert-err { padding: 10px 14px; border-radius: var(--radius-sm); font-size: 13px; margin-bottom: 16px; color: var(--danger); background: var(--danger-dim); border: 1px solid color-mix(in srgb, var(--danger) 25%, transparent); }
</style>
