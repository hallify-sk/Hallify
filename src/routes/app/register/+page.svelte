<script lang="ts">
	import { pageTitle } from '$lib/page-title';
	import { onMount } from 'svelte';
	import { saas } from '$lib/analytics';
	import { enhance } from '$app/forms';
	import { t } from '$lib/i18n.svelte';
	import AuthShell from '$lib/components/AuthShell.svelte';
	import type { PageData, ActionData } from './$types';

	interface Props { data: PageData; form: ActionData; }
	const { data, form }: Props = $props();

	// Routing hint only — it decides which page follows the sign-up, never what
	// the account is. The server re-reads and re-validates it on submit.
	let intent = $state<'guest' | 'operator'>(form?.intent ?? data.intent);

	// Bound, not value={form?.x}: a one-way value is re-applied whenever the template
	// updates, so switching the intent above wiped the name and email already typed.
	let firstName = $state(form?.firstName ?? '');
	let lastName = $state(form?.lastName ?? '');
	let email = $state(form?.email ?? '');

	// Back to sign-in without losing where they were going (an invitation, a venue).
	const loginHref = $derived(data.next ? `/app/login?redirect=${encodeURIComponent(data.next)}` : '/app/login');

	onMount(() => saas.signUpStarted());
</script>

<svelte:head><title>{pageTitle(t.auth.createAccount)}</title></svelte:head>

<AuthShell>
	<div class="section-head auth-header">
		<h1>{t.authPages.registerTitle}</h1>
		<p class="subtitle">{t.authPages.registerSubtitle}</p>
	</div>

	{#if form?.error}
		<div class="notice notice-error">{form.error}</div>
	{/if}

	<form
		method="POST"
		class="auth-form"
		use:enhance={() => async ({ result, update }) => {
			// The sign-up conversion fires here for venue-seekers. Operators are
			// counted on /app/org/new, which already reports it on mount — firing
			// in both places would double-count the same account.
			if (result.type === 'redirect' && result.location !== '/app/org/new') saas.signUpCompleted();
			await update();
		}}
	>
		<input type="hidden" name="redirect" value={data.next} />

		<fieldset class="intent">
			<legend>{t.authPages.registerIntentLegend}</legend>
			<div class="intent-opts">
				<label class="intent-opt" class:is-on={intent === 'guest'}>
					<input type="radio" name="intent" value="guest" bind:group={intent} />
					<span class="intent-mark" aria-hidden="true"></span>
					<span class="intent-copy">
						<span class="intent-name">{t.authPages.registerIntentGuest}</span>
						<span class="intent-hint">{t.authPages.registerIntentGuestHint}</span>
					</span>
				</label>
				<label class="intent-opt" class:is-on={intent === 'operator'}>
					<input type="radio" name="intent" value="operator" bind:group={intent} />
					<span class="intent-mark" aria-hidden="true"></span>
					<span class="intent-copy">
						<span class="intent-name">{t.authPages.registerIntentOperator}</span>
						<span class="intent-hint">{t.authPages.registerIntentOperatorHint}</span>
					</span>
				</label>
			</div>
		</fieldset>

		<div class="field-row">
			<div class="field">
				<label for="firstName">{t.auth.firstName}</label>
				<input id="firstName" name="firstName" type="text" placeholder="Ján" bind:value={firstName} required autocomplete="given-name" />
			</div>
			<div class="field">
				<label for="lastName">{t.auth.lastName}</label>
				<input id="lastName" name="lastName" type="text" placeholder="Novák" bind:value={lastName} required autocomplete="family-name" />
			</div>
		</div>
		<div class="field">
			<label for="email">{t.auth.email}</label>
			<input id="email" name="email" type="email" placeholder="you@example.com" bind:value={email} required autocomplete="email" />
		</div>
		<div class="field">
			<label for="password">{t.auth.password}</label>
			<input id="password" name="password" type="password" placeholder={t.auth.passwordMin} required autocomplete="new-password" />
		</div>
		<label class="consent">
			<input type="checkbox" name="acceptTerms" required />
			<span>
				{t.authPages.registerTermsBefore}
				<a href="/terms" target="_blank" rel="noopener">{t.authPages.registerTermsLink}</a>
				{t.authPages.registerTermsBetween}
				<a href="/privacy" target="_blank" rel="noopener">{t.authPages.registerPrivacyLink}</a>.
			</span>
		</label>
		<!-- The DPA is the organisation's contract, accepted on /app/org/new when the
		     account becomes a controller; a personal account never enters into it. -->
		<p class="consent-note">
			{t.authPages.registerDpaBefore}
			<a href="/dpa" target="_blank" rel="noopener">{t.authPages.registerDpaLink}</a>{t.authPages.registerDpaAfter}
		</p>
		<button type="submit" class="submit-btn">{t.authPages.registerSubmit}</button>
		<p class="next-hint">
			{intent === 'operator' ? t.authPages.registerNextOperator : t.authPages.registerNextGuest}
		</p>
	</form>

	<p class="auth-switch">{t.auth.hasAccount} <a href={loginHref}>{t.auth.signInLink}</a></p>
</AuthShell>

<style>
	/* Spacing and the subtitle's treatment come from the global .section-head. */
	h1 {
		font-size: 28px;
		font-weight: 550;
		color: var(--text-base);
		letter-spacing: -0.045em;
		line-height: 1.12;
		margin: 0;
	}

	.notice {
		padding: 10px 14px;
		border-radius: var(--radius-sm);
		font-size: 13px;
		font-weight: 500;
		margin-bottom: 16px;
	}
	.notice-error {
		background: var(--danger-dim);
		color: var(--danger);
	}

	.auth-form { display: flex; flex-direction: column; gap: 16px; }

	.field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

	.field { display: flex; flex-direction: column; gap: 5px; }

	label {
		font-size: 12px;
		font-weight: 600;
		color: var(--text-muted);
	}

	/* ── Audience choice ───────────────────────────────────────────── */
	/* Both audiences sign up on this one form, so the first thing the page
	   asks is which one you are. It changes nothing about the account — only
	   the page we open next. */
	/* A fieldset is left in normal flow on purpose: `display:flex` on one is
	   rendered inconsistently across browsers because the legend sits outside
	   the box's formatting context. min-width:0 defeats its min-content default. */
	.intent {
		border: none;
		padding: 0;
		min-width: 0;
	}
	.intent legend {
		/* An ordinary small uppercase label, not a section eyebrow. */
		padding: 0;
		margin-bottom: 8px;
		font-size: 10px;
		font-weight: 650;
		text-transform: uppercase;
		letter-spacing: .13em;
		color: var(--text-muted);
	}
	.intent-opts { display: flex; flex-direction: column; gap: 8px; }

	.intent-opt {
		position: relative;
		display: flex;
		align-items: flex-start;
		gap: 11px;
		padding: 11px 13px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg-panel);
		cursor: pointer;
		font-size: 13px;
		font-weight: 400;
		color: var(--text-base);
		transition: border-color .15s, background .15s;
	}
	.intent-opt:hover { border-color: var(--text-subtle); }
	.intent-opt.is-on {
		border-color: var(--accent);
		background: var(--accent-dim);
	}
	.intent-opt:focus-within {
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-dim);
	}

	/* The native control stays in the DOM — keyboard, screen readers and form
	   submission all run through it — it is just not what you look at. */
	.intent-opt input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}

	/* Square, inside and out: the language has no round controls beyond true
	   circles and physical metaphors, and a choice box is neither. */
	.intent-mark {
		flex-shrink: 0;
		width: 14px;
		height: 14px;
		margin-top: 2px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg-base);
		display: grid;
		place-items: center;
		transition: border-color .15s, background .15s;
	}
	.intent-opt.is-on .intent-mark {
		border-color: var(--accent);
		background: var(--accent);
	}
	.intent-opt.is-on .intent-mark::after {
		content: '';
		width: 6px;
		height: 6px;
		background: var(--accent-contrast);
	}

	.intent-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
	.intent-name { font-size: 13px; font-weight: 600; color: var(--text-base); letter-spacing: -.01em; }
	.intent-hint { font-size: 11.5px; color: var(--text-muted); line-height: 1.45; }

	/* The one checkbox on the page, so it keeps the native control (accent-coloured)
	   rather than the intent cards' custom mark. */
	.consent {
		display: flex;
		align-items: flex-start;
		gap: 9px;
		font-size: 12px;
		font-weight: 400;
		line-height: 1.5;
		color: var(--text-muted);
		cursor: pointer;
	}
	.consent input { width: 16px; height: 16px; margin: 1px 0 0; flex-shrink: 0; accent-color: var(--accent); }
	.consent a { color: var(--accent-ink); font-weight: 600; text-decoration: none; }
	.consent a:hover { text-decoration: underline; }
	/* Sits under the checkbox text, aligned with it (16px box + 9px gap). */
	.consent-note {
		margin: -8px 0 0 25px;
		font-size: 11.5px;
		line-height: 1.45;
		color: var(--text-subtle);
	}
	.consent-note a { color: var(--accent-ink); font-weight: 600; text-decoration: none; }
	.consent-note a:hover { text-decoration: underline; }

	.submit-btn {
		width: 100%;
		padding: 12px;
		margin-top: 6px;
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

	.next-hint {
		font-size: 11.5px;
		color: var(--text-subtle);
		line-height: 1.45;
		margin: -6px 0 0;
		text-align: center;
	}

	.auth-switch {
		text-align: center;
		font-size: 13px;
		color: var(--text-muted);
		margin-top: 28px;
	}
	.auth-switch a { color: var(--accent-ink); font-weight: 600; text-decoration: none; }
	.auth-switch a:hover { text-decoration: underline; }

	@media (prefers-reduced-motion: reduce) {
		.submit-btn:hover { transform: none; }
	}
</style>
