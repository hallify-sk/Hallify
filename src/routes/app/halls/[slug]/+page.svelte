<script lang="ts">
	import { DOW_KEYS } from '$lib/availability';
	import { t } from '$lib/i18n.svelte';
	import { reveal } from '$lib/reveal';
	import Lightbox from '$lib/components/Lightbox.svelte';
	import type { PageData } from './$types';

	interface Props { data: PageData; }
	const { data }: Props = $props();

	const { hall } = data;

	const DAYS = $derived([
		t.appHalls.daySunday,
		t.appHalls.dayMonday,
		t.appHalls.dayTuesday,
		t.appHalls.dayWednesday,
		t.appHalls.dayThursday,
		t.appHalls.dayFriday,
		t.appHalls.daySaturday,
	]);

	// The open photo is tracked by index, not by url, so the viewer knows where it
	// is in the gallery and can move to the next one.
	const galleryImages = $derived((hall.gallery_images as string[] | undefined) ?? []);
	let activeIndex = $state<number | null>(null);
</script>

<svelte:head><title>{hall.name} – Hallify</title></svelte:head>

<Lightbox
	images={galleryImages}
	index={activeIndex}
	alt={hall.name}
	onclose={() => (activeIndex = null)}
	onindex={(i) => (activeIndex = i)}
/>

<div class="wrap page">

	<section class="section section--lead">
		<a href="/app/halls" class="back">
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
			{t.appHalls.backToHalls}
		</a>

		<!-- Hero -->
		<div
			class="hero"
			style={hall.cover_image_url
				? `background-image: url('${hall.cover_image_url}')`
				: `background: linear-gradient(135deg, ${hall.color}cc, ${hall.color}44)`}
		>
			<div class="hero-overlay">
				<h1>{hall.name}</h1>
				{#if hall.address}
					<p class="hero-meta">
						<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 13-8 13S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
						{hall.address}
					</p>
				{/if}
				<p class="hero-meta">
					<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
					{t.appHalls.upTo} {hall.max_people} {t.appHalls.guestsWord}
				</p>
			</div>
		</div>
	</section>

	<div class="layout">
		<div class="main-col">
			<!-- Description -->
			{#if hall.description}
				<section class="section" use:reveal>
					<div class="section-head"><h2>{t.appHalls.about}</h2></div>
					<p class="desc-text">{hall.description}</p>
				</section>
			{/if}

			<!-- Gallery -->
			{#if galleryImages.length}
				<section class="section" use:reveal>
					<div class="section-head"><h2>{t.appHalls.gallery}</h2></div>
					<div class="gallery-grid">
						{#each galleryImages as img, i (img)}
							<button class="gallery-thumb" onclick={() => (activeIndex = i)} type="button">
								<img src={img} alt={t.appHalls.hallImageAlt} />
							</button>
						{/each}
					</div>
				</section>
			{/if}

			<!-- Amenities -->
			{#if hall.amenities?.length}
				<section class="section" use:reveal>
					<div class="section-head"><h2>{t.appHalls.amenities}</h2></div>
					<div class="amenity-chips">
						{#each hall.amenities as a}
							<span class="chip">{a}</span>
						{/each}
					</div>
				</section>
			{/if}

			<!-- Opening hours -->
			{#if hall.opening_hours && Object.keys(hall.opening_hours).length}
				<section class="section" use:reveal>
					<div class="section-head"><h2>{t.appHalls.openingHours}</h2></div>
					<div class="row-list hours-list">
						{#each DAYS as day, i}
							{@const hours = hall.opening_hours[DOW_KEYS[i]] ?? hall.opening_hours[i.toString()]}
							{#if hours}
								<div class="row-item">
									<span class="hours-day">{day}</span>
									<span class="hours-val">
										{hours.open ? `${hours.from} – ${hours.to}` : t.appHalls.closed}
									</span>
								</div>
							{/if}
						{/each}
					</div>
				</section>
			{/if}
		</div>

		<!-- Sidebar -->
		<aside class="sidebar">
			<!-- Pricing -->
			{#if hall.pricing_info}
				<section class="section">
					<h3>{t.appHalls.pricing}</h3>
					<p class="pricing-text">{hall.pricing_info}</p>
				</section>
			{/if}

			<!-- Contact -->
			{#if hall.contact_phone || hall.contact_email || hall.contact_website}
				<section class="section">
					<h3>{t.appHalls.contact}</h3>
					<div class="row-list contact-list">
						{#if hall.contact_phone}
							<a href="tel:{hall.contact_phone}" class="row-item contact-row">
								<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.74 12 19.79 19.79 0 0 1 1.5 3.33 2 2 0 0 1 3.5 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8 8.09A16 16 0 0 0 12.5 12.5l.29-.29a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 14.5v2.42z"/></svg>
								{hall.contact_phone}
							</a>
						{/if}
						{#if hall.contact_email}
							<a href="mailto:{hall.contact_email}" class="row-item contact-row">
								<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 7L2 7"/></svg>
								{hall.contact_email}
							</a>
						{/if}
						{#if hall.contact_website}
							<a href={hall.contact_website} target="_blank" rel="noopener noreferrer" class="row-item contact-row">
								<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><path d="M2 12h20"/></svg>
								{hall.contact_website}
							</a>
						{/if}
					</div>
				</section>
			{/if}

			<!-- CTA -->
			<div class="card--inset cta-card">
				{#if !data.isLoggedIn}
					<p class="cta-hint">{t.appHalls.signInToReserveHint}</p>
					<a href="/app/login?redirect=/app/halls/{hall.slug ?? hall.id}" class="cta-btn">{t.appHalls.signInToBook}</a>
					<a href="/app/register" class="cta-link">{t.appHalls.noAccountCreate}</a>
				{:else if data.isClient}
					<p class="cta-hint">{t.appHalls.readyToBook}</p>
					<a href="/app/halls/{hall.slug ?? hall.id}/book" class="cta-btn">{t.appHalls.requestReservation}</a>
				{:else}
					<p class="cta-hint cta-org">{t.appHalls.orgAccountNote}</p>
				{/if}
			</div>
		</aside>
	</div>
</div>

<style>
	/* A narrower measure than the default page width; the density vars still
	   supply the gutters and the section rhythm. */
	.page { --page-max: 1000px; }

	.back {
		display: inline-flex; align-items: center; gap: 5px;
		font-size: 13px; color: var(--text-muted); text-decoration: none; font-weight: 600;
		margin-bottom: 20px;
		transition: color .15s;
	}
	.back:hover { color: var(--accent-ink); }

	.hero {
		height: 280px;
		border-radius: var(--radius-xl);
		background-size: cover;
		background-position: center;
		position: relative;
		overflow: hidden;
	}

	.hero-overlay {
		position: absolute;
		inset: 0;
		background: linear-gradient(to top, rgba(16,24,16,.7) 0%, transparent 60%);
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		padding: 28px;
		color: #fff;
	}

	.hero-overlay h1 { font-size: var(--display-size); font-weight: 550; letter-spacing: -.055em; line-height: 1.08; margin-bottom: 10px; }
	.hero-meta { font-size: 13px; opacity: .9; display: flex; align-items: center; gap: 5px; }

	.layout {
		display: grid;
		grid-template-columns: 1fr 280px;
		gap: 0 32px;
		align-items: start;
	}

	.desc-text { font-size: var(--body-size); color: var(--text-muted); line-height: var(--body-leading); white-space: pre-wrap; }

	.gallery-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
	}

	.gallery-thumb {
		aspect-ratio: 4/3;
		border-radius: var(--radius);
		overflow: hidden;
		cursor: pointer;
		padding: 0;
		border: none;
		background: none;
	}
	.gallery-thumb img { width: 100%; height: 100%; object-fit: cover; transition: transform .5s; }
	.gallery-thumb:hover img { transform: scale(1.04); }

	.amenity-chips { display: flex; flex-wrap: wrap; gap: 7px; }
	.chip {
		padding: 6px 13px;
		border-radius: var(--radius-sm);
		font-size: 11px;
		font-weight: 600;
		background: var(--bg-hover);
		border: none;
		color: var(--text-muted);
		cursor: inherit;
	}

	.hours-day { width: 90px; font-weight: 500; color: var(--text-base); flex-shrink: 0; }
	.hours-val { color: var(--text-muted); }
	.hours-list .row-item { font-size: 14px; }

	/* The sidebar is a 280px column: it keeps the hairline rhythm of the page
	   at a measure that suits it, rather than the full-width section padding. */
	.sidebar { --section-pad: 26px; position: sticky; top: 80px; }
	.sidebar h3 { font-size: 15px; font-weight: 600; letter-spacing: -.03em; color: var(--text-base); margin-bottom: 10px; }

	.pricing-text { font-size: 14px; color: var(--text-muted); white-space: pre-wrap; line-height: 1.75; }

	.contact-row { font-size: 13px; color: var(--text-muted); text-decoration: none; gap: 6px; }
	.contact-row:hover { color: var(--accent-ink); }

	.cta-card { display: flex; flex-direction: column; gap: 10px; margin-top: 26px; padding: 20px; }

	.cta-hint { font-size: 13px; color: var(--text-muted); }
	.cta-org { font-style: italic; }

	.cta-btn {
		display: block;
		padding: 12px;
		border-radius: var(--radius-sm);
		background: var(--accent);
		color: var(--accent-contrast);
		font-size: 13px;
		font-weight: 650;
		text-align: center;
		text-decoration: none;
		transition: transform .2s, background .2s;
	}
	.cta-btn:hover { background: var(--accent-hover); transform: translateY(-2px); }
	.cta-btn:active { transform: translateY(0); }

	.cta-link { font-size: 12px; color: var(--accent-ink); text-align: center; text-decoration: none; }

	@media (prefers-reduced-motion: reduce) {
		.cta-btn:hover { transform: none; }
		.gallery-thumb:hover img { transform: none; }
	}

	@media (max-width: 700px) {
		.layout { grid-template-columns: 1fr; }
		.sidebar { position: static; }
	}
</style>
