<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthShell from '$lib/components/AuthShell.svelte';
	import type { ActionData } from './$types';

	interface Props { form: ActionData; }
	const { form }: Props = $props();

	let accountType = $state<'client' | 'organization' | null>(
		(form as { accountType?: string })?.accountType as 'client' | 'organization' | null ?? null
	);
</script>

<svelte:head><title>Create account – Hallify</title></svelte:head>

<AuthShell>
	<div class="auth-header">
		<h1>Create your account</h1>
		<p class="subtitle">How will you use Hallify?</p>
	</div>

	{#if form?.error}
		<div class="notice notice-error">{form.error}</div>
	{/if}

	<!-- Step 1: choose account type -->
	<div class="type-grid">
		<button
			type="button"
			class="type-card"
			class:selected={accountType === 'client'}
			onclick={() => (accountType = 'client')}
		>
			<span class="type-icon">
				<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<rect x="3" y="4" width="18" height="18" rx="2"/>
					<path d="M16 2v4M8 2v4M3 10h18"/>
					<path d="m9 16 2 2 4-4"/>
				</svg>
			</span>
			<strong>Find &amp; Book</strong>
			<span class="type-desc">Browse halls, request reservations and manage your events</span>
		</button>
		<button
			type="button"
			class="type-card"
			class:selected={accountType === 'organization'}
			onclick={() => (accountType = 'organization')}
		>
			<span class="type-icon">
				<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="M3 21h18"/>
					<path d="M5 21V7l7-4 7 4v14"/>
					<path d="M9 21v-4h6v4"/>
					<rect x="9" y="9" width="2" height="2"/>
					<rect x="13" y="9" width="2" height="2"/>
					<rect x="9" y="13" width="2" height="2"/>
					<rect x="13" y="13" width="2" height="2"/>
				</svg>
			</span>
			<strong>Manage Venues</strong>
			<span class="type-desc">List your halls, handle bookings and grow your business</span>
		</button>
	</div>

	<!-- Step 2: fill details (appears after type selection) -->
	{#if accountType}
		<form method="POST" use:enhance class="auth-form">
			<input type="hidden" name="accountType" value={accountType} />

			<div class="field-row">
				<div class="field">
					<label for="firstName">First name</label>
					<input id="firstName" name="firstName" type="text" placeholder="Ján" required />
				</div>
				<div class="field">
					<label for="lastName">Last name</label>
					<input id="lastName" name="lastName" type="text" placeholder="Novák" required />
				</div>
			</div>
			<div class="field">
				<label for="email">Email</label>
				<input id="email" name="email" type="email" placeholder="you@example.com" required autocomplete="email" />
			</div>
			<div class="field">
				<label for="password">Password</label>
				<input id="password" name="password" type="password" placeholder="At least 6 characters" required autocomplete="new-password" />
			</div>
			<button type="submit" class="submit-btn">
				{accountType === 'client' ? 'Create client account' : 'Create organization account'}
			</button>
		</form>
	{/if}

	<p class="auth-switch">Already have an account? <a href="/app/login">Sign in</a></p>
</AuthShell>

<style>
	.auth-header { margin-bottom: 24px; }

	h1 {
		font-size: 24px;
		font-weight: 700;
		color: var(--text-base);
		letter-spacing: -0.02em;
		margin-bottom: 6px;
	}

	.subtitle {
		font-size: 14px;
		color: var(--text-muted);
	}

	.notice {
		padding: 10px 14px;
		border-radius: 8px;
		font-size: 13px;
		font-weight: 500;
		margin-bottom: 16px;
		background: var(--danger-dim);
		color: var(--danger);
		border: 1px solid color-mix(in srgb, var(--danger) 25%, transparent);
	}

	.type-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
		margin-bottom: 24px;
	}

	.type-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		padding: 20px 14px;
		border-radius: 12px;
		border: 2px solid var(--border);
		background: var(--surface);
		cursor: pointer;
		text-align: center;
		transition: border-color .15s, background .15s;
		font-family: inherit;
	}

	.type-card:hover {
		border-color: var(--accent);
		background: color-mix(in srgb, var(--accent) 5%, var(--surface));
	}

	.type-card.selected {
		border-color: var(--accent);
		background: color-mix(in srgb, var(--accent) 10%, var(--surface));
	}

	.type-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--accent);
	}

	.type-card strong {
		font-size: 14px;
		font-weight: 700;
		color: var(--text-base);
	}

	.type-desc {
		font-size: 12px;
		color: var(--text-muted);
		line-height: 1.4;
	}

	.auth-form { display: flex; flex-direction: column; gap: 16px; }

	.field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

	.field { display: flex; flex-direction: column; gap: 5px; }

	label {
		font-size: 12px;
		font-weight: 600;
		color: var(--text-muted);
	}

	.submit-btn {
		width: 100%;
		padding: 11px;
		margin-top: 4px;
		border-radius: 8px;
		background: var(--accent);
		color: #fff;
		font-size: 14px;
		font-weight: 600;
		border: none;
		cursor: pointer;
		font-family: inherit;
		transition: background .15s;
	}
	.submit-btn:hover { background: var(--accent-hover); }

	.auth-switch {
		text-align: center;
		font-size: 13px;
		color: var(--text-muted);
		margin-top: 24px;
	}
	.auth-switch a { color: var(--accent); font-weight: 600; text-decoration: none; }
	.auth-switch a:hover { text-decoration: underline; }
</style>
