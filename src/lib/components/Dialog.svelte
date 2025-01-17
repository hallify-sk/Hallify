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
		class="block backdrop-blur w-full fixed top-0 left-0 h-full z-40 bg-black/15"
		in:fade
		out:fade={{ delay: 100 }}
	></div>
	<div
		class="fixed top-0 left-0 w-full h-full z-50 overflow-auto overflow-x-visible px-4 grid place-items-center"
		id="backdrop"
	>
		<div
			in:fly={{ y: 30, delay: 100 }}
			out:fly={{ y: 30 }}
			class="mx-auto my-12 bg-slate-100 max-w-2xl block rounded w-full"
		>
			<div
				class="w-full p-4 border-b border-slate-400/30 flex flex-auto justify-between items-center"
			>
				<h2>
					{@render header?.()}
				</h2>
				<button onclick={handleClose} class="text-slate-500 hover:text-slate-700">
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
