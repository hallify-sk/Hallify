<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	interface Props { data: PageData; form: ActionData; }
	const { data, form }: Props = $props();

	const { hall } = data;

	const today = new Date().toISOString().split('T')[0];
	const minDate = (() => {
		if (!hall.min_days_advance) return today;
		const d = new Date();
		d.setDate(d.getDate() + hall.min_days_advance);
		return d.toISOString().split('T')[0];
	})();
</script>

<svelte:head><title>Request reservation – {hall.name}</title></svelte:head>

<div class="page">
	<a href="/app/halls/{hall.slug ?? hall.id}" class="back">← Back to {hall.name}</a>

	<div class="card">
		<div class="card-head">
			<div
				class="hall-dot"
				style="background: {hall.color}"
			></div>
			<div>
				<h1>Request a reservation</h1>
				<p class="hall-sub">{hall.name}{hall.address ? ` · ${hall.address}` : ''}</p>
			</div>
		</div>

		{#if form?.error}
			<div class="notice-error">{form.error}</div>
		{/if}

		{#if hall.pre_reservation_text}
			<div class="pre-text">{hall.pre_reservation_text}</div>
		{/if}

		<form method="POST" use:enhance class="form">
			<div class="field">
				<label for="title">Event name <span class="req">*</span></label>
				<input id="title" name="title" type="text" placeholder="e.g. Birthday party" required />
			</div>

			<div class="field-row">
				<div class="field">
					<label for="eventDate">Date <span class="req">*</span></label>
					<input id="eventDate" name="eventDate" type="date" min={minDate} required />
				</div>
				<div class="field">
					<label for="startTime">Start time</label>
					<input id="startTime" name="startTime" type="time" />
				</div>
				<div class="field">
					<label for="endTime">End time</label>
					<input id="endTime" name="endTime" type="time" />
				</div>
			</div>

			<div class="field">
				<label for="description">Notes (optional)</label>
				<textarea id="description" name="description" rows="3" placeholder="Any special requirements or notes for the venue…"></textarea>
			</div>

			<div class="form-footer">
				<p class="status-note">
					{#if hall.auto_approve}
						Your reservation will be automatically approved.
					{:else}
						Your request will be reviewed by the venue. You'll be notified once it's confirmed.
					{/if}
				</p>
				<button type="submit" class="submit-btn">Send reservation request</button>
			</div>
		</form>
	</div>
</div>

<style>
	.page { display: flex; flex-direction: column; gap: 20px; max-width: 560px; margin: 0 auto; }

	.back { font-size: 13px; color: var(--accent); text-decoration: none; font-weight: 500; }

	.card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 14px;
		padding: 24px;
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.card-head { display: flex; align-items: center; gap: 14px; }

	.hall-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }

	.card-head h1 { font-size: 18px; font-weight: 700; color: var(--text-base); margin-bottom: 2px; }
	.hall-sub { font-size: 13px; color: var(--text-muted); }

	.notice-error {
		padding: 10px 14px;
		border-radius: 8px;
		font-size: 13px;
		font-weight: 500;
		background: var(--danger-dim);
		color: var(--danger);
		border: 1px solid color-mix(in srgb, var(--danger) 25%, transparent);
	}

	.pre-text {
		font-size: 13px;
		color: var(--text-muted);
		background: var(--bg);
		border-radius: 8px;
		padding: 12px;
		border: 1px solid var(--border);
		line-height: 1.5;
		white-space: pre-wrap;
	}

	.form { display: flex; flex-direction: column; gap: 16px; }

	.field { display: flex; flex-direction: column; gap: 5px; }
	.field-row { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 12px; }

	label { font-size: 12px; font-weight: 600; color: var(--text-muted); }
	.req { color: var(--danger); }

	textarea {
		resize: vertical;
		font-family: inherit;
		font-size: 14px;
	}

	.form-footer { display: flex; flex-direction: column; gap: 10px; margin-top: 4px; }

	.status-note {
		font-size: 12px;
		color: var(--text-muted);
		font-style: italic;
	}

	.submit-btn {
		width: 100%;
		padding: 11px;
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
</style>
