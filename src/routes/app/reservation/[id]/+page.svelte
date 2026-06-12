<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/stores';
	import { t } from '$lib/i18n';
	import { migrateToMultiFloor } from '$lib/floorplan-types';
	import FloorplanViewer from '$lib/FloorplanViewer.svelte';
	import SectionHeader from '$lib/components/SectionHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import KpiCard from '$lib/components/KpiCard.svelte';
	import type { PageData } from './$types';
	import type { RsvpConfig } from '$lib/db/index';

	interface Props { data: PageData; }
	let { data }: Props = $props();

	const rsvpConfig = $derived((data.reservation.rsvp_config ?? {}) as RsvpConfig);
	const rsvpEnabled = $derived((data.reservation.rsvp_config as RsvpConfig)?.enabled !== false);

	let copied = $state(false);
	let statusOpen = $state(false);
	let templateDialogOpen = $state(false);
	let layoutFormRef: HTMLFormElement | undefined = $state();
	let layoutJsonValue = $state('');
	let resetFormRef: HTMLFormElement | undefined = $state();
	let templateFormRef: HTMLFormElement | undefined = $state();

	function onLayoutSave(json: string) {
		layoutJsonValue = json;
		// Trigger form submission after state update
		requestAnimationFrame(() => layoutFormRef?.requestSubmit());
	}
	let statusDropdownRef: HTMLDivElement | undefined = $state();
	let statusFormRef: HTMLFormElement | undefined = $state();

	// Click-outside to close status dropdown
	$effect(() => {
		if (!statusOpen) return;
		function handleClick(e: MouseEvent) {
			if (statusDropdownRef && !statusDropdownRef.contains(e.target as Node)) {
				statusOpen = false;
			}
		}
		document.addEventListener('click', handleClick, true);
		return () => document.removeEventListener('click', handleClick, true);
	});

	// Close template dialog on Escape
	$effect(() => {
		if (!templateDialogOpen) return;
		function handleKey(e: KeyboardEvent) {
			if (e.key === 'Escape') templateDialogOpen = false;
		}
		document.addEventListener('keydown', handleKey);
		return () => document.removeEventListener('keydown', handleKey);
	});

	function resetLayout() {
		if (!confirm(t.event.confirmReset)) return;
		resetFormRef?.requestSubmit();
	}

	function loadTemplate(templateId: string) {
		if (!confirm(t.event.confirmLoadTemplate)) return;
		if (!templateFormRef) return;
		const input = templateFormRef.querySelector('input[name="templateId"]') as HTMLInputElement;
		if (input) { input.value = templateId; templateFormRef.requestSubmit(); }
		templateDialogOpen = false;
	}

	const statusColors: Record<string, string> = {
		pending: '#b45309',
		waiting_payment: '#4338ca',
		approved: '#15803d',
		planned: '#1d4ed8',
		completed: '#64748b',
		cancelled: '#dc2626',
	};

	const user = $derived($page.data.user);
	const isAdmin = $derived(user?.role === 'admin');
	const canEditAdvanced = $derived(
		isAdmin || ['approved', 'planned'].includes(data.reservation.status)
	);
	const canCancel = $derived(
		!['cancelled', 'completed'].includes(data.reservation.status)
	);

	function selectStatus(value: string) {
		statusOpen = false;
		if (!statusFormRef) return;
		const input = statusFormRef.querySelector('input[name="status"]') as HTMLInputElement;
		if (input) {
			input.value = value;
			statusFormRef.requestSubmit();
		}
	}
	const isPast = $derived(new Date(data.reservation.event_date) < new Date(new Date().toDateString()));

	function formatDate(d: Date | string) {
		return new Date(d).toLocaleDateString('sk-SK', {
			weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
		});
	}

	async function copyInvite() {
		await navigator.clipboard.writeText(data.inviteUrl);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}

	// Count tables/seats from layout (across all floors)
	const layoutStats = $derived.by(() => {
		if (!data.reservation.layout_json) return { tables: 0, seats: 0 };
		const state = migrateToMultiFloor(data.reservation.layout_json);
		let tableCount = 0, seatCount = 0;
		for (const floor of state.floors) {
			tableCount += floor.tables.length;
			for (const t of floor.tables) {
				seatCount += (Number(t.chairsTop) || 0) + (Number(t.chairsBottom) || 0) +
					(Number(t.chairsLeft) || 0) + (Number(t.chairsRight) || 0) || (Number(t.chairs) || 0);
			}
		}
		return { tables: tableCount, seats: seatCount };
	});
</script>

<svelte:head><title>{data.reservation.title} – Hallify</title></svelte:head>

<div class="page">
	<!-- Header -->
	<div class="page-top">
		<div>
			<SectionHeader overline={t.event.manage} title={data.reservation.title} />
			{#if isPast}
				<div class="alert-warning" style="margin-top:-12px;margin-bottom:20px">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
					</svg>
					{t.event.pastEvent}
				</div>
			{/if}
		</div>
		<div class="header-actions">
			{#if canEditAdvanced}
				<a href="/app/reservation/{data.reservation.id}/rsvp-editor" class="btn-outline">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
					</svg>
					{t.event.rsvpSettings}
				</a>
			{/if}
			{#if data.reservation.status === 'approved' && !isAdmin}
				<form method="POST" action="?/markPlanned" use:enhance style="display:inline">
					<button type="submit" class="btn-outline">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<polyline points="20 6 9 17 4 12"/>
						</svg>
						{t.event.markPlanned}
					</button>
				</form>
			{/if}
			{#if canCancel && !isAdmin}
				<form method="POST" action="?/cancel" use:enhance style="display:inline"
					onsubmit={(e) => { if (!confirm(t.event.confirmCancel)) e.preventDefault(); }}>
					<button type="submit" class="btn-danger btn-sm">{t.event.cancelReservation}</button>
				</form>
			{/if}
			<a href="/app/" class="btn-outline">{t.event.backToEvents}</a>
		</div>
	</div>

	{#if !canEditAdvanced && !isAdmin}
		<div class="alert-warning" style="margin-bottom:20px">
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
			</svg>
			{t.event.pendingNotice}
		</div>
	{/if}

	<!-- Two-column details -->
	<div class="detail-grid">
		<!-- Left: Event details card -->
		<div class="card detail-card">
			<h2>{t.event.details}</h2>

			<div class="detail-row">
				<div class="detail-icon">
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2">
						<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
						<line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
					</svg>
				</div>
				<div>
					<div class="detail-label">{t.event.dateTime}</div>
					<div class="detail-value">{formatDate(data.reservation.event_date)}</div>
					{#if data.reservation.start_time && data.reservation.end_time}
						<div class="detail-sub">{data.reservation.start_time} - {data.reservation.end_time}</div>
					{/if}
				</div>
			</div>

			<div class="detail-row">
				<div class="detail-icon dot" style="background:var(--accent)"></div>
				<div>
					<div class="detail-label">{t.event.venue}</div>
					<div class="detail-value">{data.reservation.hall_name}</div>
					<div class="detail-sub">{t.common.capacity}: {data.reservation.hall_max_people} {t.common.people}</div>
				</div>
			</div>

			<div class="detail-row">
				<div class="detail-icon">
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2">
						<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
						<circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
						<path d="M16 3.13a4 4 0 0 1 0 7.75"/>
					</svg>
				</div>
				<div>
					<div class="detail-label">{t.event.attendees}</div>
					<div class="detail-value">{data.rsvps.length} / {layoutStats.seats} {t.event.confirmed}</div>
					<div class="detail-sub">{t.event.registrations}: {data.rsvps.length}</div>
				</div>
			</div>

			<hr />

			{#if data.reservation.description}
				<div>
					<div class="desc-label">{t.event.eventDescription}</div>
					<p class="desc-text">{data.reservation.description}</p>
				</div>
			{/if}

			<!-- Status control -->
			{#if isAdmin}
				<form method="POST" action="?/updateStatus" use:enhance bind:this={statusFormRef} class="status-form">
					<input type="hidden" name="status" value={data.reservation.status} />
					<div class="status-dropdown" bind:this={statusDropdownRef}>
						<button
							type="button"
							class="status-trigger"
							onclick={() => (statusOpen = !statusOpen)}
						>
							<StatusBadge status={data.reservation.status} />
							<svg class="status-chevron" class:open={statusOpen} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<polyline points="6 9 12 15 18 9"/>
							</svg>
						</button>
						{#if statusOpen}
							<div class="status-menu">
								{#each ['pending', 'waiting_payment', 'approved', 'planned', 'completed', 'cancelled'] as opt}
									<button
										type="button"
										class="status-option"
										class:active={data.reservation.status === opt}
										onclick={() => selectStatus(opt)}
									>
										<span class="status-dot" style="background:{statusColors[opt]}"></span>
										{(t.status as Record<string, string>)[opt]}
									</button>
								{/each}
							</div>
						{/if}
					</div>
				</form>
			{:else}
				<StatusBadge status={data.reservation.status} />
			{/if}
		</div>

		<!-- Right: Stat cards -->
		<div class="stat-stack">
			<KpiCard
				label={t.event.totalAttendees}
				value={data.rsvps.length}
				sublabel="{t.common.of} {layoutStats.seats} {t.event.seats}"
			/>
			<KpiCard
				label={t.event.registrations}
				value={data.rsvps.length}
			/>
			<div class="card invite-card">
				<div class="invite-header">
					<div class="invite-label">{t.event.inviteLink}</div>
					<form method="POST" action="?/toggleRsvp" use:enhance={() => {
						return async ({ update }) => { await update({ reset: false }); };
					}}>
						<input type="hidden" name="enabled" value={rsvpEnabled ? 'false' : 'true'} />
						<button type="submit" class="rsvp-toggle" class:on={rsvpEnabled}
							title={rsvpEnabled ? t.event.rsvpEnabled : t.event.rsvpDisabled}>
							<span class="rsvp-toggle-knob"></span>
						</button>
					</form>
				</div>
				{#if rsvpEnabled}
					<button onclick={copyInvite} class="btn-action" style="width:100%">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
							<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
						</svg>
						{copied ? t.event.copied : t.event.copyLink}
					</button>
				{:else}
					<p class="rsvp-disabled-msg">{t.event.rsvpDisabled}</p>
				{/if}
			</div>
		</div>
	</div>

	<!-- Table layout section -->
	<div class="card layout-section">
		<div class="layout-header">
			<div>
				<h2 style="margin-bottom:4px">{t.event.tableLayout}</h2>
				<p class="layout-sub">{canEditAdvanced ? t.event.customLayout : t.event.layoutLocked}</p>
			</div>
			{#if canEditAdvanced}
				<div class="layout-actions">
					<a href="/app/reservation/{data.reservation.id}/layout" class="btn-action btn-sm">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
							<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
						</svg>
						{t.event.editLayout}
					</a>
					<button type="button" class="btn-outline btn-sm" onclick={() => (templateDialogOpen = true)}>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
							<polyline points="14 2 14 8 20 8"/>
						</svg>
						{t.event.loadTemplate}
					</button>
					<button type="button" class="btn-outline btn-sm" onclick={resetLayout}>
						<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
						</svg>
						{t.event.resetLayout}
					</button>
				</div>
			{/if}
		</div>

		<div class="layout-preview card">
			<div class="layout-preview-header">
				<span>{t.event.currentLayout}</span>
				<span class="layout-badge">{layoutStats.tables} {t.event.tables} ({t.event.customBadge})</span>
			</div>
			<div class="map-wrap">
				<FloorplanViewer
					layoutJson={data.reservation.layout_json ?? data.reservation.hall_floorplan_json}
					rsvps={data.rsvps}
					reservationId={data.reservation.id}
					tableTypes={data.tableTypes}
					onsave={onLayoutSave}
				/>
			</div>
			<div class="layout-footer">
				{layoutStats.tables} {t.event.tables}, {layoutStats.seats} {t.event.seats}
			</div>
		</div>
	</div>
</div>

<!-- Hidden forms -->
<form method="POST" action="?/saveLayout" use:enhance bind:this={layoutFormRef} style="display:none">
	<input type="hidden" name="layoutJson" value={layoutJsonValue} />
</form>
<form method="POST" action="?/resetLayout" use:enhance bind:this={resetFormRef} style="display:none"></form>
<form method="POST" action="?/loadTemplate" use:enhance bind:this={templateFormRef} style="display:none">
	<input type="hidden" name="templateId" value="" />
</form>

<!-- Template dialog -->
{#if templateDialogOpen}
	<div class="dialog-backdrop" onclick={() => (templateDialogOpen = false)} role="presentation">
		<div class="dialog-card" onclick={(e) => e.stopPropagation()} role="dialog">
			<div class="dialog-header">
				<h2>{t.event.loadTemplate}</h2>
				<button type="button" class="dialog-close" onclick={() => (templateDialogOpen = false)}>
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
					</svg>
				</button>
			</div>
			{#if data.templates.length === 0}
				<p class="no-templates">{t.event.noTemplates}</p>
			{:else}
				<div class="template-list">
					{#each data.templates as tmpl}
						<button type="button" class="template-item" onclick={() => loadTemplate(tmpl.id)}>
							<div class="template-name">{tmpl.name}</div>
							{#if tmpl.event_type}
								<div class="template-type">{tmpl.event_type}</div>
							{/if}
						</button>
					{/each}
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.page {
		padding: 32px 40px;
		overflow-y: auto;
		height: 100%;
	}

	.page-top {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		flex-wrap: wrap;
		gap: 16px;
	}

	.header-actions {
		display: flex;
		gap: 10px;
	}

	.detail-grid {
		display: grid;
		grid-template-columns: 1fr 320px;
		gap: 20px;
		margin-bottom: 24px;
	}

	.detail-card h2 {
		font-size: 16px;
		font-weight: 600;
		margin-bottom: 20px;
	}

	.detail-row {
		display: flex;
		gap: 14px;
		margin-bottom: 20px;
	}

	.detail-icon {
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.detail-icon.dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		margin: 10px;
	}

	.detail-label {
		font-size: 13px;
		font-weight: 600;
		color: var(--text-base);
		margin-bottom: 2px;
	}

	.detail-value {
		font-size: 14px;
		color: var(--text-base);
	}

	.detail-sub {
		font-size: 13px;
		color: var(--text-muted);
	}

	hr {
		border: none;
		border-top: 1px solid var(--border);
		margin: 16px 0;
	}

	.desc-label {
		font-size: 14px;
		font-weight: 600;
		margin-bottom: 6px;
	}

	.desc-text {
		font-size: 14px;
		color: var(--text-muted);
		line-height: 1.6;
		margin-bottom: 16px;
	}

	.status-form {
		display: flex;
		gap: 10px;
		align-items: center;
	}

	/* Custom status dropdown */
	.status-dropdown {
		position: relative;
	}

	.status-trigger {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 4px 8px 4px 4px;
		border-radius: 8px;
		border: 1px solid var(--border);
		background: var(--bg-panel);
		cursor: pointer;
		transition: border-color 0.15s, box-shadow 0.15s;
	}

	.status-trigger:hover {
		border-color: var(--accent);
		box-shadow: 0 0 0 2px rgba(123, 108, 240, 0.1);
	}

	.status-chevron {
		transition: transform 0.2s;
		color: var(--text-muted);
	}

	.status-chevron.open {
		transform: rotate(180deg);
	}

	.status-menu {
		position: absolute;
		top: 100%;
		left: 0;
		margin-top: 4px;
		background: var(--bg-panel);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 6px;
		min-width: 160px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
		z-index: 201;
	}

	.status-option {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 8px 14px;
		border-radius: 6px;
		font-size: 13px;
		font-weight: 500;
		color: var(--text-base);
		cursor: pointer;
		background: none;
		border: none;
		font-family: inherit;
		text-align: left;
	}

	.status-option:hover {
		background: var(--bg-panel2);
	}

	.status-option.active {
		background: var(--bg-panel2);
		font-weight: 600;
	}

	.status-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.stat-stack {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.invite-card {
		padding: 20px;
	}

	.invite-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 12px;
	}

	.invite-label {
		font-size: 13px;
		font-weight: 500;
		color: var(--text-muted);
	}

	.rsvp-toggle {
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

	.rsvp-toggle.on {
		background: var(--accent);
	}

	.rsvp-toggle-knob {
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

	.rsvp-toggle.on .rsvp-toggle-knob {
		transform: translateX(16px);
	}

	.rsvp-disabled-msg {
		font-size: 13px;
		color: var(--text-muted);
		text-align: center;
		padding: 8px 0;
	}

	.layout-section {
		margin-bottom: 24px;
	}

	.layout-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 20px;
	}

	.layout-header h2 {
		font-size: 16px;
		font-weight: 600;
	}

	.layout-sub {
		font-size: 13px;
		color: var(--text-muted);
	}

	.layout-actions {
		display: flex;
		gap: 10px;
	}

	.layout-preview {
		background: var(--bg-panel2);
		border: 1px solid var(--border);
		padding: 0;
		overflow: hidden;
	}

	.layout-preview-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 14px 20px;
		border-bottom: 1px solid var(--border);
		font-size: 14px;
		font-weight: 500;
	}

	.layout-badge {
		font-size: 12px;
		color: var(--accent);
		font-weight: 600;
	}

	.map-wrap {
		height: 500px;
		position: relative;
	}

	.layout-footer {
		padding: 10px 20px;
		border-top: 1px solid var(--border);
		font-size: 13px;
		color: var(--text-muted);
		text-align: right;
	}

	/* Template dialog */
	.dialog-backdrop {
		position: fixed;
		inset: 0;
		z-index: 1000;
		background: rgba(0, 0, 0, 0.4);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 20px;
	}

	.dialog-card {
		background: var(--bg-panel);
		border-radius: 14px;
		width: 100%;
		max-width: 420px;
		box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
		overflow: hidden;
	}

	.dialog-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 18px 20px;
		border-bottom: 1px solid var(--border);
	}

	.dialog-header h2 {
		font-size: 16px;
		font-weight: 600;
		margin: 0;
	}

	.dialog-close {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: 8px;
		border: none;
		background: none;
		cursor: pointer;
		color: var(--text-muted);
	}

	.dialog-close:hover {
		background: var(--bg-panel2);
		color: var(--text-base);
	}

	.no-templates {
		padding: 24px 20px;
		text-align: center;
		font-size: 13px;
		color: var(--text-muted);
	}

	.template-list {
		padding: 8px;
		max-height: 360px;
		overflow-y: auto;
	}

	.template-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 12px 14px;
		border-radius: 8px;
		border: none;
		background: none;
		cursor: pointer;
		font-family: inherit;
		text-align: left;
	}

	.template-item:hover {
		background: var(--bg-panel2);
	}

	.template-name {
		font-size: 14px;
		font-weight: 500;
	}

	.template-type {
		font-size: 12px;
		color: var(--text-muted);
		background: var(--bg-panel2);
		padding: 2px 8px;
		border-radius: 4px;
	}

</style>
