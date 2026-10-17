<script lang="ts">
	import { page } from '$app/stores';

	interface Props {
		label: string;
		items: { href: string; label: string }[];
	}
	const { label, items }: Props = $props();

	let open = $state(false);

	const isActive = $derived(items.some(i => $page.url.pathname.startsWith(i.href)));

	function onClickOutside(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (!target.closest('.nav-dropdown')) open = false;
	}

	$effect(() => {
		if (open) {
			document.addEventListener('click', onClickOutside, true);
			return () => document.removeEventListener('click', onClickOutside, true);
		}
	});
</script>

<div class="nav-dropdown">
	<button
		class="nav-dropdown-btn"
		class:active={isActive}
		onclick={() => open = !open}
	>
		{label}
		<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
			<polyline points="6 9 12 15 18 9"/>
		</svg>
	</button>
	{#if open}
		<div class="nav-dropdown-menu">
			{#each items as item}
				<a href={item.href} class="nav-dropdown-item" class:active={$page.url.pathname === item.href} onclick={() => open = false}>
					{item.label}
				</a>
			{/each}
		</div>
	{/if}
</div>

<style>
	.nav-dropdown {
		position: relative;
	}

	.nav-dropdown-btn {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 6px 12px;
		border-radius: var(--radius-sm);
		font-size: 14px;
		font-weight: 500;
		color: var(--text-muted);
		background: none;
		border: none;
		cursor: pointer;
		transition: background 0.15s, color 0.15s;
	}

	.nav-dropdown-btn:hover,
	.nav-dropdown-btn.active {
		color: var(--accent-ink);
		background: var(--accent-dim);
	}

	.nav-dropdown-menu {
		position: absolute;
		top: 100%;
		left: 0;
		margin-top: 4px;
		background: var(--bg-panel);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		padding: 6px;
		min-width: 180px;
		box-shadow: var(--shadow);
		z-index: 200;
	}

	.nav-dropdown-item {
		display: block;
		padding: 8px 14px;
		border-radius: var(--radius-sm);
		font-size: 13px;
		font-weight: 500;
		color: var(--text-base);
		text-decoration: none;
		transition: background 0.15s;
	}

	.nav-dropdown-item:hover {
		background: var(--bg-hover);
		text-decoration: none;
	}

	.nav-dropdown-item.active {
		color: var(--accent-ink);
		background: var(--accent-dim);
	}
</style>
