<script lang="ts">
	import type { Snippet } from 'svelte';
	import { collapsibleOpen } from '$lib/util';

	let { id, children, open = $bindable() }: { id: string; children: Snippet, open: boolean } = $props();

	$effect(() => {
		if (open) {
			collapsibleOpen.set(id);
		}else{
			collapsibleOpen.set('');
		}
	});

</script>

<div class="relative dropdown">
	{@render children?.()}
</div>
