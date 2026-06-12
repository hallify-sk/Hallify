<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { untrack } from 'svelte';
	import { t } from '$lib/i18n';
	import { migrateToMultiFloor } from '$lib/floorplan-types';
	import SectionHeader from '$lib/components/SectionHeader.svelte';
	import MiniCalendar from '$lib/components/MiniCalendar.svelte';
	import type { PageData, ActionData } from './$types';

	interface Props { data: PageData; form: ActionData; }
	const { data, form }: Props = $props();

	let selectedHall = $state<string>(untrack(() => data.selectedHallId ?? ''));
	let selectedTemplate = $state('');
	let eventType = $state('');
	let selectedDate = $state('');
	let step = $state(1);

	const selectedHallData = $derived(data.halls.find(h => h.id === selectedHall));

	const EVENT_TYPES_KEYS: (keyof typeof t.eventTypes)[] = ['wedding', 'ball', 'conference', 'birthday', 'other'];

	const filteredTemplates = $derived(
		data.templates.filter(tmpl => {
			if (!eventType) return true;
			if (!tmpl.event_type) return true;
			const key = eventType.toLowerCase();
			return tmpl.event_type.toLowerCase() === key ||
				tmpl.event_type.toLowerCase() === (t.eventTypes as Record<string, string>)[key];
		})
	);

	const maxStep = $derived(selectedHall && filteredTemplates.length > 0 ? 3 : 2);

	// Compute blocked dates as ISO strings for MiniCalendar
	const blockedDateStrings = $derived.by(() => {
		const result: string[] = [];
		const blocks = data.blocks;
		for (const b of blocks) {
			if (b.block_type === 'date_range' && b.date_from && b.date_to) {
				const start = new Date(b.date_from);
				const end = new Date(b.date_to);
				for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
					result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
				}
			}
			if (b.block_type === 'weekly' && b.days_of_week) {
				const now = new Date();
				for (let i = 0; i < 180; i++) {
					const d = new Date(now);
					d.setDate(d.getDate() + i);
					if (b.days_of_week.includes(d.getDay())) {
						result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
					}
				}
			}
		}
		return result;
	});

	const allBlockedDates = $derived([...new Set([...blockedDateStrings, ...data.takenDates])]);

	function onHallChange() {
		if (selectedHall) goto(`/reservation/new?hall=${selectedHall}`, { replaceState: true, noScroll: true });
	}

	function onDateSelect(date: string) {
		selectedDate = date;
	}

	function nextStep() {
		if (step < maxStep) step++;
	}

	function prevStep() {
		if (step > 1) step--;
	}

	// Auto-select hall if only one exists
	$effect(() => {
		if (data.halls.length === 1 && !selectedHall) {
			selectedHall = data.halls[0].id;
			onHallChange();
		}
	});
</script>

<svelte:head><title>{t.createEvent.title} – Hallify</title></svelte:head>

<div class="page">
	<SectionHeader overline={t.createEvent.overview} title={t.createEvent.title} />

	{#if form?.error}
		<div class="alert-error">{form.error}</div>
	{/if}

	<!-- Step indicator -->
	<div class="step-indicator">
		<!-- Step 1 -->
		<div class="step-item" class:active={step === 1} class:done={step > 1}>
			<div class="step-num">
				{#if step > 1}
					<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
						<polyline points="20 6 9 17 4 12"/>
					</svg>
				{:else}
					1
				{/if}
			</div>
			<span class="step-label">Hall &amp; Date</span>
		</div>

		<div class="step-connector"></div>

		<!-- Step 2 -->
		<div class="step-item" class:active={step === 2} class:done={step > 2} class:future={step < 2}>
			<div class="step-num">
				{#if step > 2}
					<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
						<polyline points="20 6 9 17 4 12"/>
					</svg>
				{:else}
					2
				{/if}
			</div>
			<span class="step-label">Event Details</span>
		</div>

		{#if maxStep === 3}
			<div class="step-connector"></div>

			<!-- Step 3 -->
			<div class="step-item" class:active={step === 3} class:future={step < 3}>
				<div class="step-num">3</div>
				<span class="step-label">Layout</span>
			</div>
		{/if}
	</div>

	<form method="POST" use:enhance>
		<!-- Hidden inputs always present for form submission -->
		<input type="hidden" name="hallId" value={selectedHall} />
		<input type="hidden" name="eventDate" value={selectedDate} />
		<input type="hidden" name="templateId" value={selectedTemplate} />

		<!-- Step 1: Hall & Date -->
		{#if step === 1}
			<div class="step-content">
				<div class="step1-grid">
					<!-- Left: Hall selection -->
					<div class="step1-halls">
						<h2 class="step-section-title">{t.createEvent.selectHall}</h2>
						<div class="hall-grid">
							{#each data.halls as h}
								<button
									type="button"
									class="hall-card"
									class:selected={selectedHall === h.id}
									onclick={() => {
										selectedHall = h.id;
										onHallChange();
									}}
								>
									{#if h.cover_image_url}
										<div class="hall-cover-img" style="background:{h.color}18">
											<img src={h.cover_image_url} alt={h.name} />
											<div class="hall-cover-strip" style="background:{h.color}"></div>
										</div>
									{:else}
										<div class="hall-icon" style="background:color-mix(in srgb,{h.color} 12%,transparent);color:{h.color}">
											<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
												<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
												<polyline points="9 22 9 12 15 12 15 22"/>
											</svg>
										</div>
									{/if}
									<div class="hall-info">
										<span class="hall-name">{h.name}</span>
										{#if h.description}
											<span class="hall-desc">{h.description}</span>
										{/if}
									</div>
									<div class="hall-card-right">
										<span class="hall-badge">{h.max_people} {t.common.people}</span>
										{#if h.slug}
											<a href="/halls/{h.slug}" target="_blank" rel="noopener"
												class="hall-profile-link"
												onclick={(e) => e.stopPropagation()}>
												Profile →
											</a>
										{/if}
									</div>
								</button>
							{/each}
						</div>

						{#if selectedHallData?.pre_reservation_text}
							<div class="info-banner">
								<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0; margin-top: 1px;">
									<circle cx="12" cy="12" r="10"/>
									<line x1="12" y1="16" x2="12" y2="12"/>
									<line x1="12" y1="8" x2="12.01" y2="8"/>
								</svg>
								<p>{selectedHallData.pre_reservation_text}</p>
							</div>
						{/if}
					</div>

					<!-- Right: Calendar -->
					<div class="step1-calendar">
						<h2 class="step-section-title">{t.createEvent.selectDate}</h2>
						<MiniCalendar
							blockedDates={allBlockedDates}
							events={data.takenDates}
							selectedDate={selectedDate}
							onselect={onDateSelect}
						/>
						{#if selectedDate}
							<div class="selected-date-note card">
								<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2.5">
									<polyline points="20 6 9 17 4 12"/>
								</svg>
								<span>{new Date(selectedDate).toLocaleDateString('sk-SK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
							</div>
						{/if}
						<div class="legend">
							<div class="legend-item"><span class="dot today"></span> dnes</div>
							<div class="legend-item"><span class="dot blocked"></span> {t.createEvent.blockedDate}</div>
							<div class="legend-item"><span class="dot event"></span> {t.createEvent.takenDate}</div>
						</div>
					</div>
				</div>

				<div class="step-actions">
					<a href="/app/" class="btn-outline">{t.common.cancel}</a>
					<button
						type="button"
						class="btn-action"
						disabled={!selectedHall || !selectedDate}
						onclick={nextStep}
					>
						Continue
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
							<line x1="5" y1="12" x2="19" y2="12"/>
							<polyline points="12 5 19 12 12 19"/>
						</svg>
					</button>
				</div>
			</div>
		{/if}

		<!-- Step 2: Event Details -->
		{#if step === 2}
			<div class="step-content">
				<div class="card step-card">
					<h2 class="step-section-title" style="margin-bottom: 20px;">{t.event?.details ?? 'Event Details'}</h2>

					<div class="field">
						<label for="title">{t.createEvent.eventName} *</label>
						<input
							id="title"
							name="title"
							type="text"
							placeholder={t.createEvent.eventNamePlaceholder}
							class="input-large"
							required
						/>
					</div>

					<div class="field">
						<label for="eventType">{t.createEvent.eventType}</label>
						<select id="eventType" name="eventType" bind:value={eventType}>
							<option value="">—</option>
							{#each EVENT_TYPES_KEYS as key}
								<option value={key}>{t.eventTypes[key]}</option>
							{/each}
						</select>
					</div>

					<div class="field">
						<label for="description">{t.createEvent.eventDescription}</label>
						<textarea id="description" name="description" rows="3" placeholder="…"></textarea>
					</div>

					<!-- Summary of step 1 selections -->
					<div class="selection-summary">
						{#if selectedHallData}
							<span class="summary-chip">
								<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
								</svg>
								{selectedHallData.name}
							</span>
						{/if}
						{#if selectedDate}
							<span class="summary-chip">
								<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<rect x="3" y="4" width="18" height="18" rx="2"/>
									<line x1="16" y1="2" x2="16" y2="6"/>
									<line x1="8" y1="2" x2="8" y2="6"/>
									<line x1="3" y1="10" x2="21" y2="10"/>
								</svg>
								{new Date(selectedDate).toLocaleDateString('sk-SK', { day: 'numeric', month: 'long', year: 'numeric' })}
							</span>
						{/if}
					</div>
				</div>

				<div class="step-actions">
					<button type="button" class="btn-outline" onclick={prevStep}>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
							<line x1="19" y1="12" x2="5" y2="12"/>
							<polyline points="12 19 5 12 12 5"/>
						</svg>
						Back
					</button>

					{#if maxStep === 2}
						<!-- No templates: this is the final step -->
						<button type="submit" class="btn-action" disabled={!selectedDate}>
							{t.createEvent.submit}
						</button>
					{:else}
						<button type="button" class="btn-action" onclick={nextStep}>
							Continue
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
								<line x1="5" y1="12" x2="19" y2="12"/>
								<polyline points="12 5 19 12 12 19"/>
							</svg>
						</button>
					{/if}
				</div>
			</div>
		{/if}

		<!-- Step 3: Layout (only if templates exist) -->
		{#if step === 3}
			<div class="step-content">
				<div class="card step-card">
					<h2 class="step-section-title" style="margin-bottom: 20px;">{t.createEvent.suggestedLayouts}</h2>

					<div class="templates-grid">
						<!-- Blank layout card first -->
						<label class="template-card" class:selected={selectedTemplate === ''}>
							<input type="radio" name="_templateRadio" value="" bind:group={selectedTemplate} />
							<div class="template-preview blank">
								<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4">
									<rect x="3" y="3" width="18" height="18" rx="2"/>
									<line x1="3" y1="9" x2="21" y2="9"/>
									<line x1="9" y1="21" x2="9" y2="9"/>
								</svg>
								<span>{t.createEvent.blankLayout}</span>
							</div>
						</label>

						{#each filteredTemplates as tmpl}
							{@const tmplFloor = migrateToMultiFloor(tmpl.layout_json).floors[0]}
							<label class="template-card" class:selected={selectedTemplate === tmpl.id}>
								<input type="radio" name="_templateRadio" value={tmpl.id} bind:group={selectedTemplate} />
								<div class="template-preview">
									<svg viewBox="0 0 100 70" preserveAspectRatio="xMidYMid meet">
										{#each tmplFloor.tables as tbl}
											{#if tbl.shape === 'round'}
												<circle cx={tbl.x * 10} cy={tbl.y * 10} r={(tbl.radius ?? 1) * 10 * 0.8} fill="var(--accent)" opacity="0.55"/>
											{:else}
												<rect
													x={(tbl.x - (tbl.width ?? 2) / 2) * 10}
													y={(tbl.y - ((tbl.height ?? 1) / 2)) * 10}
													width={(tbl.width ?? 2) * 10}
													height={(tbl.height ?? 1) * 10}
													rx="2" fill="var(--accent)" opacity="0.55"
												/>
											{/if}
										{/each}
									</svg>
								</div>
								<span class="template-name">{tmpl.name}</span>
								{#if tmpl.event_type}
									<span class="template-tag">{tmpl.event_type}</span>
								{/if}
							</label>
						{/each}
					</div>
				</div>

				<div class="step-actions">
					<button type="button" class="btn-outline" onclick={prevStep}>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
							<line x1="19" y1="12" x2="5" y2="12"/>
							<polyline points="12 19 5 12 12 5"/>
						</svg>
						Back
					</button>
					<button type="submit" class="btn-action" disabled={!selectedDate}>
						{t.createEvent.submit}
					</button>
				</div>
			</div>
		{/if}
	</form>
</div>

<style>
	.page {
		padding: 32px 40px;
		overflow-y: auto;
		height: 100%;
		max-width: 900px;
	}

	/* ── Step indicator ─────────────────────────────────────────────── */

	.step-indicator {
		display: flex;
		align-items: center;
		gap: 0;
		margin-bottom: 32px;
	}

	.step-item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 16px;
	}

	.step-item:first-child {
		padding-left: 0;
	}

	.step-num {
		width: 26px;
		height: 26px;
		border-radius: 50%;
		font-size: 12px;
		font-weight: 700;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		transition: background 0.15s, border-color 0.15s, color 0.15s;
		/* default / future */
		background: var(--bg-panel2);
		border: 1.5px solid var(--border);
		color: var(--text-subtle);
	}

	.step-label {
		font-size: 13px;
		font-weight: 500;
		color: var(--text-subtle);
		white-space: nowrap;
		transition: color 0.15s;
	}

	/* Active step */
	.step-item.active .step-num {
		background: var(--accent);
		border-color: var(--accent);
		color: #fff;
	}

	.step-item.active .step-label {
		color: var(--text-base);
		font-weight: 600;
	}

	/* Completed step */
	.step-item.done .step-num {
		background: var(--accent-dim);
		border-color: var(--accent);
		color: var(--accent);
	}

	.step-item.done .step-label {
		color: var(--accent);
	}

	/* Future step (already default, just explicit) */
	.step-item.future .step-num {
		background: var(--bg-panel2);
		border-color: var(--border);
		color: var(--text-subtle);
	}

	.step-connector {
		flex: 1;
		height: 1px;
		background: var(--border);
		min-width: 24px;
		max-width: 48px;
	}

	/* ── Step content wrapper ───────────────────────────────────────── */

	.step-content {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.step-card {
		display: flex;
		flex-direction: column;
	}

	.step-section-title {
		font-size: 15px;
		font-weight: 600;
		color: var(--text-base);
		margin-bottom: 14px;
	}

	/* ── Step 1 layout ──────────────────────────────────────────────── */

	.step1-grid {
		display: grid;
		grid-template-columns: 45fr 55fr;
		gap: 24px;
		align-items: start;
	}

	.step1-halls {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.step1-calendar {
		display: flex;
		flex-direction: column;
		gap: 12px;
		position: sticky;
		top: 20px;
	}

	/* ── Hall cards ─────────────────────────────────────────────────── */

	.hall-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: 10px;
	}

	.hall-card {
		border: 1.5px solid var(--border);
		border-radius: 10px;
		padding: 14px 16px;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 12px;
		transition: border-color 0.15s, background 0.15s;
		background: var(--bg-panel);
		text-align: left;
		width: 100%;
	}

	.hall-card:hover {
		border-color: var(--text-subtle);
		background: var(--bg-hover);
	}

	.hall-card.selected {
		border-color: var(--accent);
		background: var(--accent-dim);
	}

	.hall-icon {
		width: 36px;
		height: 36px;
		border-radius: 8px;
		background: var(--bg-panel2);
		border: 1px solid var(--border);
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-muted);
		flex-shrink: 0;
		transition: background 0.15s, border-color 0.15s;
	}

	.hall-card.selected .hall-icon {
		background: var(--accent-dim);
		border-color: var(--accent);
		color: var(--accent);
	}

	.hall-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.hall-name {
		font-size: 14px;
		font-weight: 600;
		color: var(--text-base);
	}

	.hall-desc {
		font-size: 12px;
		color: var(--text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.hall-badge {
		font-size: 11px;
		font-weight: 600;
		color: var(--text-muted);
		background: var(--bg-panel2);
		border: 1px solid var(--border);
		border-radius: 20px;
		padding: 3px 9px;
		white-space: nowrap;
		flex-shrink: 0;
		transition: background 0.15s, border-color 0.15s, color 0.15s;
	}

	.hall-card.selected .hall-badge {
		background: var(--accent);
		border-color: var(--accent);
		color: #fff;
	}

	.hall-cover-img {
		width: 48px; height: 36px; border-radius: 6px; overflow: hidden;
		flex-shrink: 0; position: relative; border: 1px solid var(--border);
	}
	.hall-cover-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
	.hall-cover-strip {
		position: absolute; bottom: 0; left: 0; right: 0; height: 2px;
	}

	.hall-card-right {
		display: flex; flex-direction: column; align-items: flex-end;
		gap: 4px; flex-shrink: 0;
	}
	.hall-profile-link {
		font-size: 10px; font-weight: 600; color: var(--accent);
		text-decoration: none; white-space: nowrap;
		transition: opacity .1s;
	}
	.hall-profile-link:hover { opacity: .75; }

	/* ── Info banner (pre_reservation_text) ─────────────────────────── */

	.info-banner {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		background: var(--accent-dim);
		border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
		border-radius: 8px;
		padding: 12px 14px;
		color: var(--text-base);
		font-size: 13px;
		line-height: 1.5;
	}

	.info-banner svg {
		color: var(--accent);
	}

	.info-banner p { margin: 0; }

	/* ── Calendar area (step 1) ──────────────────────────────────────── */

	.selected-date-note {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 11px 16px;
		font-size: 13px;
		font-weight: 500;
		color: var(--accent);
	}

	.legend {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 0 4px;
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 11px;
		color: var(--text-muted);
	}

	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.dot.today   { background: var(--accent); }
	.dot.blocked { background: var(--danger); }
	.dot.event   { background: var(--warning); }

	/* ── Step 2: event details ──────────────────────────────────────── */

	.input-large {
		font-size: 16px !important;
		padding: 11px 14px !important;
	}

	.selection-summary {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 8px;
		padding-top: 16px;
		border-top: 1px solid var(--border-subtle);
	}

	.summary-chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		font-weight: 500;
		color: var(--text-muted);
		background: var(--bg-panel2);
		border: 1px solid var(--border);
		border-radius: 20px;
		padding: 4px 10px;
	}

	/* ── Step 3: templates ──────────────────────────────────────────── */

	.templates-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		gap: 12px;
	}

	.template-card {
		cursor: pointer;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.template-card input { display: none; }

	.template-preview {
		border: 2px solid var(--border);
		border-radius: 8px;
		aspect-ratio: 1.4;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--bg-panel2);
		overflow: hidden;
		transition: border-color 0.15s;
		flex-direction: column;
		gap: 6px;
	}

	.template-preview svg { width: 100%; height: 100%; }

	.template-preview.blank {
		color: var(--text-muted);
		font-size: 11px;
		font-weight: 500;
	}

	.template-preview.blank svg {
		width: 28px;
		height: 28px;
	}

	.template-card.selected .template-preview {
		border-color: var(--accent);
		background: var(--accent-dim);
	}

	.template-name {
		font-size: 12px;
		font-weight: 500;
		color: var(--text-base);
	}

	.template-tag {
		font-size: 10px;
		color: var(--accent);
		font-weight: 600;
		text-transform: uppercase;
	}

	/* ── Navigation buttons ─────────────────────────────────────────── */

	.step-actions {
		display: flex;
		justify-content: flex-end;
		gap: 10px;
		padding-top: 4px;
	}

	.btn-action:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.btn-action:disabled:hover {
		background: var(--accent);
	}
</style>
