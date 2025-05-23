<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import Button from './Button.svelte';
	import Icon from '$lib/icons/Icon.svelte';
	import ChevronUp from '$lib/icons/ChevronUp.svelte';
	import ChevronDown from '$lib/icons/ChevronDown.svelte';

	const {
		text,
		open,
		children
	}: {
		text: string;
		open?: boolean;
		children: Snippet;
	} = $props();

	let isOpen = $state(false);
	let contentHeight = $state(0);
	let content: HTMLDivElement;

	function toggle() {
		isOpen = !isOpen;
		contentHeight = isOpen ? content.scrollHeight : 0;
	}

	onMount(() => {
		if (open) {
			toggle();
		}
	});
</script>

<div class="w-full">
	<div class="w-full flex flex-col">
		<Button onclick={toggle} disableBorder={true} color="white">
			<div class="w-full flex flex-row items-center justify-between">
				<p class="text-text-main font-semibold">{text}</p>
				{#if isOpen}
					<Icon stroke={3} scale="tiny">
						<ChevronUp />
					</Icon>
				{:else}
					<Icon stroke={3} scale="tiny">
						<ChevronDown />
					</Icon>
				{/if}
			</div>
		</Button>
	</div>

	<div
		bind:this={content}
		class="overflow-hidden transition-[height] duration-200 ease-out"
		style="height: {contentHeight}px"
	>
		<div class="p-2">
			{@render children?.()}
		</div>
	</div>
</div>
