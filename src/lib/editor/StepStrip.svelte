<script lang="ts">
	import type { Snippet } from 'svelte';

	/** One step of the guided editor, as the strip shows it. */
	export interface StepItem {
		id: string;
		label: string;
		index: number;
		state: 'done' | 'active' | 'todo';
	}

	interface Props {
		steps: StepItem[];
		/** A short line at the right of the steps, e.g. what this context cannot change. */
		note?: string;
		onPick: (id: string) => void;
		/** Floor tabs, help — whatever the host wants at the far right. */
		right?: Snippet;
	}
	const { steps, note = '', onPick, right }: Props = $props();
</script>

<div class="steps" role="tablist" aria-label="Steps">
	{#each steps as s, i (s.id)}
		{#if i > 0}
			<svg class="chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="9 6 15 12 9 18"/></svg>
		{/if}
		<button type="button" class="step" class:done={s.state === 'done'} class:on={s.state === 'active'}
			role="tab" aria-selected={s.state === 'active'} onclick={() => onPick(s.id)}>
			<i aria-hidden="true">{s.state === 'done' ? '✓' : s.index}</i>
			<span>{s.label}</span>
		</button>
	{/each}
	<div class="spacer"></div>
	{#if note}<span class="note">{note}</span>{/if}
	{#if right}{@render right()}{/if}
</div>

<style>
	.steps {
		height: 52px; display: flex; align-items: center; gap: 6px; padding: 0 16px;
		background: var(--bg-panel); border-bottom: 1px solid var(--border); box-sizing: border-box; flex-shrink: 0;
		overflow: hidden;
	}
	.chev { color: var(--text-subtle); flex-shrink: 0; }
	.step {
		display: inline-flex; align-items: center; gap: 9px; padding: 7px 13px 7px 8px; border-radius: 999px;
		border: 1px solid transparent; background: transparent; font-weight: 500; font-size: 13px;
		color: var(--text-muted); white-space: nowrap; cursor: pointer; font-family: inherit;
		transition: background .15s, color .15s;
	}
	.step:hover { background: var(--bg-hover); color: var(--text-base); }
	.step i {
		width: 22px; height: 22px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;
		font-style: normal; font-size: 11px; font-weight: 700; background: var(--bg-panel2); color: var(--text-muted); flex-shrink: 0;
	}
	.step.done i { background: var(--success-dim); color: var(--success); }
	.step.on { background: var(--accent-dim); border-color: color-mix(in srgb, var(--accent) 45%, transparent); color: var(--accent-ink); font-weight: 600; }
	.step.on i { background: var(--accent); color: var(--accent-contrast); }
	.spacer { flex: 1; }
	.note { font-size: 12px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 420px; }
	@media (max-width: 1180px) {
		.note { display: none; }
		.step span { display: none; }
		.step.on span { display: inline; }
	}
</style>
