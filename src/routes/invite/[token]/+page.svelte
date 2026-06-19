<script lang="ts">
	import { enhance } from '$app/forms';
	import { t, getLocale } from '$lib/i18n.svelte';
	import type { PageData, ActionData } from './$types';

	interface Props { data: PageData; form: ActionData; }
	let { data, form }: Props = $props();

	const fmtDate = $derived(
		new Date(data.invite.eventDate).toLocaleDateString(getLocale() === 'en' ? 'en-GB' : 'sk-SK', {
			weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
		})
	);
</script>

<svelte:head><title>{t.inviteAccept.invitedHeading} – {data.invite.orgName}</title></svelte:head>

<div class="invite-wrap">
	<div class="invite-card">
		<h1 class="invite-heading">{t.inviteAccept.invitedHeading}</h1>
		<p class="invite-intro"><strong>{data.invite.orgName}</strong> {t.inviteAccept.invitedBy}.</p>

		<div class="invite-event">
			<div class="ie-row"><span class="ie-k">{t.inviteAccept.eventLabel}</span><span class="ie-v">{data.invite.eventTitle}</span></div>
			<div class="ie-row"><span class="ie-k">{t.inviteAccept.hallLabel}</span><span class="ie-v">{data.invite.hallName}</span></div>
			<div class="ie-row"><span class="ie-k">{t.inviteAccept.dateLabel}</span><span class="ie-v">{fmtDate}</span></div>
		</div>

		{#if data.loggedInMatches}
			<!-- Already signed in as the invited client → one-click claim. -->
			<h2 class="invite-sub">{t.inviteAccept.claimTitle}</h2>
			<p class="invite-hint">{t.inviteAccept.claimHint}</p>
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
			<h2 class="invite-sub">{t.inviteAccept.createAccountTitle}</h2>
			<p class="invite-hint">{t.inviteAccept.createAccountHint}</p>

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
	</div>
</div>

<style>
	.invite-wrap {
		min-height: 100dvh; display: flex; align-items: center; justify-content: center;
		padding: 32px 18px; background: var(--bg-base);
	}
	.invite-card {
		width: 100%; max-width: 440px; background: var(--bg-panel);
		border: 1px solid var(--border); border-radius: 16px; padding: 28px;
		box-shadow: 0 10px 40px -12px rgba(0,0,0,.18);
	}
	.invite-heading { font-size: 20px; font-weight: 800; letter-spacing: -.025em; color: var(--text-base); margin: 0 0 6px; }
	.invite-intro { font-size: 14px; line-height: 1.6; color: var(--text-muted); margin: 0 0 18px; }

	.invite-event {
		background: var(--bg-panel2, var(--bg-base)); border: 1px solid var(--border);
		border-radius: 11px; padding: 12px 14px; margin: 0 0 20px;
	}
	.ie-row { display: flex; gap: 12px; padding: 4px 0; font-size: 13px; }
	.ie-k { width: 64px; flex-shrink: 0; color: var(--text-subtle); font-weight: 600; }
	.ie-v { color: var(--text-base); font-weight: 500; }

	.invite-sub { font-size: 15px; font-weight: 700; color: var(--text-base); margin: 0 0 4px; }
	.invite-hint { font-size: 13px; line-height: 1.6; color: var(--text-muted); margin: 0 0 16px; }

	.invite-readonly { display: flex; flex-direction: column; gap: 10px; margin: 0 0 16px; }
	.ro-field { display: flex; flex-direction: column; gap: 2px; }
	.ro-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--text-subtle); }
	.ro-value { font-size: 14px; color: var(--text-base); font-weight: 500; }

	.invite-form { display: flex; flex-direction: column; gap: 8px; }
	.invite-flabel { font-size: 12.5px; font-weight: 600; color: var(--text-muted); }
	.invite-form input {
		width: 100%; box-sizing: border-box; font: inherit; font-size: 14px;
		padding: 11px 13px; border: 1px solid var(--border); border-radius: 10px;
		background: var(--bg-panel2, var(--bg-base)); color: var(--text-base);
	}
	.invite-form input:focus { outline: none; border-color: var(--accent); }

	.invite-btn {
		display: inline-block; width: 100%; box-sizing: border-box; text-align: center;
		margin-top: 8px; padding: 12px 18px; border: none; border-radius: 10px; cursor: pointer;
		font: inherit; font-size: 14px; font-weight: 700; text-decoration: none;
		background: var(--accent); color: #fff; transition: filter .12s;
	}
	.invite-btn:hover { filter: brightness(1.06); }
	.invite-err {
		font-size: 13px; font-weight: 600; color: var(--danger, #dc2626);
		background: color-mix(in srgb, var(--danger, #dc2626) 8%, transparent);
		border: 1px solid color-mix(in srgb, var(--danger, #dc2626) 24%, transparent);
		border-radius: 9px; padding: 9px 12px; margin: 0 0 14px;
	}
</style>
