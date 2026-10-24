<script lang="ts">
  const { children } = $props();
</script>

<!--
  The platform pages share one header, toolbar, table and badge vocabulary. It is
  the organisation console's (clients, messages): the same page title, total
  badge, filter row and hairline rows, defined once here instead of re-declared
  — slightly differently — on every page. Scoped under .pf so nothing leaks.
-->
<div class="pf">
  {@render children()}
</div>

<style>
  /* ── Page header ── */
  :global(.pf .page) { padding-block: 24px; }
  :global(.pf .back) {
    display: inline-flex; align-items: center; gap: 6px; margin-bottom: 14px;
    font-size: 12.5px; font-weight: 600; color: var(--text-muted); text-decoration: none;
  }
  :global(.pf .back:hover) { color: var(--accent-ink); text-decoration: none; }
  :global(.pf .page-header) {
    display: flex; align-items: flex-end; justify-content: space-between;
    gap: 12px 16px; flex-wrap: wrap; padding-bottom: 18px;
  }
  :global(.pf .page-header .eyebrow) { display: block; margin: 0 0 10px; }
  :global(.pf .page-header-left) { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; min-width: 0; }
  :global(.pf .page-title) {
    font-size: var(--display-size); font-weight: 550; color: var(--text-base);
    letter-spacing: -.055em; line-height: 1.08; margin: 0; overflow-wrap: anywhere;
  }
  :global(.pf .page-lead) { font-size: 13px; line-height: 1.6; color: var(--text-muted); margin: 8px 0 0; max-width: 640px; }
  :global(.pf .page-actions) { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  :global(.pf .total-badge) {
    font-size: 11px; font-weight: 650; padding: 2px 8px; border-radius: 3px;
    background: var(--accent-dim); color: var(--accent-ink); font-variant-numeric: tabular-nums; white-space: nowrap;
  }
  :global(.pf .section-head h2 .total-badge) { vertical-align: middle; margin-left: 6px; letter-spacing: 0; }

  /* ── Filter toolbar (as on /app/manage/clients) ── */
  :global(.pf .list-filters) { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 14px; }
  :global(.pf .list-filters input),
  :global(.pf .list-filters select) {
    width: auto; font: inherit; font-size: 12.5px; padding: 6px 9px; border: 1px solid var(--border);
    border-radius: var(--radius-sm); background: var(--bg-panel); color: var(--text-base);
  }
  :global(.pf .list-filters .lf-search) { flex: 1 1 240px; min-width: 0; max-width: 420px; }
  :global(.pf .lf-clear) { font-size: 12px; font-weight: 600; color: var(--accent-ink); text-decoration: none; }
  :global(.pf .lf-clear:hover) { text-decoration: underline; }
  :global(.pf .lf-count) { margin-left: auto; font-size: 12px; color: var(--text-muted); font-variant-numeric: tabular-nums; white-space: nowrap; }

  /* Chip filters (audit log). */
  :global(.pf .chip-filters) { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 14px; }
  :global(.pf .chip-filters .chip) { text-decoration: none; }

  /* ── Tables: hairline rows; wide ones scroll inside their own box ── */
  :global(.pf .pf-table) { container-type: inline-size; }
  :global(.pf .table-scroll) { overflow-x: auto; overscroll-behavior-x: contain; padding-inline: var(--row-inset, 10px); margin-inline: calc(var(--row-inset, 10px) * -1); }
  :global(.pf .row-item) { font-size: 13px; }
  :global(.pf .row-head > *) { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  :global(.pf .cell-main) { min-width: 0; }
  :global(.pf .cell-title) { font-weight: 600; color: var(--text-base); text-decoration: none; overflow-wrap: anywhere; }
  :global(a.cell-title:hover) { color: var(--accent-ink); text-decoration: none; }
  :global(.pf .cell-sub) { display: block; font-size: 11.5px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  :global(.pf .ellipsis) { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  :global(.pf .muted) { color: var(--text-muted); }
  :global(.pf .num) { text-align: right; font-variant-numeric: tabular-nums; }
  :global(.pf .nowrap) { white-space: nowrap; }
  :global(.pf .mono) { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px; }
  :global(.pf .row-actions) { display: flex; gap: 6px; align-items: center; justify-content: flex-end; flex-wrap: wrap; }
  :global(.pf .row-actions form) { display: contents; }
  :global(.pf .row-actions a) { text-decoration: none; }
  :global(.pf .row-item.is-dim > *:not(.row-actions)) { opacity: .55; }
  :global(.pf .m-label) { display: none; color: var(--text-muted); font-weight: 500; }
  :global(.pf .table-note) { font-size: 12px; color: var(--text-muted); margin: 12px 0 0; }

  /* ── Key/value rows on detail pages ── */
  :global(.pf .kv) { justify-content: space-between; gap: 16px; padding-block: 9px; }
  :global(.pf .kv > .k) { color: var(--text-muted); flex-shrink: 0; }
  :global(.pf .kv > .v) { font-weight: 600; text-align: right; min-width: 0; overflow-wrap: anywhere; }

  /* ── Badges: the StatusBadge pill, for plan / state / level ── */
  :global(.pf .pf-tag) {
    --c: var(--text-muted);
    display: inline-flex; align-items: center; gap: 5px;
    padding: 3px 9px; border-radius: var(--radius-sm);
    font-size: 11px; font-weight: 650; white-space: nowrap; letter-spacing: .01em; line-height: 1.3;
    background: color-mix(in srgb, var(--c) 12%, transparent); color: var(--c);
  }
  :global(.pf .pf-tag[data-tone='success']) { --c: var(--success); }
  :global(.pf .pf-tag[data-tone='warning']) { --c: var(--warning); }
  :global(.pf .pf-tag[data-tone='danger']) { --c: var(--danger); }
  :global(.pf .pf-tag[data-tone='accent']) { --c: var(--accent-ink); }

  /* ── Empty states: .card--inset.state-block, with the copy muted ── */
  :global(.pf .state-block .icon-tile svg) { width: 19px; height: 19px; }

  :global(.pf .sr-only) { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
</style>
