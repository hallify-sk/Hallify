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

{#if popupVisible}
	<!-- Overlay -->
	<button
		type="button"
		class="w-screen h-screen bg-black/20 fixed top-0 left-0 grid place-items-center z-50 cursor-pointer text-left"
		on:click={closePopup}
	>
		<!-- Popup content -->
		<button type="button" class="bg-background-50 p-6 rounded-md block cursor-default text-left" on:click|stopPropagation>
			<slot />
		</button>
	</button>
{/if}
