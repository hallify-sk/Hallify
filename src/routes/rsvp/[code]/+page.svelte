<script lang="ts">
	import { enhance } from '$app/forms';
	import { t } from '$lib/i18n.svelte';
	import { reveal } from '$lib/reveal';
	import type { PageData, ActionData } from './$types';
	import type { RsvpConfig } from '$lib/db/index';
	import { readableInkOn } from '$lib/contrast';

	interface Props { data: PageData; form: ActionData; }
	const { data, form }: Props = $props();

	const config = (data.reservation.rsvp_config ?? {}) as RsvpConfig;
	const rsvpEnabled = config.enabled !== false;
	const btnColor = config.primaryColor ?? 'var(--accent-action)';
	// The organiser picks this colour freely, so the label on top of it cannot be a
	// fixed token — --accent-contrast is near-black and disappears on a dark pick.
	const btnInk = readableInkOn(config.primaryColor);
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
	<!-- The invitation is the one surface here that is NOT the app's own language:
	     the organiser picks a decorative theme (.rsvp-style-*) that owns its radius,
	     border, shadow and face, so this card keeps its local chrome rather than
	     .card--raised, which every variant would override anyway. -->
	<div class="rsvp-card" use:reveal>
		<div class="event-info">
			<p class="eyebrow">{t.rsvp.title}</p>
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
			<div class="card--inset cancelled-box">
				<p>{t.rsvp.cancelled}</p>
			</div>
		{:else if !rsvpEnabled}
			<div class="card--inset cancelled-box">
				<p>{t.rsvp.closed}</p>
			</div>
		{:else if form?.success}
			<div class="card--inset success-box">
				<span class="icon-tile">
					<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2">
						<circle cx="12" cy="12" r="10"/><polyline points="9 12 12 15 16 9"/>
					</svg>
				</span>
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
					<button type="submit" class="btn-submit" style="background:{btnColor}; color:{btnInk}">
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
		padding: 64px 16px;
	}

	.rsvp-card {
		background: var(--bg-panel);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		padding: 44px 40px;
		width: 100%;
		max-width: 480px;
		box-shadow: var(--shadow);
	}


	.event-info {
		border-bottom: 1px solid var(--border);
		padding-bottom: 26px;
		margin-bottom: 30px;
	}

	.event-info .eyebrow { display: block; margin-bottom: 10px; }

	h1 {
		font-size: clamp(24px, 4.4vw, 30px);
		font-weight: 550;
		letter-spacing: -0.055em;
		line-height: 1.08;
		margin-bottom: 12px;
	}

	.event-desc {
		font-size: 14px;
		color: var(--text-muted);
		line-height: 1.75;
		margin-bottom: 18px;
	}

	.event-details { display: flex; flex-direction: column; gap: 10px; }

	.detail {
		display: flex;
		align-items: center;
		gap: 9px;
		font-size: 13px;
		line-height: 1.5;
		color: var(--text-muted);
	}

	.detail svg { color: var(--accent-ink); flex-shrink: 0; }

	/* Both of these sit on .card--inset for the fill and the padding; only the
	   voice is local. */
	.cancelled-box {
		text-align: center;
		color: var(--danger);
		font-size: 14px;
		line-height: 1.75;
	}

	.success-box {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		text-align: center;
	}

	.success-box h2 { font-size: 20px; font-weight: 550; letter-spacing: -0.045em; }
	.success-box p { font-size: 14px; line-height: 1.75; color: var(--text-muted); }

	.form-section h2 {
		font-size: 17px;
		font-weight: 600;
		letter-spacing: -0.03em;
		margin-bottom: 20px;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-bottom: 18px;
	}

	.required { color: var(--danger); }

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		line-height: 1.5;
		cursor: pointer;
	}

	.btn-submit {
		width: 100%;
		padding: 13px 20px;
		border-radius: var(--radius-sm);
		/* Overridden inline with a value derived from the organiser's own colour; this
		   is only the fallback for when no colour has been chosen. */
		color: var(--accent-contrast);
		font-size: 14px;
		font-weight: 650;
		border: none;
		cursor: pointer;
		margin-top: 8px;
		/* font-family, not the `font` shorthand: the shorthand resets size and weight
		   back to the inherited values, which silently killed the two declarations
		   above. The family still inherits, so each style variant keeps its own face. */
		font-family: inherit;
		transition: transform .2s, filter .2s;
	}

	/* The lift on hover is the signature interaction of this language. */
	.btn-submit:hover { transform: translateY(-2px); filter: brightness(0.96); }
	.btn-submit:active { transform: translateY(0); }

	@media (prefers-reduced-motion: reduce) {
		.btn-submit:hover { transform: none; }
	}

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
		line-height: 1.5;
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
		padding: 9px 13px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		font-size: 13px;
		background: var(--bg-panel2);
	}

	/* ===== RSVP Style Variants ===== */

	/* Default — already styled above */

	/* Elegant — serif fonts, large radius, soft shadows */
	:global(.rsvp-style-elegant) .rsvp-card {
		font-family: 'Georgia', 'Times New Roman', serif;
		/* Decorative template radii are exempt from the 3/4/6px scale (see
		   APP-DESIGN-SYSTEM.md §4) — flattening them collapses the six themes
		   into one look. */
		border-radius: 24px;
		box-shadow: var(--shadow);
		border: none;
	}
	/* The -.055em signature belongs to Inter. On the serif and script faces the
	   variants switch to, it crowds the letterforms, so each one relaxes it. */
	:global(.rsvp-style-elegant) h1 { font-family: 'Georgia', serif; font-style: italic; font-weight: 400; font-size: 24px; letter-spacing: -0.01em; line-height: 1.2; }
	:global(.rsvp-style-elegant) .btn-submit { border-radius: 24px; }
	:global(.rsvp-style-elegant) input, :global(.rsvp-style-elegant) select { border-radius: 12px; }

	/* Modern — sharp corners, bold geometric look */
	:global(.rsvp-style-modern) .rsvp-card {
		font-family: 'Inter', 'Helvetica Neue', sans-serif;
		border-radius: 0;
		box-shadow: none;
		border: 2px solid var(--text-base);
	}
	:global(.rsvp-style-modern) h1 { font-family: 'Inter', sans-serif; font-weight: 650; text-transform: uppercase; letter-spacing: 0.05em; font-size: 18px; }
	:global(.rsvp-style-modern) .btn-submit { border-radius: 0; text-transform: uppercase; letter-spacing: 0.08em; }
	:global(.rsvp-style-modern) input, :global(.rsvp-style-modern) select { border-radius: 0; border: 2px solid var(--border); }
	:global(.rsvp-style-modern) .event-info { border-bottom: 2px solid var(--text-base); }

	/* Romantic — cursive headers, pastel-ready, large rounded */
	:global(.rsvp-style-romantic) .rsvp-card {
		font-family: 'Georgia', serif;
		border-radius: 28px;
		box-shadow: var(--shadow);
		border: 1px solid var(--border-subtle);
	}
	:global(.rsvp-style-romantic) h1 { font-family: 'Brush Script MT', 'Segoe Script', cursive; font-weight: 400; font-size: 28px; letter-spacing: normal; line-height: 1.3; }
	:global(.rsvp-style-romantic) .form-section h2 { font-family: 'Brush Script MT', 'Segoe Script', cursive; font-weight: 400; font-size: 20px; letter-spacing: normal; }
	:global(.rsvp-style-romantic) .btn-submit { border-radius: 28px; }
	:global(.rsvp-style-romantic) input, :global(.rsvp-style-romantic) select { border-radius: 14px; }

	/* Minimal — thin borders, lots of whitespace */
	:global(.rsvp-style-minimal) .rsvp-card {
		font-family: 'Helvetica Neue', 'Arial', sans-serif;
		border-radius: 8px;
		box-shadow: none;
		border: 1px solid var(--border);
		padding: 48px 40px;
	}
	:global(.rsvp-style-minimal) h1 { font-weight: 300; font-size: 22px; letter-spacing: 0.02em; }
	:global(.rsvp-style-minimal) .event-info { border-bottom: 1px solid var(--border-subtle); padding-bottom: 24px; margin-bottom: 28px; }
	:global(.rsvp-style-minimal) .btn-submit { border-radius: 4px; font-weight: 400; }
	:global(.rsvp-style-minimal) input, :global(.rsvp-style-minimal) select { border-radius: 4px; background: var(--bg-panel2); }

	/* Festive — vibrant, rounded, playful */
	:global(.rsvp-style-festive) .rsvp-card {
		font-family: 'Verdana', 'Trebuchet MS', sans-serif;
		border-radius: 20px;
		box-shadow: var(--shadow);
		border: 2px dashed currentColor;
	}
	:global(.rsvp-style-festive) h1 { font-weight: 650; font-size: 22px; letter-spacing: -0.02em; line-height: 1.2; }
	:global(.rsvp-style-festive) .btn-submit { border-radius: 50px; font-weight: 650; padding: 14px; }
	:global(.rsvp-style-festive) input, :global(.rsvp-style-festive) select { border-radius: 10px; }

	/* Classic — traditional, medium radius, subtle */
	:global(.rsvp-style-classic) .rsvp-card {
		font-family: 'Palatino Linotype', 'Book Antiqua', Palatino, serif;
		border-radius: 12px;
		box-shadow: var(--shadow-sm);
		border: 1px solid var(--border);
	}
	:global(.rsvp-style-classic) h1 { font-weight: 550; font-size: 22px; font-family: 'Palatino Linotype', serif; letter-spacing: -0.015em; line-height: 1.2; }
	:global(.rsvp-style-classic) .btn-submit { border-radius: 8px; }
	:global(.rsvp-style-classic) input, :global(.rsvp-style-classic) select { border-radius: 6px; border: 1px solid var(--border); }

	/* The generous padding above would leave too little room on a phone. This sits
	   after the variants on purpose: a variant selector carries one class more than
	   the bare .rsvp-card, so the one variant that sets its own padding needs its
	   own entry here or it would out-specify the guard. */
	@media (max-width: 520px) {
		.rsvp-wrap { padding: 32px 16px; }
		.rsvp-card { padding: 30px 22px; }
		:global(.rsvp-style-minimal) .rsvp-card { padding: 34px 24px; }
	}
</style>
