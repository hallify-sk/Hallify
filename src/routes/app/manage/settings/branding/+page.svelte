<script lang="ts">
	import { enhance } from '$app/forms';
	import { t } from '$lib/i18n.svelte';
	import SectionHeader from '$lib/components/SectionHeader.svelte';
	import type { PageData, ActionData } from './$types';

	interface Props { data: PageData; form: ActionData; }
	const { data, form }: Props = $props();

	const branding = $derived(data.branding);

	let selectedLang = $state<'sk' | 'en'>(data.orgLanguage ?? 'sk');
	const LANGS = [
		{ id: 'sk', name: 'Slovenčina', short: 'SK' },
		{ id: 'en', name: 'English',    short: 'EN' },
	] as const;

	const themes = $derived([
		{ id: 'slate', name: t.settingsPages.themeSlate, desc: t.settingsPages.themeSlateDesc, accent: '#4f6ef7', bg: '#f3f4f6', panel: '#ffffff', border: '#e3e6ed' },
		{ id: 'dark',  name: t.settingsPages.themeDark,  desc: t.settingsPages.themeDarkDesc,  accent: '#818cf8', bg: '#0f1117', panel: '#16181f', border: '#2a2c36' },
		{ id: 'warm',  name: t.settingsPages.themeWarm,  desc: t.settingsPages.themeWarmDesc,  accent: '#7c3aed', bg: '#faf9f7', panel: '#ffffff', border: '#e5e0d8' },
	] as const);

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

<svelte:head><title>{t.settingsPages.customizeTitle} – {t.settings.title} – Hallify</title></svelte:head>

<div class="page">
<SectionHeader overline={t.settingsPages.organization} title={t.settingsPages.customizeTitle} />

{#if form?.success}
	<div class="alert-success">{t.settingsPages.changesSaved}</div>
{/if}

<!-- ── Default language (available to all plans) ──────────── -->
<form method="POST" action="?/saveLanguage" class="lang-card"
	use:enhance={() => { return async ({ update }) => { await update({ reset: false }); }; }}>
	<div class="lang-card-head">
		<h2>{t.settingsPages.defaultLanguage}</h2>
		<p>{t.settingsPages.defaultLanguageHintPre} <code>?lang=</code> {t.settingsPages.defaultLanguageHintPost}</p>
	</div>
	<div class="lang-options">
		{#each LANGS as l}
			<label class="lang-option" class:sel={selectedLang === l.id}>
				<input type="radio" name="language" value={l.id} bind:group={selectedLang} />
				<span class="lang-short">{l.short}</span>
				<span class="lang-name">{l.name}</span>
			</label>
		{/each}
	</div>
	<button type="submit" class="btn-action btn-sm lang-save">{t.settingsPages.saveLanguage}</button>
</form>

<!-- ── Analytics (available to all plans; applies to this org's bubble only) ── -->
<form method="POST" action="?/saveGtm" class="lang-card"
	use:enhance={() => { return async ({ update }) => { await update({ reset: false }); }; }}>
	<div class="lang-card-head">
		<h2>{t.settingsPages.analyticsTitle}</h2>
		<p>{t.settingsPages.analyticsHint}</p>
	</div>
	<input class="gtm-input" type="text" name="gtmContainerId" placeholder="GTM-XXXXXXX"
		value={data.gtmContainerId ?? ''} autocomplete="off" spellcheck="false" />
	{#if form?.error}<p class="gtm-err">{form.error}</p>{/if}
	{#if form?.gtmSuccess}<p class="gtm-ok">{t.settingsPages.analyticsSaved}</p>{/if}
	<button type="submit" class="btn-action btn-sm lang-save">{t.settingsPages.saveAnalytics}</button>
</form>

{#if data.locked}
	<div class="locked-card">
		<div class="locked-icon">
			<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
		</div>
		<h3>{t.settingsPages.customizationLockedTitle}</h3>
		<p>{t.settingsPages.upgradeTo} <strong>Starter</strong> {t.settingsPages.customizationLockedHint}</p>
		<a href="/app/billing" class="btn-action locked-cta">{t.settingsPages.viewPlans}</a>
	</div>
{:else}
<form method="POST" action="?/save" use:enhance={() => { return async ({ update }) => { await update({ reset: false }); }; }}>
	<input type="hidden" name="logoUrl" value={logoUrl} />

	<!-- ── Theme ──────────────────────────────────── -->
	<div class="card section-card">
		<div class="section-head">
			<div>
				<div class="section-title">{t.settingsPages.defaultTheme}</div>
				<p class="section-hint">{t.settingsPages.defaultThemeHint}</p>
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
		<div class="section-title">{t.settingsPages.identity}</div>
		<p class="section-hint">{t.settingsPages.identityHint}</p>

		<!-- Logo -->
		<div class="field" style="margin-bottom:20px">
			<span class="field-label">{t.settingsPages.logo}</span>
			<div class="logo-row">
				<div class="logo-preview">
					<img src={logoPreview} alt="Logo" onerror={(e) => { (e.target as HTMLImageElement).src = '/Hallify.svg'; }} />
				</div>
				<div class="logo-upload">
					<label class="upload-btn" class:loading={uploading}>
						{#if uploading}
							<svg class="spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
							{t.settingsPages.uploading}
						{:else}
							<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
							{t.settingsPages.uploadImage}
						{/if}
						<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onchange={uploadLogo} disabled={uploading} />
					</label>
					{#if logoUrl && logoUrl !== '/Hallify.svg'}
						<button type="button" class="remove-logo" onclick={() => logoUrl = ''}>{t.settingsPages.remove}</button>
					{/if}
					<span class="upload-hint">{t.settingsPages.logoFormatsHint}</span>
				</div>
			</div>
		</div>

		<!-- App name + tagline -->
		<div class="field-row">
			<div class="field">
				<label for="brand-name" class="field-label">{t.settingsPages.orgDisplayName}</label>
				<input id="brand-name" name="appName" type="text" value={branding?.appName ?? 'Hallify'} placeholder="Hallify" />
			</div>
			<div class="field">
				<label for="brand-tagline" class="field-label">{t.settingsPages.tagline} <span class="opt">{t.settingsPages.optional}</span></label>
				<input id="brand-tagline" name="tagline" type="text" value={branding?.tagline ?? ''} placeholder={t.settingsPages.taglinePlaceholder} />
			</div>
		</div>
	</div>

	<!-- ── Accent color ───────────────────────────── -->
	<div class="card section-card">
		<div class="section-title">{t.settingsPages.accentColor}</div>
		<p class="section-hint">{t.settingsPages.accentColorHint}</p>
		<div class="color-row">
			<input id="brand-primary" name="primaryColor" type="color" value={branding?.primaryColor ?? '#4f6ef7'} />
			<div class="color-meta">
				<span class="color-hex">{branding?.primaryColor ?? '#4f6ef7'}</span>
				<span class="color-hint">{t.settingsPages.clickToChange}</span>
			</div>
		</div>
		<input type="hidden" name="accentColor" value={branding?.accentColor ?? branding?.primaryColor ?? '#4f6ef7'} />
	</div>

	<div class="form-footer">
		<button type="submit" class="btn-action">{t.settingsPages.saveChanges}</button>
		<button type="submit" formaction="?/resetDefaults" class="btn-reset">{t.settingsPages.resetToDefaults}</button>
	</div>
</form>
{/if}
</div>

<style>
	.page { padding: 28px 32px; }

	.lang-card {
		background: var(--bg-panel); border: 1px solid var(--border); border-radius: 16px;
		padding: 22px 24px; margin-bottom: 20px;
	}
	.lang-card-head h2 { font-size: 15px; font-weight: 700; color: var(--text-base); margin: 0 0 4px; }
	.lang-card-head p { font-size: 13px; color: var(--text-muted); line-height: 1.55; margin: 0 0 16px; max-width: 60ch; }
	.lang-card-head code { font-family: ui-monospace, monospace; font-size: 12px; background: var(--bg-hover); padding: 1px 5px; border-radius: 4px; }
	.lang-options { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
	.lang-option {
		display: flex; align-items: center; gap: 9px; cursor: pointer;
		padding: 10px 14px; border: 1px solid var(--border); border-radius: 10px;
		transition: border-color .12s, background .12s; min-width: 150px;
	}
	.lang-option:hover { border-color: var(--accent); }
	.lang-option.sel { border-color: var(--accent); background: var(--accent-dim); }
	.lang-option input { accent-color: var(--accent); }
	.lang-short { font-size: 11px; font-weight: 800; letter-spacing: .04em; color: var(--accent); }
	.lang-name { font-size: 13.5px; font-weight: 600; color: var(--text-base); }

	.locked-card {
		background: var(--bg-panel); border: 1px solid var(--border); border-radius: 16px;
		padding: 40px 28px; text-align: center; max-width: 460px; margin: 8px auto 0;
	}
	.locked-icon {
		width: 52px; height: 52px; border-radius: 14px; margin: 0 auto 16px;
		display: flex; align-items: center; justify-content: center;
		background: var(--accent-dim, color-mix(in srgb, var(--accent) 12%, transparent)); color: var(--accent);
	}
	.locked-card h3 { font-size: 16px; font-weight: 700; color: var(--text-base); margin: 0 0 8px; }
	.locked-card p { font-size: 13px; color: var(--text-muted); line-height: 1.6; margin: 0 0 20px; }
	.locked-cta { display: inline-block; text-decoration: none; }

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
	.gtm-input {
		width: 100%; max-width: 320px; padding: 8px 11px; border-radius: 8px;
		border: 1px solid var(--border); background: var(--bg-base);
		color: var(--text-base); font-family: ui-monospace, monospace; font-size: 13px;
	}
	.gtm-err { color: var(--danger, #ef4444); font-size: 12px; margin: 6px 0 0; }
	.gtm-ok  { color: var(--success, #22c55e); font-size: 12px; margin: 6px 0 0; }
</style>
