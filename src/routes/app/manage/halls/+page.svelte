<script lang="ts">
  import { enhance } from '$app/forms';
  import { t } from '$lib/i18n.svelte';
  import type { PageData, ActionData } from './$types';

  interface Props { data: PageData; form: ActionData; }
  const { data, form }: Props = $props();

  let showCreate = $state(false);

  function fmtDate(d: Date | string) {
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  const maxRes = $derived(Math.max(...data.halls.map(h => Number(h.reservation_count)), 1));
</script>

<svelte:head><title>{t.halls.manageHalls} – Hallify</title></svelte:head>

<div class="page">

  <!-- ─── Header ────────────────────────────────────────────────────────────── -->
  <div class="page-header">
    <div>
      <p class="page-overline">{t.nav.halls}</p>
      <h1 class="page-title">{t.halls.manageHalls}</h1>
    </div>
    <button class="btn-primary" type="button" onclick={() => showCreate = !showCreate}>
      {#if showCreate}{t.common.cancel}{:else}+ {t.halls.addHall}{/if}
    </button>
  </div>

  <!-- ─── Create form ───────────────────────────────────────────────────────── -->
  {#if showCreate}
    <div class="card create-card">
      <div class="card-header">
        <h2 class="card-title">{t.hallAdmin.newHall}</h2>
      </div>
      {#if form?.error}
        <p class="form-error">{form.error}</p>
      {/if}
      <form method="POST" action="?/create" class="create-form"
        use:enhance={() => async ({ result, update }) => { await update(); if (result.type === 'success') showCreate = false; }}>
        <div class="field-row">
          <div class="field field-grow">
            <label class="field-label" for="name">{t.halls.hallName} *</label>
            <input class="field-input" id="name" name="name" type="text" placeholder={t.halls.hallNamePlaceholder} required />
          </div>
          <div class="field" style="width:130px">
            <label class="field-label" for="maxPeople">{t.halls.maxGuests}</label>
            <input class="field-input" id="maxPeople" name="maxPeople" type="number" min="1" max="2000" value="100" />
          </div>
          <div class="field color-field">
            <label class="field-label" for="color">{t.halls.hallColor}</label>
            <input class="color-input" id="color" name="color" type="color" value="#4f6ef7" />
          </div>
        </div>
        <div class="field">
          <label class="field-label" for="description">{t.common.description}</label>
          <textarea class="field-input field-textarea" id="description" name="description" rows="2" placeholder={t.hallAdmin.optional}></textarea>
        </div>
        <div class="create-actions">
          <button type="button" class="btn-ghost" onclick={() => showCreate = false}>{t.common.cancel}</button>
          <button type="submit" class="btn-primary">{t.halls.createHall}</button>
        </div>
      </form>
    </div>
  {/if}

  <!-- ─── Empty state ───────────────────────────────────────────────────────── -->
  {#if data.halls.length === 0}
    <div class="empty-state">
      <div class="empty-icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>
        </svg>
      </div>
      <p class="empty-title">{t.hallAdmin.noHallsYet}</p>
      <p class="empty-sub">{t.hallAdmin.noHallsSub}</p>
      <button class="btn-primary" type="button" onclick={() => showCreate = true}>+ {t.halls.addHall}</button>
    </div>

  <!-- ─── Halls table ───────────────────────────────────────────────────────── -->
  {:else}
    <div class="card halls-card">
      <div class="halls-thead">
        <span>{t.dashboard.hall}</span>
        <span>{t.common.capacity}</span>
        <span>{t.hallAdmin.allTimeBookings}</span>
        <span>{t.common.created}</span>
        <span></span>
      </div>
      {#each data.halls as h}
        <div class="halls-row">
          <a href="/app/manage/halls/{h.id}" class="halls-name-cell">
            <span class="halls-strip" style="background:{h.color}"></span>
            <div class="halls-info">
              <span class="halls-name">{h.name}</span>
              {#if h.description}<span class="halls-desc">{h.description}</span>{/if}
            </div>
          </a>

          <span class="halls-cap">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            {h.max_people}
          </span>

          <div class="halls-bar-cell">
            <span class="halls-bar-count">{h.reservation_count}</span>
            <div class="halls-bar-track">
              <div class="halls-bar-fill" style="width:{Math.round(Number(h.reservation_count) / maxRes * 100)}%;background:{h.color}"></div>
            </div>
          </div>

          <span class="halls-created">{fmtDate(h.created_at)}</span>

          <div class="halls-actions">
            <a href="/app/manage/halls/{h.id}" class="btn-manage">{t.hallAdmin.manageAction}</a>
            <form method="POST" action="?/delete" use:enhance style="display:contents">
              <input type="hidden" name="id" value={h.id} />
              <button type="submit" class="btn-delete"
                onclick={(e) => { if (!confirm(`${t.hallAdmin.confirmDeleteHall} "${h.name}"? ${t.hallAdmin.cannotBeUndone}`)) e.preventDefault(); }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
              </button>
            </form>
          </div>
        </div>
      {/each}
    </div>

    <p class="footer-note">{data.halls.length} {data.halls.length === 1 ? t.hallAdmin.hallConfiguredSingular : t.hallAdmin.hallsConfiguredPlural}</p>
  {/if}

</div>

<style>
  @keyframes pageFadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes fadeSlideUp {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .page {
    padding: 24px 28px;
    animation: pageFadeIn 0.15s ease both;
  }

  /* ── Header ── */
  .page-header {
    display: flex; align-items: flex-end; justify-content: space-between;
    margin-bottom: 22px;
    animation: fadeSlideUp 0.35s ease both; animation-delay: 0ms;
  }
  .page-overline {
    font-size: 10px; font-weight: 700; text-transform: uppercase;
    letter-spacing: .08em; color: var(--text-subtle); margin-bottom: 3px;
  }
  .page-title {
    font-size: 22px; font-weight: 800; color: var(--text-base); letter-spacing: -.02em;
  }

  /* ── Buttons ── */
  .btn-primary {
    padding: 8px 18px; border-radius: 8px; font-size: 13px; font-weight: 600;
    background: var(--accent); color: #fff; border: none; cursor: pointer;
    font-family: inherit; transition: opacity .12s; white-space: nowrap;
    text-decoration: none; display: inline-flex; align-items: center;
  }
  .btn-primary:hover { opacity: .88; }
  .btn-ghost {
    padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 500;
    background: none; border: 1px solid var(--border); color: var(--text-muted);
    cursor: pointer; font-family: inherit; transition: border-color .1s, color .1s;
  }
  .btn-ghost:hover { border-color: var(--accent); color: var(--text-base); }

  /* ── Card shell ── */
  .card {
    background: var(--bg-panel); border: 1px solid var(--border); border-radius: 12px;
    overflow: hidden;
  }
  .card-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 18px 12px;
  }
  .card-title { font-size: 13px; font-weight: 700; color: var(--text-base); }

  /* ── Create form ── */
  .create-card {
    margin-bottom: 16px;
    animation: fadeSlideUp 0.3s ease both; animation-delay: 40ms;
  }
  .create-form { padding: 0 18px 18px; }
  .field-row { display: flex; gap: 12px; align-items: flex-end; }
  .field { display: flex; flex-direction: column; gap: 5px; }
  .field-grow { flex: 1; min-width: 0; }
  .field-label {
    font-size: 11px; font-weight: 600; text-transform: uppercase;
    letter-spacing: .05em; color: var(--text-subtle);
  }
  .field-input {
    padding: 8px 10px; border: 1px solid var(--border); border-radius: 7px;
    background: var(--bg-panel2, var(--bg-base)); font-size: 13px;
    color: var(--text-base); font-family: inherit; outline: none;
    transition: border-color .12s;
  }
  .field-input:focus { border-color: var(--accent); }
  .field-textarea { resize: vertical; margin-top: 10px; width: 100%; box-sizing: border-box; }
  .color-field { width: 72px; }
  .color-input {
    width: 48px; height: 36px; border: 1px solid var(--border); border-radius: 7px;
    padding: 2px; background: var(--bg-panel2, var(--bg-base)); cursor: pointer;
  }
  .form-error {
    margin: 0 18px 12px; padding: 8px 12px; background: color-mix(in srgb, var(--danger, #ef4444) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--danger, #ef4444) 25%, transparent);
    border-radius: 7px; font-size: 12px; color: var(--danger, #ef4444);
  }
  .create-actions {
    display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px;
  }

  /* ── Halls table ── */
  .halls-card {
    animation: fadeSlideUp 0.35s ease both; animation-delay: 60ms;
  }
  .halls-thead {
    display: grid;
    grid-template-columns: 1fr 110px 1fr 110px 120px;
    gap: 12px;
    padding: 8px 18px;
    font-size: 10px; font-weight: 700; text-transform: uppercase;
    letter-spacing: .06em; color: var(--text-subtle);
    background: var(--bg-panel2, var(--bg-base));
    border-bottom: 1px solid var(--border);
  }
  .halls-row {
    display: grid;
    grid-template-columns: 1fr 110px 1fr 110px 120px;
    gap: 12px;
    align-items: center;
    border-bottom: 1px solid var(--border-subtle, var(--border));
    transition: background .1s;
  }
  .halls-row:last-child { border-bottom: none; }
  .halls-row:hover { background: var(--bg-hover); }

  .halls-name-cell {
    display: flex; align-items: center; gap: 0;
    text-decoration: none; color: var(--text-base);
    padding: 12px 0 12px 18px; min-width: 0;
  }
  .halls-strip {
    width: 4px; height: 34px; border-radius: 2px; flex-shrink: 0; margin-right: 12px;
  }
  .halls-info { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .halls-name {
    font-size: 13px; font-weight: 600; color: var(--text-base);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .halls-name-cell:hover .halls-name { color: var(--accent); }
  .halls-desc {
    font-size: 11px; color: var(--text-subtle);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }

  .halls-cap {
    display: flex; align-items: center; gap: 5px;
    font-size: 12px; color: var(--text-muted);
  }
  .halls-cap svg { color: var(--text-subtle); flex-shrink: 0; }

  .halls-bar-cell {
    display: flex; align-items: center; gap: 10px;
  }
  .halls-bar-count {
    font-size: 13px; font-weight: 700; color: var(--text-base);
    min-width: 20px; text-align: right; flex-shrink: 0;
  }
  .halls-bar-track {
    flex: 1; height: 6px; background: var(--border); border-radius: 3px; overflow: hidden;
  }
  .halls-bar-fill { height: 6px; border-radius: 3px; transition: width .4s ease; }

  .halls-created { font-size: 11px; color: var(--text-subtle); }

  .halls-actions {
    display: flex; align-items: center; gap: 6px;
    padding-right: 18px; justify-content: flex-end;
  }
  .btn-manage {
    padding: 5px 12px; border-radius: 6px; font-size: 12px; font-weight: 500;
    border: 1px solid var(--border); background: var(--bg-panel);
    color: var(--text-muted); text-decoration: none; white-space: nowrap;
    transition: color .1s, border-color .1s;
  }
  .btn-manage:hover { color: var(--accent); border-color: var(--accent); }
  .btn-delete {
    width: 30px; height: 30px; border-radius: 6px; border: 1px solid var(--border);
    background: var(--bg-panel); color: var(--text-subtle); cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: color .1s, border-color .1s, background .1s;
  }
  .btn-delete:hover {
    color: var(--danger, #ef4444);
    border-color: color-mix(in srgb, var(--danger, #ef4444) 40%, transparent);
    background: color-mix(in srgb, var(--danger, #ef4444) 6%, transparent);
  }

  /* ── Empty state ── */
  .empty-state {
    display: flex; flex-direction: column; align-items: center; gap: 10px;
    padding: 72px 40px; text-align: center;
    animation: fadeSlideUp 0.35s ease both; animation-delay: 60ms;
  }
  .empty-icon {
    width: 56px; height: 56px; border-radius: 14px;
    background: var(--bg-panel); border: 1px solid var(--border);
    display: flex; align-items: center; justify-content: center;
    color: var(--text-subtle); margin-bottom: 4px;
  }
  .empty-title { font-size: 15px; font-weight: 700; color: var(--text-base); margin: 0; }
  .empty-sub { font-size: 13px; color: var(--text-muted); margin: 0 0 6px; max-width: 280px; line-height: 1.5; }

  /* ── Footer ── */
  .footer-note {
    margin-top: 10px; font-size: 11px; color: var(--text-subtle); padding: 0 2px;
    animation: fadeSlideUp 0.35s ease both; animation-delay: 120ms;
  }
</style>
