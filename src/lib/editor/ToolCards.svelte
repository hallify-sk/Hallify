<script lang="ts">
	import type { Snippet } from 'svelte';

	/** A tool as the left column shows it: a name, one line on how to use it, a key. */
	export interface ToolCard {
		id: string;
		name: string;
		how: string;
		kbd?: string;
		/** SVG path data drawn in a 24×24 box, stroked. */
		icon: string;
	}

	interface Props {
		title: string;
		tools: ToolCard[];
		active: string;
		onPick: (id: string) => void;
		canUndo: boolean;
		canRedo: boolean;
		onUndo: () => void;
		onRedo: () => void;
		undoLabel: string;
		redoLabel: string;
		/** Extra content between the tools and the undo row (e.g. a note). */
		children?: Snippet;
	}
	const { title, tools, active, onPick, canUndo, canRedo, onUndo, onRedo, undoLabel, redoLabel, children }: Props = $props();
</script>

<div class="tools">
	<div class="title">{title}</div>
	{#each tools as tool (tool.id)}
		<button type="button" class="tool" class:on={active === tool.id} onclick={() => onPick(tool.id)}
			aria-pressed={active === tool.id} title={tool.kbd ? `${tool.name} (${tool.kbd})` : tool.name}>
			<span class="ic" aria-hidden="true">
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d={tool.icon}/></svg>
			</span>
			<span class="txt">
				<b>{tool.name}{#if tool.kbd}<kbd>{tool.kbd}</kbd>{/if}</b>
				<span>{tool.how}</span>
			</span>
		</button>
	{/each}
	{#if children}{@render children()}{/if}
	<div class="grow"></div>
	<div class="history">
		<button type="button" class="hbtn" onclick={onUndo} disabled={!canUndo} title="{undoLabel} (Ctrl+Z)">
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 105.64-8.36L1 10"/></svg>
			{undoLabel}
		</button>
		<button type="button" class="hbtn" onclick={onRedo} disabled={!canRedo} title="{redoLabel} (Ctrl+Y)">
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-5.64-8.36L23 10"/></svg>
			{redoLabel}
		</button>
	</div>
</div>

<style>
	.tools {
		width: 224px; flex-shrink: 0; display: flex; flex-direction: column; gap: 4px; padding: 12px 10px;
		background: var(--bg-panel); border-right: 1px solid var(--border); box-sizing: border-box; overflow-y: auto;
	}
	.title { font-size: 11px; font-weight: 650; letter-spacing: .06em; text-transform: uppercase; color: var(--text-muted); padding: 2px 10px 8px; }
	.tool {
		display: flex; gap: 10px; align-items: flex-start; padding: 10px; border-radius: var(--radius-lg);
		border: 1px solid transparent; background: transparent; text-align: left; width: 100%; box-sizing: border-box;
		cursor: pointer; font-family: inherit; color: var(--text-base); transition: background .15s, border-color .15s;
	}
	.tool:hover { background: var(--bg-hover); }
	.tool.on { background: var(--accent-dim); border-color: color-mix(in srgb, var(--accent) 45%, transparent); }
	.ic {
		width: 32px; height: 32px; border-radius: var(--radius-lg); background: var(--bg-panel2);
		display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: var(--text-base);
	}
	.tool.on .ic { background: var(--bg-panel); color: var(--accent-ink); }
	.txt { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
	.txt b { font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
	.txt > span { font-size: 11.5px; line-height: 1.35; color: var(--text-muted); }
	kbd {
		font-family: inherit; font-size: 10px; font-weight: 600; color: var(--text-muted); padding: 0 5px; line-height: 1.5;
		border: 1px solid var(--border); border-bottom-width: 2px; border-radius: var(--radius-sm); background: var(--bg-panel2);
	}
	.tool.on kbd { color: var(--accent-ink); }
	.grow { flex: 1; }
	.history { display: flex; gap: 4px; padding: 4px 2px 0; }
	.hbtn {
		flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 30px;
		border: 1px solid transparent; border-radius: var(--radius); background: transparent; color: var(--text-muted);
		font-size: 12px; font-weight: 500; cursor: pointer; font-family: inherit;
	}
	.hbtn:hover:not(:disabled) { background: var(--bg-hover); color: var(--text-base); }
	.hbtn:disabled { opacity: .4; cursor: default; }
</style>
