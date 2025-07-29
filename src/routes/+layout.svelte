<script lang="ts">
	import type { Snippet } from 'svelte';
	import '../app.postcss';
	import { Toaster } from 'svelte-hot-french-toast';
	import ChatWidget from '$lib/components/ChatWidget.svelte';
	import { page } from '$app/stores';

	let { children }: { children: Snippet } = $props();

	// Check if current route is an admin route
	const isAdminRoute = $derived($page.url.pathname.startsWith('/admin'));
</script>

<Toaster toastOptions={{ class: 'toast', position: 'bottom-end' }} />

{@render children?.()}

<!-- Chat Widget available on all pages except admin pages -->
{#if !isAdminRoute}
	<ChatWidget />
{/if}

<style lang="postcss">
	:global(.toast) {
		@apply !border-border-main/30 !border !bg-background-1 !shadow-none hover:!bg-background-2 !text-text-main;
	}
</style>
