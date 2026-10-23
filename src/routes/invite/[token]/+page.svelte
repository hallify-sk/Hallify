<script lang="ts">
	import { enhance } from '$app/forms';
	import { t, getLocale } from '$lib/i18n.svelte';
	import { formatDate } from '$lib/format';
	import { reveal } from '$lib/reveal';
	import type { PageData, ActionData } from './$types';

	interface Props { data: PageData; form: ActionData; }
	let { data, form }: Props = $props();

	// event_date is a plain YYYY-MM-DD: formatDate reads it as a local calendar day.
	const fmtDate = $derived(
		data.invite
			? formatDate(data.invite.eventDate, getLocale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
			: ''
	);

	const unavailableHint = $derived(
		data.unavailable === 'used'
			? t.inviteAccept.usedHint
			: data.unavailable === 'expired'
				? t.inviteAccept.expiredHint
				: t.inviteAccept.notFoundHint
	);
</script>

<svelte:head>
	<title>{data.invite ? `${t.inviteAccept.invitedHeading} – ${data.invite.orgName}` : t.inviteAccept.unavailableTitle}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="invite-wrap">
	<!-- A plain div: the root layout already renders the page <main>. -->
	<div class="invite-shell">
		{#if !data.invite}
		<!-- Used, expired, revoked or cancelled: say which, and where to go next. -->
		<section class="section section--lead" use:reveal>
			<div class="section-head">
				<h1 class="invite-heading">{t.inviteAccept.unavailableTitle}</h1>
				<p>{unavailableHint}</p>
			</div>
			{#if data.unavailable === 'used'}
				<a class="invite-btn" href="/login">{t.inviteAccept.signIn}</a>
			{/if}
		</section>
		{:else}
		<section class="section section--lead" use:reveal>
			<div class="section-head">
				<h1 class="invite-heading">{t.inviteAccept.invitedHeading}</h1>
				<p><strong>{data.invite.orgName}</strong> {t.inviteAccept.invitedBy}.</p>
			</div>

			<div class="row-list">
				<div class="row-item"><span class="ie-k">{t.inviteAccept.eventLabel}</span><span class="ie-v">{data.invite.eventTitle}</span></div>
				<div class="row-item"><span class="ie-k">{t.inviteAccept.hallLabel}</span><span class="ie-v">{data.invite.hallName}</span></div>
				<div class="row-item"><span class="ie-k">{t.inviteAccept.dateLabel}</span><span class="ie-v">{fmtDate}</span></div>
			</div>
		</section>

		<section class="section" use:reveal>
			{#if data.loggedInMatches}
				<!-- Already signed in as the invited client → one-click claim. -->
				<div class="section-head">
					<h2>{t.inviteAccept.claimTitle}</h2>
					<p>{t.inviteAccept.claimHint}</p>
				</div>
				{#if form?.error}<p class="invite-err">{form.error}</p>{/if}
				<form method="POST" action="?/claim" use:enhance>
					<button type="submit" class="invite-btn">{t.inviteAccept.claimSubmit}</button>
				</form>
			{:else if data.loggedInDifferent}
				<!-- A different account is signed in → log out before accepting. -->
				<p class="invite-hint">{t.inviteAccept.signedInDifferent} <strong>{data.currentEmail}</strong>.</p>
				<a class="invite-btn" href="/logout">{t.inviteAccept.logOutToContinue}</a>
			{:else if data.hasAccount}
				<!-- Email already has an account → log in to claim. -->
				<p class="invite-hint">{t.inviteAccept.alreadyHaveAccount}</p>
				<a class="invite-btn" href="/login?redirect=/invite/{data.token}">{t.inviteAccept.logInToClaim}</a>
			{:else}
				<!-- New person → name + email prefilled, just choose a password. -->
				<div class="section-head">
					<h2>{t.inviteAccept.createAccountTitle}</h2>
					<p>{t.inviteAccept.createAccountHint}</p>
				</div>

				<div class="invite-readonly">
					<div class="ro-field">
						<span class="ro-label">{t.inviteAccept.nameLabel}</span>
						<span class="ro-value">{data.invite.firstName} {data.invite.lastName}</span>
					</div>
					<div class="ro-field">
						<span class="ro-label">{t.inviteAccept.emailLabel}</span>
						<span class="ro-value">{data.invite.email}</span>
					</div>
				</div>

				{#if form?.error}<p class="invite-err">{form.error}</p>{/if}
				<form method="POST" action="?/register" use:enhance class="invite-form">
					<label class="invite-flabel" for="password">{t.inviteAccept.passwordLabel}</label>
					<input id="password" name="password" type="password" required minlength={8}
						placeholder={t.inviteAccept.passwordPlaceholder} autocomplete="new-password" />
					<button type="submit" class="invite-btn">{t.inviteAccept.createSubmit}</button>
				</form>
			{/if}
		</section>
		{/if}
	</div>
</div>

<style>
	/* The page is composed from the global primitives: .section hairlines,
	   .section-head trios and .row-list rows. Only the measure, the key column
	   and the form controls are local. */
	.invite-wrap {
		min-height: 100dvh; display: flex; align-items: center; justify-content: center;
		padding: 32px 18px; background: var(--bg-base);
	}
	.invite-shell { width: min(620px, 100%); }
	.invite-heading {
		font-size: var(--display-size); font-weight: 550; letter-spacing: -.055em;
		line-height: 1.08; color: var(--text-base); margin: 0;
	}

	.ie-k { width: 76px; flex-shrink: 0; color: var(--text-muted); font-weight: 600; font-size: 13px; }
	.ie-v { color: var(--text-base); font-weight: 500; font-size: 13px; }

	.invite-hint { font-size: 13px; line-height: 1.75; color: var(--text-muted); margin: 0 0 16px; }

	.invite-readonly { display: flex; flex-direction: column; gap: 10px; margin: 0 0 16px; }
	.ro-field { display: flex; flex-direction: column; gap: 2px; }
	.ro-label { font-size: 10px; font-weight: 650; text-transform: uppercase; letter-spacing: .13em; color: var(--text-muted); }
	.ro-value { font-size: 14px; color: var(--text-base); font-weight: 500; }

	.invite-form { display: flex; flex-direction: column; gap: 8px; }
	.invite-flabel { font-size: 12.5px; font-weight: 600; color: var(--text-muted); }
	.invite-form input {
		width: 100%; box-sizing: border-box; font: inherit; font-size: 14px;
		padding: 11px 13px; border: 1px solid var(--border); border-radius: var(--radius-sm);
		background: var(--bg-panel2); color: var(--text-base);
		transition: border-color .15s, box-shadow .15s;
	}
	.invite-form input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }

	.invite-btn {
		display: inline-block; width: 100%; box-sizing: border-box; text-align: center;
		margin-top: 8px; padding: 12px 18px; border: none; border-radius: var(--radius-sm); cursor: pointer;
		font: inherit; font-size: 14px; font-weight: 650; text-decoration: none;
		background: var(--accent); color: var(--accent-contrast); transition: transform .2s, background .2s;
	}
	.invite-btn:hover { background: var(--accent-hover); transform: translateY(-2px); }
	.invite-btn:active { transform: translateY(0); }
	.invite-err {
		font-size: 13px; font-weight: 600; color: var(--danger);
		background: var(--danger-dim);
		border: 1px solid color-mix(in srgb, var(--danger) 25%, transparent);
		border-radius: var(--radius-sm); padding: 9px 12px; margin: 0 0 14px;
	}

	@media (prefers-reduced-motion: reduce) {
		.invite-btn:hover { transform: none; }
	}
</style>
