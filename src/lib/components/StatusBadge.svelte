<script lang="ts">
	import { t } from '$lib/i18n.svelte';

	interface Props {
		status: 'pending' | 'waiting_payment' | 'approved' | 'planned' | 'completed' | 'cancelled' | 'set' | 'unset' | 'open' | 'closed';
		label?: string;
	}
	const { status, label }: Props = $props();

	const COLOR: Record<string, string> = {
		pending:         'var(--warning)',
		waiting_payment: 'var(--accent-ink)',
		approved:        'var(--success)',
		planned:         'var(--text-base)',
		completed:       'var(--text-muted)',
		cancelled:       'var(--danger)',
		set:             'var(--success)',
		unset:           'var(--text-muted)',
		open:            'var(--text-base)',
		closed:          'var(--text-muted)',
	};

	// The label is also the tint the pill is mixed from, so the neutral statuses
	// take --text-muted, not --text-subtle: subtle lands at ~2.8:1 on its own
	// 12% wash, which is below AA for an 11px label.
	const color = $derived(COLOR[status] ?? 'var(--text-muted)');
	const displayLabel = $derived(label ?? (t.status as Record<string, string>)[status] ?? status);
</script>

<span class="badge" style:--c={color}>{displayLabel}</span>

<style>
	.badge {
		display: inline-flex; align-items: center;
		padding: 3px 9px; border-radius: var(--radius-sm);
		font-size: 11px; font-weight: 650; white-space: nowrap;
		letter-spacing: .01em;
		background: color-mix(in srgb, var(--c) 12%, transparent);
		color: var(--c);
	}
</style>
