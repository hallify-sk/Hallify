<script lang="ts">
	//Icons
	import Cross from '$lib/icons/Cross.svelte';
	import Icon from '$lib/icons/Icon.svelte';

	//Svelte
	import { onMount, type Snippet } from 'svelte';
	import { fly, fade } from 'svelte/transition';

	let {
		open = $bindable(false),
		header,
		children
	}: { open: boolean; header: Snippet; children: Snippet } = $props();

	function handleOpen() {
		document.body.style.overflow = 'hidden';
	}

	function handleClose() {
		open = false;
		document.body.style.overflow = 'auto';
	}

	$effect(() => {
		if (open) handleOpen();
	});

	//If click on backdrop, close dialog
	onMount(() => {
		document.addEventListener('click', (e) => {
			if ((e.target as HTMLDivElement).id === 'backdrop') {
				open = false;
				document.body.style.overflow = 'auto';
			}
		});
	});
</script>

{#if open}
	<div
		class="fixed top-0 left-0 z-40 block w-full h-full backdrop-blur bg-black/15"
		in:fade
		out:fade={{ delay: 100 }}
	></div>
	<div
		class="fixed top-0 left-0 z-50 grid w-full h-full px-4 overflow-auto overflow-x-visible place-items-center"
		id="backdrop"
	>
		<div
			in:fly={{ y: 30, delay: 100 }}
			out:fly={{ y: 30 }}
			class="block w-full max-w-2xl mx-auto my-12 rounded bg-background-1"
		>
			<div
				class="flex items-center justify-between flex-auto w-full p-4 border-b border-border-main/30"
			>
				<h2 class="text-text-main">
					{@render header?.()}
				</h2>
				<button onclick={handleClose} class="text-text-main hover:text-text-1">
					<Icon scale="small">
						<Cross />
					</Icon>
				</button>
			</div>
			<div>
				{@render children?.()}
			</div>
		</div>
	</div>
{/if}
