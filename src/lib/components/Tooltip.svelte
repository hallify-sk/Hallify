<script lang="ts">
	import Icon from '$lib/icons/Icon.svelte';
	import Question from '$lib/icons/Question.svelte';
	import type { Snippet } from 'svelte';

	let { icon, children }: { icon?: Snippet; children: Snippet } = $props();
</script>

<div class="relative">
	<Icon scale="small" isPeer={true}>
		{#if icon}
			{@render icon?.()}
		{:else}
			<Question />
		{/if}
	</Icon>
	<div
		class="absolute left-0 hidden p-2 border rounded peer-hover:block hover:block bottom-5 border-border-main/30 bg-background-1 min-w-60"
	>
		{@render children?.()}
	</div>
</div>
