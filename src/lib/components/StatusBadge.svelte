<script lang="ts">
	import { t } from '$lib/i18n';

	interface Props {
		status: 'pending' | 'waiting_payment' | 'approved' | 'planned' | 'completed' | 'cancelled' | 'set' | 'unset' | 'open' | 'closed';
		label?: string;
	}
	const { status, label }: Props = $props();

	const COLOR: Record<string, string> = {
		pending:         '#f59e0b',
		waiting_payment: '#6366f1',
		approved:        '#22c55e',
		planned:         '#3b82f6',
		completed:       '#94a3b8',
		cancelled:       '#ef4444',
		set:             '#22c55e',
		unset:           '#94a3b8',
		open:            '#3b82f6',
		closed:          '#94a3b8',
	};

	const color = $derived(COLOR[status] ?? '#94a3b8');
	const displayLabel = $derived(label ?? (t.status as Record<string, string>)[status] ?? status);
</script>

<span class="badge" style:--c={color}>{displayLabel}</span>

<style>
	.badge {
		display: inline-flex; align-items: center;
		padding: 3px 9px; border-radius: 99px;
		font-size: 11px; font-weight: 700; white-space: nowrap;
		background: color-mix(in srgb, var(--c) 12%, transparent);
		color: var(--c);
	}
</style>
