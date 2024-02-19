<script lang="ts">
	import Calendar from '$lib/Calendar.svelte';
	import Navbar from '$lib/Navbar.svelte';
	import Popup from '$lib/Popup.svelte';
	export let data;
	console.log(data);

	let openCalendarPopup: () => void;
	let closeCalendarPopup: () => void;

	let openOtherPopup: () => void;
	let closeOtherPopup: () => void;

	let selectedDate: Date | null;
	let selectedDateString: string | null;

	let openLoginPopup: () => void;
	let closeLoginPopup: () => void;

	let openRegisterPopup: () => void;
	let closeRegisterPopup: () => void;

	let isCreatingFlow: boolean = false;

</script>

<Navbar
	onAuth={()=>{
		if(!isCreatingFlow) return;
		isCreatingFlow = false;
		openOtherPopup();
	}}
	bind:openLoginPopup
	bind:closeLoginPopup
	bind:openRegisterPopup
	bind:closeRegisterPopup
	user={data.user}
/>

<div class="min-h-screen pt-12">
	<button on:click={openCalendarPopup}>Open popup</button>
</div>

<Popup bind:openPopup={openCalendarPopup} bind:closePopup={closeCalendarPopup}>
	<form>
	<div class="w-80">
		<h2 class="text-text-700 text-xl mb-2">Vytvorenie události</h2>
		<h3 class="text-text-500 mb-4">Výber dňa</h3>
		<Calendar bind:selectedDate bind:selectedDateString />
		<p class="text-text-700 my-2">
			Vybraný deň:
			{#if selectedDate}
				<span class="text-text-600">{selectedDate?.toLocaleDateString('sk')}</span>
			{/if}
		</p>
		<input type="date" bind:value={selectedDateString}>
	</div>
	<button
		type="reset"
		on:click={() => {
			closeCalendarPopup();
			selectedDate = null;
			selectedDateString = null;
		}}
		class="px-4 py-2 bg-background-100 hover:bg-background-200 rounded-md text-text-900"
		>Zrušiť</button
	>
	<button
		on:click={() => {
			closeCalendarPopup();
			isCreatingFlow = true;
			openLoginPopup();
		}}
		type="button"
		class="px-4 py-2 bg-background-700 hover:bg-primary-600 rounded-md text-text-50 w-[120px]"
	>
		Prihlásiť sa
	</button>
	</form>
</Popup>

<Popup bind:openPopup={openOtherPopup} bind:closePopup={closeOtherPopup}>
	<form>
	<div class="w-80">
		<h2 class="text-text-700 text-xl mb-2">Vytvorenie události</h2>
		<h3 class="text-text-500 mb-4">Špecifikácia sály</h3>
		<Calendar bind:selectedDate bind:selectedDateString />
		<p class="text-text-700 my-2">
			Vybraný deň:
			{#if selectedDate}
				<span class="text-text-600">{selectedDate?.toLocaleDateString('sk')}</span>
			{/if}
		</p>
		<input type="date" bind:value={selectedDateString}>
	</div>
	<button
		type="reset"
		on:click={() => {
			closeCalendarPopup();
			selectedDate = null;
			selectedDateString = null;
		}}
		class="px-4 py-2 bg-background-100 hover:bg-background-200 rounded-md text-text-900"
		>Zrušiť</button
	>
	<button
		on:click={() => {
			closeCalendarPopup();
			openLoginPopup();
		}}
		type="button"
		class="px-4 py-2 bg-background-700 hover:bg-primary-600 rounded-md text-text-50 w-[120px]"
	>
		Prihlásiť sa
	</button>
	</form>
</Popup>


<!--
{#each data.stages as stage, i}
    <a href="/editor/{stage.id}">Stage #{i+1}</a>
{/each}
-->
