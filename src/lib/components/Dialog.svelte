<script lang="ts">
	//Icons
	import Cross from '$lib/icons/Cross.svelte';
	import Icon from '$lib/icons/Icon.svelte';

	//Svelte
	import { onMount, onDestroy, type Snippet } from 'svelte';
	import { fly, fade } from 'svelte/transition';

	let {
		open = $bindable(false),
		header,
		children
	}: { open: boolean; header: Snippet; children: Snippet } = $props();

	// TypeScript interface for dialog instance
	interface DialogInstance {
		open: boolean;
		id?: string;
	}

	// TypeScript interface for dialog stack
	interface DialogStack {
		dialogs: DialogInstance[];
		register: (dialog: DialogInstance) => void;
		unregister: (dialog: DialogInstance) => void;
		updateBodyOverflow: () => void;
	}

	// Global dialog stack management
	const dialogStack = (() => {
		if (typeof window === 'undefined') return { dialogs: [], register: () => {}, unregister: () => {}, updateBodyOverflow: () => {} } as DialogStack;
		
		// Create or get existing dialog stack from global window
		if (!(window as any).__dialogStack) {
			(window as any).__dialogStack = {
				dialogs: [],
				register(dialog: DialogInstance) {
					this.dialogs.push(dialog);
					this.updateBodyOverflow();
				},
				unregister(dialog: DialogInstance) {
					const index = this.dialogs.indexOf(dialog);
					if (index > -1) {
						this.dialogs.splice(index, 1);
					}
					this.updateBodyOverflow();
				},
				updateBodyOverflow() {
					// Only disable body scroll if there are open dialogs
					document.body.style.overflow = this.dialogs.length > 0 ? 'hidden' : 'auto';
				}
			} as DialogStack;
		}
		return (window as any).__dialogStack as DialogStack;
	})();

	let dialogInstance: DialogInstance = { open: false, id: crypto.randomUUID() };
	let clickListener: ((e: Event) => void) | null = null;

	function handleOpen() {
		if (!dialogInstance.open) {
			dialogInstance.open = true;
			dialogStack.register(dialogInstance);
		}
	}

	function handleClose() {
		open = false;
		if (dialogInstance.open) {
			dialogInstance.open = false;
			dialogStack.unregister(dialogInstance);
		}
	}

	// Calculate z-index based on position in stack
	let zIndex = $derived.by(() => {
		if (!dialogInstance.open) return 40;
		const index = dialogStack.dialogs.indexOf(dialogInstance);
		return 40 + (index * 10); // Each dialog gets +10 z-index
	});

	// Calculate backdrop opacity based on position in stack
	let backdropOpacity = $derived.by(() => {
		if (!dialogInstance.open) return 0;
		const index = dialogStack.dialogs.indexOf(dialogInstance);
		const totalDialogs = dialogStack.dialogs.length;
		// All dialogs should have backdrop, but reduce opacity for non-topmost
		return index === totalDialogs - 1 ? 0.15 : 0.1;
	});

	// Calculate scale for non-topmost dialogs
	let dialogScale = $derived.by(() => {
		if (!dialogInstance.open) return 1;
		const index = dialogStack.dialogs.indexOf(dialogInstance);
		const totalDialogs = dialogStack.dialogs.length;
		// Slightly scale down dialogs that are not on top
		return index === totalDialogs - 1 ? 1 : 0.98;
	});

	// Handle backdrop click
	function setupClickListener() {
		clickListener = (e: Event) => {
			if ((e.target as HTMLDivElement)?.id === `backdrop-${zIndex}`) {
				handleClose();
			}
		};
		document.addEventListener('click', clickListener);
	}

	function removeClickListener() {
		if (clickListener) {
			document.removeEventListener('click', clickListener);
			clickListener = null;
		}
	}

	onMount(() => {
		if (open) {
			setupClickListener();
		}
	});

	onDestroy(() => {
		removeClickListener();
		if (dialogInstance.open) {
			dialogInstance.open = false;
			dialogStack.unregister(dialogInstance);
		}
	});

	// Setup/remove click listener when dialog opens/closes
	$effect(() => {
		if (open && !clickListener) {
			setupClickListener();
		} else if (!open && clickListener) {
			removeClickListener();
		}
	});

	$effect(() => {
		if (open) {
			handleOpen();
		} else {
			if (dialogInstance.open) {
				dialogInstance.open = false;
				dialogStack.unregister(dialogInstance);
			}
		}
	});
</script>

{#if open}
	<!-- Always show backdrop for each dialog -->
	<div
		class="fixed top-0 left-0 block w-full h-full backdrop-blur-sm transition-all duration-200"
		style="z-index: {zIndex}; background-color: rgba(0, 0, 0, {backdropOpacity});"
		in:fade={{ duration: 150 }}
		out:fade={{ delay: 100, duration: 150 }}
	></div>
	<div
		class="fixed top-0 left-0 grid w-full h-full px-4 overflow-auto overflow-x-visible place-items-center"
		style="z-index: {zIndex + 1};"
		id="backdrop-{zIndex}"
	>
		<div
			in:fly={{ y: 30, delay: 100, duration: 200 }}
			out:fly={{ y: 30, duration: 150 }}
			class="block w-full max-w-2xl mx-auto my-12 rounded bg-background-1 shadow-2xl border border-border-main/20 transition-transform duration-200"
			style="transform: scale({dialogScale})"
		>
			<div
				class="flex items-center justify-between flex-auto w-full p-4 border-b border-border-main/30"
			>
				<h2 class="text-text-main">
					{@render header?.()}
				</h2>
				<button onclick={handleClose} class="text-text-main hover:text-text-1 transition-colors">
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
