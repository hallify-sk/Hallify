<script lang="ts">
	import { enhance } from '$app/forms';
	import { t } from '$lib/i18n.svelte';
	import VenueAuthCard from '$lib/site/VenueAuthCard.svelte';
	import type { PageData, ActionData } from './$types';

	interface Props { data: PageData; form: ActionData; }
	const { data, form }: Props = $props();
</script>

<svelte:head><title>{t.forgotPassword.resetTitle} – {data.domainOrg.name}</title></svelte:head>

<VenueAuthCard org={data.domainOrg}>
	{#if !data.valid}
		<div class="auth-header">
			<h1>{t.forgotPassword.resetTitle}</h1>
		</div>
		<div class="notice notice-error" role="alert">{t.forgotPassword.invalidToken}</div>
		<p class="auth-switch">
			<!-- The venue's own recovery page: /app/* sends clients back to /halls here. -->
			<a href="/forgot-password">
				<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
					<polyline points="15 18 9 12 15 6"/>
				</svg>
				{t.forgotPassword.title}
			</a>
		</p>
	{:else}
		<div class="auth-header">
			<h1>{t.forgotPassword.resetTitle}</h1>
			<p class="subtitle">{t.forgotPassword.resetSubtitle}</p>
		</div>

		{#if form?.error}
			<div class="notice notice-error" role="alert">{form.error}</div>
		{/if}

		<form method="POST" use:enhance class="auth-form">
			<div class="field">
				<label for="password">{t.profile.newPassword}</label>
				<input id="password" name="password" type="password" required minlength="8" autocomplete="new-password" placeholder="••••••••" />
			</div>
			<div class="field">
				<label for="confirmPassword">{t.profile.confirmPassword}</label>
				<input id="confirmPassword" name="confirmPassword" type="password" required minlength="8" autocomplete="new-password" placeholder="••••••••" />
			</div>
			<!-- Client accounts need 8 characters, as at registration; the shared hint said 6. -->
			<p class="hint">{t.publicBooking.passwordMin8Hint}</p>
			<button type="submit" class="submit-btn">{t.forgotPassword.resetButton}</button>
		</form>
	{/if}
</VenueAuthCard>

<style>
	.auth-header { margin-bottom: 32px; }

	h1 {
		font-size: 28px;
		font-weight: 550;
		color: var(--text-base);
		letter-spacing: -0.045em;
		line-height: 1.12;
		margin-bottom: 8px;
	}

	.subtitle {
		font-size: 14px;
		color: var(--text-muted);
		line-height: 1.75;
	}

	.notice {
		padding: 10px 14px;
		border-radius: var(--radius-sm);
		font-size: 13px;
		font-weight: 500;
		margin-bottom: 20px;
	}
	.notice-error {
		background: var(--danger-dim);
		color: var(--danger);
		border: 1px solid color-mix(in srgb, var(--danger) 25%, transparent);
	}

	.auth-form { display: flex; flex-direction: column; gap: 16px; }

	.field { display: flex; flex-direction: column; gap: 5px; }

	label {
		font-size: 12px;
		font-weight: 600;
		color: var(--text-muted);
	}

	.hint {
		font-size: 11px;
		color: var(--text-subtle);
		margin-top: -6px;
	}

	.submit-btn {
		width: 100%;
		padding: 12px;
		border-radius: var(--radius-sm);
		background: var(--accent);
		color: var(--accent-contrast);
		font-size: 14px;
		font-weight: 650;
		border: none;
		cursor: pointer;
		font-family: inherit;
		transition: transform .2s, background .2s;
	}
	.submit-btn:hover { background: var(--accent-hover); transform: translateY(-2px); }
	.submit-btn:active { transform: translateY(0); }

	.auth-switch {
		text-align: center;
		font-size: 13px;
		margin-top: 28px;
	}
	.auth-switch a {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		color: var(--text-muted);
		text-decoration: none;
	}
	.auth-switch a:hover { color: var(--accent-ink); text-decoration: none; }

	@media (prefers-reduced-motion: reduce) {
		.submit-btn:hover { transform: none; }
	}
</style>
