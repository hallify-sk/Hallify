<script lang="ts">
	import { enhance, applyAction } from '$app/forms';
	import { PUBLIC_TURNSTILE_TOKEN } from '$env/static/public';
	import { Turnstile } from 'svelte-turnstile';
	import Calendar from '$lib/Calendar.svelte';
	import Select from '$lib/Select.svelte';
	import Navbar from '$lib/Navbar.svelte';
	import Popup from '$lib/Popup.svelte';
	import { invalidateAll } from '$app/navigation';
	import { onMount, onDestroy } from 'svelte';
	import Checkbox from '$lib/Checkbox.svelte';
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

	onMount(async () => {
		pollingInterval = setInterval(() => {
			invalidateAll();
		}, 5000);
	});

	onDestroy(() => {
		clearInterval(pollingInterval);
	});
	let validateCategory: boolean = true;

	let nameRegisterError = false;
	let personCountError = false;

	let pocetLudi: number;
	let isLoadingHall: boolean = false;

	setInterval(()=>{
		console.log(selectedDateString);
	},1000);
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

<Popup
	bind:openPopup={openCalendarPopup}
	bind:closePopup={closeCalendarPopup}
	onClose={() => {
		selectedDate = null;
		//selectedDateString = null;
		errorCalendarMessage = '';
	}}
>
	<form
		class="flex flex-col"
		method="post"
		action="/?/reserveDateTemp"
		use:enhance={() => {
			isLoadingCalendar = true;
			return ({ result }) => {
				isLoadingCalendar = false;
				console.log(result);
				if (result.type == 'success') {
					applyAction(result);
					closeCalendarPopup();
					openHallPopup();
				} else if (result.type == 'failure') {
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
			<Calendar
				bind:selectedDate
				bind:selectedDateString
				blockedDays={data.tempReservations}
				user={data.user?.id || ''}
			/>
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
				on:click={closeCalendarPopup}
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

<Popup bind:openPopup={openHallPopup} bind:closePopup={closeHallPopup} popupVisible={true}>
	<form action="/?/reserveDate" method="POST"
	use:enhance={({ formData }) => {
		console.log(selectedDateString);
		if(selectedDateString) formData.append("date", selectedDateString);
		isLoadingHall = true;
		return ({ result }) => {
			isLoadingHall = false;
			console.log(result);
			if (result.type == 'success') {
				applyAction(result);
				closeCalendarPopup();
				openHallPopup();
			} else if (result.type == 'failure') {
				errorCalendarMessage = result.data?.message;
			}
		};
	}}>
		<div class="w-80">
			<h2 class="text-text-700 text-xl mb-2">Vytvorenie události</h2>
			<h3 class="text-text-500 mb-4">Špecifikácia sály</h3>
			<Select
				name="type"
				bind:invalid={validateCategory}
				options={data.categories}
				defaultText="Typ události"
			/>
			<fieldset class="relative text-input mt-1">
				<input
					on:change={() => (personCountError = false)}
					on:blur={()=>{
						if (!pocetLudi) {
							personCountError = true;
						}
						if(pocetLudi < 0 || pocetLudi > 120){
							personCountError = true;
						}
					}}
					bind:value={pocetLudi}
					placeholder=""
					type="number"
					required={true}
					min=0
					max=120
					id="pocetLudi"
					name="pocetLudi"
					class="w-80 appearance-none bg-background-100 text-text-600 text-left rounded-md pb-0.5 pt-5 px-2 peer border mt-0.5 {personCountError
						? 'border-red-500'
						: ''}"
				/>
				<label
					for="name"
					class="absolute top-0.5 left-1 {personCountError
						? 'text-red-500'
						: 'text-text-400'} text-sm peer-focus:top-0.5 peer-focus:left-1 peer-focus:text-text-400 peer-focus:text-sm peer-placeholder-shown:top-3 peer-placeholder-shown:left-1 peer-placeholder-shown:text-text-500 peer-placeholder-shown:text-base pointer-events-none ml-1 duration-75"
					>Počet osôb</label
				>
			</fieldset>
			{#each data.addons as addon}
				<fieldset class="mt-1 flex flex-row items-center gap-2">
					<Checkbox name={addon.id}/>
					<label class="text-text-600" for={addon.id}>{addon.name} <span class="text-secondary-500 text-sm">{addon.price ? `${addon.price}€${addon.hourly ? "/hod." : ""}` : ``}</span></label>
				</fieldset>
			{/each}
		</div>
		<div class="ml-auto mt-3 items-center flex flex-row flex-nowrap gap-2">
			<button
				type="reset"
				on:click={() => {
					closeHallPopup();
					openCalendarPopup();
				}}
				class="px-4 py-2 bg-background-100 hover:bg-background-200 rounded-md text-text-900"
				>Zrušiť</button
			>
			<button
				type="submit"
				class="px-4 py-2 bg-background-700 hover:bg-primary-600 rounded-md text-text-50 w-[120px]"
			>
				Potvrdiť
			</button>
		</div>
	</form>
</Popup>

<!--
{#each data.stages as stage, i}
    <a href="/editor/{stage.id}">Stage #{i+1}</a>
{/each}
-->

<style lang="postcss">
	input[type='number'] {
		-moz-appearance: textfield;
		appearance: textfield;
		@apply m-0;
	}
	input[type='number']::-webkit-inner-spin-button,
	input[type='number']::-webkit-outer-spin-button {
		@apply appearance-none m-0;
	}
</style>
