<script lang="ts">
	import FloorplanPrint from '$lib/FloorplanPrint.svelte';
	import type { TableObj, Guest } from '$lib/floorplan-types';
	import { seatingManifestCsv, downloadCsv, fileSlug } from '$lib/csvExport';
	import { t, getLocale } from '$lib/i18n.svelte';
	import type { PageData } from './$types';

	interface Props { data: PageData; }
	const { data }: Props = $props();

	const guestById = new Map<string, Guest>(data.layout.guests.map((g) => [g.id, g]));

	function tableLabel(t: TableObj, i: number): string {
		return (t.label ?? '').trim() || `T${i + 1}`;
	}

	function fullName(g: Guest): string {
		return `${g.lastName}, ${g.firstName}`.replace(/^,\s*/, '').trim();
	}

	function exportCsv() {
		downloadCsv(`seating-${fileSlug(data.reservation.title)}.csv`, seatingManifestCsv(floors));
	}

	function fmtDate(d: string) {
		return new Date(d).toLocaleDateString(getLocale() === 'en' ? 'en-GB' : 'sk-SK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
	}

	// Per-floor breakdown: tables with their seated guests, plus a floor-level
	// roll-up of every note/allergy so staff can scan one box per floor.
	const floors = $derived(data.layout.floors.map((f, fi) => {
		const tables = f.tables.map((t, ti) => {
			const seats = t.assignments
				.map((gid, idx) => ({ idx, guest: gid ? guestById.get(gid) ?? null : null }))
				.filter((s) => s.guest);
			// Unique tag (T1, T2…) so two tables with the same name stay distinguishable.
			return { tag: `T${ti + 1}`, label: tableLabel(t, ti), total: t.assignments.length, seats };
		});
		// Standalone chairs (concert-style seating, not attached to a table)
		const standalone = (f.seats ?? [])
			.map((s, i) => ({ idx: i, guest: s.assignment ? guestById.get(s.assignment) ?? null : null }))
			.filter((s) => s.guest);

		const seatedIds = new Set<string>();
		for (const t of f.tables) for (const a of t.assignments) if (a) seatedIds.add(a);
		for (const s of f.seats ?? []) if (s.assignment) seatedIds.add(s.assignment);
		const seatedCount = seatedIds.size;
		const totalSeats = f.tables.reduce((n, t) => n + t.assignments.length, 0) + (f.seats?.length ?? 0);
		return { name: f.name || `Floor ${fi + 1}`, idx: fi, tables, standalone, seatedCount, totalSeats, floor: f };
	}));
</script>

<svelte:head><title>{data.reservation.title} — {t.manifest.seatingManifest}</title></svelte:head>

<div class="manifest-page">
<div class="manifest">
	<div class="toolbar no-print">
		<a href="/halls/my-reservations/{data.reservation.id}" class="btn-outline btn-sm">
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
			{t.common.back}
		</a>
		<span class="toolbar-title">{t.manifest.seatingManifest}</span>
		<div class="toolbar-actions">
			<button class="btn-outline btn-sm" onclick={exportCsv}>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
				{t.manifest.exportCsv}
			</button>
			<button class="btn-action btn-sm" onclick={() => window.print()}>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
				{t.manifest.print}
			</button>
		</div>
	</div>

	<header class="doc-head">
		<h1>{data.reservation.title}</h1>
		<div class="doc-meta">
			<span>{fmtDate(data.reservation.event_date)}</span>
			{#if data.reservation.start_time}<span>· {data.reservation.start_time}{#if data.reservation.end_time}–{data.reservation.end_time}{/if}</span>{/if}
			<span>· {data.reservation.hall_name}</span>
		</div>
	</header>

	{#each floors as fl}
		<section class="floor">
			<div class="floor-head">
				<h2>{fl.name}</h2>
				<span class="floor-stat">{fl.seatedCount} / {fl.totalSeats} {t.manifest.seated}</span>
			</div>

			<div class="floor-map">
				<FloorplanPrint floor={fl.floor} guests={data.layout.guests} {tableLabel} />
			</div>

			<div class="legend-key">
				<span class="key-item"><span class="dot dot-filled"></span> {t.manifest.occupiedSeat}</span>
				<span class="key-item"><span class="dot dot-empty"></span> {t.manifest.emptySeat}</span>
				<span class="key-item">{t.manifest.seatNumbersMatch} <b>{t.manifest.seat}</b> {t.manifest.columnOverleaf}</span>
			</div>

			<!-- ── Check-in roster (starts a fresh page when printed) ── -->
			<div class="roster-wrap">
				<h3 class="roster-title">{fl.name} — {t.manifest.checkInList}</h3>

				{#if fl.seatedCount === 0}
					<p class="roster-empty">{t.manifest.noGuestsSeated}</p>
				{:else}
					<table class="roster">
						<thead>
							<tr>
								<th class="c-chk">✓</th>
								<th class="c-seat">{t.manifest.seat}</th>
								<th>{t.manifest.guest}</th>
								<th>{t.manifest.group}</th>
								<th>{t.manifest.notesAllergies}</th>
							</tr>
						</thead>
						<tbody>
							{#each fl.tables as tbl}
								{#if tbl.seats.length}
									<tr class="grp"><td colspan="5"><span class="grp-tag">{tbl.tag}</span> {tbl.label}</td></tr>
									{#each tbl.seats as s}
										<tr>
											<td class="c-chk"><span class="chk"></span></td>
											<td class="c-seat">{tbl.tag}·{s.idx + 1}</td>
											<td class="c-name">{s.guest ? fullName(s.guest) : ''}</td>
											<td class="c-grp">{s.guest?.group ?? ''}</td>
											<td class="c-note">{s.guest?.note ?? ''}</td>
										</tr>
									{/each}
								{/if}
							{/each}
							{#if fl.standalone.length}
								<tr class="grp"><td colspan="5">{t.manifest.standaloneChairs}</td></tr>
								{#each fl.standalone as s}
									<tr>
										<td class="c-chk"><span class="chk"></span></td>
										<td class="c-seat">C{s.idx + 1}</td>
										<td class="c-name">{s.guest ? fullName(s.guest) : ''}</td>
										<td class="c-grp">{s.guest?.group ?? ''}</td>
										<td class="c-note">{s.guest?.note ?? ''}</td>
									</tr>
								{/each}
							{/if}
						</tbody>
					</table>
				{/if}
			</div>
		</section>
	{/each}
</div>
</div>

<style>
	/* The manifest is a printable document: always light, theme-independent, so it
	   reads the same in dark mode and prints ink-on-white to save toner. It therefore
	   cannot follow [data-theme]; instead it pins the light "paper" values of the
	   neutral tokens onto its own subtree, and everything below writes in var(--…)
	   as usual. The accent tokens are deliberately NOT pinned — a white-label org's
	   brand colour should still reach the screen-only toolbar. */
	.manifest-page {
		--bg-panel:      #fefefd;
		--bg-panel2:     #f3f4f0;
		--bg-hover:      #eef0eb;
		--border:        #dfe2dd;
		--border-subtle: #eceee9;
		--text-base:     #202322;
		--text-muted:    #686d68;
		--text-subtle:   #878f87;
		--warning:       #955f10;
		/* <FloorplanPrint> draws its walls with var(--editor-wall); in the dark theme
		   that token inverts to a pale #9aa89c, which would all but disappear on this
		   white sheet. Pin the light-paper value with the other neutrals. */
		--editor-wall:   #3b443c;
		background: var(--bg-panel); min-height: 100vh; color-scheme: light;
	}
	.manifest { max-width: 960px; margin: 0 auto; padding: 20px 24px 64px; color: var(--text-base); }

	.toolbar {
		display: flex; align-items: center; gap: 12px; margin-bottom: 20px;
		padding-bottom: 14px; border-bottom: 1px solid var(--border);
	}
	.toolbar-title { font-size: 14px; font-weight: 600; flex: 1; color: var(--text-base); }
	.toolbar-actions { display: flex; gap: 8px; }
	/* The pinned tokens above already force these controls light; the rules remain so
	   the toolbar keeps its own paper surface rather than the page background. */
	.toolbar :global(.btn-outline) { color: var(--text-base); border: 1px solid var(--border); background: var(--bg-panel); }
	.toolbar :global(.btn-outline:hover) { background: var(--bg-hover); }
	.toolbar :global(.btn-action) { color: var(--accent-contrast); background: var(--accent); border: 1px solid var(--accent); }
	.toolbar :global(.btn-action:hover) { background: var(--accent-hover); }

	.doc-head { margin-bottom: 10px; }
	.doc-head h1 { font-size: 26px; font-weight: 550; letter-spacing: -.055em; line-height: 1.08; margin: 0 0 6px; }
	.doc-meta { font-size: 13px; color: var(--text-muted); display: flex; gap: 6px; flex-wrap: wrap; }

	.floor { margin-top: 30px; }
	.floor-head { display: flex; align-items: baseline; justify-content: space-between; border-bottom: 2px solid var(--text-base); padding-bottom: 6px; margin-bottom: 14px; }
	.floor-head h2 { font-size: 20px; font-weight: 550; letter-spacing: -.045em; line-height: 1.14; margin: 0; }
	.floor-stat { font-size: 12px; font-weight: 600; color: var(--text-muted); }

	.floor-map {
		border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 10px;
		background: var(--bg-panel); margin-bottom: 16px;
	}

	.legend-key { display: flex; gap: 16px; font-size: 11px; color: var(--text-muted); margin-bottom: 14px; }
	.key-item { display: inline-flex; align-items: center; gap: 5px; }
	/* <b> would otherwise take the UA bold (700 in Chrome, bolder/900 in Firefox). */
	.key-item b { font-weight: 650; }
	.dot { width: 11px; height: 11px; border-radius: 50%; border: 1.5px solid var(--text-base); display: inline-block; }
	.dot-filled { background: var(--text-base); }
	.dot-empty { background: var(--bg-panel); }

	/* ── Check-in roster table ── */
	.roster-title { font-size: 16px; font-weight: 600; letter-spacing: -.03em; margin: 0 0 14px; }
	.roster-empty { font-size: 13px; color: var(--text-muted); font-style: italic; }
	.roster { width: 100%; border-collapse: collapse; font-size: 12.5px; color: var(--text-base); line-height: 1.4; }
	/* Eyebrow metrics on the column heads, but muted ink rather than --accent-ink:
	   this sheet is printed and read at a glance, so it stays monochrome. */
	.roster th {
		text-align: left; font-size: 10px; font-weight: 650; text-transform: uppercase;
		letter-spacing: .13em; color: var(--text-muted); padding: 7px 8px;
		border-bottom: 2px solid var(--text-base);
	}
	.roster td { padding: 7px 8px; border-bottom: 1px solid var(--border); vertical-align: top; }
	.roster tr.grp td {
		background: var(--bg-panel2); font-weight: 650; font-size: 12px;
		border-bottom: 1px solid var(--border); padding: 6px 8px;
	}
	.c-chk { width: 30px; text-align: center; }
	.c-seat { width: 62px; font-weight: 650; white-space: nowrap; }
	.grp-tag {
		display: inline-block; min-width: 22px; text-align: center;
		padding: 0 6px; margin-right: 5px; border-radius: var(--radius-sm);
		border: 1.5px solid var(--text-base); color: var(--text-base); font-size: 11px; font-weight: 650;
	}
	.c-name { font-weight: 600; }
	.c-grp { color: var(--text-muted); }
	.c-note { color: var(--warning); }
	/* Radius held at 4px: a 15px box at --radius-sm would round into a circle and
	   stop reading as something to tick. */
	.chk {
		display: inline-block; width: 15px; height: 15px;
		border: 1.5px solid var(--text-subtle); border-radius: 3px;
	}

	@media print {
		/* html/body sit outside .manifest-page, so they cannot read the pinned paper
		   tokens — on paper the sheet is literally white. */
		:global(html), :global(body) { background: #fff !important; }
		.manifest-page { min-height: 0; }
		.no-print { display: none !important; }
		.manifest { max-width: none; padding: 0; }
		.floor { break-before: page; margin-top: 0; }
		.floor:first-of-type { break-before: auto; }
		.floor-map { border: none; padding: 0; }
		/* Map fills page one; the roster begins on the next page. */
		.roster-wrap { break-before: page; }
		.roster tr.grp td { background: var(--bg-panel2) !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
		.roster tr, .roster tr.grp { break-inside: avoid; }
	}
</style>
