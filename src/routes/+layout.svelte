<script lang="ts">
	import type { Snippet } from 'svelte';
	import '../app.postcss';
	import { Toaster } from 'svelte-french-toast';

	let { children }: { children: Snippet } = $props();
</script>

<Toaster toastOptions={{ className: 'toast', position: 'bottom-right' }} />

{@render children?.()}

<style lang="postcss">
	:global(.toast) {
		@apply !border-slate-400/30 !border !bg-slate-100 !shadow-none hover:!bg-slate-50;
	}
</style>
