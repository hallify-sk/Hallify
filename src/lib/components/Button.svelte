<script lang="ts">
	import type { Snippet } from 'svelte';

	const {
		type = "button",
		color,
		children,
		onclick
	}: {
		type?: "button" | "submit" | "reset",
		color:
			| 'primary'
			| 'secondary'
			| 'accent'
			| 'warning'
			| 'danger'
			| 'success'
			| 'white'
			| 'transparent';
		children: Snippet;
		onclick?: () => void;
	} = $props();
</script>

{#if color === 'primary'}
	<button
		{type}
		{onclick}
		class="text-white bg-primary hover:bg-primary-2 dark:text-black border-primary-4/30"
	>
		{@render children?.()}
	</button>
{:else if color == 'secondary'}
	<button
		{type}
		{onclick}
		class="text-white bg-secondary hover:bg-secondary-2 dark:text-black border-secondary-4/30"
	>
		{@render children?.()}
	</button>
{:else if color == 'accent'}
	<button
	{type}
	{onclick}>
		{@render children?.()}
	</button>
{:else if color == 'warning'}
	<button
	{type}
	{onclick}>
		{@render children?.()}
	</button>
{:else if color == 'danger'}
	<button 
	{type}
	{onclick}>
		{@render children?.()}
	</button>
{:else if color == 'success'}
	<button 
	{type}
	{onclick}>
		{@render children?.()}
	</button>
{:else if color == 'white'}
	<button 
	{type}
	{onclick}>
		{@render children?.()}
	</button>
{:else if color == 'transparent'}
	<button 
	{type}
	class="border-none bg-transpaent text-text-1 hover:bg-background-1 dark:text-white" {onclick}>
		{@render children?.()}
	</button>
{/if}

<style lang="postcss">
	button {
		@apply flex flex-row gap-2 items-center justify-center duration-150 px-4 py-2 rounded border text-sm text-center;
	}
</style>
