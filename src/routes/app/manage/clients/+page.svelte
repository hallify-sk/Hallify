<script lang="ts">
	import { pageTitle } from '$lib/page-title';
	import { page } from '$app/stores';
	import { t, getLocale } from '$lib/i18n.svelte';
	import { formatDate } from '$lib/format';
	import { formatRating } from '$lib/feedback';
	import { CLIENTS_PAGE_SIZE } from '$lib/clients';
	import ListToolbar from '$lib/components/ListToolbar.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const day = (d: string | null) => (d ? formatDate(d, getLocale()) : '—');

	/** The current list URL with some parameters changed (and paging reset unless given). */
	function hrefWith(patch: Record<string, string | number | null>) {
		const u = new URLSearchParams($page.url.searchParams);
		if (!('page' in patch)) u.delete('page');
		for (const [k, v] of Object.entries(patch)) {
			if (v === null || v === '') u.delete(k);
			else u.set(k, String(v));
		}
		const qs = u.toString();
		return qs ? `?${qs}` : '?';
	}
	const exportHref = $derived(`/app/manage/clients/export${$page.url.search}`);
	const firstShown = $derived(data.total === 0 ? 0 : (data.page - 1) * CLIENTS_PAGE_SIZE + 1);
	const lastShown = $derived(Math.min(data.page * CLIENTS_PAGE_SIZE, data.total));

	const sorts = $derived([
		['name', t.clients.sortName], ['last', t.clients.sortLast], ['next', t.clients.sortNext],
		['bookings', t.clients.sortBookings], ['rating', t.clients.sortRating], ['newest', t.clients.sortNewest],
	] as const);
</script>

<svelte:head><title>{pageTitle(t.clients.title)}</title></svelte:head>

<div class="page wrap">
	<div class="page-header">
		<div class="page-header-left">
			<h1 class="page-title">{t.clients.title}</h1>
			<span class="total-badge">{data.everyone}</span>
		</div>
	</div>

	<section class="section section--lead">
		<p class="cl-intro">{t.clients.intro}</p>

		{#if data.everyone === 0}
			<div class="card--inset state-block">
				<span class="icon-tile" aria-hidden="true">
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
				</span>
				<h2>{t.clients.empty}</h2>
				<p>{t.clients.emptyHint}</p>
			</div>
		{:else}
			{#snippet clearSearch()}
				<a class="lf-clear" href={hrefWith({ q: null })}>{t.clients.clear}</a>
			{/snippet}
			<ListToolbar q={data.filters.q} label={t.clients.title}
				searchLabel={t.clients.searchLabel} searchPlaceholder={t.clients.searchPlaceholder}
				submitLabel={t.clients.search} exportHref={exportHref} exportLabel={t.clients.exportCsv}
				below={data.filters.q ? clearSearch : undefined}>
				{#snippet filters()}
					<select class="lt-select" name="sort" aria-label={t.clients.sortLabel}>
						{#each sorts as [value, label]}
							<option {value} selected={data.filters.sort === value}>{label}</option>
						{/each}
					</select>
				{/snippet}
			</ListToolbar>

			{#if data.rows.length === 0}
				<div class="card--inset state-block">
					<h2>{t.clients.noMatches}</h2>
				</div>
			{:else}
				<div class="cl-list row-list">
					<div class="cl-head">
						<span>{t.clients.colClient}</span>
						<span>{t.clients.contact}</span>
						<span class="num">{t.clients.colBookings}</span>
						<span>{t.clients.colNext}</span>
						<span>{t.clients.colLast}</span>
						<span>{t.clients.colRating}</span>
					</div>
					{#each data.rows as c (c.key)}
						<a href="/app/manage/clients/{c.urlId}" class="row-item row-item--bleed cl-row">
							<div class="td-name">
								<span class="cl-name">{c.name}</span>
								{#if c.kind === 'guest'}<span class="guest-tag" title={t.clients.guestHint}>{t.clients.guestTag}</span>{/if}
							</div>
							<div class="td-contact">
								{#if c.email}<span class="cl-sub">{c.email}</span>{/if}
								{#if c.phone}<span class="cl-sub">{c.phone}</span>{/if}
								{#if !c.email && !c.phone}<span class="cl-sub">—</span>{/if}
							</div>
							<div class="td-num" aria-label={t.clients.bookingsCount(c.bookings)}>{c.bookings}</div>
							<div class="td-date" class:soon={!!c.nextEvent}><span class="m-label">{t.clients.colNext}: </span>{day(c.nextEvent)}</div>
							<div class="td-date"><span class="m-label">{t.clients.colLast}: </span>{day(c.lastEvent)}</div>
							<div class="td-rating">
								{#if c.ratingAverage != null}
									<span class="star" aria-hidden="true">★</span>
									<span>{formatRating(c.ratingAverage, getLocale())}</span>
									<span class="cl-sub-inline">({c.ratingCount})</span>
								{:else}
									<span class="cl-sub-inline">—</span>
								{/if}
							</div>
						</a>
					{/each}
				</div>

				<div class="pager">
					<span class="pager-info">{t.resOps.showing(firstShown, lastShown, data.total)}</span>
					{#if data.pages > 1}
						<div class="pager-links">
							{#if data.page > 1}<a class="btn-outline btn-sm" href={hrefWith({ page: data.page - 1 })} rel="prev">{t.resOps.prevPage}</a>{/if}
							<span class="pager-num">{data.page} / {data.pages}</span>
							{#if data.page < data.pages}<a class="btn-outline btn-sm" href={hrefWith({ page: data.page + 1 })} rel="next">{t.resOps.nextPage}</a>{/if}
						</div>
					{/if}
				</div>
			{/if}
		{/if}
	</section>
</div>

<style>
	.page { padding-block: 24px; }
	.page-header { display: flex; align-items: center; justify-content: space-between; padding-bottom: 18px; }
	.page-header-left { display: flex; align-items: center; gap: 10px; }
	.page-title { font-size: var(--display-size); font-weight: 550; color: var(--text-base); letter-spacing: -.055em; line-height: 1.08; }
	.total-badge {
		font-size: 11px; font-weight: 650; padding: 2px 8px; border-radius: 3px;
		background: var(--accent-dim); color: var(--accent-ink);
	}
	.cl-intro { font-size: 13px; color: var(--text-muted); margin: 0 0 14px; }
	.lf-clear { font-size: 12px; font-weight: 600; color: var(--accent-ink); text-decoration: none; white-space: nowrap; }
	.lf-clear:hover { text-decoration: underline; }

	/* Laid out by the list's own width, like the reservations list. */
	.cl-list { container-type: inline-size; }
	.cl-head, .cl-row {
		display: grid;
		grid-template-columns: minmax(150px, 1.6fr) minmax(160px, 1.6fr) 90px 110px 110px 90px;
		gap: 14px; align-items: center;
	}
	.cl-head {
		padding: 0 var(--row-inset, 10px) 8px;
		margin-inline: calc(var(--row-inset, 10px) * -1);
		font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .12em;
		color: var(--text-muted); border-bottom: 1px solid var(--border);
	}
	.cl-head .num, .td-num { text-align: right; }
	.cl-row { color: var(--text-base); text-decoration: none; transition: background .15s; }
	.cl-row:hover { background: var(--bg-hover); }
	.td-name, .td-contact { min-width: 0; }
	.cl-name { font-size: 13px; font-weight: 600; }
	.cl-sub { display: block; font-size: 11.5px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.cl-sub-inline { font-size: 11.5px; color: var(--text-muted); }
	.guest-tag {
		display: inline-block; margin-left: 6px; padding: 0 5px; border-radius: 3px; vertical-align: middle;
		font-size: 10px; font-weight: 600; color: var(--text-muted); background: var(--bg-hover);
	}
	.td-num { font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; }
	.td-date { font-size: 12px; font-weight: 600; color: var(--text-muted); white-space: nowrap; }
	.td-date.soon { color: var(--text-base); }
	.td-rating { font-size: 12.5px; display: flex; gap: 4px; align-items: baseline; white-space: nowrap; }
	.star { color: var(--warning); }
	.m-label { display: none; font-weight: 500; }

	.pager { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 14px; }
	.pager-info { font-size: 12px; color: var(--text-muted); }
	.pager-links { display: flex; align-items: center; gap: 8px; }
	.pager-num { font-size: 12px; color: var(--text-muted); }

	@container (max-width: 720px) {
		.cl-head { display: none; }
		.cl-row { grid-template-columns: 1fr auto; row-gap: 4px; }
		.td-contact { grid-column: 1 / -1; grid-row: 2; }
		.td-num { grid-row: 1; grid-column: 2; }
		.td-num::after { content: ' ×'; color: var(--text-muted); font-weight: 500; }
		.td-date, .td-rating { grid-column: auto; }
		.m-label { display: inline; }
	}
</style>
