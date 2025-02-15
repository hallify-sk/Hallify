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
		@apply !border-slate-400/30 !border !bg-slate-100 !shadow-none hover:!bg-slate-50;
	}
</style>
