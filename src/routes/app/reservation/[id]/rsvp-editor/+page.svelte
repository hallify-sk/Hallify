<script lang="ts">
	import { enhance } from '$app/forms';
	import { t } from '$lib/i18n.svelte';
	import type { PageData, ActionData } from './$types';
	import type { RsvpConfig } from '$lib/db/index';

	interface Props { data: PageData; form: ActionData; }
	let { data, form }: Props = $props();

	// Initialize config from reservation
	const initial = (data.reservation.rsvp_config ?? {}) as RsvpConfig;
	let primaryColor = $state(initial.primaryColor ?? '#e91e8a');
	let bgColor = $state(initial.bgColor ?? '#ffffff');
	let bgImage = $state(initial.bgImage ?? '');
	let description = $state(initial.description ?? '');
	let arrivalTime = $state(initial.arrivalTime ?? '');
	let maxExtraGuests = $state(initial.maxExtraGuests ?? 0);
	let fields = $state<NonNullable<RsvpConfig['fields']>>(
		initial.fields && initial.fields.length > 0 && initial.fields[0].name === 'name'
			? initial.fields
			: [
				{ name: 'name', label: t.rsvp.fullName, type: 'text', required: true },
				...(initial.fields ?? [{ name: 'email', label: t.rsvp.email, type: 'email', required: false }]),
			]
	);

	function isNameField(idx: number) {
		return idx === 0 && fields[0]?.name === 'name';
	}

	let rsvpStyle = $state(initial.style ?? 'default');

	const RSVP_STYLES: { id: string; label: string; desc: string }[] = [
		{ id: 'default', label: 'Default', desc: 'Štandardný štýl' },
		{ id: 'elegant', label: 'Elegant', desc: 'Serifové písmo, jemné tiene' },
		{ id: 'modern', label: 'Modern', desc: 'Ostré hrany, geometrický' },
		{ id: 'romantic', label: 'Romantic', desc: 'Kurzívne nadpisy, zaoblené' },
		{ id: 'minimal', label: 'Minimal', desc: 'Tenké čiary, veľa priestoru' },
		{ id: 'festive', label: 'Festive', desc: 'Hravý, výrazný, zaoblené' },
		{ id: 'classic', label: 'Classic', desc: 'Tradičný, serifové písmo' },
	];

	let fullscreenPreview = $state(false);
	let showToast = $state(false);
	let saving = $state(false);

	// Watch for successful save and show toast
	$effect(() => {
		if (form?.success) {
			showToast = true;
			saving = false;
			const timer = setTimeout(() => { showToast = false; }, 3000);
			return () => clearTimeout(timer);
		}
	});

	function addField() {
		fields = [...fields, { name: `field_${fields.length}`, label: '', type: 'text', required: false }];
	}

	function removeField(idx: number) {
		if (isNameField(idx)) return;
		fields = fields.filter((_, i) => i !== idx);
	}

	function moveField(idx: number, dir: -1 | 1) {
		const newIdx = idx + dir;
		if (newIdx < 0 || newIdx >= fields.length) return;
		const arr = [...fields];
		[arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
		fields = arr;
	}

	const defaultAllergens = $derived(t.rsvpEditor.defaultAllergens.split(',').map(s => s.trim()));

	const configJson = $derived(JSON.stringify({
		enabled: initial.enabled,
		primaryColor, bgColor, bgImage, description, style: rsvpStyle, arrivalTime: arrivalTime || undefined,
		maxExtraGuests: Math.max(0, Math.min(20, Number(maxExtraGuests) || 0)),
		fields: fields.map(f => ({
			name: f.name, label: f.label, type: f.type,
			required: f.required,
			options: f.type === 'allergies' && !f.options?.length ? defaultAllergens : f.options,
		})),
	}));

	function loadTemplate(tmplId: string) {
		const tmpl = data.templates.find(t2 => t2.id === tmplId);
		if (!tmpl) return;
		const c = (tmpl.config ?? {}) as RsvpConfig;
		primaryColor = c.primaryColor ?? '#e91e8a';
		bgColor = c.bgColor ?? '#ffffff';
		bgImage = c.bgImage ?? '';
		description = c.description ?? '';
		rsvpStyle = c.style ?? 'default';
		arrivalTime = c.arrivalTime ?? '';
		maxExtraGuests = c.maxExtraGuests ?? 0;
		fields = c.fields ?? [
			{ name: 'name', label: t.rsvp.fullName, type: 'text', required: true },
			{ name: 'email', label: t.rsvp.email, type: 'email', required: false },
		];
	}

	function previewBgStyle(bg: string, img: string): string {
		if (img) {
			return `background-image:url(${img});background-size:cover;background-position:center;background-color:${bg}`;
		}
		return `background:${bg}`;
	}
</script>

<svelte:head><title>{t.rsvpEditor.title} – Hallify</title></svelte:head>

<!-- Sticky toolbar -->
<div class="toolbar">
	<a href="/app/reservation/{data.reservation.id}" class="toolbar-back" title={t.common.back}>
		<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
		{t.common.back}
	</a>
	<h1 class="toolbar-title">{t.rsvpEditor.title}</h1>
	{#if data.advancedRsvp}
		<form method="POST" action="?/save" use:enhance={() => {
			saving = true;
			return async ({ update }) => {
				await update({ reset: false });
			};
		}}>
			<input type="hidden" name="config" value={configJson} />
			<button type="submit" class="btn-action btn-sm toolbar-save" disabled={saving}>
				{#if saving}
					<span class="spinner"></span>
				{/if}
				{t.rsvpEditor.save}
			</button>
		</form>
	{/if}
</div>

<!-- Success toast -->
{#if showToast}
	<div class="toast-success" role="alert">
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
		{t.rsvpEditor.save} - OK
	</div>
{/if}

{#if !data.advancedRsvp}
	<div class="rsvp-upsell">
		<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
		<h2>Advanced RSVP editing is a paid feature</h2>
		<p>Your Free plan collects basic RSVPs (name &amp; email). Upgrade to customise the RSVP form — add custom fields, allergies, styling and templates.</p>
		<a href="/app/billing" class="btn-action">View plans</a>
	</div>
{:else}
<div class="editor-grid">
	<!-- Left: Settings -->
	<div class="settings-col">

		<!-- Section: Load template -->
		{#if data.templates.length > 0}
			<div class="section template-loader">
				<div class="template-loader-row">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
						<polyline points="14 2 14 8 20 8"/>
					</svg>
					<select class="template-select"
						onchange={(e) => {
							const val = (e.target as HTMLSelectElement).value;
							if (val) { loadTemplate(val); (e.target as HTMLSelectElement).value = ''; }
						}}>
						<option value="">{t.rsvpEditor.loadTemplate}…</option>
						{#each data.templates as tmpl}
							<option value={tmpl.id}>{tmpl.name}</option>
						{/each}
					</select>
				</div>
				<p class="template-hint">{t.rsvpEditor.loadTemplateHint}</p>
			</div>
		{/if}

		<!-- Section: Appearance -->
		<div class="section section--lead">
			<h3 class="section-title">{t.rsvpEditor.primaryColor} / {t.rsvpEditor.bgColor}</h3>
			<div class="color-row">
				<div class="color-picker-group">
					<label>{t.rsvpEditor.primaryColor}</label>
					<div class="color-picker">
						<label class="color-swatch" style="background:{primaryColor}">
							<input type="color" bind:value={primaryColor} />
						</label>
						<input type="text" class="color-hex" value={primaryColor}
							oninput={(e) => { primaryColor = (e.target as HTMLInputElement).value; }} />
					</div>
				</div>
				<div class="color-picker-group">
					<label>{t.rsvpEditor.bgColor}</label>
					<div class="color-picker">
						<label class="color-swatch" style="background:{bgColor}">
							<input type="color" bind:value={bgColor} />
						</label>
						<input type="text" class="color-hex" value={bgColor}
							oninput={(e) => { bgColor = (e.target as HTMLInputElement).value; }} />
					</div>
				</div>
			</div>

			<div class="field compact">
				<label for="bgImage">{t.rsvpEditor.bgImage}</label>
				<input id="bgImage" type="text" bind:value={bgImage}
					placeholder={t.rsvpEditor.bgImagePlaceholder} />
			</div>
		</div>

		<!-- Section: Style -->
		<div class="section">
			<h3 class="section-title">{t.rsvpEditor.style}</h3>
			<p class="template-hint" style="margin-bottom:10px">{t.rsvpEditor.styleHint}</p>
			<div class="style-grid">
				{#each RSVP_STYLES as s}
					<button type="button" class="style-option" class:active={rsvpStyle === s.id}
						onclick={() => { rsvpStyle = s.id; }}>
						<span class="style-name">{s.label}</span>
						<span class="style-desc">{s.desc}</span>
					</button>
				{/each}
			</div>
		</div>

		<!-- Section: Content -->
		<div class="section">
			<h3 class="section-title">{t.rsvpEditor.description}</h3>
			<div class="field compact">
				<textarea id="description" bind:value={description} rows="3"
					placeholder={t.rsvpEditor.descriptionPlaceholder}></textarea>
			</div>
			<div class="field compact">
				<label for="arrivalTime">{t.rsvpEditor.arrivalTime}</label>
				<input id="arrivalTime" type="time" bind:value={arrivalTime} />
				<p class="field-hint">{t.rsvpEditor.arrivalTimeHint}</p>
			</div>
			<div class="field compact" style="margin-bottom:0">
				<label for="maxExtra">Extra guests per invite</label>
				<input id="maxExtra" type="number" min="0" max="20" bind:value={maxExtraGuests} />
				<p class="field-hint">How many extra people each invitee can bring (0 = they come alone).</p>
			</div>
		</div>

		<!-- Section: Form Fields -->
		<div class="section">
			<div class="fields-header">
				<h3 class="section-title" style="margin-bottom:0">{t.rsvpEditor.fields}</h3>
				<button type="button" class="btn-outline btn-sm" onclick={addField}>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
					{t.rsvpEditor.addField}
				</button>
			</div>

			{#each fields as field, idx}
				<div class="field-card">
					<div class="field-card-header">
						<span class="field-num">{idx + 1}</span>
						<div class="field-card-actions">
							<button type="button" class="btn-icon" onclick={() => moveField(idx, -1)}
								disabled={idx === 0} title="Move up">
								<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 15l-6-6-6 6"/></svg>
							</button>
							<button type="button" class="btn-icon" onclick={() => moveField(idx, 1)}
								disabled={idx === fields.length - 1} title="Move down">
								<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
							</button>
							{#if !isNameField(idx)}<button type="button" class="btn-icon danger" onclick={() => removeField(idx)} title={t.common.delete}>
								<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
							</button>{/if}
						</div>
					</div>
					<div class="field-row">
						<div class="field">
							<label>{t.rsvpEditor.fieldLabel}</label>
							<input type="text" bind:value={field.label} placeholder="napr. Meno" />
						</div>
						<div class="field" style="max-width:130px">
							<label>{t.rsvpEditor.fieldType}</label>
							<select bind:value={field.type} disabled={isNameField(idx)}>
								<option value="text">{t.rsvpEditor.text}</option>
								<option value="email">{t.rsvpEditor.emailType}</option>
								<option value="select">{t.rsvpEditor.select}</option>
								<option value="checkbox">{t.rsvpEditor.checkbox}</option>
								<option value="allergies">{t.rsvpEditor.allergies}</option>
							</select>
						</div>
					</div>
					<div class="field-row">
						<div class="field">
							<label>{t.rsvpEditor.fieldName}</label>
							<input type="text" bind:value={field.name} placeholder="field_name" disabled={isNameField(idx)} />
						</div>
						<div class="field toggle-field">
							<label>{t.rsvpEditor.fieldRequired}</label>
							<button type="button" class="toggle-switch" class:on={field.required}
								onclick={() => { if (!isNameField(idx)) { field.required = !field.required; fields = [...fields]; } }}
								role="switch" aria-checked={field.required}
								disabled={isNameField(idx)}>
								<span class="toggle-knob"></span>
							</button>
						</div>
					</div>
					{#if field.type === 'select'}
						<div class="field">
							<label>{t.rsvpEditor.options}</label>
							<input type="text" value={field.options?.join(', ') ?? ''}
								oninput={(e) => {
									field.options = (e.target as HTMLInputElement).value.split(',').map(s => s.trim()).filter(Boolean);
									fields = [...fields];
								}}
								placeholder="Option 1, Option 2, Option 3" />
						</div>
					{:else if field.type === 'allergies'}
						<div class="field">
							<label>{t.rsvpEditor.allergiesOptions}</label>
							<input type="text" value={field.options?.join(', ') ?? t.rsvpEditor.defaultAllergens}
								oninput={(e) => {
									field.options = (e.target as HTMLInputElement).value.split(',').map(s => s.trim()).filter(Boolean);
									fields = [...fields];
								}}
								onfocus={(e) => {
									if (!field.options?.length) {
										field.options = t.rsvpEditor.defaultAllergens.split(',').map(s => s.trim());
										fields = [...fields];
										(e.target as HTMLInputElement).value = field.options.join(', ');
									}
								}}
								placeholder={t.rsvpEditor.defaultAllergens} />
						</div>
					{/if}
				</div>
			{/each}
		</div>

		<!-- Sticky save bar at bottom -->
		<div class="save-bar">
			<form method="POST" action="?/save" use:enhance={() => {
				saving = true;
				return async ({ update }) => {
					await update({ reset: false });
				};
			}}>
				<input type="hidden" name="config" value={configJson} />
				<button type="submit" class="btn-action" disabled={saving}>
					{#if saving}
						<span class="spinner"></span>
					{/if}
					{t.rsvpEditor.save}
				</button>
			</form>
		</div>
	</div>

	<!-- Right: Live preview (sticky) -->
	<div class="preview-col">
		<div class="preview-panel">
			<div class="preview-panel-header">
				<h3>{t.rsvpEditor.preview}</h3>
				<button type="button" class="btn-outline btn-sm"
					onclick={() => { fullscreenPreview = true; }}>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
					{t.rsvpEditor.fullscreenPreview}
				</button>
			</div>
			<div class="preview-card rsvp-style-{rsvpStyle}" style={previewBgStyle(bgColor, bgImage)}>
				<div class="preview-inner">
					<h2 style="color:{primaryColor}">{data.reservation.title}</h2>
					{#if description}
						<p class="preview-desc">{description}</p>
					{/if}
					{#if arrivalTime}
						<p class="preview-arrival">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
							{t.rsvpEditor.arrivalTime}: {arrivalTime}
						</p>
					{/if}
					<div class="preview-fields">
						{#each fields as field}
							<div class="preview-field">
								{#if field.type === 'checkbox'}
									<div class="checkbox-row">
										<input type="checkbox" disabled />
										<span class="checkbox-label">{field.label || field.name}
											{#if field.required}<span style="color:{primaryColor}">*</span>{/if}
										</span>
									</div>
								{:else if field.type === 'allergies'}
									<label>{field.label || field.name}
										{#if field.required}<span style="color:{primaryColor}">*</span>{/if}
									</label>
									<div class="allergies-checklist">
										{#each (field.options?.length ? field.options : t.rsvpEditor.defaultAllergens.split(',').map(s => s.trim())) as allergen}
											<label class="allergy-item">
												<input type="checkbox" disabled />
												<span>{allergen}</span>
											</label>
										{/each}
										<div class="allergy-other">
											<label class="allergy-item">
												<input type="checkbox" disabled />
												<span>{t.rsvpEditor.allergiesOther}</span>
											</label>
											<input type="text" disabled placeholder={t.rsvpEditor.allergiesOtherPlaceholder} class="allergy-other-input" />
										</div>
									</div>
								{:else}
									<label>{field.label || field.name}
										{#if field.required}<span style="color:{primaryColor}">*</span>{/if}
									</label>
									{#if field.type === 'select'}
										<select disabled>
											<option>{field.options?.[0] ?? '...'}</option>
										</select>
									{:else}
										<input type={field.type} disabled placeholder={field.label} />
									{/if}
								{/if}
							</div>
						{/each}
					</div>
					<button class="preview-submit" style="background:{primaryColor}">
						{t.rsvp.submit}
					</button>
				</div>
			</div>
		</div>
	</div>
</div>
{/if}

<!-- Fullscreen preview overlay -->
{#if fullscreenPreview}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="fullscreen-overlay" onclick={(e) => { if (e.target === e.currentTarget) fullscreenPreview = false; }}
		onkeydown={(e) => { if (e.key === 'Escape') fullscreenPreview = false; }}>
		<button type="button" class="fullscreen-close" onclick={() => { fullscreenPreview = false; }}>
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
		</button>
		<div class="fullscreen-content rsvp-style-{rsvpStyle}" style={previewBgStyle(bgColor, bgImage)}>
			<div class="preview-inner fullscreen-inner">
				<h2 style="color:{primaryColor}">{data.reservation.title}</h2>
				{#if description}
					<p class="preview-desc">{description}</p>
				{/if}
				<div class="preview-fields">
					{#each fields as field}
						<div class="preview-field">
							{#if field.type === 'checkbox'}
								<div class="checkbox-row">
									<input type="checkbox" disabled />
									<span class="checkbox-label">{field.label || field.name}
										{#if field.required}<span style="color:{primaryColor}">*</span>{/if}
									</span>
								</div>
							{:else if field.type === 'allergies'}
								<label>{field.label || field.name}
									{#if field.required}<span style="color:{primaryColor}">*</span>{/if}
								</label>
								<div class="allergies-checklist">
									{#each (field.options?.length ? field.options : t.rsvpEditor.defaultAllergens.split(',').map(s => s.trim())) as allergen}
										<label class="allergy-item">
											<input type="checkbox" disabled />
											<span>{allergen}</span>
										</label>
									{/each}
									<div class="allergy-other">
										<label class="allergy-item">
											<input type="checkbox" disabled />
											<span>{t.rsvpEditor.allergiesOther}</span>
										</label>
										<input type="text" disabled placeholder={t.rsvpEditor.allergiesOtherPlaceholder} class="allergy-other-input" />
									</div>
								</div>
							{:else}
								<label>{field.label || field.name}
									{#if field.required}<span style="color:{primaryColor}">*</span>{/if}
								</label>
								{#if field.type === 'select'}
									<select disabled>
										<option>{field.options?.[0] ?? '...'}</option>
									</select>
								{:else}
									<input type={field.type} disabled placeholder={field.label} />
								{/if}
							{/if}
						</div>
					{/each}
				</div>
				<button class="preview-submit" style="background:{primaryColor}">
					{t.rsvp.submit}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.rsvp-upsell {
		max-width: 460px; margin: 60px auto; text-align: center;
		display: flex; flex-direction: column; align-items: center; gap: 12px;
		padding: 32px 28px; background: var(--bg-panel); border: 1px solid var(--border); border-radius: var(--radius-lg);
	}
	.rsvp-upsell svg { color: var(--accent-ink); }
	.rsvp-upsell h2 { font-size: 17px; font-weight: 650; letter-spacing: -.03em; margin: 0; }
	.rsvp-upsell p { font-size: 13px; color: var(--text-muted); line-height: 1.5; margin: 0; }
	.rsvp-upsell .btn-action { margin-top: 6px; text-decoration: none; }

	/* ===== Toolbar ===== */
	.toolbar {
		position: sticky;
		top: 0;
		z-index: 100;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 24px;
		background: var(--bg-panel);
		border-bottom: 1px solid var(--border);
		min-height: 52px;
	}

	.toolbar-back {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
		font-weight: 500;
		color: var(--text-muted);
		text-decoration: none;
	}

	.toolbar-back:hover {
		color: var(--text-base);
		text-decoration: none;
	}

	.toolbar-title {
		position: absolute;
		left: 50%;
		transform: translateX(-50%);
		font-size: 15px;
		font-weight: 600;
		letter-spacing: -.03em;
		color: var(--text-base);
		white-space: nowrap;
	}

	.toolbar-save {
		flex-shrink: 0;
	}

	/* ===== Toast ===== */
	.toast-success {
		position: fixed;
		top: 64px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 200;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 20px;
		background: var(--success-dim);
		border: 1px solid color-mix(in srgb, var(--success) 30%, transparent);
		color: var(--success);
		border-radius: var(--radius);
		font-size: 13px;
		font-weight: 600;
		box-shadow: var(--shadow);
		animation: toast-in 0.25s ease-out;
	}

	@keyframes toast-in {
		from { opacity: 0; transform: translateX(-50%) translateY(-10px); }
		to { opacity: 1; transform: translateX(-50%) translateY(0); }
	}

	/* ===== Grid layout ===== */
	.editor-grid {
		display: grid;
		grid-template-columns: 1fr 380px;
		gap: 24px;
		align-items: start;
		padding: 24px;
	}

	.settings-col {
		display: flex;
		flex-direction: column;
		gap: 16px;
		position: relative;
	}

	/* ===== Template loader ===== */
	.template-loader {
		background: var(--bg-panel2);
	}

	.template-loader-row {
		display: flex;
		align-items: center;
		gap: 10px;
		color: var(--text-muted);
	}

	.template-select {
		flex: 1;
		height: 34px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
		padding: 0 10px;
		font-size: 13px;
		background: var(--bg-panel);
		color: var(--text-base);
		cursor: pointer;
	}

	.template-hint {
		font-size: 11px;
		color: var(--text-muted);
		margin-top: 6px;
	}


	.section-title {
		font-size: 10px;
		font-weight: 650;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: .13em;
		line-height: 1.7;
		margin-bottom: 14px;
	}

	/* ===== Color pickers ===== */
	.color-row {
		display: flex;
		gap: 16px;
		margin-bottom: 14px;
	}

	.color-picker-group {
		flex: 1;
	}

	.color-picker-group > label {
		display: block;
		font-size: 11px;
		font-weight: 600;
		color: var(--text-muted);
		margin-bottom: 6px;
	}

	.color-picker {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.color-swatch {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		border: 2px solid var(--border);
		cursor: pointer;
		overflow: hidden;
		flex-shrink: 0;
		transition: border-color 0.15s;
	}

	.color-swatch:hover {
		border-color: var(--accent);
	}

	.color-swatch input[type="color"] {
		position: absolute;
		inset: 0;
		opacity: 0;
		width: 100%;
		height: 100%;
		cursor: pointer;
		border: none;
		padding: 0;
		margin: 0;
	}

	.color-hex {
		flex: 1;
		height: 34px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
		padding: 0 10px;
		font-size: 13px;
		font-family: monospace;
		background: var(--bg-panel2);
		color: var(--text-base);
		min-width: 0;
	}

	/* ===== Compact fields ===== */
	.field.compact {
		margin-bottom: 14px;
	}

	.field.compact > label {
		display: block;
		font-size: 11px;
		font-weight: 600;
		color: var(--text-muted);
		margin-bottom: 6px;
	}

	/* ===== Fields builder ===== */
	.fields-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 14px;
	}

	.field-card {
		background: var(--bg-panel2);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 12px 14px;
		margin-bottom: 8px;
	}

	.field-card:last-child {
		margin-bottom: 0;
	}

	.field-card-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 8px;
	}

	.field-num {
		font-size: 10px;
		font-weight: 600;
		color: var(--text-muted);
		background: var(--bg-panel);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 1px 6px;
		line-height: 1.4;
	}

	.field-card-actions {
		display: flex;
		gap: 3px;
	}

	.btn-icon {
		width: 24px;
		height: 24px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
		background: var(--bg-panel);
		color: var(--text-muted);
		font-size: 12px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background 0.15s, color 0.15s;
	}

	.btn-icon:hover { background: var(--accent-dim); color: var(--accent-ink); }
	.btn-icon.danger:hover { background: var(--danger-dim); color: var(--danger); }
	.btn-icon:disabled { opacity: 0.3; cursor: not-allowed; }

	/* ===== Toggle switch ===== */
	.toggle-field {
		max-width: 100px;
	}

	.toggle-switch {
		position: relative;
		width: 36px;
		height: 20px;
		border-radius: 4px;
		/* --border is only ~1.2:1 against the --bg-panel2 field card it sits on, so the
		   "off" track was effectively invisible. --text-subtle clears the 3:1 the spec
		   wants for a control state. */
		background: var(--text-subtle);
		border: none;
		cursor: pointer;
		transition: background 0.2s;
		padding: 0;
		flex-shrink: 0;
	}

	.toggle-switch.on {
		background: var(--accent);
	}

	.toggle-knob {
		position: absolute;
		top: 2px;
		left: 2px;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: var(--bg-panel);
		transition: transform 0.2s;
		box-shadow: var(--shadow-xs);
	}

	.toggle-switch.on .toggle-knob {
		transform: translateX(16px);
	}

	/* ===== Sticky save bar ===== */
	.save-bar {
		position: sticky;
		bottom: 0;
		padding: 12px 20px;
		background: var(--bg-panel);
		border-top: 1px solid var(--border);
		border-radius: 0 0 var(--radius-lg) var(--radius-lg);
		display: flex;
		align-items: center;
		justify-content: flex-end;
		z-index: 10;
	}

	.save-bar form {
		display: flex;
		align-items: center;
	}

	/* Both Save buttons are disabled while saving; without this they would still take
	   the new signature hover lift and the accent-hover wash. */
	.btn-action:disabled:hover {
		background: var(--accent);
		transform: none;
	}

	/* ===== Spinner ===== */
	/* Inherits the button's own ink (--accent-contrast on the accent fill), so it
	   stays legible whatever the org's brand colour is. */
	.spinner {
		display: inline-block;
		width: 14px;
		height: 14px;
		border: 2px solid color-mix(in srgb, currentColor 30%, transparent);
		border-top-color: currentColor;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	/* ===== Preview panel (sticky) ===== */
	.preview-col {
		position: sticky;
		top: 76px; /* toolbar height + gap */
		max-height: calc(100vh - 76px);
		overflow: auto;
	}

	.preview-panel-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 12px;
	}

	.preview-panel-header h3 {
		font-size: 10px;
		font-weight: 650;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: .13em;
		line-height: 1.7;
	}

	.preview-card {
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		min-height: 400px;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 32px 24px;
	}

	.preview-inner {
		width: 100%;
		max-width: 340px;
		background: var(--bg-panel);
		border-radius: var(--radius-lg);
		padding: 28px 24px;
		box-shadow: var(--shadow);
	}

	.preview-inner h2 {
		font-size: 18px;
		font-weight: 550;
		letter-spacing: -.055em;
		line-height: 1.08;
		margin-bottom: 8px;
	}

	.preview-desc {
		font-size: 13px;
		color: var(--text-muted);
		margin-bottom: 12px;
		line-height: 1.75;
	}

	.preview-arrival {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
		font-weight: 600;
		color: var(--text-muted);
		margin-bottom: 20px;
	}

	.field-hint {
		font-size: 11px;
		color: var(--text-muted);
		margin-top: 4px;
	}

	.preview-fields {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin-bottom: 20px;
	}

	.preview-field label {
		display: block;
		font-size: 12px;
		font-weight: 600;
		color: var(--text-base);
		margin-bottom: 4px;
		text-transform: none;
		letter-spacing: 0;
	}

	.preview-field input[type="text"],
	.preview-field input[type="email"],
	.preview-field select {
		width: 100%;
		padding: 8px 12px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		font-size: 13px;
		background: var(--bg-panel2);
	}

	.checkbox-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.checkbox-row input[type="checkbox"] {
		width: 16px;
		height: 16px;
		margin: 0;
		flex-shrink: 0;
	}

	.checkbox-label {
		font-size: 12px;
		font-weight: 600;
		color: var(--text-base);
		user-select: none;
		line-height: 1;
	}

	.preview-submit {
		width: 100%;
		padding: 10px;
		border: none;
		border-radius: var(--radius-sm);
		color: var(--accent-contrast);
		font-size: 14px;
		font-weight: 650;
		cursor: default;
	}

	/* ===== Fullscreen overlay ===== */
	.fullscreen-overlay {
		position: fixed;
		inset: 0;
		z-index: 9999;
		background: rgba(0, 0, 0, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.fullscreen-close {
		position: fixed;
		top: 16px;
		right: 20px;
		z-index: 10000;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		border: none;
		background: var(--bg-panel);
		color: var(--text-base);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background 0.15s, box-shadow 0.15s;
		box-shadow: var(--shadow-sm);
	}

	.fullscreen-close:hover {
		background: var(--bg-hover);
		box-shadow: var(--shadow);
	}

	.fullscreen-content {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: auto;
		padding: 48px 24px;
	}

	.fullscreen-inner {
		max-width: 480px;
	}

	/* ===== Allergies checklist ===== */
	.allergies-checklist {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 12px;
		margin-top: 4px;
	}

	.allergy-item {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		color: var(--text-base);
		cursor: default;
	}

	.allergy-item input[type="checkbox"] {
		width: 15px;
		height: 15px;
		margin: 0;
		flex-shrink: 0;
	}

	.allergy-other {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-top: 4px;
	}

	.allergy-other-input {
		width: 100%;
		padding: 6px 10px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		font-size: 12px;
		background: var(--bg-panel2);
	}

	/* ===== Style picker grid ===== */
	.style-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		gap: 8px;
	}

	.style-option {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 10px 12px;
		border: 2px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--bg-panel2);
		cursor: pointer;
		transition: border-color 0.15s, background 0.15s;
		text-align: left;
		font: inherit;
	}

	.style-option:hover {
		border-color: var(--text-subtle);
		background: var(--bg-hover);
	}

	.style-option.active {
		border-color: var(--accent);
		background: var(--accent-dim);
	}

	.style-name {
		font-size: 13px;
		font-weight: 650;
		letter-spacing: -.03em;
		color: var(--text-base);
	}

	.style-desc {
		font-size: 11px;
		color: var(--text-muted);
	}

	/* ===== Preview style variants ===== */
	:global(.rsvp-style-elegant) .preview-inner { font-family: 'Georgia', serif; border-radius: var(--radius-xl); }
	:global(.rsvp-style-elegant) .preview-inner h2 { font-family: 'Georgia', serif; font-style: italic; font-weight: 400; }
	:global(.rsvp-style-elegant) .preview-submit { border-radius: 24px; }
	:global(.rsvp-style-elegant) .preview-field input,
	:global(.rsvp-style-elegant) .preview-field select { border-radius: 12px; }

	:global(.rsvp-style-modern) .preview-inner { font-family: 'Inter', sans-serif; border-radius: 0; border: 2px solid var(--text-base); }
	:global(.rsvp-style-modern) .preview-inner h2 { font-weight: 650; text-transform: uppercase; letter-spacing: 0.05em; font-size: 15px; }
	:global(.rsvp-style-modern) .preview-submit { border-radius: 0; text-transform: uppercase; letter-spacing: 0.08em; }
	:global(.rsvp-style-modern) .preview-field input,
	:global(.rsvp-style-modern) .preview-field select { border-radius: 0; border: 2px solid var(--border); }

	:global(.rsvp-style-romantic) .preview-inner { font-family: 'Georgia', serif; border-radius: var(--radius-xl); }
	:global(.rsvp-style-romantic) .preview-inner h2 { font-family: 'Brush Script MT', 'Segoe Script', cursive; font-weight: 400; font-size: 22px; }
	:global(.rsvp-style-romantic) .preview-submit { border-radius: 28px; }
	:global(.rsvp-style-romantic) .preview-field input,
	:global(.rsvp-style-romantic) .preview-field select { border-radius: 14px; }

	:global(.rsvp-style-minimal) .preview-inner { font-family: 'Helvetica Neue', sans-serif; border-radius: var(--radius-sm); padding: 36px 28px; }
	:global(.rsvp-style-minimal) .preview-inner h2 { font-weight: 300; letter-spacing: 0.02em; }
	:global(.rsvp-style-minimal) .preview-submit { border-radius: 4px; font-weight: 400; }
	:global(.rsvp-style-minimal) .preview-field input,
	:global(.rsvp-style-minimal) .preview-field select { border-radius: 4px; }

	:global(.rsvp-style-festive) .preview-inner { font-family: 'Verdana', sans-serif; border-radius: 4px; border: 2px dashed currentColor; }
	:global(.rsvp-style-festive) .preview-inner h2 { font-weight: 650; }
	:global(.rsvp-style-festive) .preview-submit { border-radius: 50px; font-weight: 650; }
	:global(.rsvp-style-festive) .preview-field input,
	:global(.rsvp-style-festive) .preview-field select { border-radius: 10px; }

	:global(.rsvp-style-classic) .preview-inner { font-family: 'Palatino Linotype', serif; border-radius: var(--radius); border: 1px solid var(--border); }
	:global(.rsvp-style-classic) .preview-inner h2 { font-family: 'Palatino Linotype', serif; font-weight: 550; }
	:global(.rsvp-style-classic) .preview-submit { border-radius: 8px; }
	:global(.rsvp-style-classic) .preview-field input,
	:global(.rsvp-style-classic) .preview-field select { border-radius: 6px; border: 1px solid var(--border); }

	/* ===== Responsive ===== */
	@media (max-width: 840px) {
		.editor-grid {
			grid-template-columns: 1fr;
		}

		.preview-col {
			position: static;
			max-height: none;
		}

		.toolbar-title {
			position: static;
			transform: none;
		}
	}
</style>
