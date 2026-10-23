<script lang="ts">
	/**
	 * A printable sheet of a floor plan (the hall's own plan, or a template): one page
	 * per floor with the plan and its key figures. The browser's print of the editor
	 * printed the whole app around it; this prints the plan alone.
	 */
	import FloorplanPrint from '$lib/FloorplanPrint.svelte';
	import { tableNumbers, tableTag } from '$lib/floorplan-layout';
	import { roomArea, roomParts, totalChairs } from '$lib/floorplan-geometry';
	import { floorDisplayName, zoneDisplayLabel, type MultiFloorState } from '$lib/floorplan-types';
	import { t, getLocale } from '$lib/i18n.svelte';

	interface Props {
		layout: MultiFloorState;
		title: string;
		subtitle: string;
		backHref: string;
		/** Tables and seats are listed (a template); the hall's own plan has none. */
		showTables?: boolean;
	}
	const { layout, title, subtitle, backHref, showTables = false }: Props = $props();

	const nums = $derived(tableNumbers(layout.floors));
	const num = (n: number) => n.toLocaleString(getLocale() === 'en' ? 'en-GB' : 'sk-SK', { maximumFractionDigits: 1 });

	const floors = $derived(layout.floors.map((f, i) => {
		const parts = roomParts(f);
		const tables = (f.tables ?? []).map((tb) => ({
			id: tb.id, tag: tableTag(nums.get(tb.id)), label: (tb.label ?? '').trim(), seats: totalChairs(tb), note: (tb.note ?? '').trim()
		}));
		return {
			f,
			name: floorDisplayName(f.name, i, t.editor.floorDefault),
			size: f.bounds ? `${num(Number(f.bounds.w))} × ${num(Number(f.bounds.h))} m` : null,
			area: parts.length ? `${num(roomArea(parts))} m²` : null,
			zones: (f.zones ?? []).map((z) => zoneDisplayLabel(z.label, t.editor.zoneDefault)).filter(Boolean),
			tables,
			seats: tables.reduce((n, tb) => n + tb.seats, 0) + (f.seats?.length ?? 0)
		};
	}));
</script>

<div class="plan-page">
	<div class="plan-doc">
		<div class="toolbar no-print">
			<a href={backHref} class="btn-outline btn-sm">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
				{t.common.back}
			</a>
			<span class="toolbar-title">{t.editor.printPlan}</span>
			<button type="button" class="btn-action btn-sm" onclick={() => window.print()}>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
				{t.manifest.print}
			</button>
		</div>

		<header class="doc-head">
			<h1>{title}</h1>
			<div class="doc-meta">{subtitle}</div>
		</header>

		{#each floors as fl (fl.f.id)}
			<section class="floor">
				<div class="floor-head">
					<h2>{fl.name}</h2>
					<span class="floor-stat">
						{#if fl.size}{fl.size}{/if}{#if fl.area}{' '}· {fl.area}{/if}{#if showTables}{' '}· {fl.tables.length} {t.units.tables(fl.tables.length)} · {fl.seats} {t.units.seats(fl.seats)}{/if}
					</span>
				</div>
				<div class="floor-map">
					<FloorplanPrint floor={fl.f} guests={[]} numbers={nums} />
				</div>
				{#if fl.zones.length}
					<p class="facts"><b>{t.editor.zones}:</b> {fl.zones.join(', ')}</p>
				{/if}
				{#if showTables && fl.tables.length}
					<table class="roster">
						<thead><tr><th class="c-seat">{t.manifest.csvTable}</th><th>{t.common.name}</th><th class="c-num">{t.editor.totalSeats}</th><th>{t.manifest.tableNotes}</th></tr></thead>
						<tbody>
							{#each fl.tables as tb (tb.id)}
								<tr><td class="c-seat">{tb.tag}</td><td>{tb.label}</td><td class="c-num">{tb.seats}</td><td class="c-note">{tb.note}</td></tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</section>
		{/each}
	</div>
</div>

<style>
	/* A printable document: always light, like the seating manifest, so it reads the
	   same in dark mode and prints ink on paper. */
	.plan-page {
		--doc-paper: #fefefd; --doc-ink: #202322; --doc-muted: #686d68; --doc-line: #dfe2dd;
		--doc-line-strong: #c9cdc6; --doc-hover: #eef0eb; --doc-warning: #955f10;
		background: var(--doc-paper); min-height: 100vh; color-scheme: light;
	}
	.plan-doc { max-width: 960px; margin: 0 auto; padding: 16px 20px 60px; color: var(--doc-ink); }
	.toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; padding-bottom: 12px; border-bottom: 1px solid var(--doc-line); }
	.toolbar-title { font-size: 14px; font-weight: 600; flex: 1; }
	.toolbar :global(.btn-outline) { color: var(--doc-ink); border: 1px solid var(--doc-line); background: var(--doc-paper); }
	.toolbar :global(.btn-outline:hover) { background: var(--doc-hover); border-color: var(--doc-line-strong); }
	.toolbar :global(.btn-action) { color: var(--accent-contrast); background: var(--accent); border: 1px solid var(--accent); }
	.doc-head h1 { font-size: 22px; font-weight: 650; letter-spacing: -.055em; margin: 0 0 4px; }
	.doc-meta { font-size: 13px; color: var(--doc-muted); }
	.floor { margin-top: 26px; }
	.floor-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; border-bottom: 2px solid var(--doc-ink); padding-bottom: 4px; margin-bottom: 12px; }
	.floor-head h2 { font-size: 17px; font-weight: 650; letter-spacing: -.045em; margin: 0; }
	.floor-stat { font-size: 12px; font-weight: 600; color: var(--doc-muted); }
	.floor-map { border: 1px solid var(--doc-line); border-radius: var(--radius); padding: 8px; margin-bottom: 12px; }
	.facts { font-size: 12px; margin: 0 0 10px; }
	.facts b { font-weight: 650; }
	.roster { width: 100%; border-collapse: collapse; font-size: 12.5px; }
	.roster th { text-align: left; font-size: 10px; font-weight: 650; text-transform: uppercase; letter-spacing: .13em; color: var(--doc-muted); padding: 6px 8px; border-bottom: 2px solid var(--doc-ink); }
	.roster td { padding: 6px 8px; border-bottom: 1px solid var(--doc-line); vertical-align: top; }
	.c-seat { width: 62px; font-weight: 650; }
	.c-num { width: 90px; text-align: right; }
	.c-note { color: var(--doc-warning); }
	@media print {
		:global(html), :global(body) { background: #fff !important; }
		.plan-page { min-height: 0; }
		.no-print { display: none !important; }
		.plan-doc { max-width: none; padding: 0; }
		.floor { break-before: page; margin-top: 0; }
		.floor:first-of-type { break-before: auto; }
		.floor-map { border: none; padding: 0; }
		.roster tr { break-inside: avoid; }
	}
</style>
