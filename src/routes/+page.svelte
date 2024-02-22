<script lang="ts">
	import { enhance, applyAction } from '$app/forms';
	import { PUBLIC_TURNSTILE_TOKEN } from '$env/static/public';
	import { Turnstile } from 'svelte-turnstile';
	import Calendar from '$lib/Calendar.svelte';
	import Navbar from '$lib/Navbar.svelte';
	import Popup from '$lib/Popup.svelte';
	import { invalidateAll } from '$app/navigation';
	import {onMount, onDestroy} from "svelte";
	export let data;
	console.log(data);
	
	let openCalendarPopup: () => void;
	let closeCalendarPopup: () => void;

	let openHallPopup: () => void;
	let closeHallPopup: () => void;

	let selectedDate: Date | null;
	let selectedDateString: string | null;

	let openLoginPopup: () => void;
	let closeLoginPopup: () => void;

	let openRegisterPopup: () => void;
	let closeRegisterPopup: () => void;

	let isCreatingFlow: boolean = false;

	let isLoadingCalendar: boolean = false;

	let errorCalendarMessage: string | unknown;

	function turnstileLoginError() {
		errorCalendarMessage = 'Skúste obnoviť stránku (zlyhala CAPTCHA)';
	}

	let pollingInterval: NodeJS.Timeout;
	
	onMount(async ()=>{
		pollingInterval = setInterval(()=>{
			invalidateAll();
		}, 5000);
	});

	onDestroy(()=>{
		clearInterval(pollingInterval);
	});

</script>

<Navbar
	onAuth={() => {
		//Only open next popup when creating things;
		if (!isCreatingFlow) return;
		isCreatingFlow = false;
		openCalendarPopup();
	}}
	bind:openLoginPopup
	bind:closeLoginPopup
	bind:openRegisterPopup
	bind:closeRegisterPopup
	user={data.user}
/>

<div class="min-h-screen pt-12">
	<button
		type="button"
		on:click={() => {
			if (data.user) {
				openCalendarPopup();
			} else {
				isCreatingFlow = true;
				openLoginPopup();
			}
		}}>Open popup</button
	>
</div>

<Popup bind:openPopup={openCalendarPopup} bind:closePopup={closeCalendarPopup}>
	<form
		class="flex flex-col"
		method="post"
		action="/?/reserveDate"
		use:enhance={() => {
			isLoadingCalendar = true;
			return ({ result }) => {
				isLoadingCalendar = false;
				console.log(result);
				if(result.type == "success"){
					applyAction(result);
					closeCalendarPopup();
					openHallPopup();
				}else if(result.type == "failure"){
					errorCalendarMessage = result.data?.message;
				}
			};
		}}
	>
		<Turnstile
			on:turnstile-error={turnstileLoginError}
			siteKey={PUBLIC_TURNSTILE_TOKEN}
			appearance="interaction-only"
		/>
		<div class="w-80">
			<h2 class="text-text-700 text-xl mb-2">Vytvorenie události</h2>
			<h3 class="text-text-500 mb-4">Výber dňa</h3>
			{#if errorCalendarMessage}
				<p class="text-red-500 mb-2 max-w-xs">{errorCalendarMessage}</p>
			{/if}
			<Calendar bind:selectedDate bind:selectedDateString blockedDays={data.reservations} user={data.user?.id || ""} />
			<p class="text-text-700 my-2">
				Vybraný deň:
				{#if selectedDate}
					<span class="text-text-600">{selectedDate?.toLocaleDateString('sk')}</span>
				{/if}
			</p>
			<input type="date" class="hidden" name="date" id="date" bind:value={selectedDateString} />
		</div>
		<div class="ml-auto mt-3 items-center flex flex-row flex-nowrap gap-2">
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
				type="submit"
				class="px-4 py-2 bg-background-700 hover:bg-primary-600 rounded-md text-text-50 w-[120px]"
			>
				{#if isLoadingCalendar}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="icon animate-spin icon-tabler icon-tabler-loader-2 mx-auto stroke-2 stroke-text-50 h-6 w-6"
						stroke="currentColor"
						fill="none"
						stroke-linecap="round"
						stroke-linejoin="round"
						><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path
							d="M12 3a9 9 0 1 0 9 9"
						/></svg
					>
				{:else}
					Pokračovať
				{/if}
			</button>
		</div>
	</form>
</Popup>

<Popup bind:openPopup={openHallPopup} bind:closePopup={closeHallPopup}>
	<form action="/?" method="POST">
		<div class="w-80">
			<h2 class="text-text-700 text-xl mb-2">Vytvorenie události</h2>
			<h3 class="text-text-500 mb-4">Špecifikácia sály</h3>
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
