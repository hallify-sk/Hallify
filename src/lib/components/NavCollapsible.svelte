<script lang="ts">
	import type { Snippet } from 'svelte';
	import { collapsibleOpen } from '$lib/util';

	let { id, children }: { id: string; children: Snippet } = $props();
</script>

<div class="relative dropdown">
	<button
		onclick={() => {
			if ($collapsibleOpen == id) {
				collapsibleOpen.set('');
				return;
			}
			collapsibleOpen.set(id);
		}}
		class="flex items-center gap-2 px-3 py-3 text-sm border-b-2 border-b-transparent hover:border-b-primary"
	>
		{@render children?.()}
	</button>
</div>
