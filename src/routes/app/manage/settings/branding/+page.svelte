<script lang="ts">
	import { enhance } from '$app/forms';
	import SectionHeader from '$lib/components/SectionHeader.svelte';
	import type { PageData, ActionData } from './$types';

	interface Props { data: PageData; form: ActionData; }
	const { data, form }: Props = $props();

	const branding = $derived(data.branding);

	const themes = [
		{ id: 'slate', name: 'Slate', desc: 'Clean & modern',  accent: '#4f6ef7', bg: '#f3f4f6', panel: '#ffffff', border: '#e3e6ed' },
		{ id: 'dark',  name: 'Dark',  desc: 'Night-friendly', accent: '#818cf8', bg: '#0f1117', panel: '#16181f', border: '#2a2c36' },
		{ id: 'warm',  name: 'Warm',  desc: 'Soft & editorial', accent: '#7c3aed', bg: '#faf9f7', panel: '#ffffff', border: '#e5e0d8' },
	] as const;

	let uploading = $state(false);
	let logoUrl = $state(branding?.logoUrl ?? '');
	let logoPreview = $derived(logoUrl || '/Hallify.svg');

	async function uploadLogo(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		uploading = true;
		try {
			const fd = new FormData();
			fd.append('file', file);
			const res = await fetch('/api/upload', { method: 'POST', body: fd });
			if (res.ok) {
				const data = await res.json();
				logoUrl = data.url;
			}
		} finally {
			uploading = false;
		}
	}
</script>

<svelte:head><title>Customize – Settings – Hallify</title></svelte:head>

<div class="page">
<SectionHeader overline="Organization" title="Customize" />

{#if form?.success}
	<div class="alert-success">Changes saved successfully.</div>
{/if}

<form method="POST" action="?/save" use:enhance={() => { return async ({ update }) => { await update({ reset: false }); }; }}>
	<input type="hidden" name="logoUrl" value={logoUrl} />

	<!-- ── Theme ──────────────────────────────────── -->
	<div class="card section-card">
		<div class="section-head">
			<div>
				<div class="section-title">Default theme</div>
				<p class="section-hint">Sets the initial theme for all members of this organization. Members can always override it with their personal preference using the switcher in the sidebar.</p>
			</div>
		</div>
		<div class="theme-grid">
			{#each themes as th}
				<label class="theme-option" class:selected={(branding?.theme ?? 'slate') === th.id}>
					<input type="radio" name="theme" value={th.id} checked={(branding?.theme ?? 'slate') === th.id} />
					<div class="theme-preview" style="background:{th.bg}; border-color:{(branding?.theme ?? 'slate') === th.id ? th.accent : 'transparent'}">
						<div class="preview-sidebar" style="background:{th.panel}; border-color:{th.border}">
							<div class="preview-dot" style="background:{th.accent}"></div>
							<div class="preview-line"></div>
							<div class="preview-line short"></div>
							<div class="preview-line short"></div>
						</div>
						<div class="preview-content">
							<div class="preview-card" style="background:{th.panel}; border-color:{th.border}"></div>
							<div class="preview-card" style="background:{th.panel}; border-color:{th.border}"></div>
						</div>
					</div>
					<div class="theme-meta">
						<span class="theme-name">{th.name}</span>
						<span class="theme-desc">{th.desc}</span>
					</div>
				</label>
			{/each}
		</div>
	</div>

	<!-- ── Identity ───────────────────────────────── -->
	<div class="card section-card">
		<div class="section-title">Identity</div>
		<p class="section-hint">Shown in the sidebar and across the app for all members of this organization.</p>

		<!-- Logo -->
		<div class="field" style="margin-bottom:20px">
			<span class="field-label">Logo</span>
			<div class="logo-row">
				<div class="logo-preview">
					<img src={logoPreview} alt="Logo" onerror={(e) => { (e.target as HTMLImageElement).src = '/Hallify.svg'; }} />
				</div>
				<div class="logo-upload">
					<label class="upload-btn" class:loading={uploading}>
						{#if uploading}
							<svg class="spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
							Uploading…
						{:else}
							<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
							Upload image
						{/if}
						<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onchange={uploadLogo} disabled={uploading} />
					</label>
					{#if logoUrl && logoUrl !== '/Hallify.svg'}
						<button type="button" class="remove-logo" onclick={() => logoUrl = ''}>Remove</button>
					{/if}
					<span class="upload-hint">PNG, JPG, SVG, WebP · max 10 MB</span>
				</div>
			</div>
		</div>

		<!-- App name + tagline -->
		<div class="field-row">
			<div class="field">
				<label for="brand-name" class="field-label">Organization display name</label>
				<input id="brand-name" name="appName" type="text" value={branding?.appName ?? 'Hallify'} placeholder="Hallify" />
			</div>
			<div class="field">
				<label for="brand-tagline" class="field-label">Tagline <span class="opt">optional</span></label>
				<input id="brand-tagline" name="tagline" type="text" value={branding?.tagline ?? ''} placeholder="Venue management made simple" />
			</div>
		</div>
	</div>

	<!-- ── Accent color ───────────────────────────── -->
	<div class="card section-card">
		<div class="section-title">Accent color</div>
		<p class="section-hint">Overrides the theme's default accent on buttons, links, and highlights. Leave at the default to follow the theme.</p>
		<div class="color-row">
			<input id="brand-primary" name="primaryColor" type="color" value={branding?.primaryColor ?? '#4f6ef7'} />
			<div class="color-meta">
				<span class="color-hex">{branding?.primaryColor ?? '#4f6ef7'}</span>
				<span class="color-hint">Click to change</span>
			</div>
		</div>
		<input type="hidden" name="accentColor" value={branding?.accentColor ?? branding?.primaryColor ?? '#4f6ef7'} />
	</div>

	<div class="form-footer">
		<button type="submit" class="btn-action">Save changes</button>
		<button type="submit" formaction="?/resetDefaults" class="btn-reset">Reset to defaults</button>
	</div>
</form>
</div>

<style>
	.page { padding: 28px 32px; max-width: 720px; }

	/* Section cards */
	.section-card {
		padding: 22px 24px;
		margin-bottom: 16px;
	}

	.section-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		margin-bottom: 16px;
	}

	.section-title {
		font-size: 13px;
		font-weight: 700;
		color: var(--text-base);
		margin-bottom: 4px;
	}

	.section-hint {
		font-size: 12px;
		color: var(--text-subtle);
		line-height: 1.5;
		margin-bottom: 16px;
	}

	/* Theme grid */
	.theme-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 10px;
	}

	.theme-option {
		cursor: pointer;
		display: flex;
		flex-direction: column;
		gap: 7px;
	}
	.theme-option input[type="radio"] { display: none; }

	.theme-preview {
		border-radius: 8px;
		border: 2px solid transparent;
		overflow: hidden;
		display: flex;
		height: 80px;
		transition: border-color .15s, opacity .15s;
	}
	.theme-option:hover .theme-preview { opacity: .85; }
	.theme-option.selected .theme-preview { box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent); }

	.preview-sidebar {
		width: 36px;
		flex-shrink: 0;
		border-right: 1px solid;
		padding: 7px 5px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.preview-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		margin-bottom: 4px;
	}

	.preview-line {
		height: 4px;
		border-radius: 2px;
		background: currentColor;
		opacity: .15;
		width: 100%;
	}
	.preview-line.short { width: 60%; }

	.preview-content {
		flex: 1;
		padding: 7px;
		display: flex;
		flex-direction: column;
		gap: 5px;
	}

	.preview-card {
		flex: 1;
		border-radius: 4px;
		border: 1px solid;
	}

	.theme-meta { display: flex; flex-direction: column; gap: 1px; }
	.theme-name { font-size: 12px; font-weight: 600; color: var(--text-base); }
	.theme-desc { font-size: 11px; color: var(--text-subtle); }

	/* Logo */
	.field { margin-bottom: 14px; }
	.field-label {
		display: block;
		font-size: 12px;
		font-weight: 600;
		color: var(--text-muted);
		margin-bottom: 8px;
		letter-spacing: .01em;
	}
	.opt {
		font-weight: 400;
		color: var(--text-subtle);
	}

	.logo-row {
		display: flex;
		align-items: center;
		gap: 16px;
	}

	.logo-preview {
		width: 48px;
		height: 48px;
		border-radius: 10px;
		border: 1px solid var(--border);
		background: var(--bg-panel2);
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		flex-shrink: 0;
	}

	.logo-preview img {
		width: 32px;
		height: 32px;
		object-fit: contain;
	}

	.logo-upload {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}

	.upload-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 14px;
		border-radius: 6px;
		border: 1px solid var(--border);
		background: var(--bg-panel2);
		color: var(--text-base);
		font-size: 12px;
		font-weight: 500;
		cursor: pointer;
		transition: background .1s, border-color .1s;
		font-family: inherit;
	}
	.upload-btn:hover { background: var(--bg-hover); border-color: var(--text-subtle); }
	.upload-btn.loading { opacity: .7; cursor: default; }
	.upload-btn input[type="file"] { display: none; }

	.remove-logo {
		font-size: 12px;
		color: var(--danger);
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
		font-family: inherit;
		font-weight: 500;
	}
	.remove-logo:hover { text-decoration: underline; }

	.upload-hint {
		font-size: 11px;
		color: var(--text-subtle);
	}

	.field-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}

	/* Color */
	.color-row {
		display: flex;
		align-items: center;
		gap: 14px;
	}

	.color-row input[type="color"] {
		width: 44px;
		height: 44px;
		border-radius: 8px;
		border: 1px solid var(--border);
		padding: 3px;
		cursor: pointer;
		background: var(--bg-panel2);
		flex-shrink: 0;
	}

	.color-meta { display: flex; flex-direction: column; gap: 2px; }
	.color-hex { font-size: 13px; font-weight: 600; font-family: monospace; color: var(--text-base); }
	.color-hint { font-size: 11px; color: var(--text-subtle); }

	/* Footer actions */
	.form-footer {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-top: 4px;
	}

	.btn-reset {
		padding: 7px 16px;
		border-radius: 6px;
		font-size: 13px;
		font-weight: 500;
		border: 1px solid var(--border);
		background: var(--bg-panel);
		color: var(--text-muted);
		cursor: pointer;
		transition: border-color .12s, color .12s;
		font-family: inherit;
	}
	.btn-reset:hover { border-color: var(--danger); color: var(--danger); }

	.alert-success {
		padding: 10px 16px;
		border-radius: 8px;
		background: var(--success-dim);
		color: var(--success);
		font-size: 13px;
		font-weight: 500;
		margin-bottom: 20px;
		border: 1px solid color-mix(in srgb, var(--success) 25%, transparent);
	}

	@keyframes spin { to { transform: rotate(360deg); } }
	.spin { animation: spin .8s linear infinite; }

	@media (max-width: 640px) {
		.page { padding: 20px 16px; }
		.theme-grid { grid-template-columns: 1fr; }
		.field-row { grid-template-columns: 1fr; }
	}
</style>
