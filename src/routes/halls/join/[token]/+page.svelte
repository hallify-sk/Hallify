<script lang="ts">
	import { venueTitle, pageTitle } from '$lib/page-title';
	import { enhance } from '$app/forms';
	import { t, getLocale } from '$lib/i18n.svelte';
	import { formatDate } from '$lib/format';
	import { reveal } from '$lib/reveal';
	import type { PageData, ActionData } from './$types';

	interface Props { data: PageData; form: ActionData; }
	let { data, form }: Props = $props();

	const s = $derived(t.sharedEvent);
	const fmtDate = $derived(
		data.invite ? formatDate(data.invite.eventDate, getLocale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : ''
	);
	const unavailableText = $derived(
		data.unavailable === 'expired' ? s.joinExpired : data.unavailable === 'cancelled' ? s.joinCancelled : s.joinNotFound
	);
</script>

<svelte:head>
	<title>{data.invite ? venueTitle(data.invite.orgName, s.joinTitle) : pageTitle(s.joinUnavailable)}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="join-shell">
	{#if !data.invite}
		<section class="section section--lead" use:reveal>
			<div class="section-head">
				<h1 class="join-heading">{s.joinUnavailable}</h1>
				<p>{unavailableText}</p>
			</div>
			<a class="join-btn" href={data.signedIn ? '/halls/my-reservations' : '/halls'}>{data.signedIn ? t.clientArea.myReservations : t.nav.home}</a>
		</section>
	{:else}
		<section class="section section--lead" use:reveal>
			<div class="section-head">
				<h1 class="join-heading">{s.joinTitle}</h1>
				<p>{s.joinIntro(data.invite.orgName)}</p>
			</div>
			<div class="row-list">
				<div class="row-item"><span class="jk">{t.inviteAccept.eventLabel}</span><span class="jv">{data.invite.eventTitle}</span></div>
				<div class="row-item"><span class="jk">{t.inviteAccept.hallLabel}</span><span class="jv">{data.invite.hallName}</span></div>
				<div class="row-item"><span class="jk">{t.inviteAccept.dateLabel}</span><span class="jv">{fmtDate}</span></div>
			</div>
		</section>

		<section class="section" use:reveal>
			{#if form?.error}<p class="join-err" role="alert">{form.error}</p>{/if}
			{#if data.matches}
				<form method="POST" action="?/accept" use:enhance>
					<button type="submit" class="join-btn">{s.joinAccept}</button>
				</form>
			{:else if data.signedIn}
				<p class="join-hint">{s.joinMismatch(data.invite.email, data.currentEmail ?? '')}</p>
				<a class="join-btn" href="/logout" data-sveltekit-reload>{s.joinSignOut}</a>
			{:else}
				<p class="join-hint">{s.joinSignInHint(data.invite.email)}</p>
				<a class="join-btn" href={data.loginHref}>{s.joinSignIn}</a>
			{/if}
		</section>
	{/if}
</div>

<style>
	.join-shell { width: min(620px, 100%); margin: 0 auto; padding: 24px 16px 48px; box-sizing: border-box; }
	.join-heading {
		font-size: var(--display-size); font-weight: 550; letter-spacing: -.055em;
		line-height: 1.08; color: var(--text-base); margin: 0;
	}
	.jk { width: 76px; flex-shrink: 0; color: var(--text-muted); font-weight: 600; font-size: 13px; }
	.jv { color: var(--text-base); font-weight: 500; font-size: 13px; overflow-wrap: anywhere; }
	.join-hint { font-size: 13.5px; line-height: 1.7; color: var(--text-muted); margin: 0 0 14px; overflow-wrap: anywhere; }
	.join-btn {
		display: inline-block; width: 100%; box-sizing: border-box; text-align: center;
		padding: 12px 18px; border: none; border-radius: var(--radius-sm); cursor: pointer;
		font: inherit; font-size: 14px; font-weight: 650; text-decoration: none;
		background: var(--accent); color: var(--accent-contrast); transition: transform .2s, background .2s;
	}
	.join-btn:hover { background: var(--accent-hover); transform: translateY(-2px); }
	.join-err {
		font-size: 13px; font-weight: 600; color: var(--danger); background: var(--danger-dim);
		border: 1px solid color-mix(in srgb, var(--danger) 25%, transparent);
		border-radius: var(--radius-sm); padding: 9px 12px; margin: 0 0 14px;
	}
	@media (prefers-reduced-motion: reduce) { .join-btn:hover { transform: none; } }
</style>
