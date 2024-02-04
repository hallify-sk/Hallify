<script lang="ts">
	import { enhance } from "$app/forms";

	export let popupVisible = false;

	export function openPopup() {
		popupVisible = !popupVisible;
	}
	export function closePopup() {
		popupVisible = false;
	}
</script>

{#if popupVisible}
	<!-- svelte-ignore a11y-click-events-have-key-events -->
	<!-- svelte-ignore a11y-no-static-element-interactions -->
	<div
		class="w-screen h-screen bg-black/20 fixed top-0 left-0 grid place-items-center z-50 cursor-pointer"
		on:click={closePopup}
	>
		<div class="bg-background-50 p-6 rounded-md block cursor-default" on:click|stopPropagation>
			<slot />
		</div>
	</div>
{/if}