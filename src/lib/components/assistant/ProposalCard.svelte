<script lang="ts">
  /**
   * A change the assistant proposed, as the person approving it sees it. Shared by
   * the assistant page and the floating widget, so the two can never disagree on
   * what Apply is about to do.
   */
  import { t, getLocale } from '$lib/i18n.svelte';

  interface Proposal { id: string; kind: string; status: string; payload: unknown; result: unknown }
  interface Props {
    proposal: Proposal;
    resolving: string | null;
    onresolve: (id: string, action: 'apply' | 'discard') => void;
    /** Narrow surfaces (the widget) show fewer preview rows. */
    compact?: boolean;
  }
  const { proposal: p, resolving, onresolve, compact = false }: Props = $props();

  interface ImportRow {
    line: number; title: string; event_date: string | null; start_time: string | null; end_time: string | null;
    num_guests: number | null; hall_name: string | null; error: string | null;
  }
  const previewRows = $derived(compact ? 12 : 50);
  const dateLocale = $derived(getLocale() === 'en' ? 'en-GB' : 'sk-SK');
  type ProblemKey = keyof typeof t.ai.problems;
  function problemText(code: string): string {
    const [key, detail] = code.split(/:(.*)/s);
    if (key in t.ai.problems) return t.ai.problems[key as ProblemKey] + (detail ? ` (${detail})` : '');
    return code; // a booking rule's own message, already translated by the server
  }
  // ── Hall details ──
  type HallFieldKey = keyof typeof t.ai.hallFields;
  const fieldLabel = (f: string) => (f in t.ai.hallFields ? t.ai.hallFields[f as HallFieldKey] : f);
  const AMENITY_LABEL: Record<string, () => string> = {
    parking: () => t.hallProfile.amenityParking, catering: () => t.hallProfile.amenityCatering,
    av: () => t.hallProfile.amenityAv, wifi: () => t.hallProfile.amenityWifi, ac: () => t.hallProfile.amenityAc,
    accessible: () => t.hallProfile.amenityAccessible, outdoor: () => t.hallProfile.amenityOutdoor,
    stage: () => t.hallProfile.amenityStage, dancefloor: () => t.hallProfile.amenityDancefloor, bar: () => t.hallProfile.amenityBar
  };
  const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  /** A stored value as a person reads it. */
  function showValue(field: string, v: unknown): string {
    if (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) return '—';
    if (field === 'amenities' && Array.isArray(v)) return v.map((k) => AMENITY_LABEL[k]?.() ?? k).join(', ');
    if (field === 'opening_hours' && typeof v === 'object') {
      const h = v as Record<string, { open: boolean; from: string; to: string }>;
      const days = DAYS.filter((d) => h[d]);
      if (!days.length) return '—';
      return days.map((d) => `${t.dayNames[DAYS.indexOf(d)]} ${h[d].open ? `${h[d].from}–${h[d].to}` : t.ai.closed}`).join(', ');
    }
    if (field === 'price_band') return '€'.repeat(Number(v));
    return String(v);
  }

  const fmtM = (n: number) => new Intl.NumberFormat(dateLocale, { maximumFractionDigits: 1 }).format(n);
  const fmtDate = (d: string | null) =>
    d ? new Date(`${d}T00:00:00`).toLocaleDateString(dateLocale, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
</script>

<div class="proposal" class:compact>
  {#if p.kind === 'reservation_import'}
    {@const payload = p.payload as { file: string; rows: ImportRow[] }}
    {@const result = p.result as { created: number; failed: { line: number; title: string; error: string }[] } | null}
    {@const ready = payload.rows.filter((r) => !r.error).length}
    {@const problems = payload.rows.length - ready}
    <div class="proposal-head">
      <strong>{t.ai.importTitle(payload.file)}</strong>
      <span class="chip chip-ok">{t.ai.importReady(ready)}</span>
      {#if problems}<span class="chip chip-warn">{t.ai.importProblems(problems)}</span>{/if}
    </div>
    <div class="proposal-table-wrap">
      <table class="proposal-table">
        <thead>
          <tr>
            <th>{t.ai.colLine}</th><th>{t.ai.colDate}</th><th>{t.ai.colTitle}</th>
            {#if !compact}<th>{t.ai.colHall}</th><th>{t.ai.colTime}</th><th>{t.ai.colGuests}</th>{/if}
            <th>{t.ai.colStatus}</th>
          </tr>
        </thead>
        <tbody>
          {#each payload.rows.slice(0, previewRows) as r (r.line)}
            <tr class:row-bad={r.error}>
              <td class="num">{r.line}</td>
              <td class="nowrap">{fmtDate(r.event_date)}</td>
              <td>{r.title || '—'}</td>
              {#if !compact}
                <td>{r.hall_name ?? '—'}</td>
                <td class="nowrap">{r.start_time ?? ''}{r.end_time ? `–${r.end_time}` : ''}</td>
                <td class="num">{r.num_guests ?? ''}</td>
              {/if}
              <td>{r.error ? problemText(r.error) : t.ai.rowOk}</td>
            </tr>
          {/each}
        </tbody>
      </table>
      {#if payload.rows.length > previewRows}
        <p class="proposal-more">{t.ai.importMore(payload.rows.length - previewRows)}</p>
      {/if}
    </div>

    {#if p.status === 'pending'}
      <div class="proposal-actions">
        <button type="button" class="btn-action btn-sm" disabled={!ready || resolving === p.id} onclick={() => onresolve(p.id, 'apply')}>
          {resolving === p.id ? t.ai.applying : t.ai.apply(ready)}
        </button>
        <button type="button" class="btn-outline btn-sm" disabled={resolving === p.id} onclick={() => onresolve(p.id, 'discard')}>
          {t.ai.discard}
        </button>
      </div>
    {:else if p.status === 'applied' && result}
      <p class="proposal-done">{t.ai.appliedResult(result.created, result.failed.length)}</p>
      {#if result.failed.length}
        <ul class="proposal-failed">
          {#each result.failed as f (f.line)}<li>{t.ai.colLine} {f.line} — {f.title}: {f.error}</li>{/each}
        </ul>
      {/if}
    {:else if p.status === 'discarded'}
      <p class="proposal-done muted">{t.ai.discarded}</p>
    {/if}

  {:else if p.kind === 'hall_update'}
    {@const plan = p.payload as { hallId: string; hallName: string; before: Record<string, unknown>; after: Record<string, unknown>; sources: string[] }}
    {@const result = p.result as { updated?: string[]; stale?: boolean } | null}
    <div class="proposal-head">
      <strong>{t.ai.hallUpdateTitle(plan.hallName)}</strong>
    </div>
    <div class="proposal-table-wrap">
      <table class="proposal-table hall-diff">
        <thead><tr><th>{t.ai.hallUpdateField}</th><th>{t.ai.hallUpdateNow}</th><th>{t.ai.hallUpdateNew}</th></tr></thead>
        <tbody>
          {#each Object.keys(plan.after) as f (f)}
            <tr>
              <td class="nowrap field">{fieldLabel(f)}</td>
              {#if f === 'cover_image_url' || f === 'gallery_images'}
                <!-- Photos are shown as photos: a URL tells nobody whether it is the right hall. -->
                {#each [plan.before[f], plan.after[f]] as v, i}
                  {@const list = (Array.isArray(v) ? v : v ? [v] : []) as string[]}
                  <td class:was-photos={i === 0}>
                    {#if list.length}
                      <span class="thumbs">
                        {#each list as src (src)}<img src={src} alt="" loading="lazy" />{/each}
                      </span>
                    {:else}—{/if}
                  </td>
                {/each}
              {:else}
                <td class="was">{showValue(f, plan.before[f])}</td>
                <td class="new">{showValue(f, plan.after[f])}</td>
              {/if}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    {#if plan.sources?.length}
      <p class="proposal-note sources">
        {t.ai.hallUpdateSources}:
        {#each plan.sources as url, i (url)}{#if i}, {/if}<a href={url} target="_blank" rel="noopener noreferrer">{url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</a>{/each}
      </p>
    {/if}
    {#if 'address' in plan.after}<p class="proposal-note">{t.ai.hallUpdatePinNote}</p>{/if}
    {#if 'cover_image_url' in plan.after || 'gallery_images' in plan.after}<p class="proposal-note warn">{t.ai.hallUpdatePhotoRights}</p>{/if}
    <p class="proposal-note">{t.ai.hallUpdateNote}</p>
    {#if p.status === 'pending'}
      <div class="proposal-actions">
        <button type="button" class="btn-action btn-sm" disabled={resolving === p.id} onclick={() => onresolve(p.id, 'apply')}>
          {resolving === p.id ? t.ai.applying : t.ai.hallUpdateApply}
        </button>
        <button type="button" class="btn-outline btn-sm" disabled={resolving === p.id} onclick={() => onresolve(p.id, 'discard')}>
          {t.ai.discard}
        </button>
      </div>
    {:else if p.status === 'applied'}
      <p class="proposal-done">
        {t.ai.hallUpdateApplied(result?.updated?.length ?? Object.keys(plan.after).length)}
        <a href="/app/manage/halls/{plan.hallId}">{t.ai.openHall} →</a>
      </p>
    {:else}
      <p class="proposal-done muted">{result?.stale ? t.ai.hallUpdateStale : t.ai.discarded}</p>
    {/if}

  {:else if p.kind === 'changes'}
    {@const plan = p.payload as { ops: { type: string; title: string; lines: string[] }[] }}
    {@const result = p.result as { results: { ok: boolean; error?: string }[] } | null}
    {@const okCount = result?.results?.filter((r) => r.ok).length ?? 0}
    <div class="proposal-head">
      <strong>{t.ai.changesTitle(plan.ops.length)}</strong>
    </div>
    <ol class="ops">
      {#each plan.ops as op, i (i)}
        {@const r = result?.results?.[i]}
        <li class:op-ok={r?.ok} class:op-bad={r && !r.ok}>
          <span class="op-mark" aria-hidden="true">{r ? (r.ok ? '✓' : '✕') : i + 1}</span>
          <span class="op-body">
            <strong>{op.title}</strong>
            {#each op.lines as line}<span class="op-line">{line}</span>{/each}
            {#if r && !r.ok && r.error}<span class="op-line op-err">{r.error}</span>{/if}
          </span>
        </li>
      {/each}
    </ol>
    {#if p.status === 'pending'}
      <div class="proposal-actions">
        <button type="button" class="btn-action btn-sm" disabled={resolving === p.id} onclick={() => onresolve(p.id, 'apply')}>
          {resolving === p.id ? t.ai.applying : t.ai.changesApply(plan.ops.length)}
        </button>
        <button type="button" class="btn-outline btn-sm" disabled={resolving === p.id} onclick={() => onresolve(p.id, 'discard')}>
          {t.ai.discard}
        </button>
      </div>
    {:else if p.status === 'applied' && result?.results}
      <p class="proposal-done" class:muted={okCount < plan.ops.length}>{t.ai.changesApplied(okCount, plan.ops.length - okCount)}</p>
    {:else if p.status === 'discarded'}
      <p class="proposal-done muted">{t.ai.discarded}</p>
    {/if}

  {:else if p.kind === 'floorplan'}
    {@const plan = p.payload as {
      hallId: string; hallName: string; replaces: boolean; notes: string; sources: string[];
      walls: { id: string; points: { x: number; y: number }[] }[];
      zones: { id: string; label: string; color: string; points: { x: number; y: number }[] }[];
      size: { w: number; h: number };
    }}
    {@const result = p.result as { stale?: boolean; notSaved?: boolean } | null}
    {@const m = 1}
    <div class="proposal-head">
      <strong>{t.ai.floorplanTitle(plan.hallName)}</strong>
      <span class="chip chip-ok">{t.ai.floorplanSize(fmtM(plan.size.w), fmtM(plan.size.h))}</span>
      <span class="chip chip-info">{t.ai.floorplanCounts(plan.walls.length, plan.zones.length)}</span>
    </div>
    <!-- Drawn as the editor draws it: walls are filled shapes, zones tinted with their label. -->
    <div class="fp-draft">
      <svg viewBox="{1 - m} {1 - m} {plan.size.w + 2 * m} {plan.size.h + 2 * m}" preserveAspectRatio="xMidYMid meet" role="img"
        aria-label={t.ai.floorplanTitle(plan.hallName)}>
        {#each plan.zones as z (z.id)}
          {@const cx = z.points.reduce((s, q) => s + q.x, 0) / z.points.length}
          {@const cy = z.points.reduce((s, q) => s + q.y, 0) / z.points.length}
          <polygon points={z.points.map((q) => `${q.x},${q.y}`).join(' ')} fill={z.color} fill-opacity="0.22" stroke={z.color} stroke-width="0.06" />
          {#if z.label}
            <text x={cx} y={cy} text-anchor="middle" dominant-baseline="middle" font-size={Math.max(0.5, Math.min(plan.size.w, plan.size.h) / 22)}
              font-weight="650" fill={z.color}>{z.label}</text>
          {/if}
        {/each}
        {#each plan.walls as w (w.id)}
          <polygon points={w.points.map((q) => `${q.x},${q.y}`).join(' ')} fill="var(--text-base)" fill-opacity="0.85" />
        {/each}
      </svg>
    </div>
    {#if plan.notes}<p class="proposal-note fp-notes">{plan.notes}</p>{/if}
    {#if plan.sources?.length}
      <p class="proposal-note sources">
        {t.ai.hallUpdateSources}:
        {#each plan.sources as src, i (src)}{#if i}, {/if}{#if /^https?:\/\//.test(src)}<a href={src} target="_blank" rel="noopener noreferrer">{src.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60)}</a>{:else}{src}{/if}{/each}
      </p>
    {/if}
    {#if plan.replaces}<p class="proposal-note warn">{t.ai.floorplanReplaces}</p>{/if}
    {#if p.status === 'pending'}
      <div class="proposal-actions">
        <button type="button" class="btn-action btn-sm" disabled={resolving === p.id} onclick={() => onresolve(p.id, 'apply')}>
          {resolving === p.id ? t.ai.applying : t.ai.floorplanApply}
        </button>
        <a class="btn-outline btn-sm" href="/app/manage/halls/{plan.hallId}/editor?draft={p.id}">{t.ai.viewInEditor}</a>
        <button type="button" class="btn-outline btn-sm" disabled={resolving === p.id} onclick={() => onresolve(p.id, 'discard')}>
          {t.ai.discard}
        </button>
      </div>
    {:else if p.status === 'applied'}
      <p class="proposal-done">
        {t.ai.floorplanApplied}
        <a href="/app/manage/halls/{plan.hallId}/editor">{t.ai.openFloorplan} →</a>
      </p>
    {:else}
      <p class="proposal-done muted">{result?.notSaved ? t.ai.draftNotSaved : result?.stale ? t.ai.floorplanStale : t.ai.discarded}</p>
    {/if}

  {:else if p.kind === 'seating'}
    {@const plan = p.payload as {
      reservationId: string; title: string; keepExisting: boolean; newGuests: unknown[];
      tables: { id: string; label: string; assignments: (string | null)[] }[];
      names: Record<string, string>; unseated: string[]; split?: string[];
    }}
    {@const result = p.result as { seated?: number; stale?: boolean; notSaved?: boolean } | null}
    {@const seated = plan.tables.reduce((n, tb) => n + tb.assignments.filter(Boolean).length, 0)}
    <div class="proposal-head">
      <strong>{t.ai.seatingTitle(plan.title)}</strong>
      <span class="chip chip-ok">{t.ai.seatingSeated(seated)}</span>
      {#if plan.newGuests.length}<span class="chip chip-info">{t.ai.seatingNewGuests(plan.newGuests.length)}</span>{/if}
      {#if plan.unseated.length}<span class="chip chip-warn">{t.ai.seatingUnseated(plan.unseated.length)}</span>{/if}
    </div>
    <p class="proposal-note">{plan.keepExisting ? t.ai.seatingKeep : t.ai.seatingReplace}</p>
    <div class="seat-grid">
      {#each plan.tables.filter((tb) => tb.assignments.some(Boolean)) as tb (tb.id)}
        <div class="seat-table">
          <div class="seat-table-head">
            <span>{tb.label}</span>
            <span class="muted">{tb.assignments.filter(Boolean).length}/{tb.assignments.length}</span>
          </div>
          <ul>
            {#each tb.assignments.filter(Boolean) as gid}<li>{plan.names[gid as string] ?? gid}</li>{/each}
          </ul>
        </div>
      {/each}
    </div>
    {#if plan.unseated.length}
      <p class="proposal-note warn"><strong>{t.ai.seatingUnseatedList}:</strong> {plan.unseated.join(', ')}</p>
    {/if}
    {#if plan.split?.length}
      <p class="proposal-note warn">{t.ai.seatingSplit(plan.split.join(', '))}</p>
    {/if}

    {#if p.status === 'pending'}
      <div class="proposal-actions">
        <button type="button" class="btn-action btn-sm" disabled={resolving === p.id} onclick={() => onresolve(p.id, 'apply')}>
          {resolving === p.id ? t.ai.applying : t.ai.seatingApply}
        </button>
        <a class="btn-outline btn-sm" href="/app/reservation/{plan.reservationId}/layout?draft={p.id}">{t.ai.viewInEditor}</a>
        <button type="button" class="btn-outline btn-sm" disabled={resolving === p.id} onclick={() => onresolve(p.id, 'discard')}>
          {t.ai.discard}
        </button>
      </div>
    {:else if p.status === 'applied'}
      <p class="proposal-done">
        {t.ai.seatingApplied(result?.seated ?? seated)}
        <a href="/app/reservation/{plan.reservationId}/layout">{t.ai.openLayout} →</a>
      </p>
    {:else}
      <p class="proposal-done muted">{result?.notSaved ? t.ai.draftNotSaved : result?.stale ? t.ai.seatingStale : t.ai.discarded}</p>
    {/if}
  {/if}
</div>

<style>
  .proposal {
    align-self: stretch; border: 1px solid var(--border); border-radius: var(--radius);
    padding: 14px 16px; background: var(--bg-panel);
  }
  .proposal.compact { padding: 12px; }
  .muted { color: var(--text-muted); }
  .proposal-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
  .proposal-head strong { font-size: 13px; margin-right: 4px; }
  .chip { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: var(--radius-sm); }
  .chip-ok { background: var(--success-dim); color: var(--success); }
  .chip-warn { background: var(--warning-dim); color: var(--warning); }
  .chip-info { background: var(--accent-dim); color: var(--accent-ink); }
  .proposal-note { margin: 0 0 10px; font-size: 12px; color: var(--text-muted); }
  .proposal-note.warn { margin: 10px 0 0; color: var(--warning); }

  .proposal-table-wrap { max-height: 320px; overflow: auto; border: 1px solid var(--border); border-radius: var(--radius-sm); }
  .proposal-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .proposal-table th {
    position: sticky; top: 0; background: var(--bg-panel2, var(--bg-panel)); text-align: left;
    font-weight: 600; color: var(--text-muted); padding: 6px 8px; border-bottom: 1px solid var(--border);
  }
  .proposal-table td { padding: 5px 8px; border-bottom: 1px solid var(--border); vertical-align: top; }
  .proposal-table tr:last-child td { border-bottom: none; }
  .proposal-table .row-bad td { background: var(--warning-dim); }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .nowrap { white-space: nowrap; }
  .proposal-more { margin: 0; padding: 6px 8px; font-size: 12px; color: var(--text-muted); }

  .seat-grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 8px;
    max-height: 360px; overflow-y: auto;
  }
  .compact .seat-grid { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); max-height: 260px; }
  .seat-table { border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 8px 10px; }
  .seat-table-head { display: flex; justify-content: space-between; font-size: 12px; font-weight: 650; margin-bottom: 4px; }
  .seat-table ul { list-style: none; margin: 0; padding: 0; font-size: 12px; line-height: 1.6; color: var(--text-base); }

  .proposal-actions { display: flex; gap: 8px; margin-top: 12px; }
  .proposal-done { margin: 12px 0 0; font-size: 13px; font-weight: 600; color: var(--success); }
  .proposal-done.muted { color: var(--text-muted); font-weight: 500; }
  .proposal-done a { margin-left: 8px; color: var(--accent-ink); font-weight: 600; }
  .hall-diff td { line-height: 1.5; }
  .hall-diff .field { font-weight: 600; color: var(--text-muted); }
  .hall-diff .was { color: var(--text-muted); text-decoration: line-through; text-decoration-color: color-mix(in srgb, var(--text-muted) 50%, transparent); }
  .hall-diff .new { color: var(--text-base); }
  .ops { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; max-height: 420px; overflow-y: auto; }
  .ops li {
    display: flex; gap: 10px; align-items: flex-start; padding: 8px 10px;
    border: 1px solid var(--border); border-radius: var(--radius-sm);
  }
  .op-mark {
    flex-shrink: 0; width: 20px; height: 20px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 700; background: var(--bg-hover); color: var(--text-muted);
  }
  .op-ok .op-mark { background: var(--success-dim); color: var(--success); }
  .op-bad .op-mark { background: var(--danger-dim); color: var(--danger); }
  .op-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .op-body strong { font-size: 12.5px; font-weight: 600; }
  .op-line { font-size: 12px; color: var(--text-muted); line-height: 1.45; overflow-wrap: anywhere; }
  .op-err { color: var(--danger); }
  .fp-draft {
    height: 260px; border-radius: var(--radius-sm); overflow: hidden;
    background: var(--editor-canvas, var(--bg-hover)); border: 1px solid var(--border);
  }
  .compact .fp-draft { height: 200px; }
  .fp-draft svg { width: 100%; height: 100%; display: block; }
  .fp-notes { margin-top: 10px; line-height: 1.5; }
  .thumbs { display: flex; flex-wrap: wrap; gap: 4px; }
  .thumbs img { width: 64px; height: 44px; object-fit: cover; border-radius: 3px; border: 1px solid var(--border); }
  .compact .thumbs img { width: 48px; height: 34px; }
  .was-photos { opacity: .55; }
  .sources { margin-top: 10px; word-break: break-word; }
  .sources a { color: var(--accent-ink); }
  .proposal-failed { margin: 6px 0 0; padding-left: 18px; font-size: 12px; color: var(--text-muted); }
</style>
