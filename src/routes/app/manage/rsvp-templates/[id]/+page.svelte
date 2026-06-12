<script lang="ts">
	import { enhance } from '$app/forms';
	import { t } from '$lib/i18n';
	import type { PageData, ActionData } from './$types';
	import type { RsvpConfig } from '$lib/db/index';

	interface Props { data: PageData; form: ActionData; }
	let { data, form }: Props = $props();

	const initial = (data.template.config ?? {}) as RsvpConfig;
	let templateName = $state(data.template.name);
	let eventType = $state(data.template.event_type ?? '');
	let primaryColor = $state(initial.primaryColor ?? '#e91e8a');
	let bgColor = $state(initial.bgColor ?? '#ffffff');
	let bgImage = $state(initial.bgImage ?? '');
	let description = $state(initial.description ?? '');
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

	let fullscreenPreview = $state(false);
	let showToast = $state(false);
	let saving = $state(false);

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

	const defaultAllergens = t.rsvpEditor.defaultAllergens.split(',').map(s => s.trim());

	const configJson = $derived(JSON.stringify({
		primaryColor, bgColor, bgImage, description,
		fields: fields.map(f => ({
			name: f.name, label: f.label, type: f.type,
			required: f.required,
			options: f.type === 'allergies' && !f.options?.length ? defaultAllergens : f.options,
		})),
	}));

	function previewBgStyle(bg: string, img: string): string {
		if (img) {
			return `background-image:url(${img});background-size:cover;background-position:center;background-color:${bg}`;
		}
		return `background:${bg}`;
	}
</script>

<svelte:head><title>{t.rsvpTemplates.editTemplate} – Hallify</title></svelte:head>

<!-- Sticky toolbar -->
<div class="toolbar">
	<a href="/app/manage/rsvp-templates" class="toolbar-back" title={t.common.back}>
		<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
		{t.common.back}
	</a>
	<h1 class="toolbar-title">{t.rsvpTemplates.editTemplate}</h1>
	<form method="POST" action="?/save" use:enhance={() => {
		saving = true;
		return async ({ update }) => {
			await update({ reset: false });
		};
	}}>
		<input type="hidden" name="name" value={templateName} />
		<input type="hidden" name="event_type" value={eventType} />
		<input type="hidden" name="config" value={configJson} />
		<button type="submit" class="btn-action btn-sm toolbar-save" disabled={saving}>
			{#if saving}
				<span class="spinner"></span>
			{/if}
			{t.rsvpEditor.save}
		</button>
	</form>
</div>

<!-- Success toast -->
{#if showToast}
	<div class="toast-success" role="alert">
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
		{t.rsvpEditor.save} - OK
	</div>
{/if}

<div class="editor-grid">
	<!-- Left: Settings -->
	<div class="settings-col">

		<!-- Section: Template info -->
		<div class="settings-section card">
			<h3 class="section-title">{t.rsvpTemplates.editTemplate}</h3>
			<div class="field-row">
				<div class="field">
					<label for="templateName">{t.rsvpTemplates.templateName}</label>
					<input id="templateName" type="text" bind:value={templateName} required />
				</div>
				<div class="field">
					<label for="eventType">{t.rsvpTemplates.eventType}</label>
					<select id="eventType" bind:value={eventType}>
						<option value="">—</option>
						{#each Object.entries(t.eventTypes) as [key, label]}
							<option value={key}>{label}</option>
						{/each}
					</select>
				</div>
			</div>
		</div>

		<!-- Section: Appearance -->
		<div class="settings-section card">
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

		<!-- Section: Content -->
		<div class="settings-section card">
			<h3 class="section-title">{t.rsvpEditor.description}</h3>
			<div class="field compact" style="margin-bottom:0">
				<textarea id="description" bind:value={description} rows="3"
					placeholder={t.rsvpEditor.descriptionPlaceholder}></textarea>
			</div>
		</div>

		<!-- Section: Form Fields -->
		<div class="settings-section card">
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
				<input type="hidden" name="name" value={templateName} />
				<input type="hidden" name="event_type" value={eventType} />
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
			<div class="preview-card" style={previewBgStyle(bgColor, bgImage)}>
				<div class="preview-inner">
					<h2 style="color:{primaryColor}">{templateName}</h2>
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
	</div>
</div>

<!-- Fullscreen preview overlay -->
{#if fullscreenPreview}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="fullscreen-overlay" onclick={(e) => { if (e.target === e.currentTarget) fullscreenPreview = false; }}
		onkeydown={(e) => { if (e.key === 'Escape') fullscreenPreview = false; }}>
		<button type="button" class="fullscreen-close" onclick={() => { fullscreenPreview = false; }}>
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
		</button>
		<div class="fullscreen-content" style={previewBgStyle(bgColor, bgImage)}>
			<div class="preview-inner fullscreen-inner">
				<h2 style="color:{primaryColor}">{templateName}</h2>
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
		font-weight: 700;
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
		background: #f0fdf4;
		border: 1px solid #bbf7d0;
		color: var(--success);
		border-radius: 8px;
		font-size: 13px;
		font-weight: 600;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
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

	.section-title {
		font-size: 13px;
		font-weight: 700;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		margin-bottom: 14px;
	}

	/* ===== Template info ===== */
	.field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

	/* ===== Color pickers ===== */
	.color-row {
		display: flex;
		gap: 16px;
		margin-bottom: 14px;
	}

	.color-picker-group { flex: 1; }

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

	.color-swatch:hover { border-color: var(--accent); }

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
		border-radius: 6px;
		border: 1px solid var(--border);
		padding: 0 10px;
		font-size: 13px;
		font-family: monospace;
		background: var(--bg-panel2);
		color: var(--text-base);
		min-width: 0;
	}

	/* ===== Compact fields ===== */
	.field.compact { margin-bottom: 14px; }
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
		border-radius: 10px;
		padding: 12px 14px;
		margin-bottom: 8px;
	}

	.field-card:last-child { margin-bottom: 0; }

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
		border-radius: 4px;
		padding: 1px 6px;
		line-height: 1.4;
	}

	.field-card-actions { display: flex; gap: 3px; }

	.btn-icon {
		width: 24px;
		height: 24px;
		border-radius: 5px;
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

	.btn-icon:hover { background: var(--accent-dim); color: var(--accent); }
	.btn-icon.danger:hover { background: #fef2f2; color: var(--danger); }
	.btn-icon:disabled { opacity: 0.3; cursor: not-allowed; }

	/* ===== Toggle switch ===== */
	.toggle-field { max-width: 100px; }

	.toggle-switch {
		position: relative;
		width: 36px;
		height: 20px;
		border-radius: 10px;
		background: var(--border);
		border: none;
		cursor: pointer;
		transition: background 0.2s;
		padding: 0;
		flex-shrink: 0;
	}

	.toggle-switch.on { background: var(--accent); }

	.toggle-knob {
		position: absolute;
		top: 2px;
		left: 2px;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: white;
		transition: transform 0.2s;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
	}

	.toggle-switch.on .toggle-knob { transform: translateX(16px); }

	/* ===== Sticky save bar ===== */
	.save-bar {
		position: sticky;
		bottom: 0;
		padding: 12px 20px;
		background: var(--bg-panel);
		border-top: 1px solid var(--border);
		border-radius: 0 0 12px 12px;
		display: flex;
		align-items: center;
		justify-content: flex-end;
		z-index: 10;
	}

	.save-bar form { display: flex; align-items: center; }

	/* ===== Spinner ===== */
	.spinner {
		display: inline-block;
		width: 14px;
		height: 14px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top-color: #fff;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	@keyframes spin { to { transform: rotate(360deg); } }

	/* ===== Preview panel (sticky) ===== */
	.preview-col {
		position: sticky;
		top: 76px;
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
		font-size: 13px;
		font-weight: 700;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.preview-card {
		border: 1px solid var(--border);
		border-radius: 14px;
		min-height: 400px;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 32px 24px;
	}

	.preview-inner {
		width: 100%;
		max-width: 340px;
		background: white;
		border-radius: 12px;
		padding: 28px 24px;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
	}

	.preview-inner h2 { font-size: 18px; font-weight: 700; margin-bottom: 8px; }
	.preview-desc { font-size: 13px; color: #666; margin-bottom: 20px; line-height: 1.5; }

	.preview-fields { display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px; }

	.preview-field label {
		display: block; font-size: 12px; font-weight: 600; color: #333;
		margin-bottom: 4px; text-transform: none; letter-spacing: 0;
	}

	.preview-field input[type="text"],
	.preview-field input[type="email"],
	.preview-field select {
		width: 100%; padding: 8px 12px; border: 1px solid #ddd;
		border-radius: 6px; font-size: 13px; background: #f9f9f9;
	}

	.checkbox-row { display: flex; align-items: center; gap: 8px; }
	.checkbox-row input[type="checkbox"] { width: 16px; height: 16px; margin: 0; flex-shrink: 0; }
	.checkbox-label { font-size: 12px; font-weight: 600; color: #333; user-select: none; line-height: 1; }

	.preview-submit {
		width: 100%; padding: 10px; border: none; border-radius: 8px;
		color: white; font-size: 14px; font-weight: 600; cursor: default;
	}

	/* ===== Fullscreen overlay ===== */
	.fullscreen-overlay {
		position: fixed; inset: 0; z-index: 9999;
		background: rgba(0, 0, 0, 0.6);
		display: flex; align-items: center; justify-content: center;
	}

	.fullscreen-close {
		position: fixed; top: 16px; right: 20px; z-index: 10000;
		width: 40px; height: 40px; border-radius: 50%; border: none;
		background: white; color: var(--text-base); cursor: pointer;
		display: flex; align-items: center; justify-content: center;
		transition: background 0.15s, box-shadow 0.15s;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
	}

	.fullscreen-close:hover { background: #f5f5f5; box-shadow: 0 2px 12px rgba(0, 0, 0, 0.25); }

	.fullscreen-content {
		width: 100%; height: 100%;
		display: flex; align-items: center; justify-content: center;
		overflow: auto; padding: 48px 24px;
	}

	.fullscreen-inner { max-width: 480px; }

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
		color: #333;
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
		border: 1px solid #ddd;
		border-radius: 6px;
		font-size: 12px;
		background: #f9f9f9;
	}

	/* ===== Responsive ===== */
	@media (max-width: 840px) {
		.editor-grid { grid-template-columns: 1fr; }
		.preview-col { position: static; max-height: none; }
		.toolbar-title { position: static; transform: none; }
	}
</style>
