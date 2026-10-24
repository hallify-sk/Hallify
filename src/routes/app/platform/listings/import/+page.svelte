<script lang="ts">
  // Bulk import of venues that are not on Hallify. The file is read here, checked on
  // the server (./preview: the form's rules and duplicates), and imported in chunks
  // (./run) so that one request never fetches more than a few photos. The page shows
  // the progress and the outcome of every item, and offers it as CSV or JSON.
  import { pageTitle } from '$lib/page-title';
  import { getLocale, t } from '$lib/i18n.svelte';
  import { downloadCsv } from '$lib/csvExport';
  import { IMPORT_CHUNK, IMPORT_MAX_ITEMS, importResultsCsv, type ImportResult, type PreviewRow } from '$lib/listing-import';
  import ListingNav from '../ListingNav.svelte';

  type Phase = 'pick' | 'checking' | 'preview' | 'importing' | 'done';
  let phase = $state<Phase>('pick');
  let fileError = $state<string | null>(null);
  let runError = $state<string | null>(null);
  let fileName = $state('');
  let items: unknown[] = [];
  let rows = $state<PreviewRow[]>([]);
  let results = $state<Record<number, ImportResult>>({});
  let done = $state(0);
  let input = $state<HTMLInputElement | null>(null);

  const ready = $derived(rows.filter((r) => r.status === 'ok'));
  const counts = $derived({
    ok: ready.length,
    duplicate: rows.filter((r) => r.status === 'duplicate').length,
    invalid: rows.filter((r) => r.status === 'invalid').length,
  });

  /** Every item's outcome, the preview's verdict standing in for those never sent. */
  const outcome = $derived(rows.map((r): ImportResult => results[r.index] ?? {
    index: r.index, name: r.name, hall_id: null, photo: null, reason: r.reason,
    status: r.status === 'duplicate' ? 'duplicate' : 'failed',
  }));
  const finalCounts = $derived({
    created: outcome.filter((r) => r.status === 'created').length,
    skipped: outcome.filter((r) => r.status === 'duplicate').length,
    failed: outcome.filter((r) => r.status === 'failed').length,
  });

  async function message(res: Response): Promise<string> {
    try { return ((await res.json()) as { message?: string }).message ?? `HTTP ${res.status}`; } catch { return `HTTP ${res.status}`; }
  }

  async function pick(file: File | undefined) {
    fileError = null; runError = null; rows = []; results = {}; done = 0;
    if (!file) return;
    fileName = file.name;
    let parsed: unknown;
    try { parsed = JSON.parse(await file.text()); } catch { fileError = t.listings.importInvalidFile; return; }
    if (!Array.isArray(parsed)) { fileError = t.listings.importInvalidFile; return; }
    if (parsed.length === 0) { fileError = t.listings.importEmpty; return; }
    if (parsed.length > IMPORT_MAX_ITEMS) { fileError = t.listings.importTooMany(IMPORT_MAX_ITEMS); return; }
    items = parsed;
    phase = 'checking';
    try {
      const res = await fetch('/app/platform/listings/import/preview', {
        method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ items }),
      });
      if (!res.ok) { fileError = await message(res); phase = 'pick'; return; }
      rows = ((await res.json()) as { rows: PreviewRow[] }).rows;
      phase = 'preview';
    } catch {
      fileError = t.listings.importStopped; phase = 'pick';
    }
  }

  async function run() {
    const todo = ready.map((r) => ({ index: r.index, item: items[r.index] }));
    phase = 'importing'; runError = null; done = 0;
    for (let at = 0; at < todo.length; at += IMPORT_CHUNK) {
      const entries = todo.slice(at, at + IMPORT_CHUNK);
      try {
        const res = await fetch('/app/platform/listings/import/run', {
          method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ entries }),
        });
        if (!res.ok) { runError = `${t.listings.importStopped} (${await message(res)})`; break; }
        for (const r of ((await res.json()) as { results: ImportResult[] }).results) results[r.index] = r;
      } catch {
        runError = t.listings.importStopped; break;
      }
      done = Math.min(at + entries.length, todo.length);
    }
    phase = 'done';
  }

  function again() {
    phase = 'pick'; rows = []; results = {}; items = []; fileName = ''; fileError = null; runError = null; done = 0;
    if (input) input.value = '';
  }

  const statusLabel = (r: ImportResult) =>
    r.status === 'created' ? t.listings.importStatusCreated : r.status === 'duplicate' ? t.listings.importStatusSkipped : t.listings.importStatusFailed;
  const photoNote = (r: ImportResult) => {
    if (!r.photo || r.photo === 'ok') return '';
    const why = t.listings.importImageErrors[r.photo] + (r.photo_detail ? ` (${r.photo_detail})` : '');
    return t.listings.importPhotoFailed(why);
  };
  const editHref = (r: ImportResult) => (r.hall_id ? `/app/platform/listings/${r.hall_id}` : '');
  const stamp = () => new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');

  function downloadResultCsv() {
    const l = t.listings;
    const csv = importResultsCsv(outcome,
      [l.importColNo, l.importColName, l.importColResult, l.importColStatus, l.editVenue],
      (r) => [String(r.index + 1), r.name, statusLabel(r), [r.reason, photoNote(r)].filter(Boolean).join(' · '), r.hall_id ? `${location.origin}${editHref(r)}` : ''],
      getLocale() === 'en' ? ',' : ';');
    downloadCsv(`hallify-import-${stamp()}.csv`, csv);
  }
  function downloadResultJson() {
    const blob = new Blob([JSON.stringify(outcome.map((r) => ({ ...r, edit_url: r.hall_id ? `${location.origin}${editHref(r)}` : null })), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `hallify-import-${stamp()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }
</script>

<svelte:head><title>{pageTitle(t.listings.importTitle, t.listings.title)}</title></svelte:head>

<div class="wrap page">
  <header class="page-header">
    <div>
      <p class="eyebrow">{t.platformOrgs.platformAdmin}</p>
      <h1 class="page-title">{t.listings.importTitle}</h1>
      <p class="page-lead">{t.listings.importLead}</p>
    </div>
  </header>

  <ListingNav />

  <section class="section section--lead">
    {#if phase === 'pick' || phase === 'checking'}
      <div class="li-pick">
        <label for="li-file" class="li-label">{t.listings.importFile}</label>
        <input id="li-file" type="file" accept=".json,application/json" bind:this={input}
          disabled={phase === 'checking'} onchange={(e) => pick(e.currentTarget.files?.[0])} />
        <p class="hint">{t.listings.importFileHint}</p>
        {#if phase === 'checking'}<p class="hint" role="status">{t.listings.importChecking}</p>{/if}
        {#if fileError}<div class="li-error" role="alert">{fileError}</div>{/if}
      </div>
    {:else}
      <div class="li-bar">
        <span class="li-file">{fileName}</span>
        {#if phase === 'preview'}
          <span class="li-summary">{t.listings.importSummary(counts.ok, counts.duplicate, counts.invalid)}</span>
          <span class="li-actions">
            <button type="button" class="btn-outline btn-sm" onclick={again}>{t.listings.importOtherFile}</button>
            <button type="button" class="btn-action btn-sm" disabled={counts.ok === 0} onclick={run}>{t.listings.importRun(counts.ok)}</button>
          </span>
        {:else if phase === 'importing'}
          <span class="li-summary" role="status" aria-live="polite">{t.listings.importProgress(done, ready.length)}</span>
          <progress max={ready.length} value={done}></progress>
        {:else}
          <span class="li-summary" role="status">{t.listings.importDone(finalCounts.created, finalCounts.skipped, finalCounts.failed)}</span>
          <span class="li-actions">
            <button type="button" class="btn-outline btn-sm" onclick={downloadResultCsv}>{t.listings.importDownloadCsv}</button>
            <button type="button" class="btn-outline btn-sm" onclick={downloadResultJson}>{t.listings.importDownloadJson}</button>
            <button type="button" class="btn-outline btn-sm" onclick={again}>{t.listings.importOtherFile}</button>
          </span>
        {/if}
      </div>
      {#if runError}<div class="li-error" role="alert">{runError}</div>{/if}

      <div class="pf-table row-list" role="table" aria-label={t.listings.importTitle}>
        <div role="row" class="row-item row-head li-row">
          <span role="columnheader" class="num">{t.listings.importColNo}</span>
          <span role="columnheader">{t.listings.importColName}</span>
          <span role="columnheader">{t.listings.importColCity}</span>
          <span role="columnheader" class="num">{t.listings.importColCapacity}</span>
          <span role="columnheader">{t.listings.importColWebsite}</span>
          <span role="columnheader">{t.listings.importColPhoto}</span>
          <span role="columnheader">{phase === 'preview' ? t.listings.importColStatus : t.listings.importColResult}</span>
        </div>
        {#each rows as r (r.index)}
          {@const res = results[r.index]}
          <div role="row" class="row-item li-row" class:is-dim={r.status !== 'ok'}>
            <span role="cell" class="num li-no">{r.index + 1}</span>
            <span role="cell" class="cell-main"><span class="cell-title">{r.name || '—'}</span></span>
            <span role="cell" class="cell-sub">{r.city || '—'}</span>
            <span role="cell" class="num">{r.max_people || '—'}</span>
            <span role="cell" class="cell-sub li-break">{r.website || '—'}</span>
            <span role="cell" class="cell-sub li-break">{r.photo_host ?? t.listings.importNoPhoto}</span>
            <span role="cell" class="li-status">
              {#if res}
                <span class="pf-tag" data-tone={res.status === 'created' ? 'success' : res.status === 'failed' ? 'danger' : 'warning'}>{statusLabel(res)}</span>
                {#if res.hall_id}<a class="li-edit" href={editHref(res)} target="_blank" rel="noopener">{t.listings.editVenue}</a>{/if}
                {#if res.reason}<span class="li-reason">{res.reason}</span>{/if}
                {#if photoNote(res)}<span class="li-reason li-warn">{photoNote(res)}</span>{/if}
              {:else if r.status === 'ok'}
                <span class="pf-tag" data-tone="success">{t.listings.importStatusOk}</span>
              {:else}
                <span class="pf-tag" data-tone={r.status === 'invalid' ? 'danger' : 'warning'}>{r.status === 'duplicate' ? t.listings.importStatusDuplicate : t.listings.importStatusInvalid}</span>
                {#if r.reason}<span class="li-reason">{r.reason}</span>{/if}
              {/if}
            </span>
          </div>
        {/each}
      </div>
    {/if}
  </section>
</div>

<style>
  .li-pick { display: grid; gap: 8px; max-width: 640px; }
  .li-label { font-size: 12px; font-weight: 600; color: var(--text-muted); }
  .hint { font-size: 12px; color: var(--text-muted); margin: 0; line-height: 1.5; }
  .li-error { padding: 10px 12px; border-radius: var(--radius-sm); background: color-mix(in srgb, var(--danger) 10%, transparent); color: var(--danger); font-size: 13px; margin: 0 0 12px; }
  .li-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; margin: 0 0 14px; }
  .li-file { font-weight: 600; font-size: 13px; }
  .li-summary { font-size: 13px; color: var(--text-muted); flex: 1 1 260px; }
  .li-actions { display: inline-flex; gap: 8px; flex-wrap: wrap; }
  .li-bar progress { flex: 1 1 200px; height: 8px; accent-color: var(--accent); }
  .li-row {
    display: grid;
    grid-template-columns: 36px minmax(150px, 2fr) minmax(90px, 1fr) 80px minmax(130px, 1.4fr) minmax(110px, 1.1fr) minmax(170px, 1.6fr);
    gap: 12px; align-items: start;
  }
  .li-no { color: var(--text-muted); }
  .li-break { overflow-wrap: anywhere; }
  .li-status { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; }
  .li-reason { flex-basis: 100%; font-size: 12px; color: var(--text-muted); line-height: 1.4; }
  .li-warn { color: var(--warning); }
  .li-edit { font-size: 12px; }
  @container (max-width: 760px) {
    .li-row.row-head { display: none; }
    .li-row { grid-template-columns: 28px minmax(0, 1fr) auto; row-gap: 4px; }
    .li-row > :nth-child(n + 3) { grid-column: 2 / -1; }
  }
</style>
