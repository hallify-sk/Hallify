<script lang="ts">
	/**
	 * What in a template's or event's layout does not fit the hall's current floor
	 * plan (see floorplan-sync.ts): which tables stand in a wall, off the floor, or on
	 * a floor the hall no longer has. The editor marks the same tables in red.
	 */
	import { t } from '$lib/i18n.svelte';
	import type { LayoutProblem } from '$lib/floorplan-sync';
	import { floorDisplayName } from '$lib/floorplan-types';

	interface Props {
		problems: LayoutProblem[];
		/** The viewer may only seat guests (a client of a hall that fixes the tables). */
		seatingOnly?: boolean;
	}
	const { problems, seatingOnly = false }: Props = $props();

	/** "T3, T5 · 2 standalone chairs" */
	function items(list: LayoutProblem[]): string {
		const tags = list.filter((p) => p.item === 'table').map((p) => p.tag ?? '').filter(Boolean);
		const chairs = list.filter((p) => p.item === 'chair').length;
		return [tags.join(', '), chairs ? t.editor.layoutFit.chairs(chairs) : ''].filter(Boolean).join(' · ');
	}

	const lines = $derived.by(() => {
		const out: string[] = [];
		const wall = problems.filter((p) => p.kind === 'wall');
		const outside = problems.filter((p) => p.kind === 'outside');
		if (wall.length) out.push(t.editor.layoutFit.inWall(items(wall)));
		if (outside.length) out.push(t.editor.layoutFit.outside(items(outside)));
		const byFloor = new Map<string, LayoutProblem[]>();
		for (const p of problems) if (p.kind === 'floor') byFloor.set(p.floor, [...(byFloor.get(p.floor) ?? []), p]);
		for (const [floor, list] of byFloor) out.push(t.editor.layoutFit.goneFloor(floorDisplayName(floor, 0, t.editor.floorDefault), items(list)));
		return out;
	});
</script>

{#if problems.length}
	<div class="fit-banner" role="status">
		<svg class="fit-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
			<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
		</svg>
		<div class="fit-body">
			<strong>{t.editor.layoutFit.title}</strong>
			<ul>
				{#each lines as line}<li>{line}</li>{/each}
			</ul>
			<span class="fit-hint">{seatingOnly ? t.editor.layoutFit.hintSeating : t.editor.layoutFit.hint}</span>
		</div>
	</div>
{/if}

<style>
	.fit-banner {
		display: flex; align-items: flex-start; gap: 10px; flex-shrink: 0;
		padding: 9px 16px; font-size: 12.5px; line-height: 1.45;
		background: var(--warning-dim); color: var(--text-base);
		border-bottom: 1px solid color-mix(in srgb, var(--warning) 30%, transparent);
	}
	.fit-icon { flex: none; margin-top: 1px; color: var(--warning); }
	.fit-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
	.fit-body strong { font-weight: 650; }
	.fit-body ul { margin: 0; padding-left: 16px; }
	.fit-body li { overflow-wrap: anywhere; }
	.fit-hint { color: var(--text-muted); }
</style>
