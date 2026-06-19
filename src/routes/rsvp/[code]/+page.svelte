<script lang="ts">
	import { enhance } from '$app/forms';
	import { t } from '$lib/i18n.svelte';
	import type { PageData, ActionData } from './$types';
	import type { RsvpConfig } from '$lib/db/index';

	interface Props { data: PageData; form: ActionData; }
	const { data, form }: Props = $props();

	const config = (data.reservation.rsvp_config ?? {}) as RsvpConfig;
	const rsvpEnabled = config.enabled !== false;
	const btnColor = config.primaryColor ?? 'var(--accent-action)';
	const pageBg = config.bgColor ?? 'var(--bg-base)';
	const bgImage = config.bgImage ?? '';
	const customDesc = config.description ?? '';
	const arrivalTime = config.arrivalTime ?? '';
	const customFields = config.fields ?? [];
	const styleName = config.style ?? 'default';

	function bgStyle(): string {
		if (bgImage) {
			return `background-image:url(${bgImage});background-size:cover;background-position:center;background-color:${pageBg}`;
		}
		return `background:${pageBg}`;
	}

	function formatDate(d: Date | string) {
		return new Date(d).toLocaleDateString('sk-SK', {
			weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
		});
	}
</script>

<svelte:head><title>RSVP – {data.reservation.title}</title></svelte:head>

<div class="rsvp-wrap rsvp-style-{styleName}" style={bgStyle()}>
	<div class="rsvp-card">
		<div class="event-info">
			<h1>{data.reservation.title}</h1>
			{#if customDesc}
				<p class="event-desc">{customDesc}</p>
			{/if}
			<div class="event-details">
				<div class="detail">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
						<line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
					</svg>
					{formatDate(data.reservation.event_date)}
				</div>
				<div class="detail">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
						<polyline points="9 22 9 12 15 12 15 22"/>
					</svg>
					{data.reservation.hall_name}
				</div>
				{#if data.reservation.hall_address}
					<div class="detail">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
							<circle cx="12" cy="10" r="3"/>
						</svg>
						{data.reservation.hall_address}
					</div>
				{/if}
				{#if arrivalTime}
					<div class="detail">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
						</svg>
						{t.rsvpEditor.arrivalTime}: {arrivalTime}
					</div>
				{/if}
			</div>
		</div>

		{#if data.reservation.status === 'cancelled'}
			<div class="cancelled-box">
				<p>{t.rsvp.cancelled}</p>
			</div>
		{:else if !rsvpEnabled}
			<div class="cancelled-box">
				<p>{t.rsvp.closed}</p>
			</div>
		{:else if form?.success}
			<div class="success-box">
				<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2">
					<circle cx="12" cy="12" r="10"/><polyline points="9 12 12 15 16 9"/>
				</svg>
				<h2>{t.rsvp.successTitle}</h2>
				<p>{t.rsvp.successMsg}</p>
			</div>
		{:else}
			<div class="form-section">
				<h2>{t.rsvp.confirmAttendance}</h2>

				{#if form?.error}
					<div class="alert-error">{form.error}</div>
				{/if}

				<form method="POST" use:enhance>
					{#if customFields.length > 0}
						<!-- Use custom fields from rsvp_config -->
						{#each customFields as field}
							<div class="field">
								<label for="cf_{field.name}">
									{field.label || field.name}
									{#if field.required}<span class="required">*</span>{/if}
								</label>
								{#if field.type === 'checkbox'}
									<label class="checkbox-label">
										<input id="cf_{field.name}" name={field.name} type="checkbox" />
										<span>{field.label}</span>
									</label>
								{:else if field.type === 'select'}
									<select id="cf_{field.name}" name={field.name} required={field.required}>
										<option value="">—</option>
										{#each (field.options ?? []) as opt}
											<option value={opt}>{opt}</option>
										{/each}
									</select>
								{:else if field.type === 'allergies'}
									<div class="allergies-checklist">
										{#each (field.options ?? []) as allergen}
											<label class="allergy-item">
												<input type="checkbox" name={field.name} value={allergen} />
												<span>{allergen}</span>
											</label>
										{/each}
										<div class="allergy-other">
											<label class="allergy-item">
												<input type="checkbox" name="{field.name}_other_check" value="other" />
												<span>{t.rsvpEditor.allergiesOther}</span>
											</label>
											<input type="text" name="{field.name}_other" placeholder={t.rsvpEditor.allergiesOtherPlaceholder} class="allergy-other-input" />
										</div>
									</div>
								{:else}
									<input id="cf_{field.name}" name={field.name} type={field.type}
										required={field.required} placeholder={field.label} />
								{/if}
							</div>
						{/each}
					{:else}
						<!-- Default fields -->
						<div class="field">
							<label for="name">{t.rsvp.fullName} *</label>
							<input id="name" name="name" type="text" required />
						</div>
						<div class="field">
							<label for="email">{t.rsvp.email}</label>
							<input id="email" name="email" type="email" />
						</div>
					{/if}
					{#if data.maxExtraGuests > 0}
						<div class="field">
							<label for="extra_guests">Bringing extra guests?</label>
							<select id="extra_guests" name="extra_guests">
								<option value="0">Just me</option>
								{#each Array(data.maxExtraGuests) as _, i}
									<option value={i + 1}>+{i + 1} {i + 1 === 1 ? 'guest' : 'guests'}</option>
								{/each}
							</select>
						</div>
					{/if}
					<button type="submit" class="btn-submit" style="background:{btnColor}">
						{t.rsvp.submit}
					</button>
				</form>
			</div>
		{/if}
	</div>
</div>

<style>
	.rsvp-wrap {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100%;
		padding: 40px 16px;
	}

	.rsvp-card {
		background: var(--bg-panel);
		border: 1px solid var(--border);
		border-radius: 16px;
		padding: 36px 32px;
		width: 100%;
		max-width: 440px;
		box-shadow: 0 4px 24px rgba(0,0,0,0.06);
	}


	.event-info {
		border-bottom: 1px solid var(--border);
		padding-bottom: 20px;
		margin-bottom: 24px;
	}

	h1 {
		font-size: 20px;
		font-weight: 700;
		margin-bottom: 8px;
	}

	.event-desc {
		font-size: 13px;
		color: var(--text-muted);
		line-height: 1.5;
		margin-bottom: 12px;
	}

	.event-details { display: flex; flex-direction: column; gap: 7px; }

	.detail {
		display: flex;
		align-items: center;
		gap: 7px;
		font-size: 13px;
		color: var(--text-muted);
	}

	.cancelled-box {
		text-align: center;
		padding: 20px;
		color: var(--danger);
		font-size: 14px;
	}

	.success-box {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		text-align: center;
		padding: 20px 0;
	}

	.success-box h2 { font-size: 18px; font-weight: 700; }
	.success-box p { font-size: 13px; color: var(--text-muted); }

	.form-section h2 { font-size: 16px; font-weight: 600; margin-bottom: 16px; }

	.alert-error {
		background: #fef2f2;
		border: 1px solid #fecaca;
		color: var(--danger);
		border-radius: 8px;
		padding: 10px 14px;
		font-size: 13px;
		margin-bottom: 14px;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 5px;
		margin-bottom: 14px;
	}

	.required { color: var(--danger); }

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		cursor: pointer;
	}

	.btn-submit {
		width: 100%;
		padding: 12px;
		border-radius: 8px;
		color: #fff;
		font-size: 14px;
		font-weight: 600;
		border: none;
		cursor: pointer;
		margin-top: 4px;
		font: inherit;
	}

	.btn-submit:hover { opacity: 0.9; }

	.allergies-checklist {
		display: flex;
		flex-wrap: wrap;
		gap: 8px 14px;
		margin-top: 2px;
	}

	.allergy-item {
		display: flex;
		align-items: center;
		gap: 7px;
		font-size: 13px;
		cursor: pointer;
	}

	.allergy-item input[type="checkbox"] {
		width: 16px;
		height: 16px;
		margin: 0;
		flex-shrink: 0;
	}

	.allergy-other {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 5px;
		margin-top: 4px;
	}

	.allergy-other-input {
		width: 100%;
		padding: 8px 12px;
		border: 1px solid var(--border);
		border-radius: 6px;
		font-size: 13px;
		background: var(--bg-panel2);
	}

	/* ===== RSVP Style Variants ===== */

	/* Default — already styled above */

	/* Elegant — serif fonts, large radius, soft shadows */
	:global(.rsvp-style-elegant) .rsvp-card {
		font-family: 'Georgia', 'Times New Roman', serif;
		border-radius: 24px;
		box-shadow: 0 8px 40px rgba(0,0,0,0.08);
		border: none;
	}
	:global(.rsvp-style-elegant) h1 { font-family: 'Georgia', serif; font-style: italic; font-weight: 400; font-size: 24px; }
	:global(.rsvp-style-elegant) .btn-submit { border-radius: 24px; }
	:global(.rsvp-style-elegant) input, :global(.rsvp-style-elegant) select { border-radius: 12px; }

	/* Modern — sharp corners, bold geometric look */
	:global(.rsvp-style-modern) .rsvp-card {
		font-family: 'Inter', 'Helvetica Neue', sans-serif;
		border-radius: 0;
		box-shadow: none;
		border: 2px solid #111;
	}
	:global(.rsvp-style-modern) h1 { font-family: 'Inter', sans-serif; font-weight: 900; text-transform: uppercase; letter-spacing: 0.05em; font-size: 18px; }
	:global(.rsvp-style-modern) .btn-submit { border-radius: 0; text-transform: uppercase; letter-spacing: 0.08em; }
	:global(.rsvp-style-modern) input, :global(.rsvp-style-modern) select { border-radius: 0; border: 2px solid #ccc; }
	:global(.rsvp-style-modern) .event-info { border-bottom: 2px solid #111; }

	/* Romantic — cursive headers, pastel-ready, large rounded */
	:global(.rsvp-style-romantic) .rsvp-card {
		font-family: 'Georgia', serif;
		border-radius: 28px;
		box-shadow: 0 6px 32px rgba(0,0,0,0.06);
		border: 1px solid rgba(0,0,0,0.06);
	}
	:global(.rsvp-style-romantic) h1 { font-family: 'Brush Script MT', 'Segoe Script', cursive; font-weight: 400; font-size: 28px; }
	:global(.rsvp-style-romantic) .form-section h2 { font-family: 'Brush Script MT', 'Segoe Script', cursive; font-weight: 400; font-size: 20px; }
	:global(.rsvp-style-romantic) .btn-submit { border-radius: 28px; }
	:global(.rsvp-style-romantic) input, :global(.rsvp-style-romantic) select { border-radius: 14px; }

	/* Minimal — thin borders, lots of whitespace */
	:global(.rsvp-style-minimal) .rsvp-card {
		font-family: 'Helvetica Neue', 'Arial', sans-serif;
		border-radius: 8px;
		box-shadow: none;
		border: 1px solid #e5e5e5;
		padding: 48px 40px;
	}
	:global(.rsvp-style-minimal) h1 { font-weight: 300; font-size: 22px; letter-spacing: 0.02em; }
	:global(.rsvp-style-minimal) .event-info { border-bottom: 1px solid #f0f0f0; padding-bottom: 24px; margin-bottom: 28px; }
	:global(.rsvp-style-minimal) .btn-submit { border-radius: 4px; font-weight: 400; }
	:global(.rsvp-style-minimal) input, :global(.rsvp-style-minimal) select { border-radius: 4px; background: #fafafa; }

	/* Festive — vibrant, rounded, playful */
	:global(.rsvp-style-festive) .rsvp-card {
		font-family: 'Verdana', 'Trebuchet MS', sans-serif;
		border-radius: 20px;
		box-shadow: 0 6px 30px rgba(0,0,0,0.1);
		border: 2px dashed currentColor;
	}
	:global(.rsvp-style-festive) h1 { font-weight: 800; font-size: 22px; }
	:global(.rsvp-style-festive) .btn-submit { border-radius: 50px; font-weight: 800; padding: 14px; }
	:global(.rsvp-style-festive) input, :global(.rsvp-style-festive) select { border-radius: 10px; }

	/* Classic — traditional, medium radius, subtle */
	:global(.rsvp-style-classic) .rsvp-card {
		font-family: 'Palatino Linotype', 'Book Antiqua', Palatino, serif;
		border-radius: 12px;
		box-shadow: 0 2px 16px rgba(0,0,0,0.05);
		border: 1px solid #d4d0c8;
	}
	:global(.rsvp-style-classic) h1 { font-weight: 600; font-size: 22px; font-family: 'Palatino Linotype', serif; }
	:global(.rsvp-style-classic) .btn-submit { border-radius: 8px; }
	:global(.rsvp-style-classic) input, :global(.rsvp-style-classic) select { border-radius: 6px; border: 1px solid #d4d0c8; }
</style>
