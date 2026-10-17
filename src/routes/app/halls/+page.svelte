<script lang="ts">
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n.svelte';
	import { reveal } from '$lib/reveal';
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

<svelte:head><title>{t.appHalls.browseTitle} – Hallify</title></svelte:head>

<div class="wrap">

	<!-- ── Header ── -->
	<section class="section section--lead">
		<div class="section-head section-head--row">
			<div class="head-left">
				<p class="eyebrow">{t.appHalls.venuePlural}</p>
				<h1>{t.appHalls.browseVenues}</h1>
				{#if data.halls.length > 0}
					<p class="result-count">
						{data.halls.length}{data.q ? '' : '+'} {data.halls.length === 1 ? t.appHalls.venueSingular : t.appHalls.venuePlural}
						{#if data.q}<span class="result-query">{t.appHalls.resultsFor} "{data.q}"</span>{/if}
					</p>
				{/if}
			</div>
			<div class="search-wrap">
				<svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
				<input
					class="search-input"
					type="text"
					placeholder={t.appHalls.searchPlaceholder}
					bind:value={search}
					oninput={onSearchInput}
					autocomplete="off"
					spellcheck="false"
				/>
				{#if search}
					<button class="search-clear" type="button" onclick={clearSearch} aria-label={t.appHalls.clearSearch}>
						<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
					</button>
				{/if}
			</div>
		</div>
	</section>

	<!-- ── Results ── -->
	<section class="section" use:reveal>
		{#if data.halls.length === 0}
			<div class="card--inset empty-state">
				{#if data.q}
					<span class="icon-tile" aria-hidden="true">
						<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
					</span>
					<h2 class="empty-title">{t.appHalls.noVenuesFound}</h2>
					<p class="empty-sub">{t.appHalls.noResultsFor} "<strong>{data.q}</strong>". {t.appHalls.tryDifferentKeyword}</p>
					<button class="btn-outline btn-sm" onclick={clearSearch}>{t.appHalls.clearSearch}</button>
				{:else}
					<span class="icon-tile" aria-hidden="true">
						<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
					</span>
					<h2 class="empty-title">{t.appHalls.noVenuesListed}</h2>
					<p class="empty-sub">{t.appHalls.checkBackSoon}</p>
				{/if}
			</div>
		{:else}
			<div class="media-grid">
				{#each data.halls as hall}
					{@const amenities = parseArr(hall.amenities)}
					<a href="/app/halls/{hall.slug ?? hall.id}" class="hall-card media-card">

						<!-- Cover -->
						<div class="media-photo cover"
							style={hall.cover_image_url
								? `background-image:url('${hall.cover_image_url}')`
								: `background:linear-gradient(135deg,${hall.color}dd 0%,${hall.color}66 100%)`}>
						</div>

						<div class="media-topline">
							{#if hall.address}
								<span class="cover-address">
									<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
									{hall.address}
								</span>
							{/if}
							<span class="cover-capacity">
								<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
								{hall.max_people} {t.appHalls.guestsWord}
							</span>
						</div>

						<h2 class="cover-name">{hall.name}</h2>

						{#if hall.description}
							<p class="card-desc">{hall.description}</p>
						{/if}

						<div class="media-bottom">
							<span class="card-chips">
								{#each amenities.slice(0, 3) as a}
									<span class="chip">{a}</span>
								{/each}
								{#if amenities.length > 3}
									<span class="chip chip-more">+{amenities.length - 3}</span>
								{/if}
							</span>
							<span class="cover-arrow" aria-hidden="true">
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
							</span>
						</div>

					</a>
				{/each}
			</div>
		{/if}
	</section>

</div>

<style>
	/* ── Header ── */
	.head-left { min-width: 0; }
	/* The eyebrow is nested in .head-left, so the global `.section-head > .eyebrow`
	   child selector does not reach it; keep its block spacing here. */
	.head-left .eyebrow { display: block; margin-bottom: 12px; }
	.section-head h1 {
		font-size: var(--display-size);
		font-weight: 550;
		letter-spacing: -.055em;
		line-height: 1.08;
		margin: 0;
	}
	.result-count { font-size: 12px; color: var(--text-subtle); font-weight: 500; margin: 8px 0 0; }
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
		width: 100%; padding: 9px 34px 9px 32px;
		border: 1px solid var(--border); border-radius: var(--radius-sm);
		background: var(--bg-panel2); color: var(--text-base);
		font-size: 13px; font-family: inherit; outline: none;
		transition: border-color .15s, box-shadow .15s;
	}
	.search-input:focus {
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-dim);
	}
	.search-clear {
		position: absolute; right: 10px;
		width: 18px; height: 18px; border-radius: 50%;
		background: var(--text-subtle); border: none; cursor: pointer;
		display: flex; align-items: center; justify-content: center;
		color: var(--bg-panel); transition: background .15s; flex-shrink: 0;
	}
	.search-clear:hover { background: var(--text-muted); }

	/* ── Hall card ── */
	.hall-card { display: block; color: inherit; text-decoration: none; }
	.hall-card:hover { text-decoration: none; color: inherit; }

	/* The cover is an inline background rather than an <img>, so it scales via a
	   pseudo-element that inherits the image. */
	.hall-card .cover { position: relative; background-size: cover; background-position: center; }
	.cover::before {
		content: '';
		position: absolute; inset: 0;
		background-image: inherit;
		background-size: cover;
		background-position: center;
		transition: transform .5s;
	}
	.hall-card:hover .cover::before { transform: scale(1.04); }

	.cover-address, .cover-capacity { display: inline-flex; align-items: center; gap: 4px; min-width: 0; }
	.cover-address { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.cover-capacity { margin-left: auto; color: var(--accent-ink); font-weight: 600; flex-shrink: 0; }

	.cover-name { font-size: var(--h3-size); font-weight: 600; letter-spacing: -.03em; line-height: 1.2; margin: 0 0 6px; }

	.card-desc {
		font-size: 12px; color: var(--text-muted); line-height: 1.7; margin: 0 0 14px;
		display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
	}

	.card-chips { display: flex; flex-wrap: wrap; gap: 5px; min-width: 0; }
	.chip {
		display: inline-flex; align-items: center;
		padding: 4px 10px; border-radius: var(--radius-sm); font-size: 11px; font-weight: 500;
		background: var(--bg-hover); border: none;
		color: var(--text-muted); cursor: inherit;
	}
	.chip-more { background: none; color: var(--text-subtle); font-size: 10px; }

	.cover-arrow {
		display: flex; align-items: center; justify-content: center;
		color: var(--accent-ink); flex-shrink: 0;
		transition: transform .2s;
	}
	.hall-card:hover .cover-arrow { transform: translateX(3px); }

	/* ── Empty state ── */
	.empty-state {
		display: flex; flex-direction: column; align-items: center; justify-content: center;
		gap: 10px; padding: 56px 20px; text-align: center; color: var(--text-subtle);
	}
	.empty-state .icon-tile { width: 52px; height: 52px; }
	.empty-state .icon-tile svg { width: 26px; height: 26px; }
	.empty-title { font-size: 16px; font-weight: 600; letter-spacing: -.03em; color: var(--text-muted); margin: 4px 0 0; }
	.empty-sub   { font-size: 13px; color: var(--text-subtle); line-height: 1.75; margin: 0; }
	.empty-sub strong { color: var(--text-muted); font-weight: 600; }
	.empty-state .btn-outline { margin-top: 4px; }

	@media (prefers-reduced-motion: reduce) {
		.hall-card:hover .cover::before { transform: none; }
		.hall-card:hover .cover-arrow { transform: none; }
	}

	@media (max-width: 600px) {
		.search-wrap { max-width: 100%; }
		.media-grid { grid-template-columns: 1fr; }
	}
</style>
