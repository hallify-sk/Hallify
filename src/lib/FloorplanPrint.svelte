<script lang="ts">
	import { zoneDisplayLabel, type FloorData, type TableObj, type Guest, type Point } from '$lib/floorplan-types';
	import { t as tr } from '$lib/i18n.svelte';
	import { roomOutlinePath, roomParts } from '$lib/floorplan-geometry';

	interface Props {
		floor: FloorData;
		guests: Guest[];
		/** The name under a table's number; its own label by default. */
		tableLabel?: (t: TableObj, idx: number) => string;
		/** Table numbers across the whole layout (`tableNumbers`), so the plan prints
		 *  the same T1, T2… as the editor. Without it tables are numbered per floor. */
		numbers?: Map<string, number>;
	}
	const { floor, guests, tableLabel = (t: TableObj) => (t.label ?? '').trim(), numbers }: Props = $props();

	const tagOf = (t: TableObj, ti: number) => `T${numbers?.get(t.id) ?? ti + 1}`;

	/** Where a zone's name goes: the middle of its corners, sized to its width. */
	function zoneLabel(points: Point[]): { x: number; y: number; size: number } {
		const xs = points.map((p) => Number(p.x)), ys = points.map((p) => Number(p.y));
		const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
		return {
			x: xs.reduce((a, v) => a + v, 0) / xs.length,
			y: ys.reduce((a, v) => a + v, 0) / ys.length,
			size: Math.max(0.18, Math.min(0.42, w / 8, h / 2.5))
		};
	}

	// ─── Chair geometry (mirrors the editor's localChairs) ────────────────────
	type ChairPos = { x: number; y: number; rot: number };
	const CR = 0.21, TABLE_GAP = 0.06;

	function localChairs(t: TableObj): ChairPos[] {
		const gap = Math.max(0, t.chairSpacing ?? 0.05);
		const step = 2 * CR + gap;
		if (t.shape === 'round') {
			const n = Number(t.chairs) || 0;
			if (n === 0) return [];
			const r = t.radius + TABLE_GAP + CR;
			return Array.from({ length: n }, (_, i) => {
				const a = (i / n) * 2 * Math.PI - Math.PI / 2;
				return { x: Math.cos(a) * r, y: Math.sin(a) * r, rot: 0 };
			});
		}
		const hw = t.width / 2, hh = t.height / 2;
		let topN = Number(t.chairsTop) || 0, botN = Number(t.chairsBottom) || 0;
		let leftN = Number(t.chairsLeft) || 0, rightN = Number(t.chairsRight) || 0;
		if (topN + botN + leftN + rightN === 0) {
			const n = Number(t.chairs) || 0, W = t.width, H = t.height;
			if (W >= H) { topN = Math.ceil(n / 2); botN = n - topN; }
			else { leftN = Math.ceil(n / 2); rightN = n - leftN; }
		}
		const side = (n: number, perp: number, horiz: boolean): ChairPos[] => {
			if (n <= 0) return [];
			const total = n * 2 * CR + (n - 1) * gap;
			const start = -total / 2 + CR;
			return Array.from({ length: n }, (_, i) => ({
				x: horiz ? start + i * step : perp,
				y: horiz ? perp : start + i * step,
				rot: 0
			}));
		};
		return [
			...side(topN, -hh - TABLE_GAP - CR, true),
			...side(botN, hh + TABLE_GAP + CR, true),
			...side(rightN, hw + TABLE_GAP + CR, false),
			...side(leftN, -hw - TABLE_GAP - CR, false)
		];
	}

	function worldChairs(t: TableObj): (ChairPos & { idx: number })[] {
		const a = (t.rotation * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
		return localChairs(t).map((c, idx) => ({
			x: t.x + c.x * cos - c.y * sin,
			y: t.y + c.x * sin + c.y * cos,
			rot: 0, idx
		}));
	}

	// ─── ViewBox: bounding box over walls/zones/tables (+ chairs) ──────────────
	const viewBox = $derived.by(() => {
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		const add = (x: number, y: number) => {
			if (x < minX) minX = x; if (y < minY) minY = y;
			if (x > maxX) maxX = x; if (y > maxY) maxY = y;
		};
		for (const w of floor.walls) for (const p of w.points) add(p.x, p.y);
		for (const z of floor.zones) for (const p of z.points) add(p.x, p.y);
		if (floor.bounds) { add(floor.bounds.x, floor.bounds.y); add(floor.bounds.x + floor.bounds.w, floor.bounds.y + floor.bounds.h); }
		for (const t of floor.tables) {
			for (const c of worldChairs(t)) add(c.x, c.y);
			const r = t.shape === 'round' ? t.radius : Math.max(t.width, t.height) / 2;
			add(t.x - r, t.y - r); add(t.x + r, t.y + r);
		}
		for (const s of floor.seats ?? []) { add(s.x - CR, s.y - CR); add(s.x + CR, s.y + CR); }
		if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 10; maxY = 10; }
		const pad = 0.6;
		return { x: minX - pad, y: minY - pad, w: (maxX - minX) + pad * 2, h: (maxY - minY) + pad * 2 };
	});

	function polyPoints(points: Point[]): string {
		return points.map((p) => `${p.x},${p.y}`).join(' ');
	}

	// Shrink the table name so it fits within the table footprint (metres).
	function labelFont(label: string, t: TableObj): number {
		const avail = (t.shape === 'round' ? t.radius * 2 : t.width) * 0.86;
		const fit = avail / Math.max(1, label.length * 0.55);
		return Math.max(0.13, Math.min(0.3, fit));
	}
</script>

<svg class="fp" viewBox="{viewBox.x} {viewBox.y} {viewBox.w} {viewBox.h}" preserveAspectRatio="xMidYMid meet">
	<!-- bounds -->
	{#if floor.bounds}
		<path d={roomOutlinePath(roomParts(floor))}
			fill="none" stroke="var(--border)" stroke-width="0.03" stroke-dasharray="0.15 0.1" />
	{/if}
	<!-- zones -->
	{#each floor.zones as z}
		<polygon points={polyPoints(z.points)} fill="color-mix(in srgb, var(--text-base) 4%, transparent)"
			stroke="var(--text-subtle)" stroke-width="0.025" />
	{/each}
	<!-- zone names (the stage, the bar…), so staff can find their way on paper -->
	{#each floor.zones as z}
		{#if z.label && z.points.length}
			{@const at = zoneLabel(z.points)}
			<text x={at.x} y={at.y} text-anchor="middle" dominant-baseline="central"
				font-size={at.size} font-weight="600" fill="var(--text-muted)" letter-spacing="0.02">{zoneDisplayLabel(z.label, tr.editor.zoneDefault)}</text>
		{/if}
	{/each}
	<!-- walls (closed filled polygons, matching the editor) -->
	{#each floor.walls as w}
		<polygon points={polyPoints(w.points)} fill="var(--editor-wall)" stroke="var(--text-base)" stroke-width="0.02" stroke-linejoin="round" />
	{/each}
	<!-- tables + numbered chairs -->
	{#each floor.tables as t, ti}
		{@const chairs = worldChairs(t)}
		<g transform="translate({t.x} {t.y}) rotate({t.rotation})">
			{#if t.shape === 'round'}
				<circle cx="0" cy="0" r={t.radius} fill="var(--bg-panel2)" stroke="var(--text-base)" stroke-width="0.035" />
			{:else}
				<rect x={-t.width / 2} y={-t.height / 2} width={t.width} height={t.height}
					fill="var(--bg-panel2)" stroke="var(--text-base)" stroke-width="0.035" />
			{/if}
		</g>
		<!-- Unique table tag (T1, T2…) above the name so same-named tables are distinguishable -->
		{@const tag = tagOf(t, ti)}
		{@const tName = tableLabel(t, ti)}
		{@const nFont = labelFont(tName, t)}
		{@const half = (t.shape === 'round' ? t.radius : t.height / 2)}
		{@const off = tName && tName !== tag ? Math.min(0.26, half * 0.42) : 0}
		<text x={t.x} y={t.y - off} text-anchor="middle" dominant-baseline="central"
			font-size={Math.min(0.42, half * 0.7)} font-weight="650" fill="var(--text-base)">{tag}</text>
		{#if tName && tName !== tag}
			<text x={t.x} y={t.y + off} text-anchor="middle" dominant-baseline="central"
				font-size={Math.min(nFont, half * 0.5)} font-weight="600" fill="var(--text-muted)">{tName}</text>
		{/if}
		<!-- chairs drawn on top so their seat numbers stay legible -->
		{#each chairs as c}
			{@const occupied = !!t.assignments[c.idx]}
			<circle cx={c.x} cy={c.y} r={CR} fill={occupied ? 'var(--text-base)' : 'var(--bg-panel)'} stroke="var(--text-base)" stroke-width="0.02" />
			<text x={c.x} y={c.y} text-anchor="middle" dominant-baseline="central"
				font-size="0.22" font-weight="650" fill={occupied ? 'var(--bg-panel)' : 'var(--text-muted)'}>{c.idx + 1}</text>
		{/each}
	{/each}
	<!-- standalone chairs (numbered, lettered prefix to distinguish from table seats) -->
	{#each floor.seats ?? [] as s, si}
		{@const occupied = !!s.assignment}
		<circle cx={s.x} cy={s.y} r={CR * 1.15} fill={occupied ? 'var(--text-base)' : 'var(--bg-panel)'} stroke="var(--text-base)" stroke-width="0.025" />
		<text x={s.x} y={s.y} text-anchor="middle" dominant-baseline="central"
			font-size="0.2" font-weight="650" fill={occupied ? 'var(--bg-panel)' : 'var(--text-muted)'}>C{si + 1}</text>
	{/each}
</svg>

<style>
	/* This sheet is printed, so it is always ink on paper — never a themed
	   surface. The "paper" light values are pinned here so a dark or warm UI
	   theme cannot invert the plan into pale ink on a white page. Everything
	   above draws through these tokens rather than raw hex. */
	.fp {
		color-scheme: light;

		--text-base:   #202322;
		--text-muted:  #686d68;
		--text-subtle: #878f87;
		--border:      #dfe2dd;
		--bg-panel:    #fefefd;
		--bg-panel2:   #f3f4f0;
		--editor-wall: #3b443c;

		width: 100%;
		height: auto;
		max-height: 220mm;
		background: var(--bg-panel);
		display: block;
	}
</style>
