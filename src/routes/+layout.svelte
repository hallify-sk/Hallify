<script lang="ts">
	import type { Snippet } from 'svelte';
	import '../app.postcss';
	import { Toaster } from 'svelte-hot-french-toast';
	import ChatWidget from '$lib/components/ChatWidget.svelte';

	let { children }: { children: Snippet } = $props();
</script>

<Toaster toastOptions={{ class: 'toast', position: 'bottom-end' }} />

{@render children?.()}

<!-- Chat Widget available on all pages -->
<ChatWidget />

<style lang="postcss">
	:global(.toast) {
		@apply !border-border-main/30 !border !bg-background-1 !shadow-none hover:!bg-background-2 !text-text-main;
	}
</style>
