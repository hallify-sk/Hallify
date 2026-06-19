<script lang="ts">
	import type { FloorData, TableObj, Guest, Point } from '$lib/floorplan-types';

	interface Props {
		floor: FloorData;
		guests: Guest[];
		tableLabel: (t: TableObj, idx: number) => string;
	}
	const { floor, guests, tableLabel }: Props = $props();

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
		<rect x={floor.bounds.x} y={floor.bounds.y} width={floor.bounds.w} height={floor.bounds.h}
			fill="none" stroke="#cbd5e1" stroke-width="0.03" stroke-dasharray="0.15 0.1" />
	{/if}
	<!-- zones -->
	{#each floor.zones as z}
		<polygon points={polyPoints(z.points)} fill="#00000008" stroke="#94a3b8" stroke-width="0.025" />
	{/each}
	<!-- walls (closed filled polygons, matching the editor) -->
	{#each floor.walls as w}
		<polygon points={polyPoints(w.points)} fill="#334155" stroke="#1e293b" stroke-width="0.02" stroke-linejoin="round" />
	{/each}
	<!-- tables + numbered chairs -->
	{#each floor.tables as t, ti}
		{@const chairs = worldChairs(t)}
		<g transform="translate({t.x} {t.y}) rotate({t.rotation})">
			{#if t.shape === 'round'}
				<circle cx="0" cy="0" r={t.radius} fill="#f1f5f9" stroke="#0f172a" stroke-width="0.035" />
			{:else}
				<rect x={-t.width / 2} y={-t.height / 2} width={t.width} height={t.height}
					fill="#f1f5f9" stroke="#0f172a" stroke-width="0.035" />
			{/if}
		</g>
		<!-- Unique table tag (T1, T2…) above the name so same-named tables are distinguishable -->
		{@const tName = tableLabel(t, ti)}
		{@const nFont = labelFont(tName, t)}
		{@const half = (t.shape === 'round' ? t.radius : t.height / 2)}
		{@const off = Math.min(0.26, half * 0.42)}
		<text x={t.x} y={t.y - off} text-anchor="middle" dominant-baseline="central"
			font-size={Math.min(0.42, half * 0.7)} font-weight="800" fill="#0f172a">T{ti + 1}</text>
		<text x={t.x} y={t.y + off} text-anchor="middle" dominant-baseline="central"
			font-size={Math.min(nFont, half * 0.5)} font-weight="600" fill="#475569">{tName}</text>
		<!-- chairs drawn on top so their seat numbers stay legible -->
		{#each chairs as c}
			{@const occupied = !!t.assignments[c.idx]}
			<circle cx={c.x} cy={c.y} r={CR} fill={occupied ? '#1e293b' : '#fff'} stroke="#1e293b" stroke-width="0.02" />
			<text x={c.x} y={c.y} text-anchor="middle" dominant-baseline="central"
				font-size="0.22" font-weight="700" fill={occupied ? '#fff' : '#475569'}>{c.idx + 1}</text>
		{/each}
	{/each}
	<!-- standalone chairs (numbered, lettered prefix to distinguish from table seats) -->
	{#each floor.seats ?? [] as s, si}
		{@const occupied = !!s.assignment}
		<circle cx={s.x} cy={s.y} r={CR * 1.15} fill={occupied ? '#1e293b' : '#fff'} stroke="#1e293b" stroke-width="0.025" />
		<text x={s.x} y={s.y} text-anchor="middle" dominant-baseline="central"
			font-size="0.2" font-weight="700" fill={occupied ? '#fff' : '#475569'}>C{si + 1}</text>
	{/each}
</svg>

<style>
	.fp {
		width: 100%;
		height: auto;
		max-height: 220mm;
		background: #fff;
		display: block;
	}
</style>
