<script lang="ts">
	import { enhance } from '$app/forms';
	import { t } from '$lib/i18n.svelte';
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
		{ id: 'slate', name: t.settingsPages.themeSlate, desc: t.settingsPages.themeSlateDesc, accent: '#f05ca1', bg: '#f9f9f7', panel: '#fefefd', border: '#dfe2dd' },
		{ id: 'dark',  name: t.settingsPages.themeDark,  desc: t.settingsPages.themeDarkDesc,  accent: '#f05ca1', bg: '#181c1a', panel: '#222723', border: '#384038' },
		{ id: 'warm',  name: t.settingsPages.themeWarm,  desc: t.settingsPages.themeWarmDesc,  accent: '#f05ca1', bg: '#faf7f3', panel: '#fffefc', border: '#e5ddd2' },
	] as const);

	let uploading = $state(false);
	let uploadError = $state<string | null>(null);
	let logoUrl = $state(branding?.logoUrl ?? '');
	let logoPreview = $derived(logoUrl || '/Hallify.svg');

	// The hex readout and the stored accent both follow the picker. Without this the
	// swatch changed, the hex underneath it did not, and the hidden accentColor field
	// still posted the previously saved colour.
	let primaryColor = $state(data.branding?.primaryColor ?? '#f05ca1');

	// Every field of the branding form is held in client state. The name and theme used
	// to be uncontrolled inputs seeded from `data`: any re-render (changing the colour
	// was enough) put the saved values back over what had just been typed, so Save
	// stored the old name.
	let appName = $state(data.branding?.appName ?? 'Hallify');
	let theme = $state(data.branding?.theme ?? 'slate');

	// Re-seed from the saved branding when it changes (after a save or "Reset to
	// defaults"), so the form shows what is stored — and only then.
	let lastSaved = ''; // plain let on purpose: a marker, not reactive state
	$effect(() => {
		const b = data.branding ?? {};
		const snapshot = JSON.stringify([b.logoUrl, b.primaryColor, b.appName, b.theme]);
		if (snapshot === lastSaved) return;
		lastSaved = snapshot;
		logoUrl = b.logoUrl ?? '';
		primaryColor = b.primaryColor ?? '#f05ca1';
		appName = b.appName ?? 'Hallify';
		theme = b.theme ?? 'slate';
	});

	// The logo goes to the same image endpoint as hall photos. It used to call
	// /api/upload, which does not exist, and failed without a word.
	async function uploadLogo(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		uploading = true;
		uploadError = null;
		try {
			const fd = new FormData();
			fd.append('file', file);
			const res = await fetch('/api/upload/image', { method: 'POST', body: fd });
			if (res.ok) {
				const body = await res.json();
				logoUrl = body.url;
			} else {
				const body = await res.json().catch(() => null);
				uploadError = body?.message ? `${t.settingsPages.logoUploadFailed} ${body.message}` : t.settingsPages.logoUploadFailed;
			}
		} catch {
			uploadError = t.settingsPages.logoUploadFailed;
		} finally {
			uploading = false;
			input.value = '';
		}
	}

	/** Save as usual; "Reset to defaults" (a second submit button) asks first. */
	const submitBranding: import('@sveltejs/kit').SubmitFunction = ({ action, cancel }) => {
		if (action.search.includes('resetDefaults') && !confirm(t.settingsPages.confirmResetBranding)) {
			cancel();
			return;
		}
		return async ({ update }) => { await update({ reset: false }); };
	};
</script>

<svelte:head><title>{t.settingsPages.customizeTitle} – {t.settings.title} – Hallify</title></svelte:head>

<p class="tab-intro">{t.settingsPages.customizeSub}</p>

{#if form?.success}
	<div class="alert-success">{t.settingsPages.changesSaved}</div>
{/if}
{#if form?.error}
	<div class="alert-error">{form.error}</div>
{/if}

{#if form?.renamed}
	<div class="alert-success">{t.settingsPages.orgNameSaved}</div>
{/if}

<!-- ── Organization name (all plans; owner or platform admin) ──────────── -->
<form method="POST" action="?/renameOrg" class="section section--lead"
	use:enhance={() => { return async ({ update }) => { await update({ reset: false }); }; }}>
	<div class="section-head">
		<!-- No eyebrow: the Settings header already says ORGANIZATION a few rows above,
		     and repeating it verbatim makes the motif meaningless. -->
		<h2>{t.settingsPages.orgNameTitle}</h2>
		<p>{t.settingsPages.orgNameHint}</p>
	</div>
	{#if form?.renameError}<div class="alert-error">{form.renameError}</div>{/if}
	<div class="name-row">
		<label class="sr-only" for="org-name">{t.settingsPages.orgNameTitle}</label>
		<input id="org-name" name="orgName" type="text" maxlength="80" required
			value={data.orgName} />
		<button type="submit" class="btn-action">{t.settingsPages.renameOrg}</button>
	</div>
</form>

<!-- ── Default language (available to all plans) ──────────── -->
<form method="POST" action="?/saveLanguage" class="section section--lead"
	use:enhance={() => { return async ({ update }) => { await update({ reset: false }); }; }}>
	<div class="section-head">
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
	<button type="submit" class="btn-action btn-sm">{t.settingsPages.saveLanguage}</button>
</form>

{#if data.locked}
	<div class="card--inset locked-card">
		<div class="icon-tile">
			<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
		</div>
		<h3>{t.settingsPages.customizationLockedTitle}</h3>
		<p>{t.settingsPages.upgradeTo} <strong>Starter</strong> {t.settingsPages.customizationLockedHint}</p>
		<a href="/app/billing" class="btn-action locked-cta">{t.settingsPages.viewPlans}</a>
	</div>
{:else}
<form method="POST" action="?/save" use:enhance={submitBranding}>
	<input type="hidden" name="logoUrl" value={logoUrl} />

	<!-- ── Theme ──────────────────────────────────── -->
	<section class="section">
		<div class="section-head">
			<h2>{t.settingsPages.defaultTheme}</h2>
			<p>{t.settingsPages.defaultThemeHint}</p>
		</div>
		<div class="theme-grid">
			{#each themes as th}
				<label class="theme-option" class:selected={theme === th.id}>
					<input type="radio" name="theme" value={th.id} bind:group={theme} />
					<div class="theme-preview" style="background:{th.bg}; border-color:{theme === th.id ? th.accent : 'transparent'}">
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
	</section>

	<!-- ── Identity ───────────────────────────────── -->
	<section class="section">
		<div class="section-head">
			<h2>{t.settingsPages.identity}</h2>
			<p>{t.settingsPages.identityHint}</p>
		</div>

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
						<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onchange={uploadLogo} disabled={uploading} />
					</label>
					{#if logoUrl && logoUrl !== '/Hallify.svg'}
						<button type="button" class="remove-logo" onclick={() => logoUrl = ''}>{t.settingsPages.remove}</button>
					{/if}
					<span class="upload-hint">{t.settingsPages.logoFormatsHint}</span>
					{#if uploadError}<span class="upload-error" role="alert">{uploadError}</span>{/if}
				</div>
			</div>
		</div>

		<!-- App name. The slogan field that sat beside it was shown nowhere; the public
		     site's subtitle lives under Verejná stránka. A stored slogan is carried
		     along unchanged rather than wiped. -->
		<div class="field-row">
			<div class="field">
				<label for="brand-name" class="field-label">{t.settingsPages.orgDisplayName}</label>
				<input id="brand-name" name="appName" type="text" maxlength="80" bind:value={appName} placeholder="Hallify" />
			</div>
		</div>
		<input type="hidden" name="tagline" value={branding?.tagline ?? ''} />
	</section>

	<!-- ── Accent color ───────────────────────────── -->
	<section class="section">
		<div class="section-head">
			<h2>{t.settingsPages.accentColor}</h2>
			<p>{t.settingsPages.accentColorHint}</p>
		</div>
		<div class="color-row">
			<input id="brand-primary" name="primaryColor" type="color" bind:value={primaryColor} aria-label={t.settingsPages.accentColor} />
			<div class="color-meta">
				<span class="color-hex">{primaryColor}</span>
				<span class="color-hint">{t.settingsPages.clickToChange}</span>
			</div>
		</div>
		<input type="hidden" name="accentColor" value={primaryColor} />
	</section>

	<div class="section form-footer">
		<button type="submit" class="btn-action">{t.settingsPages.saveChanges}</button>
		<button type="submit" formaction="?/resetDefaults" class="btn-reset">{t.settingsPages.resetToDefaults}</button>
	</div>
</form>
{/if}

<style>
	/* Input + button on one line. align-items: stretch so the button matches the
	   field's height instead of sitting short beside it. */
	.name-row {
		display: flex;
		align-items: stretch;
		gap: 10px;
		max-width: 520px;
	}
	.name-row input { flex: 1; min-width: 0; }
	.name-row button { flex-shrink: 0; }

	.sr-only {
		position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
		overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
	}

	/* The page shell, title and tab strip live in the Settings layout. */
	.tab-intro { font-size: 13px; color: var(--text-muted); line-height: 1.7; margin: 20px 0 0; max-width: 70ch; }

	.section-head code { font-family: ui-monospace, monospace; font-size: 12px; background: var(--bg-hover); padding: 1px 5px; border-radius: var(--radius-sm); }

	.lang-options { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
	.lang-option {
		display: flex; align-items: center; gap: 9px; cursor: pointer;
		padding: 10px 14px; border: 1px solid var(--border); border-radius: var(--radius);
		transition: border-color .15s, background .15s; min-width: 150px;
	}
	.lang-option:hover { border-color: var(--accent); }
	.lang-option.sel { border-color: var(--accent); background: var(--accent-dim); }
	.lang-option input { accent-color: var(--accent); }
	.lang-short { font-size: 11px; font-weight: 650; letter-spacing: .04em; color: var(--accent-ink); }
	.lang-name { font-size: 13.5px; font-weight: 600; color: var(--text-base); }

	.locked-card { text-align: center; max-width: 460px; margin: 8px auto 0; }
	.locked-card .icon-tile { width: 52px; height: 52px; margin: 0 auto 16px; }
	.locked-card h3 { font-size: 16px; font-weight: 650; letter-spacing: -.03em; color: var(--text-base); margin: 0 0 8px; }
	.locked-card p { font-size: 13px; color: var(--text-muted); line-height: 1.6; margin: 0 0 20px; }
	.locked-cta { display: inline-block; text-decoration: none; }

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
		border-radius: var(--radius);
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
		border-radius: var(--radius-sm);
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
	.logo-row {
		display: flex;
		align-items: center;
		gap: 16px;
	}

	.logo-preview {
		width: 48px;
		height: 48px;
		border-radius: var(--radius-lg);
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
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
		background: var(--bg-panel2);
		color: var(--text-base);
		font-size: 12px;
		font-weight: 500;
		cursor: pointer;
		transition: background .15s, border-color .15s;
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
	.upload-error {
		font-size: 12px;
		color: var(--danger);
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
		border-radius: var(--radius);
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
	}

	.btn-reset {
		padding: 7px 16px;
		border-radius: var(--radius-sm);
		font-size: 13px;
		font-weight: 500;
		border: 1px solid var(--border);
		background: var(--bg-panel);
		color: var(--text-muted);
		cursor: pointer;
		transition: border-color .15s, color .15s;
		font-family: inherit;
	}
	.btn-reset:hover { border-color: var(--danger); color: var(--danger); }

	.alert-success {
		padding: 10px 16px;
		border-radius: var(--radius-sm);
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
		.theme-grid { grid-template-columns: 1fr; }
		.field-row { grid-template-columns: 1fr; }
	}
</style>
