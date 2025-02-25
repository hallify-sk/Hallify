<script lang="ts">
	// Exported variables
	export let popupVisible = false;
	export let onClose: () => void = () => {};
	export let onOpen: () => void = () => {};

	// Function to open the popup
	export function openPopup() {
		onOpen();
		popupVisible = true;
	}

	// Function to close the popup
	export function closePopup() {
		onClose();
		popupVisible = false;
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
{#if popupVisible}
	<!-- Overlay -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		class="fixed top-0 left-0 z-50 grid w-screen h-screen text-left cursor-pointer bg-black/20 place-items-center"
		on:click={closePopup}
	>
		<!-- Popup content -->
		<button type="button" class="block max-w-2xl p-6 text-left rounded-md cursor-default bg-background-50" on:click|stopPropagation>
			<slot />
		</button>
	</div>
{/if}
