<script lang="ts">
	import type { Snippet } from 'svelte';
	import '../app.postcss';
	import { Toaster } from 'svelte-hot-french-toast';

	let { children }: { children: Snippet } = $props();
</script>

<Toaster toastOptions={{ class: 'toast', position: 'bottom-end' }} />

{@render children?.()}

<style lang="postcss">
	:global(.toast) {
		@apply !border-border-main/30 !border !bg-background-1 !shadow-none hover:!bg-background-2 !text-text-main;
	}
</style>
