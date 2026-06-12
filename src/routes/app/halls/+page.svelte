<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';

	interface Props { data: PageData; }
	const { data }: Props = $props();

	function parseArr(v: unknown): string[] {
		if (!v) return [];
		if (Array.isArray(v)) return v as string[];
		if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } }
		return [];
	}

	let search = $state(data.q ?? '');
	let debounceTimer: ReturnType<typeof setTimeout>;

	function onSearchInput() {
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			const params = search.trim() ? `?q=${encodeURIComponent(search.trim())}` : '';
			goto(`/app/halls${params}`, { replaceState: true });
		}, 340);
	}

	function clearSearch() {
		search = '';
		goto('/app/halls', { replaceState: true });
	}
</script>

<svelte:head><title>Browse halls – Hallify</title></svelte:head>

<div class="page">

	<!-- ── Header ── -->
	<div class="page-head">
		<div class="head-left">
			<h1 class="page-title">Browse venues</h1>
			{#if data.halls.length > 0}
				<span class="result-count">
					{data.halls.length}{data.q ? '' : '+'} venue{data.halls.length === 1 ? '' : 's'}
					{#if data.q}<span class="result-query">for "{data.q}"</span>{/if}
				</span>
			{/if}
		</div>
		<div class="search-wrap">
			<svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
			<input
				class="search-input"
				type="text"
				placeholder="Search by name, city, or feature…"
				bind:value={search}
				oninput={onSearchInput}
				autocomplete="off"
				spellcheck="false"
			/>
			{#if search}
				<button class="search-clear" type="button" onclick={clearSearch} aria-label="Clear search">
					<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
				</button>
			{/if}
		</div>
	</div>

	<!-- ── Results ── -->
	{#if data.halls.length === 0}
		<div class="empty-state">
			{#if data.q}
				<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
				<p class="empty-title">No venues found</p>
				<p class="empty-sub">No results for "<strong>{data.q}</strong>". Try a different keyword.</p>
				<button class="btn-ghost" onclick={clearSearch}>Clear search</button>
			{:else}
				<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
				<p class="empty-title">No venues listed yet</p>
				<p class="empty-sub">Check back soon — venues are being added.</p>
			{/if}
		</div>
	{:else}
		<div class="grid">
			{#each data.halls as hall}
				{@const amenities = parseArr(hall.amenities)}
				<a href="/app/halls/{hall.slug ?? hall.id}" class="hall-card">

					<!-- Cover -->
					<div class="cover"
						style={hall.cover_image_url
							? `background-image:url('${hall.cover_image_url}')`
							: `background:linear-gradient(135deg,${hall.color}dd 0%,${hall.color}66 100%)`}>
						<div class="cover-overlay">
							<div class="cover-meta">
								{#if hall.address}
									<span class="cover-address">
										<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
										{hall.address}
									</span>
								{/if}
							</div>
							<h2 class="cover-name">{hall.name}</h2>
						</div>
						<div class="cover-arrow">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
						</div>
					</div>

					<!-- Body -->
					<div class="card-body">
						<div class="card-chips">
							<span class="chip chip-cap">
								<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
								{hall.max_people} guests
							</span>
							{#each amenities.slice(0, 3) as a}
								<span class="chip">{a}</span>
							{/each}
							{#if amenities.length > 3}
								<span class="chip chip-more">+{amenities.length - 3}</span>
							{/if}
						</div>
						{#if hall.description}
							<p class="card-desc">{hall.description}</p>
						{/if}
					</div>

				</a>
			{/each}
		</div>
	{/if}

</div>

<style>
	@keyframes fadeUp {
		from { opacity: 0; transform: translateY(12px); }
		to   { opacity: 1; transform: translateY(0); }
	}

	.page {
		display: flex; flex-direction: column; gap: 20px;
		padding: 24px 28px;
		animation: fadeUp .2s ease both;
	}

	/* ── Header ── */
	.page-head {
		display: flex; align-items: center;
		gap: 14px; flex-wrap: wrap;
	}
	.head-left { display: flex; align-items: baseline; gap: 8px; flex-shrink: 0; }
	.page-title { font-size: 18px; font-weight: 800; color: var(--text-base); letter-spacing: -.03em; }
	.result-count { font-size: 12px; color: var(--text-subtle); font-weight: 500; white-space: nowrap; }
	.result-query { color: var(--text-muted); }

	/* ── Search ── */
	.search-wrap {
		position: relative; display: flex; align-items: center;
		flex: 1; max-width: 400px; min-width: 200px;
	}
	.search-icon {
		position: absolute; left: 11px; color: var(--text-subtle); pointer-events: none; flex-shrink: 0;
	}
	.search-input {
		width: 100%; padding: 8px 34px 8px 32px;
		border: 1px solid var(--border); border-radius: 8px;
		background: var(--bg-panel); color: var(--text-base);
		font-size: 13px; font-family: inherit; outline: none;
		transition: border-color .12s, box-shadow .12s;
	}
	.search-input:focus {
		border-color: var(--accent);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 12%, transparent);
	}
	.search-clear {
		position: absolute; right: 10px;
		width: 18px; height: 18px; border-radius: 50%;
		background: var(--text-subtle); border: none; cursor: pointer;
		display: flex; align-items: center; justify-content: center;
		color: var(--bg-panel); transition: background .1s; flex-shrink: 0;
	}
	.search-clear:hover { background: var(--text-muted); }

	/* ── Grid ── */
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(272px, 1fr));
		gap: 16px;
	}

	/* ── Hall card ── */
	.hall-card {
		display: flex; flex-direction: column;
		border-radius: 12px; overflow: hidden;
		background: var(--bg-panel); border: 1px solid var(--border);
		text-decoration: none; color: inherit;
		transition: border-color .15s, box-shadow .15s, transform .15s;
	}
	.hall-card:hover {
		border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
		box-shadow: 0 8px 28px rgba(0,0,0,.14);
		transform: translateY(-3px);
	}

	/* Cover */
	.cover {
		position: relative;
		aspect-ratio: 16/9;
		background-size: cover;
		background-position: center;
		overflow: hidden;
	}
	.cover-overlay {
		position: absolute; inset: 0;
		background: linear-gradient(to top, rgba(0,0,0,.72) 0%, rgba(0,0,0,.08) 55%, transparent 100%);
		display: flex; flex-direction: column; justify-content: flex-end;
		padding: 12px 14px; gap: 3px;
		transition: background .2s;
	}
	.hall-card:hover .cover-overlay {
		background: linear-gradient(to top, rgba(0,0,0,.8) 0%, rgba(0,0,0,.15) 60%, transparent 100%);
	}
	.cover-meta { display: flex; align-items: center; gap: 6px; }
	.cover-address {
		display: inline-flex; align-items: center; gap: 4px;
		font-size: 11px; color: rgba(255,255,255,.7);
	}
	.cover-name {
		font-size: 15px; font-weight: 700; color: #fff;
		line-height: 1.2; letter-spacing: -.01em;
		text-shadow: 0 1px 4px rgba(0,0,0,.3);
	}
	.cover-arrow {
		position: absolute; top: 12px; right: 12px;
		width: 30px; height: 30px; border-radius: 50%;
		background: rgba(255,255,255,.15); backdrop-filter: blur(6px);
		border: 1px solid rgba(255,255,255,.2);
		display: flex; align-items: center; justify-content: center;
		color: #fff;
		opacity: 0; transform: scale(.85);
		transition: opacity .18s, transform .18s;
	}
	.hall-card:hover .cover-arrow { opacity: 1; transform: scale(1); }

	/* Card body */
	.card-body {
		padding: 12px 14px 14px;
		display: flex; flex-direction: column; gap: 8px;
	}

	.card-chips { display: flex; flex-wrap: wrap; gap: 5px; }
	.chip {
		display: inline-flex; align-items: center; gap: 4px;
		padding: 3px 9px; border-radius: 99px; font-size: 11px; font-weight: 500;
		background: var(--bg-panel2, var(--bg-base)); border: 1px solid var(--border);
		color: var(--text-muted);
	}
	.chip-cap {
		background: color-mix(in srgb, var(--accent) 8%, transparent);
		border-color: color-mix(in srgb, var(--accent) 20%, transparent);
		color: var(--accent); font-weight: 600;
	}
	.chip-more {
		background: none; border-color: transparent;
		color: var(--text-subtle); font-size: 10px;
	}

	.card-desc {
		font-size: 12px; color: var(--text-muted); line-height: 1.5;
		display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
	}

	/* ── Empty state ── */
	.empty-state {
		display: flex; flex-direction: column; align-items: center; justify-content: center;
		gap: 10px; padding: 80px 20px; text-align: center; color: var(--text-subtle);
	}
	.empty-title { font-size: 15px; font-weight: 700; color: var(--text-muted); margin: 4px 0 0; }
	.empty-sub   { font-size: 13px; color: var(--text-subtle); line-height: 1.5; }
	.empty-sub strong { color: var(--text-muted); }
	.btn-ghost {
		display: inline-flex; align-items: center; gap: 6px;
		padding: 7px 16px; border-radius: 7px; font-size: 12px; font-weight: 500;
		background: none; border: 1px solid var(--border); color: var(--text-muted);
		cursor: pointer; font-family: inherit; transition: border-color .1s, color .1s;
		margin-top: 4px;
	}
	.btn-ghost:hover { border-color: var(--accent); color: var(--text-base); }

	@media (max-width: 600px) {
		.page { padding: 16px 18px; }
		.page-head { flex-direction: column; align-items: stretch; }
		.search-wrap { max-width: 100%; }
		.grid { grid-template-columns: 1fr; }
	}
</style>
