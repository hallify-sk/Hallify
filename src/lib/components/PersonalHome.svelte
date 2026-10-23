<script lang="ts">
	/**
	 * Home for a Hallify account that belongs to no organisation — most accounts: people
	 * looking for a venue. /app used to send them to /priestory, whose "Prejsť do
	 * aplikácie" led back to /app, so the account had nowhere of its own to be.
	 */
	import { t } from '$lib/i18n.svelte';
	import SectionHeader from '$lib/components/SectionHeader.svelte';

	interface Props {
		firstName: string;
		invites: { token: string; orgName: string }[];
	}
	const { firstName, invites }: Props = $props();
</script>

<div class="wrap">
	<div class="section section--lead">
		<SectionHeader overline={t.personalHome.overline} title={t.personalHome.greeting.replace('{name}', firstName)} />
		<p class="home-lead">{t.personalHome.lead}</p>
	</div>

	{#if invites.length > 0}
		<!-- Someone already asked them in: the most useful thing on the page. -->
		<section class="section">
			<div class="section-head"><h2>{t.personalHome.invitesTitle}</h2></div>
			<div class="row-list">
				{#each invites as invite (invite.token)}
					<a class="row-item invite-row" href="/app/invite/{invite.token}">
						<span class="invite-org">{invite.orgName}</span>
						<span class="invite-cta">{t.personalHome.inviteOpen}</span>
					</a>
				{/each}
			</div>
		</section>
	{/if}

	<section class="section">
		<div class="home-grid">
			<a class="card--inset home-card" href="/priestory">
				<span class="icon-tile" aria-hidden="true">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
				</span>
				<h3>{t.personalHome.findTitle}</h3>
				<p>{t.personalHome.findBody}</p>
			</a>
			<a class="card--inset home-card" href="/app/org/new">
				<span class="icon-tile" aria-hidden="true">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
				</span>
				<h3>{t.personalHome.operatorTitle}</h3>
				<p>{t.personalHome.operatorBody}</p>
			</a>
			<a class="card--inset home-card" href="/app/profile">
				<span class="icon-tile" aria-hidden="true">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
				</span>
				<h3>{t.personalHome.profileTitle}</h3>
				<p>{t.personalHome.profileBody}</p>
			</a>
		</div>
		<p class="home-hint">{t.personalHome.bookingsHint}</p>
	</section>
</div>

<style>
	/* SectionHeader carries its own 24px tail; the lead sits right under it. */
	.section--lead :global(.section-header) { margin-bottom: 12px; }
	.home-lead {
		font-size: var(--body-size);
		line-height: var(--body-leading);
		color: var(--text-muted);
		max-width: 560px;
		margin: 0;
	}

	.home-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: var(--grid-gap);
	}
	/* The empty-state block's shape (.state-block), as a link. */
	.home-card {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 10px;
		color: inherit;
		text-decoration: none;
		transition: box-shadow .15s;
	}
	.home-card:hover { box-shadow: inset 0 0 0 1px var(--border); text-decoration: none; }
	.home-card:hover h3 { color: var(--accent-ink); }
	.home-card h3 {
		font-size: var(--h3-size);
		font-weight: 600;
		letter-spacing: -.03em;
		margin: 0;
	}
	.home-card p {
		font-size: var(--body-size);
		line-height: var(--body-leading);
		color: var(--text-muted);
		margin: 0;
	}

	.home-hint {
		font-size: 12px;
		color: var(--text-subtle);
		line-height: 1.5;
		margin: 18px 0 0;
		max-width: 640px;
	}

	.invite-row { justify-content: space-between; text-decoration: none; }
	.invite-row:hover { background: var(--bg-hover); text-decoration: none; }
	.invite-org { font-weight: 600; color: var(--text-base); min-width: 0; overflow-wrap: anywhere; }
	.invite-cta { font-size: 12px; font-weight: 600; color: var(--accent-ink); flex-shrink: 0; }
</style>
