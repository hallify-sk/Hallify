<script lang="ts">
	import { RSVP_ENABLED } from '$lib/features';
	import { migrateToMultiFloor } from '$lib/floorplan-types';
	import { roomOutlinePath, roomParts } from '$lib/floorplan-geometry';
	import type { FloorData, MultiFloorState, WallObj, ZoneObj, TableObj, Guest, Point, TableShape } from '$lib/floorplan-types';

	// ─── Types ────────────────────────────────────────────────────────────────
	type ChairPos   = { x: number; y: number; rot: number };
	type ChairPopover = { tableId: string; chairIdx: number; x: number; y: number };

	interface RsvpEntry { id: string; name: string; email: string | null; created_at: Date }

	interface TableType {
		id: string; name: string; shape: 'rect' | 'round';
		width: number; height: number; radius: number;
		max_chairs: number;
	}

	// ─── Props ────────────────────────────────────────────────────────────────
	interface Props {
		layoutJson: unknown;
		rsvps: RsvpEntry[];
		reservationId: string;
		onsave?: (json: string) => void;
		tableTypes?: TableType[];
	}
	const { layoutJson, rsvps, reservationId, onsave, tableTypes = [] }: Props = $props();

	// RSVP feature is hidden for now — gate the import UI but keep importRsvp()/rsvps wired
	// so it can be re-enabled by flipping this flag.
	const SHOW_RSVP = RSVP_ENABLED; // single switch: $lib/features

	// ─── State (loaded from layoutJson) ──────────────────────────────────────
	let floors = $state<FloorData[]>([]);
	let activeFloorIdx = $state(0);
	// Working copy of active floor's data
	let walls  = $state<WallObj[]>([]);
	let zones  = $state<ZoneObj[]>([]);
	let tables = $state<TableObj[]>([]);
	let guests = $state<Guest[]>([]);

	let zoom  = $state(60);
	let panX  = $state(40);
	let panY  = $state(40);

	let isPanning    = $state(false);
	let chairPopover = $state<ChairPopover | null>(null);
	let guestSearch  = $state('');
	let newFirst     = $state('');
	let newLast      = $state('');
	let activeTab    = $state<'guests'>('guests');

	// Tutorial state — ping-based (localStorage driven)
	let showTutorial = $state(false);
	let activePing = $state<string | null>(null);

	import { onMount } from 'svelte';
	import { t as tr } from '$lib/i18n.svelte';
	import { dialog } from '$lib/actions/dialog';

	onMount(() => {
		if (typeof localStorage !== 'undefined') {
			showTutorial = !localStorage.getItem('hallify_tutorial_seen');
		}
	});

	function dismissTutorial() {
		showTutorial = false;
		activePing = null;
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem('hallify_tutorial_seen', '1');
		}
	}

	function togglePing(id: string) {
		activePing = activePing === id ? null : id;
	}

	// ─── Floor management ─────────────────────────────────────────────────────
	function saveCurrentFloor() {
		floors[activeFloorIdx] = { ...floors[activeFloorIdx], walls, zones, tables };
	}

	function switchFloor(idx: number) {
		if (idx === activeFloorIdx) return;
		saveCurrentFloor();
		activeFloorIdx = idx;
		const f = floors[idx];
		walls = f.walls; zones = f.zones; tables = f.tables;
		chairPopover = null; guestSearch = '';
	}

	// ─── Load layout ──────────────────────────────────────────────────────────
	$effect(() => {
		if (!layoutJson) {
			floors = [{ id: crypto.randomUUID(), name: 'Floor 1', walls: [], zones: [], tables: [], bounds: null }];
			guests = [];
			activeFloorIdx = 0;
			walls = []; zones = []; tables = [];
			return;
		}
		try {
			const raw = typeof layoutJson === 'string' ? JSON.parse(layoutJson) : layoutJson;
			const state = migrateToMultiFloor(raw);
			const f0 = state.floors[0]; // use local var, NOT reactive `floors`
			floors = state.floors;
			guests = state.guests;
			activeFloorIdx = 0;
			walls = f0.walls; zones = f0.zones; tables = f0.tables;
		} catch { /* ignore */ }
	});

	// ─── SVG ref ──────────────────────────────────────────────────────────────
	let svgEl: SVGSVGElement;

	// ─── Coords ───────────────────────────────────────────────────────────────
	const wx = (x: number) => x * zoom + panX;
	const wy = (y: number) => y * zoom + panY;
	const ws = (s: number) => s * zoom;
	const sx = (px: number) => (px - panX) / zoom;
	const sy = (py: number) => (py - panY) / zoom;

	function svgCoords(e: PointerEvent): Point {
		const r = svgEl.getBoundingClientRect();
		return { x: sx(e.clientX - r.left), y: sy(e.clientY - r.top) };
	}

	// ─── Geometry ────────────────────────────────────────────────────────────
	function rotatedCorners(t: TableObj): Point[] {
		const a = (t.rotation * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
		const hw = t.width / 2, hh = t.height / 2;
		return ([ [-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh] ] as [number,number][]).map(([dx,dy]) => ({
			x: t.x + dx * cos - dy * sin, y: t.y + dx * sin + dy * cos
		}));
	}

	// ─── Chair layout ─────────────────────────────────────────────────────────
	function localChairs(t: TableObj): ChairPos[] {
		const CR = 0.21, TABLE_GAP = 0.06;
		const gap  = Math.max(0, t.chairSpacing ?? 0.05);
		const step = 2 * CR + gap;

		if (t.shape === 'round') {
			const n = Number(t.chairs) || 0;
			if (n === 0) return [];
			const r = t.radius + TABLE_GAP + CR;
			return Array.from({ length: n }, (_, i) => {
				const a = (i / n) * 2 * Math.PI - Math.PI / 2;
				return { x: Math.cos(a) * r, y: Math.sin(a) * r, rot: (a * 180 / Math.PI) + 90 };
			});
		}

		const hw = t.width / 2, hh = t.height / 2;
		// Support both new per-side and legacy format
		let topN: number, botN: number, rightN: number, leftN: number;
		if ((t.chairsTop ?? 0) + (t.chairsBottom ?? 0) + (t.chairsLeft ?? 0) + (t.chairsRight ?? 0) > 0) {
			topN = Number(t.chairsTop) || 0; botN = Number(t.chairsBottom) || 0;
			leftN = Number(t.chairsLeft) || 0; rightN = Number(t.chairsRight) || 0;
		} else {
			// Legacy fallback
			const n = Number(t.chairs) || 0;
			const W = t.width, H = t.height;
			if (t.chairsOnShortSide) {
				const P = 2 * (W + H);
				topN = Math.max(0, Math.round(n * W / P));
				botN = Math.max(0, Math.round(n * W / P));
				const rem = n - topN - botN;
				rightN = Math.ceil(rem / 2); leftN = rem - rightN;
			} else if (W >= H) {
				topN = Math.ceil(n/2); botN = n-topN; leftN = 0; rightN = 0;
			} else {
				leftN = Math.ceil(n/2); rightN = n-leftN; topN = 0; botN = 0;
			}
		}

		function sidePlacement(n: number, perp: number, horiz: boolean, rot: number): ChairPos[] {
			if (n <= 0) return [];
			const total = n * 2 * CR + (n - 1) * gap;
			const start = -total / 2 + CR;
			return Array.from({ length: n }, (_, i) => ({
				x: horiz ? start + i * step : perp,
				y: horiz ? perp : start + i * step,
				rot
			}));
		}
		return [
			...sidePlacement(topN,   -hh - TABLE_GAP - CR, true,  180),
			...sidePlacement(botN,    hh + TABLE_GAP + CR, true,  0),
			...sidePlacement(rightN,  hw + TABLE_GAP + CR, false, 270),
			...sidePlacement(leftN,  -hw - TABLE_GAP - CR, false, 90),
		];
	}

	function findClickedChair(t: TableObj, p: Point): number {
		const a = -(t.rotation * Math.PI) / 180;
		const cos = Math.cos(a), sin = Math.sin(a);
		const dx = p.x - t.x, dy = p.y - t.y;
		const lx = dx * cos - dy * sin, ly = dx * sin + dy * cos;
		const CR = 0.21;
		const chairs = localChairs(t);
		for (let i = 0; i < chairs.length; i++) {
			const cdx = lx - chairs[i].x, cdy = ly - chairs[i].y;
			if (Math.sqrt(cdx * cdx + cdy * cdy) <= CR) return i;
		}
		return -1;
	}

	// ─── Surname family normalization (Slovak feminine → masculine root) ──────
	function surnameRoot(surname: string): string {
		let s = surname.trim();
		// Slovak feminine suffixes → masculine: -ová → remove, -á → remove
		// e.g. Hudáková → Hudák, Nováková → Novák, Kováčová → Kováč
		// Horváthová → Horváth, Szabová → Szabo
		if (s.endsWith('ová')) s = s.slice(0, -3);
		else if (s.endsWith('ova')) s = s.slice(0, -3); // without diacritics
		// Handle -á ending for adjective-type surnames: Malá → Malý, Veselá → Veselý
		// But don't strip single-char surnames
		else if (s.length > 2 && s.endsWith('á')) s = s.slice(0, -1) + 'ý';
		return s.toLowerCase();
	}

	// ─── Guest helpers ────────────────────────────────────────────────────────
	function addGuest() {
		const first = newFirst.trim(), last = newLast.trim();
		if (!first || !last) return;
		const root = surnameRoot(last);
		// Auto-set group to match existing guests with same surname root
		const existingGroup = guests.find(g => surnameRoot(g.lastName) === root)?.group;
		guests = [...guests, { id: crypto.randomUUID(), firstName: first, lastName: last, group: existingGroup || last }];
		newFirst = ''; newLast = '';
	}

	function assignGuest(guestId: string) {
		if (!chairPopover) return;
		const { tableId, chairIdx } = chairPopover;
		// Remove guest from ALL floors' tables first
		floors = floors.map((f, fi) => {
			const floorTables = fi === activeFloorIdx ? tables : f.tables;
			const updated = floorTables.map(t => {
				const a = [...t.assignments];
				for (let i = 0; i < a.length; i++) if (a[i] === guestId) a[i] = null;
				return { ...t, assignments: a };
			});
			return fi === activeFloorIdx ? f : { ...f, tables: updated };
		});
		// Now assign on current floor
		tables = tables.map(t => {
			const a = [...t.assignments];
			for (let i = 0; i < a.length; i++) if (a[i] === guestId) a[i] = null;
			if (t.id === tableId) a[chairIdx] = guestId;
			return { ...t, assignments: a };
		});
		chairPopover = null; guestSearch = '';
	}

	function clearChairAssignment() {
		if (!chairPopover) return;
		const { tableId, chairIdx } = chairPopover;
		tables = tables.map(t => {
			if (t.id !== tableId) return t;
			const a = [...t.assignments]; a[chairIdx] = null;
			return { ...t, assignments: a };
		});
		chairPopover = null;
	}

	function importRsvp(rsvp: RsvpEntry) {
		const parts = rsvp.name.trim().split(/\s+/);
		const firstName = parts[0] ?? '';
		const lastName = parts.slice(1).join(' ') || '—';
		const existing = guests.find(g => g.firstName === firstName && g.lastName === lastName);
		if (!existing) {
			const root = surnameRoot(lastName);
			const existingGroup = guests.find(g => surnameRoot(g.lastName) === root)?.group;
			guests = [...guests, { id: crypto.randomUUID(), firstName, lastName, group: existingGroup || lastName }];
		}
	}

	function importAllRsvps() {
		for (const rsvp of rsvps) {
			importRsvp(rsvp);
		}
	}

	// ─── Derived ──────────────────────────────────────────────────────────────
	const assignedIds = $derived(new Set([
		...tables.flatMap(t => t.assignments.filter(Boolean) as string[]),
		...floors.flatMap((f, i) => i === activeFloorIdx ? [] : f.tables.flatMap(t => t.assignments.filter(Boolean) as string[]))
	]));

	// Group RSVPs by surname family
	const groupedRsvps = $derived.by(() => {
		const groups = new Map<string, RsvpEntry[]>();
		for (const r of rsvps) {
			const parts = r.name.trim().split(/\s+/);
			const lastName = parts.slice(1).join(' ') || '—';
			const root = surnameRoot(lastName);
			if (!groups.has(root)) groups.set(root, []);
			groups.get(root)!.push(r);
		}
		return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
	});

	// Group guests by surname family
	const groupedGuests = $derived.by(() => {
		const groups = new Map<string, Guest[]>();
		for (const g of guests) {
			const root = surnameRoot(g.lastName);
			if (!groups.has(root)) groups.set(root, []);
			groups.get(root)!.push(g);
		}
		return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
	});

	const popoverTable = $derived.by(() => {
		const cp = chairPopover;
		return cp ? tables.find(t => t.id === cp.tableId) ?? null : null;
	});
	const popoverChairGuest = $derived.by(() => {
		const cp = chairPopover, pt = popoverTable;
		if (!pt || !cp) return null;
		return guests.find(g => g.id === pt.assignments[cp.chairIdx]) ?? null;
	});
	const filteredPopoverGuests = $derived.by(() => {
		const cp = chairPopover, pt = popoverTable;
		return guests
			.filter(g => {
				const isCurrent = cp && pt ? pt.assignments[cp.chairIdx] === g.id : false;
				return isCurrent || !assignedIds.has(g.id);
			})
			.filter(g => !guestSearch ||
				`${g.firstName} ${g.lastName}`.toLowerCase().includes(guestSearch.toLowerCase()))
			.sort((a, b) => a.lastName.localeCompare(b.lastName));
	});

	const patternX = $derived(((panX % zoom) + zoom) % zoom);
	const patternY = $derived(((panY % zoom) + zoom) % zoom);

	// ─── Events ───────────────────────────────────────────────────────────────
	function onPointerDown(e: PointerEvent) {
		if (e.button === 1 || (e.button === 0 && e.altKey)) {
			e.preventDefault(); isPanning = true; svgEl.setPointerCapture(e.pointerId); return;
		}
		if (e.button !== 0) return;
		if (chairPopover) { chairPopover = null; guestSearch = ''; return; }

		const raw = svgCoords(e);
		for (let i = tables.length - 1; i >= 0; i--) {
			const ci = findClickedChair(tables[i], raw);
			if (ci >= 0) {
				const r = svgEl.getBoundingClientRect();
				chairPopover = { tableId: tables[i].id, chairIdx: ci, x: e.clientX-r.left, y: e.clientY-r.top };
				guestSearch = '';
				return;
			}
		}
	}

	function onPointerMove(e: PointerEvent) {
		if (isPanning) { panX += e.movementX; panY += e.movementY; }
	}

	function onPointerUp(e: PointerEvent) {
		isPanning = false;
		svgEl?.releasePointerCapture(e.pointerId);
	}

	function onWheel(e: WheelEvent) {
		e.preventDefault();
		const r = svgEl.getBoundingClientRect();
		const cx = e.clientX - r.left, cy = e.clientY - r.top;
		const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
		const newZoom = Math.max(15, Math.min(200, zoom * factor));
		panX = cx - (cx - panX) * (newZoom / zoom);
		panY = cy - (cy - panY) * (newZoom / zoom);
		zoom = newZoom;
	}

	function onKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape') { chairPopover = null; guestSearch = ''; }
	}

	// ─── Save ─────────────────────────────────────────────────────────────────
	function saveLayout() {
		saveCurrentFloor();
		const state: MultiFloorState = { version: 2, floors, guests };
		const json = JSON.stringify(state);
		onsave?.(json);
		svgEl?.dispatchEvent(new CustomEvent('layoutsave', { bubbles: true, detail: json }));
	}
</script>

<svelte:window onkeydown={onKeyDown} />

<div class="viewer">
	<!-- Map canvas -->
	<div class="map-area">
		<!-- Floor tabs (only when multiple floors) -->
		{#if floors.length > 1}
			<div class="floor-tabs">
				{#each floors as floor, i}
					<button class="floor-tab" class:active={i === activeFloorIdx}
						onclick={() => switchFloor(i)}>
						{floor.name}
					</button>
				{/each}
			</div>
		{/if}

		<!-- Tutorial pings -->
		{#if showTutorial}
			<!-- Ping on first table area (top-left of canvas) -->
			<div class="ping-container" style="top:50%;left:50%;transform:translate(-50%,-50%)">
				<button class="ping" onclick={() => togglePing('table')} aria-label={tr.components.tableHintLabel}>
					<span class="ping-dot"></span>
					<span class="ping-ring"></span>
				</button>
				{#if activePing === 'table'}
					<div class="ping-tooltip">{tr.tutorial.tableHint}</div>
				{/if}
			</div>

			<!-- Dismiss button -->
			<button class="tutorial-dismiss" onclick={dismissTutorial}>
				{tr.tutorial.dontShowAgain}
			</button>
		{/if}

		<!-- SVG canvas -->
		<svg
			bind:this={svgEl}
			class="canvas"
			onpointerdown={onPointerDown}
			onpointermove={onPointerMove}
			onpointerup={onPointerUp}
			onwheel={onWheel}
			style="cursor:{isPanning ? 'grabbing' : 'default'}"
			role="img"
			aria-label={tr.components.seatingFloorPlan}
		>
			<defs>
				<pattern id="vgrid" width={zoom} height={zoom} patternUnits="userSpaceOnUse"
					x={patternX} y={patternY}>
					<path d="M {zoom} 0 L 0 0 0 {zoom}" fill="none" stroke="var(--editor-grid)" stroke-width="0.5"/>
				</pattern>
				<pattern id="vgrid5" width={zoom*5} height={zoom*5} patternUnits="userSpaceOnUse"
					x={patternX} y={patternY}>
					<rect width={zoom*5} height={zoom*5} fill="url(#vgrid)"/>
					<path d="M {zoom*5} 0 L 0 0 0 {zoom*5}" fill="none" stroke="var(--editor-grid-strong)" stroke-width="1"/>
				</pattern>
			</defs>

			<!-- Floor -->
			<rect width="100%" height="100%" fill="var(--editor-canvas)"/>
			<rect width="100%" height="100%" fill="url(#vgrid5)"/>

			<!-- Ghost outline of floor below -->
			{#if activeFloorIdx > 0}
				{@const below = floors[activeFloorIdx - 1]}
				{#if below.bounds}
					<path d={roomOutlinePath(roomParts(below), zoom, panX, panY)}
						fill="none" stroke="color-mix(in srgb, var(--editor-wall) 30%, transparent)"
						stroke-width="1.5" stroke-dasharray="6,4"
						pointer-events="none"/>
				{/if}
				{#each below.zones as zone}
					<polygon points={zone.points.map(p => `${wx(p.x)},${wy(p.y)}`).join(' ')}
						fill={zone.color} fill-opacity="0.06" stroke={zone.color} stroke-opacity="0.15"
						stroke-width="1" stroke-dasharray="4,3" pointer-events="none"/>
				{/each}
				{#each below.walls as wall}
					<polygon points={wall.points.map(p => `${wx(p.x)},${wy(p.y)}`).join(' ')}
						fill="color-mix(in srgb, var(--editor-wall) 12%, transparent)"
						stroke="color-mix(in srgb, var(--editor-wall) 30%, transparent)"
						stroke-width="1" stroke-dasharray="4,3" pointer-events="none"/>
				{/each}
			{/if}

			<!-- Zones -->
			{#each zones as z}
				<polygon points={z.points.map(p => `${wx(p.x)},${wy(p.y)}`).join(' ')}
					fill={z.color + '33'} stroke={z.color} stroke-width="1.5"/>
				{#if z.label}
					{@const cx = z.points.reduce((s,p) => s+p.x,0)/z.points.length}
					{@const cy = z.points.reduce((s,p) => s+p.y,0)/z.points.length}
					<text x={wx(cx)} y={wy(cy)} text-anchor="middle" dominant-baseline="middle"
						font-size="11" fill={z.color} font-weight="600" pointer-events="none">{z.label}</text>
				{/if}
			{/each}

			<!-- Walls -->
			{#each walls as w}
				<polygon points={w.points.map(p => `${wx(p.x)},${wy(p.y)}`).join(' ')}
					fill="var(--editor-wall)" stroke="none" stroke-width="0"/>
			{/each}

			<!-- Tables -->
			{#each tables as t}
				{@const chairs = localChairs(t)}
				{@const isAssigned = (i: number) => !!t.assignments[i]}
				{@const guestOf = (i: number) => guests.find(g => g.id === t.assignments[i]) ?? null}
				<g transform="translate({wx(t.x)},{wy(t.y)}) rotate({t.rotation})">
					<!-- Table body -->
					{#if t.shape === 'rect'}
						<rect x={-ws(t.width/2)} y={-ws(t.height/2)}
							width={ws(t.width)} height={ws(t.height)}
							rx="8" fill="var(--warning)" stroke="color-mix(in srgb, var(--warning) 60%, var(--text-base))" stroke-width="1.5"/>
					{:else}
						<circle r={ws(t.radius)} fill="var(--warning)" stroke="color-mix(in srgb, var(--warning) 60%, var(--text-base))" stroke-width="1.5"/>
					{/if}
					<!-- Label -->
					{#if t.label}
						<text text-anchor="middle" dominant-baseline="middle"
							font-size={Math.max(8, ws(0.25))} fill="var(--warning-dim)" font-weight="600"
							pointer-events="none">{t.label}</text>
					{/if}
					<!-- Chairs -->
					{#each chairs as ch, ci}
						{@const assigned = isAssigned(ci)}
						{@const guest = guestOf(ci)}
						<g transform="translate({ws(ch.x)},{ws(ch.y)}) rotate({ch.rot})">
							<rect x={-ws(0.21)} y={-ws(0.21)} width={ws(0.42)} height={ws(0.42)} rx={ws(0.07)}
								fill={assigned ? 'var(--success)' : 'var(--warning-dim)'}
								stroke={assigned ? 'color-mix(in srgb, var(--success) 60%, var(--text-base))' : 'var(--warning)'}
								stroke-width="1" cursor="pointer"/>
							{#if guest && zoom >= 55}
								<text text-anchor="middle" dominant-baseline="middle"
									font-size={ws(0.18)} fill="var(--on-success)" font-weight="650"
									pointer-events="none">
									{guest.firstName[0]}{guest.lastName[0]}
								</text>
							{/if}
						</g>
					{/each}
				</g>
			{/each}
		</svg>

		<!-- Chair assignment popover -->
		{#if chairPopover}
			<div class="overlay" role="presentation"
				onclick={() => { chairPopover = null; guestSearch = ''; }}
				onkeydown={(e) => e.key === 'Escape' && (chairPopover = null)}></div>
			<div class="chair-popover" role="dialog" aria-labelledby="chair-popover-title"
				use:dialog={{ onclose: () => { chairPopover = null; guestSearch = ''; } }}
				style="left:{Math.min(chairPopover.x+12, 9999)}px; top:{Math.min(chairPopover.y-8, 9999)}px">
				<div class="pop-header">
					<span id="chair-popover-title">
						{#if popoverTable}{popoverTable.label} · {tr.components.seat} {chairPopover.chairIdx + 1}{/if}
					</span>
					<button type="button" onclick={() => { chairPopover = null; guestSearch = ''; }} class="pop-close" aria-label={tr.myRes.close}>✕</button>
				</div>
				{#if popoverChairGuest}
					<div class="current-guest">
						<div class="cg-avatar">{popoverChairGuest.firstName[0]}{popoverChairGuest.lastName[0]}</div>
						<span>{popoverChairGuest.firstName} {popoverChairGuest.lastName}</span>
						<button onclick={clearChairAssignment} class="unassign-btn">{tr.components.remove}</button>
					</div>
				{/if}
				<input type="text" bind:value={guestSearch} placeholder={tr.components.searchGuests} aria-label={tr.components.searchGuests} class="pop-search" />
				<div class="pop-list">
					{#each filteredPopoverGuests as g}
						<button onclick={() => assignGuest(g.id)} class="pop-guest"
							class:current={popoverChairGuest?.id === g.id}>
							<div class="pg-avatar">{g.firstName[0]}{g.lastName[0]}</div>
							{g.lastName}, {g.firstName}
						</button>
					{/each}
					{#if filteredPopoverGuests.length === 0}
						<p class="pop-empty">{tr.components.noUnassignedGuests}</p>
					{/if}
				</div>
			</div>
		{/if}

		<!-- Zoom hint -->
		<div class="zoom-hint">{tr.components.panZoomHint}</div>
	</div>

	<!-- Right panel -->
	<div class="right-panel">
		<div class="panel-header">
			<span>{tr.components.guests}</span>
			<span class="panel-count">{guests.length}</span>
		</div>

		<!-- Import RSVPs (grouped by surname family) -->
		{#if SHOW_RSVP && rsvps.length > 0}
			<div class="rsvp-section">
				<div class="section-label-row">
					<span class="section-label">{tr.components.rsvps} ({rsvps.length})</span>
					{#if !rsvps.every(r => guests.some(g => `${g.firstName} ${g.lastName}`.toLowerCase() === r.name.toLowerCase()))}
						<button onclick={importAllRsvps} class="import-all-btn">{tr.components.importAll}</button>
					{/if}
				</div>
				{#each groupedRsvps as [, familyRsvps]}
					<div class="family-group">
						{#each familyRsvps as rsvp}
							{@const alreadyAdded = guests.some(g => `${g.firstName} ${g.lastName}`.toLowerCase() === rsvp.name.toLowerCase())}
							<div class="rsvp-row">
								<span class="rsvp-name">{rsvp.name}</span>
								{#if alreadyAdded}
									<span class="added-badge">{tr.components.added}</span>
								{:else}
									<button onclick={() => importRsvp(rsvp)} class="import-btn">{tr.components.import}</button>
								{/if}
							</div>
						{/each}
					</div>
				{/each}
			</div>
		{/if}

		<!-- Add guest manually -->
		<div class="add-section">
			<div class="section-label">{tr.components.addGuest}</div>
			<input type="text" bind:value={newFirst} placeholder={tr.components.firstName} aria-label={tr.components.firstName} />
			<input type="text" bind:value={newLast} placeholder={tr.components.lastName} aria-label={tr.components.lastName} style="margin-top:4px"/>
			<button onclick={addGuest} class="add-btn" disabled={!newFirst.trim() || !newLast.trim()}>{tr.components.add}</button>
		</div>

		<!-- Guest list (grouped by surname family) -->
		<div class="guest-list-section">
			<div class="section-label">{tr.components.seatingList}</div>
			{#each groupedGuests as [familyRoot, familyGuests]}
				<div class="family-group">
					<div class="family-label">{familyGuests[0].group || familyRoot}</div>
					{#each familyGuests as g}
						{@const tableForGuest = tables.find(t => t.assignments.includes(g.id)) ?? floors.flatMap((f, i) => i === activeFloorIdx ? [] : f.tables).find(t => t.assignments.includes(g.id))}
						{@const seatIdx = tableForGuest ? tableForGuest.assignments.indexOf(g.id) : -1}
						<div class="guest-item">
							<div class="gi-avatar" class:assigned={assignedIds.has(g.id)}>
								{g.firstName[0]}{g.lastName[0]}
							</div>
							<div class="gi-name">{g.firstName} {g.lastName}</div>
							<div class="gi-seat">
								{#if tableForGuest}
									<span class="seat-tag">{tableForGuest.label} #{seatIdx+1}</span>
								{:else}
									<span class="no-seat">{tr.components.unassigned}</span>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<p class="empty-guests">{tr.components.noGuestsYet}</p>
			{/each}
		</div>

		<button onclick={saveLayout} class="save-btn">{tr.components.saveSeating}</button>
	</div>
</div>

<style>
	.viewer {
		display: flex;
		height: 100%;
		overflow: hidden;
		position: relative;
	}

	.map-area {
		flex: 1;
		position: relative;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.canvas {
		width: 100%;
		flex: 1;
		display: block;
	}

	/* Floor tabs */
	.floor-tabs {
		display: flex;
		align-items: center;
		gap: 2px;
		padding: 4px 8px;
		background: var(--bg-panel);
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}

	.floor-tab {
		padding: 4px 12px;
		border-radius: var(--radius-sm);
		font-size: 11px;
		font-weight: 500;
		color: var(--text-muted);
		background: transparent;
		border: 1px solid transparent;
		cursor: pointer;
		transition: all 0.12s;
		font-family: inherit;
		font-size: 11px;
		font-weight: 500;
	}

	.floor-tab:hover { background: var(--bg-panel2); color: var(--text-base); }
	.floor-tab.active {
		background: var(--accent-dim);
		color: var(--accent-ink);
		font-weight: 600;
		border-color: var(--accent);
	}

	/* Tutorial pings */
	.ping-container {
		position: absolute;
		z-index: 40;
		pointer-events: auto;
	}

	.ping {
		position: relative;
		width: 20px;
		height: 20px;
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
	}

	.ping-dot {
		position: absolute;
		inset: 4px;
		background: var(--accent);
		border-radius: 50%;
		z-index: 2;
	}

	.ping-ring {
		position: absolute;
		inset: 0;
		border: 2px solid var(--accent);
		border-radius: 50%;
		animation: ping-pulse 1.5s ease-out infinite;
		z-index: 1;
	}

	@keyframes ping-pulse {
		0% { transform: scale(1); opacity: 0.8; }
		100% { transform: scale(2.5); opacity: 0; }
	}

	.ping-tooltip {
		position: absolute;
		top: 28px;
		left: 50%;
		transform: translateX(-50%);
		background: var(--bg-panel);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 10px 14px;
		font-size: 12px;
		color: var(--text-base);
		line-height: 1.5;
		white-space: nowrap;
		box-shadow: var(--shadow);
		z-index: 41;
	}

	.tutorial-dismiss {
		position: absolute;
		bottom: 12px;
		right: 12px;
		z-index: 40;
		padding: 5px 12px;
		border-radius: var(--radius-sm);
		background: var(--bg-panel);
		border: 1px solid var(--border);
		font-size: 11px;
		color: var(--text-muted);
		cursor: pointer;
		font-family: inherit;
		box-shadow: var(--shadow-xs);
		transition: background .15s, color .15s, border-color .15s;
	}

	.tutorial-dismiss:hover {
		background: var(--accent-dim);
		color: var(--accent-ink);
		border-color: var(--accent);
	}

	/* Popover */
	.overlay {
		position: absolute;
		inset: 0;
		z-index: 20;
	}

	.chair-popover {
		position: absolute;
		z-index: 21;
		background: var(--bg-panel);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow);
		width: 220px;
		overflow: hidden;
	}

	.pop-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 10px;
		background: var(--bg-panel2);
		border-bottom: 1px solid var(--border);
		font-size: 12px;
		font-weight: 600;
		letter-spacing: -.03em;
	}

	.pop-close {
		background: none;
		border: none;
		cursor: pointer;
		color: var(--text-muted);
		font-size: 12px;
		line-height: 1;
		padding: 2px 4px;
	}

	.current-guest {
		display: flex;
		align-items: center;
		gap: 7px;
		padding: 8px 10px;
		border-bottom: 1px solid var(--border);
		font-size: 12px;
	}

	.cg-avatar {
		width: 22px; height: 22px;
		border-radius: 50%;
		background: var(--accent-dim);
		color: var(--accent-ink);
		font-size: 9px; font-weight: 650;
		display: flex; align-items: center; justify-content: center;
		flex-shrink: 0;
	}

	.unassign-btn {
		margin-left: auto;
		font-size: 11px;
		color: var(--danger);
		background: none;
		border: none;
		cursor: pointer;
		font-family: inherit;
	}

	.pop-search {
		display: block;
		width: 100%;
		border: none;
		border-bottom: 1px solid var(--border);
		padding: 7px 10px;
		font-size: 12px;
		background: var(--bg-panel2);
		color: var(--text-base);
		outline: none;
		box-sizing: border-box;
		font-family: inherit;
	}

	.pop-list {
		max-height: 180px;
		overflow-y: auto;
	}

	.pop-guest {
		display: flex;
		align-items: center;
		gap: 7px;
		width: 100%;
		padding: 6px 10px;
		font-size: 12px;
		text-align: left;
		background: none;
		border: none;
		cursor: pointer;
		color: var(--text-base);
		font-family: inherit;
	}

	.pop-guest:hover { background: var(--accent-dim); color: var(--accent-ink); }
	.pop-guest.current { background: var(--success-dim); color: var(--success); }

	.pg-avatar {
		width: 20px; height: 20px;
		border-radius: 50%;
		background: var(--bg-panel2);
		font-size: 9px; font-weight: 650;
		display: flex; align-items: center; justify-content: center;
		flex-shrink: 0;
	}

	.pop-empty { padding: 10px; font-size: 12px; color: var(--text-muted); text-align: center; }

	/* Zoom hint */
	.zoom-hint {
		position: absolute;
		bottom: 12px;
		left: 50%;
		transform: translateX(-50%);
		background: color-mix(in srgb, var(--text-base) 82%, transparent);
		color: var(--bg-panel);
		font-size: 11px;
		padding: 4px 10px;
		border-radius: 3px;
		pointer-events: none;
		opacity: 0.7;
	}

	/* Right panel */
	.right-panel {
		width: 240px;
		flex-shrink: 0;
		background: var(--bg-panel);
		border-left: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.panel-header {
		padding: 12px 14px;
		font-size: 13px;
		font-weight: 600;
		letter-spacing: -.03em;
		border-bottom: 1px solid var(--border);
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.panel-count {
		background: var(--accent-dim);
		color: var(--accent-ink);
		font-size: 11px;
		font-weight: 650;
		padding: 1px 6px;
		border-radius: 3px;
	}

	.rsvp-section, .add-section, .guest-list-section {
		padding: 10px 12px;
		border-bottom: 1px solid var(--border);
	}

	.guest-list-section {
		flex: 1;
		overflow-y: auto;
		border-bottom: none;
	}

	/* Eyebrow: the uppercase overline motif of the language. */
	.section-label {
		font-size: 10px;
		font-weight: 650;
		text-transform: uppercase;
		letter-spacing: .13em;
		color: var(--text-muted);
		margin-bottom: 6px;
	}

	.rsvp-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 4px 0;
		font-size: 12px;
	}

	.rsvp-name { color: var(--text-base); }

	.import-btn {
		font-size: 11px;
		font-weight: 600;
		padding: 2px 7px;
		border-radius: var(--radius-sm);
		background: var(--accent-dim);
		color: var(--accent-ink);
		border: none;
		cursor: pointer;
		font-family: inherit;
		transition: background .15s;
	}

	.import-btn:hover { background: color-mix(in srgb, var(--accent) 22%, transparent); }

	.added-badge {
		font-size: 11px;
		color: var(--success);
		font-weight: 600;
	}

	.add-section input {
		width: 100%;
		display: block;
	}

	.add-btn {
		width: 100%;
		margin-top: 6px;
		padding: 6px;
		border-radius: var(--radius-sm);
		background: var(--accent);
		color: var(--accent-contrast);
		font-size: 12px;
		font-weight: 650;
		border: none;
		cursor: pointer;
		font-family: inherit;
		transition: transform .2s, background .2s;
	}

	/* The lift on hover is the signature interaction of this language. */
	.add-btn:hover:not(:disabled) { background: var(--accent-hover); transform: translateY(-2px); }
	.add-btn:active:not(:disabled) { transform: translateY(0); }

	.add-btn:disabled { opacity: 0.4; cursor: not-allowed; }

	.guest-item {
		display: flex;
		align-items: center;
		gap: 7px;
		padding: 5px 0;
		font-size: 12px;
	}

	.gi-avatar {
		width: 24px; height: 24px;
		border-radius: 50%;
		background: var(--bg-panel2);
		border: 1px solid var(--border);
		font-size: 9px; font-weight: 650;
		display: flex; align-items: center; justify-content: center;
		flex-shrink: 0;
		color: var(--text-muted);
	}

	.gi-avatar.assigned {
		background: var(--success-dim);
		border-color: color-mix(in srgb, var(--success) 30%, transparent);
		color: var(--success);
	}

	.gi-name { flex: 1; font-weight: 500; color: var(--text-base); }

	.seat-tag {
		font-size: 10px;
		background: var(--accent-dim);
		color: var(--accent-ink);
		padding: 1px 5px;
		border-radius: var(--radius-sm);
		font-weight: 600;
	}

	.no-seat { font-size: 10px; color: var(--text-muted); }

	.empty-guests {
		font-size: 12px;
		color: var(--text-muted);
		padding: 12px 0;
		text-align: center;
	}

	.save-btn {
		margin: 10px 12px;
		padding: 9px;
		border-radius: var(--radius-sm);
		background: var(--accent);
		color: var(--accent-contrast);
		font-size: 13px;
		font-weight: 650;
		border: none;
		cursor: pointer;
		font-family: inherit;
		flex-shrink: 0;
		transition: transform .2s, background .2s;
	}

	/* The lift on hover is the signature interaction of this language. */
	.save-btn:hover { background: var(--accent-hover); transform: translateY(-2px); }
	.save-btn:active { transform: translateY(0); }

	.section-label-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.import-all-btn {
		font-size: 11px;
		padding: 2px 8px;
		border-radius: var(--radius-sm);
		background: var(--accent);
		color: var(--accent-contrast);
		border: none;
		cursor: pointer;
		font-weight: 600;
		font-family: inherit;
		font-size: 11px;
		font-weight: 600;
		transition: transform .2s, background .2s;
	}

	/* The lift on hover is the signature interaction of this language. */
	.import-all-btn:hover { background: var(--accent-hover); transform: translateY(-2px); }
	.import-all-btn:active { transform: translateY(0); }

	.family-group {
		margin-bottom: 4px;
		padding: 4px 0;
		border-bottom: 1px solid var(--border);
	}

	.family-group:last-child { border-bottom: none; }

	.family-label {
		font-size: 11px;
		font-weight: 650;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		padding: 4px 0 2px;
	}

	@media (prefers-reduced-motion: reduce) {
		.add-btn:hover:not(:disabled),
		.import-all-btn:hover,
		.save-btn:hover { transform: none; }
	}
</style>
