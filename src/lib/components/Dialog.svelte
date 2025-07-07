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
		id: string;
		element?: HTMLElement;
	}

	// TypeScript interface for dialog stack
	interface DialogStack {
		dialogs: DialogInstance[];
		register: (dialog: DialogInstance) => void;
		unregister: (dialogId: string) => void;
		updateBodyOverflow: () => void;
		getDialogIndex: (dialogId: string) => number;
		getTopDialogIndex: () => number;
	}

	// Global dialog stack management
	const dialogStack = (() => {
		if (typeof window === 'undefined') {
			return { 
				dialogs: [], 
				register: () => {}, 
				unregister: () => {}, 
				updateBodyOverflow: () => {},
				getDialogIndex: () => -1,
				getTopDialogIndex: () => -1
			} as DialogStack;
		}
		
		// Create or get existing dialog stack from global window
		if (!(window as any).__dialogStack) {
			(window as any).__dialogStack = {
				dialogs: [],
				register(dialog: DialogInstance) {
					this.dialogs.push(dialog);
					this.updateBodyOverflow();
				},
				unregister(dialogId: string) {
					const index = this.dialogs.findIndex(d => d.id === dialogId);
					if (index > -1) {
						this.dialogs.splice(index, 1);
					}
					this.updateBodyOverflow();
				},
				updateBodyOverflow() {
					// Only disable body scroll if there are open dialogs
					document.body.style.overflow = this.dialogs.length > 0 ? 'hidden' : 'auto';
				},
				getDialogIndex(dialogId: string) {
					return this.dialogs.findIndex(d => d.id === dialogId);
				},
				getTopDialogIndex() {
					return this.dialogs.length - 1;
				}
			} as DialogStack;
		}
		return (window as any).__dialogStack as DialogStack;
	})();

	// Create unique dialog instance
	const dialogId = crypto.randomUUID();
	let dialogElement: HTMLElement | undefined = $state();
	let isRegistered = $state(false);

	function handleOpen() {
		if (!isRegistered && open) {
			const dialogInstance: DialogInstance = {
				id: dialogId,
				element: dialogElement
			};
			dialogStack.register(dialogInstance);
			isRegistered = true;
		}
	}

	function handleClose() {
		open = false;
		if (isRegistered) {
			dialogStack.unregister(dialogId);
			isRegistered = false;
		}
	}

	// Calculate z-index based on position in stack
	let zIndex = $derived.by(() => {
		if (!open || !isRegistered) return 40;
		const index = dialogStack.getDialogIndex(dialogId);
		return 40 + (index * 10); // Each dialog gets +10 z-index
	});

	// Calculate if this dialog is the topmost
	let isTopmost = $derived.by(() => {
		if (!open || !isRegistered) return false;
		const currentIndex = dialogStack.getDialogIndex(dialogId);
		const topIndex = dialogStack.getTopDialogIndex();
		return currentIndex === topIndex;
	});

	// Calculate backdrop opacity - more noticeable for lower dialogs
	let backdropOpacity = $derived.by(() => {
		if (!open || !isRegistered) return 0;
		const currentIndex = dialogStack.getDialogIndex(dialogId);
		const totalDialogs = dialogStack.dialogs.length;
		
		if (currentIndex === totalDialogs - 1) {
			// Topmost dialog gets standard backdrop
			return 0.4;
		} else {
			// Lower dialogs get darker backdrop to show stacking
			const distanceFromTop = totalDialogs - 1 - currentIndex;
			return Math.min(0.7, 0.4 + (distanceFromTop * 0.15));
		}
	});

	// Calculate scale for non-topmost dialogs
	let dialogScale = $derived.by(() => {
		if (!open || !isRegistered) return 1;
		const currentIndex = dialogStack.getDialogIndex(dialogId);
		const totalDialogs = dialogStack.dialogs.length;
		
		if (currentIndex === totalDialogs - 1) {
			return 1; // Topmost dialog at full scale
		} else {
			// Scale down lower dialogs more noticeably
			const distanceFromTop = totalDialogs - 1 - currentIndex;
			return Math.max(0.90, 1 - (distanceFromTop * 0.05));
		}
	});

	// Handle backdrop click only for topmost dialog
	function handleBackdropClick(e: Event) {
		if (isTopmost && (e.target as HTMLElement)?.dataset?.backdrop === 'true') {
			handleClose();
		}
	}

	onMount(() => {
		if (open) {
			handleOpen();
		}
	});

	onDestroy(() => {
		if (isRegistered) {
			dialogStack.unregister(dialogId);
		}
	});

	// Watch for open changes
	$effect(() => {
		if (open) {
			handleOpen();
		} else if (isRegistered) {
			dialogStack.unregister(dialogId);
			isRegistered = false;
		}
	});
</script>

{#if open}
	<!-- Backdrop with enhanced opacity for stacking effect -->
	<div
		class="fixed top-0 left-0 block w-full h-full backdrop-blur-sm transition-all duration-300"
		style="z-index: {zIndex}; background-color: rgba(0, 0, 0, {backdropOpacity});"
		data-backdrop="true"
		onclick={handleBackdropClick}
		in:fade={{ duration: 200 }}
		out:fade={{ delay: 100, duration: 200 }}
	></div>
	
	<!-- Dialog container -->
	<div
		bind:this={dialogElement}
		class="fixed top-0 left-0 grid w-full h-full px-4 overflow-auto overflow-x-visible place-items-center pointer-events-none"
		style="z-index: {zIndex + 1};"
	>
		<div
			in:fly={{ y: 30, delay: 100, duration: 300 }}
			out:fly={{ y: 30, duration: 200 }}
			class="block w-full max-w-2xl mx-auto my-12 rounded bg-background-1 shadow-2xl border border-border-main/20 transition-all duration-300 pointer-events-auto"
			style="transform: scale({dialogScale}); {!isTopmost ? 'filter: brightness(0.9);' : ''}"
		>
			<div
				class="flex items-center justify-between flex-auto w-full p-4 border-b border-border-main/30"
			>
				<h2 class="text-text-main">
					{@render header?.()}
				</h2>
				<button 
					onclick={handleClose} 
					class="text-text-main hover:text-text-1 transition-colors p-1 rounded hover:bg-background-2"
					disabled={!isTopmost}
					style={!isTopmost ? 'opacity: 0.6; cursor: not-allowed;' : ''}
				>
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
