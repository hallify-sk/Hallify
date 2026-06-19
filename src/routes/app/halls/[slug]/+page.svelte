<script lang="ts">
	import { t } from '$lib/i18n.svelte';
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

	let activeImg = $state<string | null>(null);
</script>

<svelte:head><title>{hall.name} – Hallify</title></svelte:head>

<!-- Lightbox -->
{#if activeImg}
	<div class="lightbox" role="button" tabindex="-1" onclick={() => (activeImg = null)} onkeydown={e => e.key === 'Escape' && (activeImg = null)}>
		<img src={activeImg} alt={t.appHalls.gallery} />
	</div>
{/if}

<div class="page">
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

	<div class="layout">
		<div class="main-col">
			<!-- Description -->
			{#if hall.description}
				<section class="section">
					<h2>{t.appHalls.about}</h2>
					<p class="desc-text">{hall.description}</p>
				</section>
			{/if}

			<!-- Gallery -->
			{#if hall.gallery_images?.length}
				<section class="section">
					<h2>{t.appHalls.gallery}</h2>
					<div class="gallery-grid">
						{#each hall.gallery_images as img}
							<button class="gallery-thumb" onclick={() => (activeImg = img)} type="button">
								<img src={img} alt={t.appHalls.hallImageAlt} />
							</button>
						{/each}
					</div>
				</section>
			{/if}

			<!-- Amenities -->
			{#if hall.amenities?.length}
				<section class="section">
					<h2>{t.appHalls.amenities}</h2>
					<div class="amenity-chips">
						{#each hall.amenities as a}
							<span class="chip">{a}</span>
						{/each}
					</div>
				</section>
			{/if}

			<!-- Opening hours -->
			{#if hall.opening_hours && Object.keys(hall.opening_hours).length}
				<section class="section">
					<h2>{t.appHalls.openingHours}</h2>
					<div class="hours-list">
						{#each DAYS as day, i}
							{@const hours = hall.opening_hours[i.toString()]}
							{#if hours}
								<div class="hours-row">
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
				<div class="sidebar-card">
					<h3>{t.appHalls.pricing}</h3>
					<p class="pricing-text">{hall.pricing_info}</p>
				</div>
			{/if}

			<!-- Contact -->
			{#if hall.contact_phone || hall.contact_email || hall.contact_website}
				<div class="sidebar-card">
					<h3>{t.appHalls.contact}</h3>
					<div class="contact-list">
						{#if hall.contact_phone}
							<a href="tel:{hall.contact_phone}" class="contact-row">
								<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.74 12 19.79 19.79 0 0 1 1.5 3.33 2 2 0 0 1 3.5 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8 8.09A16 16 0 0 0 12.5 12.5l.29-.29a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 14.5v2.42z"/></svg>
								{hall.contact_phone}
							</a>
						{/if}
						{#if hall.contact_email}
							<a href="mailto:{hall.contact_email}" class="contact-row">
								<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 7L2 7"/></svg>
								{hall.contact_email}
							</a>
						{/if}
						{#if hall.contact_website}
							<a href={hall.contact_website} target="_blank" rel="noopener noreferrer" class="contact-row">
								<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><path d="M2 12h20"/></svg>
								{hall.contact_website}
							</a>
						{/if}
					</div>
				</div>
			{/if}

			<!-- CTA -->
			<div class="sidebar-card cta-card">
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
	.page { display: flex; flex-direction: column; gap: 20px; max-width: 960px; margin: 0 auto; padding: 24px 28px; }

	.back {
		display: inline-flex; align-items: center; gap: 5px; align-self: flex-start;
		font-size: 13px; color: var(--text-muted); text-decoration: none; font-weight: 600;
		transition: color .12s;
	}
	.back:hover { color: var(--accent); }

	.hero {
		height: 280px;
		border-radius: 16px;
		background-size: cover;
		background-position: center;
		position: relative;
		overflow: hidden;
	}

	.hero-overlay {
		position: absolute;
		inset: 0;
		background: linear-gradient(to top, rgba(0,0,0,.7) 0%, transparent 60%);
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		padding: 24px;
		color: #fff;
	}

	.hero-overlay h1 { font-size: 28px; font-weight: 800; margin-bottom: 6px; }
	.hero-meta { font-size: 14px; opacity: .9; display: flex; align-items: center; gap: 5px; }

	.layout {
		display: grid;
		grid-template-columns: 1fr 280px;
		gap: 24px;
		align-items: start;
	}

	.main-col { display: flex; flex-direction: column; gap: 28px; }

	.section { display: flex; flex-direction: column; gap: 12px; }
	.section h2 { font-size: 15px; font-weight: 700; color: var(--text-base); }

	.desc-text { font-size: 14px; color: var(--text-muted); line-height: 1.6; white-space: pre-wrap; }

	.gallery-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
	}

	.gallery-thumb {
		aspect-ratio: 4/3;
		border-radius: 8px;
		overflow: hidden;
		cursor: pointer;
		padding: 0;
		border: none;
		background: none;
	}
	.gallery-thumb img { width: 100%; height: 100%; object-fit: cover; transition: opacity .15s; }
	.gallery-thumb:hover img { opacity: .85; }

	.amenity-chips { display: flex; flex-wrap: wrap; gap: 6px; }
	.chip {
		padding: 5px 12px;
		border-radius: 99px;
		font-size: 12px;
		font-weight: 600;
		background: var(--bg-panel2, var(--bg-base));
		border: 1px solid var(--border);
		color: var(--text-muted);
	}

	.hours-list { display: flex; flex-direction: column; gap: 4px; }
	.hours-row { display: flex; gap: 12px; font-size: 14px; }
	.hours-day { width: 90px; font-weight: 500; color: var(--text-base); }
	.hours-val { color: var(--text-muted); }

	.sidebar { display: flex; flex-direction: column; gap: 16px; position: sticky; top: 80px; }

	.sidebar-card {
		border-radius: 14px;
		border: 1px solid var(--border);
		background: var(--bg-panel);
		padding: 16px 18px;
	}
	.sidebar-card h3 { font-size: 13px; font-weight: 700; color: var(--text-base); margin-bottom: 10px; }

	.pricing-text { font-size: 14px; color: var(--text-muted); white-space: pre-wrap; line-height: 1.5; }

	.contact-list { display: flex; flex-direction: column; gap: 8px; }
	.contact-row { font-size: 13px; color: var(--text-muted); text-decoration: none; display: flex; align-items: center; gap: 6px; }
	.contact-row:hover { color: var(--accent); }

	.cta-card { display: flex; flex-direction: column; gap: 10px; }

	.cta-hint { font-size: 13px; color: var(--text-muted); }
	.cta-org { font-style: italic; }

	.cta-btn {
		display: block;
		padding: 11px;
		border-radius: 8px;
		background: var(--accent);
		color: #fff;
		font-size: 14px;
		font-weight: 600;
		text-align: center;
		text-decoration: none;
		transition: background .15s;
	}
	.cta-btn:hover { background: var(--accent-hover); }

	.cta-link { font-size: 12px; color: var(--accent); text-align: center; text-decoration: none; }

	/* Lightbox */
	.lightbox {
		position: fixed;
		inset: 0;
		background: rgba(0,0,0,.85);
		z-index: 1000;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: zoom-out;
	}
	.lightbox img { max-width: 90vw; max-height: 90vh; border-radius: 8px; }

	@media (max-width: 700px) {
		.layout { grid-template-columns: 1fr; }
		.sidebar { position: static; }
	}
</style>
