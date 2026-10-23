<script lang="ts">
	// A Hallify account's bookings across venues (D4). It sits in the app shell like the
	// rest of /app: the sidebar already carries the brand, the navigation and sign-out,
	// so the topbar this area had as a separate client space would only repeat them.
	interface Props { children: import('svelte').Snippet; }
	const { children }: Props = $props();
</script>

<div class="content">
	{@render children()}
</div>

<style>
	.content { padding: 32px 24px; max-width: 960px; width: 100%; margin: 0 auto; box-sizing: border-box; }
	@media (max-width: 600px) { .content { padding: 24px 16px; } }
</style>
