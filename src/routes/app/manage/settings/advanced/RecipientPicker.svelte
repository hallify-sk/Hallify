<script lang="ts">
	import { t } from '$lib/i18n.svelte';

	interface StaffMember {
		id: string;
		first_name: string;
		last_name: string;
		email: string;
		role: string;
	}

	interface Props {
		/** The notification key this picker belongs to (newReservation, …). */
		name: string;
		staff: StaffMember[];
		/** null = everyone on the team; [] = nobody (the email is off). */
		selected: string[] | null;
		labelledBy: string;
	}

	const { name, staff, selected, labelledBy }: Props = $props();

	// `all` follows the team: a member invited tomorrow is included without
	// anyone revisiting this screen. `custom` pins an explicit list.
	let mode = $state<'all' | 'custom'>(selected === null ? 'all' : 'custom');
	let picked = $state<string[]>(selected === null ? staff.map((s) => s.id) : [...selected]);
	let open = $state(false);

	const panelId = `rp-${name}`;

	const chosen = $derived(mode === 'all' ? staff.map((s) => s.id) : picked);

	const summary = $derived(
		mode === 'all'
			? t.settingsPages.recipientsEveryone
			: picked.length === 0
				? t.settingsPages.recipientsNone
				: picked.length === 1
					? (staff.find((s) => s.id === picked[0])?.first_name ?? t.settingsPages.recipientsCount(1))
					: t.settingsPages.recipientsCount(picked.length)
	);

	function fullName(m: StaffMember) {
		return `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim() || m.email;
	}

	function chooseAll() {
		mode = 'all';
		picked = staff.map((s) => s.id);
	}

	function toggleMember(id: string) {
		// The first manual tick turns the inherited "everyone" into an explicit list.
		if (mode === 'all') {
			mode = 'custom';
			picked = staff.map((s) => s.id);
		}
		picked = picked.includes(id) ? picked.filter((p) => p !== id) : [...picked, id];
	}

	function onWindowClick(e: MouseEvent) {
		const el = e.target as HTMLElement;
		if (!el.closest?.(`[data-rp="${panelId}"]`)) open = false;
	}

	$effect(() => {
		if (!open) return;
		document.addEventListener('click', onWindowClick, true);
		return () => document.removeEventListener('click', onWindowClick, true);
	});
</script>

<div class="rp" data-rp={panelId}>
	<!-- The form carries the decision, not the open/closed state of the panel. -->
	<input type="hidden" name="mode_{name}" value={mode} />
	{#if mode === 'custom'}
		{#each picked as id (id)}
			<input type="hidden" name="recipients_{name}" value={id} />
		{/each}
	{/if}

	<button
		type="button"
		class="rp-trigger"
		class:off={mode === 'custom' && picked.length === 0}
		aria-expanded={open}
		aria-controls={panelId}
		aria-labelledby="{labelledBy} {panelId}-value"
		onclick={() => (open = !open)}
	>
		<span class="rp-value" id="{panelId}-value">{summary}</span>
		<svg class="rp-caret" class:up={open} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
			<polyline points="6 9 12 15 18 9" />
		</svg>
	</button>

	{#if open}
		<div class="rp-panel card--raised" id={panelId} role="group" aria-labelledby={labelledBy}>
			<label class="rp-option">
				<input type="checkbox" checked={mode === 'all'} onchange={chooseAll} />
				<span class="rp-option-main">
					<span class="rp-option-name">{t.settingsPages.recipientsEveryone}</span>
					<span class="rp-option-sub">{t.settingsPages.recipientsEveryoneHint}</span>
				</span>
			</label>

			<div class="rp-divider"></div>

			{#if staff.length === 0}
				<p class="rp-empty">{t.settingsPages.recipientsNoStaff}</p>
			{:else}
				{#each staff as m (m.id)}
					<label class="rp-option">
						<input type="checkbox" checked={chosen.includes(m.id)} onchange={() => toggleMember(m.id)} />
						<span class="rp-option-main">
							<span class="rp-option-name">{fullName(m)}</span>
							<span class="rp-option-sub">{m.email}</span>
						</span>
					</label>
				{/each}
			{/if}
		</div>
	{/if}
</div>

<style>
	.rp { position: relative; flex-shrink: 0; }

	.rp-trigger {
		display: inline-flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		min-width: 190px;
		height: 34px;
		box-sizing: border-box;
		padding: 0 11px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg-panel2);
		color: var(--text-base);
		font-family: inherit;
		font-size: 12.5px;
		font-weight: 600;
		cursor: pointer;
		transition: border-color .15s, background .15s, color .15s;
	}
	.rp-trigger:hover { border-color: var(--text-subtle); }
	.rp-trigger[aria-expanded='true'] { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
	.rp-trigger.off { color: var(--text-subtle); font-weight: 500; }

	.rp-value { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.rp-caret { flex-shrink: 0; color: var(--text-subtle); transition: transform .15s; }
	.rp-caret.up { transform: rotate(180deg); }

	.rp-panel {
		position: absolute;
		top: calc(100% + 4px);
		right: 0;
		z-index: 60;
		min-width: 250px;
		max-height: 260px;
		overflow-y: auto;
		padding: 6px;
	}

	.rp-option {
		display: flex;
		align-items: flex-start;
		gap: 9px;
		padding: 7px 8px;
		border-radius: var(--radius-sm);
		cursor: pointer;
		transition: background .15s;
	}
	.rp-option:hover { background: var(--bg-hover); }
	.rp-option input { margin-top: 2px; accent-color: var(--accent); cursor: pointer; }

	.rp-option-main { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
	.rp-option-name { font-size: 12.5px; font-weight: 600; color: var(--text-base); }
	.rp-option-sub { font-size: 11px; color: var(--text-subtle); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

	.rp-divider { height: 1px; background: var(--border-subtle); margin: 5px 2px; }

	.rp-empty { font-size: 12px; color: var(--text-subtle); padding: 7px 8px; margin: 0; }

	@media (max-width: 600px) {
		.rp-trigger { min-width: 0; width: 100%; }
		.rp-panel { left: 0; right: 0; }
	}
</style>
