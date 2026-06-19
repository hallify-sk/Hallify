<script lang="ts">
	import { enhance } from '$app/forms';
	import { t } from '$lib/i18n.svelte';
	import SectionHeader from '$lib/components/SectionHeader.svelte';
	import type { PageData, ActionData } from './$types';

	interface Props { data: PageData; form: ActionData; }
	const { data, form }: Props = $props();

	const teamItems = $derived([
		{ key: 'newReservation', title: t.settingsPages.notifyNewBookingTitle, desc: t.settingsPages.notifyNewBookingDesc },
		{ key: 'guestMessage', title: t.settingsPages.notifyGuestMessageTitle, desc: t.settingsPages.notifyGuestMessageDesc },
		{ key: 'guestCancel', title: t.settingsPages.notifyGuestCancelTitle, desc: t.settingsPages.notifyGuestCancelDesc },
		{ key: 'guestEdit', title: t.settingsPages.notifyGuestEditTitle, desc: t.settingsPages.notifyGuestEditDesc },
	] as const);

	const guestItems = $derived([
		{ key: 'statusChange', title: t.settingsPages.notifyStatusUpdateTitle, desc: t.settingsPages.notifyStatusUpdateDesc },
		{ key: 'newMessage', title: t.settingsPages.notifyRepliesTitle, desc: t.settingsPages.notifyRepliesDesc },
	] as const);
</script>

<svelte:head><title>{t.settings.tabEmail} – {t.settings.title} – Hallify</title></svelte:head>

<div class="page">
	<SectionHeader overline={t.settings.manage} title={t.settings.tabEmail} />

	{#if form?.success}
		<div class="alert-success">{t.settings.saved}</div>
	{/if}

	<p class="intro">
		{t.settingsPages.emailIntroPre} <strong>noreply@hallify.sk</strong>. {t.settingsPages.emailIntroPost}
	</p>

	<form method="POST" action="?/saveNotifications" use:enhance={() => async ({ update }) => { await update({ reset: false }); }}>
		<div class="groups">
			<section class="group">
				<div class="group-head">
					<span class="group-title">{t.settingsPages.notifyTeam}</span>
					<span class="group-sub">{t.settingsPages.notifyTeamSub}</span>
				</div>
				{#each teamItems as item}
					<label class="toggle-row">
						<span class="toggle-text">
							<span class="toggle-title">{item.title}</span>
							<span class="toggle-desc">{item.desc}</span>
						</span>
						<input type="checkbox" name={item.key} checked={data.notifications[item.key]} />
						<span class="switch" aria-hidden="true"></span>
					</label>
				{/each}
			</section>

			<section class="group">
				<div class="group-head">
					<span class="group-title">{t.settingsPages.notifyGuests}</span>
					<span class="group-sub">{t.settingsPages.notifyGuestsSub}</span>
				</div>
				{#each guestItems as item}
					<label class="toggle-row">
						<span class="toggle-text">
							<span class="toggle-title">{item.title}</span>
							<span class="toggle-desc">{item.desc}</span>
						</span>
						<input type="checkbox" name={item.key} checked={data.notifications[item.key]} />
						<span class="switch" aria-hidden="true"></span>
					</label>
				{/each}
			</section>
		</div>

		<div class="actions">
			<button type="submit" class="btn-action">{t.common.save}</button>
		</div>
	</form>
</div>

<style>
	.page { padding: 24px 28px; }

	.intro { font-size: 13px; color: var(--text-muted); line-height: 1.6; margin: 0 0 20px; max-width: 70ch; }

	.groups {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
		align-items: start;
	}

	.group {
		background: var(--bg-panel);
		border: 1px solid var(--border);
		border-radius: 14px;
		padding: 18px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.group-head { margin-bottom: 4px; }
	.group-title { display: block; font-size: 13px; font-weight: 700; color: var(--text-base); }
	.group-sub { display: block; font-size: 11.5px; color: var(--text-subtle); margin-top: 2px; }

	.toggle-row {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 12px 14px;
		background: var(--bg-panel2, var(--bg-base));
		border: 1px solid var(--border-subtle, var(--border));
		border-radius: 10px;
		cursor: pointer;
		transition: border-color .12s;
	}
	.toggle-row:hover { border-color: color-mix(in srgb, var(--accent) 35%, var(--border)); }

	.toggle-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
	.toggle-title { font-size: 13px; font-weight: 600; color: var(--text-base); }
	.toggle-desc { font-size: 11.5px; color: var(--text-muted); line-height: 1.45; }

	/* Switch */
	.toggle-row input { position: absolute; opacity: 0; width: 0; height: 0; }
	.switch {
		flex-shrink: 0;
		position: relative;
		width: 38px; height: 22px;
		border-radius: 99px;
		background: var(--bg-hover, var(--border));
		border: 1px solid var(--border);
		transition: background .15s, border-color .15s;
	}
	.switch::after {
		content: '';
		position: absolute;
		top: 2px; left: 2px;
		width: 16px; height: 16px;
		border-radius: 50%;
		background: var(--text-subtle);
		transition: transform .15s, background .15s;
	}
	.toggle-row input:checked ~ .switch { background: var(--accent); border-color: var(--accent); }
	.toggle-row input:checked ~ .switch::after { transform: translateX(16px); background: #fff; }
	.toggle-row input:focus-visible ~ .switch { box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent); }

	.actions { margin-top: 20px; }
	.btn-action {
		padding: 9px 22px; border-radius: 8px; font-size: 13px; font-weight: 600;
		background: var(--accent); color: #fff; border: none; cursor: pointer; font-family: inherit;
	}
	.btn-action:hover { opacity: .9; }

	.alert-success {
		padding: 10px 14px; border-radius: 9px; font-size: 13px; font-weight: 500; margin-bottom: 16px;
		color: var(--success, #16a34a);
		background: color-mix(in srgb, var(--success, #22c55e) 12%, transparent);
		border: 1px solid color-mix(in srgb, var(--success, #22c55e) 28%, transparent);
	}

	@media (max-width: 760px) {
		.groups { grid-template-columns: 1fr; }
	}
</style>
