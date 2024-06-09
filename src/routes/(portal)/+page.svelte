<script lang="ts">
	import Calendar from "$lib/Calendar.svelte";
	import Select from "$lib/Select.svelte";
	import Navbar from "$lib/Navbar.svelte";
	import Popup from "$lib/Popup.svelte";
	import Checkbox from "$lib/Checkbox.svelte";
	import { enhance, applyAction } from "$app/forms";
	import { PUBLIC_TURNSTILE_TOKEN } from "$env/static/public";
	import { Turnstile } from "svelte-turnstile";
	import { invalidateAll } from "$app/navigation";
	import { onMount, onDestroy } from "svelte";
	import { getMinutesToDate } from "$lib/lib.js";
	import type { Writable } from "svelte/store";

	export let data;

	let openCalendarPopup: () => void;
	let closeCalendarPopup: () => void;

	let openHallPopup: () => void;
	let closeHallPopup: () => void;

	let selectedDate: Writable<Date | null>;
	let selectedDateString: string | null;

	let openLoginPopup: () => void;
	let closeLoginPopup: () => void;

	let openRegisterPopup: () => void;
	let closeRegisterPopup: () => void;

	let isCreatingFlow: boolean = false;

	let isLoadingCalendar: boolean = false;

	let errorCalendarMessage: string | unknown;
	let errorHallMessage: string | unknown;

	function turnstileLoginError() {
		errorCalendarMessage = "Skúste obnoviť stránku (zlyhala CAPTCHA)";
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

	let nameError = false;
	let personCountError = false;

	let pocetLudi: number;

	let openDeletePopup: () => void = () => {};
	let closeDeletePopup: () => void = () => {};
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
<div class="flex flex-row flex-nowrap pb-8">
	<div class="min-h-screen pt-24 px-14 flex flex-col flex-nowrap gap-4">
		<h1 class="text-2xl font-bold text-text-600">
			{data.user?.name ? `Dobrý deň, ${data.user?.name?.split(" ")[0]}` : "Vitajte"}
		</h1>
		<h2 class="mt-7 text-text-500">
			{#if data.user}
				Tu si môžete naplánovať nové udalosti, alebo zobraziť svoje staršie udalosti.
			{:else}
				Pre vytvorenie udalosti sa musíte prihlásiť alebo zaregistrovať.
			{/if}
		</h2>
		<div class="grid gap-7 mt-7 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 auto-rows-fr w-full">
			<button
				on:click={() => {
					if (data.user) {
						openCalendarPopup();
					} else {
						isCreatingFlow = true;
						openLoginPopup();
					}
				}}
				class="rounded-md bg-background-100 h-full flex items-center flex-col p-8 gap-6 text-center hover:brightness-105"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="icon icon-tabler icon-tabler-plus w-16 stroke-primary-400 bg-background-50 rounded-full"
					viewBox="0 0 24 24"
					stroke-width="1.5"
					stroke="currentColor"
					fill="none"
					stroke-linecap="round"
					stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M12 5l0 14" /><path d="M5 12l14 0" /></svg
				>
				<p class="text-lg font-bold text-text-600">Vytvoriť novú udalosť</p>
				<p class="text-text-500">Vytvorte novú udalosť teraz a začnite svoju cestu k dokonálemu podujatiu.</p>
			</button>
			{#each data.ownedTempReservations as reservation}
				<div class="relative">
					<div class="flex flex-row flex-nowrap justify-end absolute w-full top-8 right-2 items-center z-20">
						<div class="relative group">
							<button
								type="button"
								class="p-1 hover:bg-background-50 rounded-md text-text-600 aspect-square flex flex-row gap-2 items-center"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="icon icon-tabler icon-tabler-dots stroke-primary-400"
									width="24"
									height="24"
									viewBox="0 0 24 24"
									stroke-width="1.5"
									stroke="currentColor"
									fill="none"
									stroke-linecap="round"
									stroke-linejoin="round"
									><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M5 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path
										d="M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"
									/><path d="M19 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /></svg
								>
							</button>
							<div
								class="hidden group-focus-within:flex focus-within:flex focus:flex flex-col absolute top-9 rounded-md -right-4 bg-background-100 w-52 px-2 py-2 gap-1 border border-background-200"
							>
								<a
									href="/event/{reservation.id}/edit"
									class="px-4 py-2 hover:bg-background-50 rounded-md text-text-600 w-full text-center"
								>
									Nastavenia
								</a>
								<button
									on:click={openDeletePopup}
									type="button"
									class="px-4 py-2 bg-background-700 hover:bg-primary-600 rounded-md text-text-50 w-full"
								>
									Vymazať
								</button>
							</div>
						</div>
					</div>
					<a
						href="/event/{reservation.id}"
						class="rounded-md relative bg-background-100 h-full flex flex-col gap-6 text-left border border-primary-500 hover:brightness-105"
					>
						<p class="w-full bg-primary-500 text-center text-text-800">NEPOTVRDENÁ REZERVÁCIA</p>
						<div class="p-8 pt-0 flex flex-col gap-6">
							<div class="flex flex-row justify-between">
								<p class="text-text-400 text-sm">
									Ponuka vyprší o: {Math.floor(getMinutesToDate(reservation.expires) / 60 / 1000)} minút
								</p>
							</div>
							<div class="flex flex-col">
								<p class="text-xl font-bold text-text-600">{reservation.name || "Meno udalosti"}</p>
								<p class="text-text-500">{reservation.expand?.category?.name || "kategória"}</p>
							</div>
							<div class="flex flex-col">
								<div class="flex flex-row gap-3">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="icon icon-tabler icon-tabler-users stroke-primary-400 rounded-full w-6 h-6"
										width="24"
										height="24"
										viewBox="0 0 24 24"
										stroke-width="1.5"
										stroke="currentColor"
										fill="none"
										stroke-linecap="round"
										stroke-linejoin="round"
										><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M9 7m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" /><path
											d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2"
										/><path d="M16 3.13a4 4 0 0 1 0 7.75" /><path d="M21 21v-2a4 4 0 0 0 -3 -3.85" /></svg
									>
									<p class="text-text-400">Počet ľudí: {reservation.guestCount || ""}</p>
								</div>
								<div class="flex flex-row gap-3">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="icon icon-tabler icon-tabler-calendar-due stroke-primary-400 rounded-full w-6 h-6"
										width="24"
										height="24"
										viewBox="0 0 24 24"
										stroke-width="1.5"
										stroke="currentColor"
										fill="none"
										stroke-linecap="round"
										stroke-linejoin="round"
										><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path
											d="M4 5m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z"
										/><path d="M16 3v4" /><path d="M8 3v4" /><path d="M4 11h16" /><path
											d="M12 16m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"
										/></svg
									>
									<p class="text-text-400">
										Dátum: {new Date(reservation.date).toLocaleDateString("sk")}
									</p>
								</div>
							</div>
						</div>
					</a>
				</div>
			{/each}
			{#each data.ownedReservations.filter((i) => new Date(i.date).getTime() > new Date().getTime()) as reservation}
				<div class="relative">
					<div class="flex flex-row flex-nowrap justify-end absolute top-2 right-2 items-center z-20 float-right">
						<div class="relative group">
							<button
								type="button"
								class="p-1 hover:bg-background-50 rounded-md text-text-600 aspect-square flex flex-row gap-2 items-center"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="icon icon-tabler icon-tabler-dots stroke-primary-400"
									width="24"
									height="24"
									viewBox="0 0 24 24"
									stroke-width="1.5"
									stroke="currentColor"
									fill="none"
									stroke-linecap="round"
									stroke-linejoin="round"
									><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M5 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path
										d="M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"
									/><path d="M19 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /></svg
								>
							</button>
							<div
								class="hidden group-focus-within:flex focus-within:flex focus:flex flex-col absolute top-9 rounded-md -right-4 bg-background-100 w-52 px-2 py-2 gap-1 border border-background-200"
							>
								<a
									href="/event/{reservation.id}/edit"
									class="px-4 py-2 hover:bg-background-50 rounded-md text-text-600 w-full text-center"
								>
									Nastavenia
								</a>
								<button
									on:click={openDeletePopup}
									type="button"
									class="px-4 py-2 bg-background-700 hover:bg-primary-600 rounded-md text-text-50 w-full"
								>
									Vymazať
								</button>
							</div>
						</div>
					</div>
					<a
						href="/event/{reservation.id}"
						class="rounded-md relative bg-background-100 h-full flex flex-col justify-center text-left border-primary-500 hover:brightness-105"
					>
						<div class="p-8 pt-0 flex flex-col gap-6 mt-6">
							<div class="flex flex-col">
								<p class="text-xl font-bold text-text-600">{reservation.name || "Meno udalosti"}</p>
								<p class="text-text-500">{reservation.expand?.category?.name || "kategória"}</p>
							</div>
							<div class="flex flex-col">
								<div class="flex flex-row gap-3">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="icon icon-tabler icon-tabler-users stroke-primary-400 rounded-full w-6 h-6"
										width="24"
										height="24"
										viewBox="0 0 24 24"
										stroke-width="1.5"
										stroke="currentColor"
										fill="none"
										stroke-linecap="round"
										stroke-linejoin="round"
										><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M9 7m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" /><path
											d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2"
										/><path d="M16 3.13a4 4 0 0 1 0 7.75" /><path d="M21 21v-2a4 4 0 0 0 -3 -3.85" /></svg
									>
									<p class="text-text-400">Počet ľudí: {reservation.guestCount || ""}</p>
								</div>
								<div class="flex flex-row gap-3">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="icon icon-tabler icon-tabler-calendar-due stroke-primary-400 rounded-full w-6 h-6"
										width="24"
										height="24"
										viewBox="0 0 24 24"
										stroke-width="1.5"
										stroke="currentColor"
										fill="none"
										stroke-linecap="round"
										stroke-linejoin="round"
										><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path
											d="M4 5m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z"
										/><path d="M16 3v4" /><path d="M8 3v4" /><path d="M4 11h16" /><path
											d="M12 16m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"
										/></svg
									>
									<p class="text-text-400">
										Dátum: {new Date(reservation.date).toLocaleDateString("sk")}
									</p>
								</div>
							</div>
						</div>
					</a>
				</div>
			{/each}
		</div>
		<h2 class="col-span-1 md:col-span-2 lg:col-span-3 text-text-600 text-lg flex flex-row gap-1 items-center">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="24"
				height="24"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="icon icon-tabler icons-tabler-outline icon-tabler-history"
				><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M12 8l0 4l2 2" /><path d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5" /></svg
			>
			Archív udalostí
		</h2>
		<div class="grid gap-7 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 auto-rows-fr w-full">
			{#each data.ownedReservations.filter((i) => new Date(i.date).getTime() < new Date().getTime()) as reservation}
				<div class="relative">
					<div class="flex flex-row flex-nowrap justify-end absolute top-2 right-2 items-center z-20 float-right">
						<div class="relative group">
							<button
								type="button"
								class="p-1 hover:bg-background-50 rounded-md text-text-600 aspect-square flex flex-row gap-2 items-center"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="icon icon-tabler icon-tabler-dots stroke-primary-400"
									width="24"
									height="24"
									viewBox="0 0 24 24"
									stroke-width="1.5"
									stroke="currentColor"
									fill="none"
									stroke-linecap="round"
									stroke-linejoin="round"
									><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M5 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path
										d="M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"
									/><path d="M19 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /></svg
								>
							</button>
							<div
								class="hidden group-focus-within:flex focus-within:flex focus:flex flex-col absolute top-9 rounded-md -right-4 bg-background-100 w-52 px-2 py-2 gap-1 border border-background-200"
							>
								<a
									href="/event/{reservation.id}/edit"
									class="px-4 py-2 hover:bg-background-50 rounded-md text-text-600 w-full text-center"
								>
									Nastavenia
								</a>
								<button
									on:click={openDeletePopup}
									type="button"
									class="px-4 py-2 bg-background-700 hover:bg-primary-600 rounded-md text-text-50 w-full"
								>
									Vymazať
								</button>
							</div>
						</div>
					</div>
					<a
						href="/event/{reservation.id}"
						class="rounded-md relative bg-background-100 h-full flex flex-col justify-center text-left border-primary-500 hover:brightness-105"
					>
						<div class="p-8 pt-0 flex flex-col gap-6 mt-6">
							<div class="flex flex-col">
								<p class="text-xl font-bold text-text-600">{reservation.name || "Meno udalosti"}</p>
								<p class="text-text-500">{reservation.expand?.category?.name || "kategória"}</p>
							</div>
							<div class="flex flex-col">
								<div class="flex flex-row gap-3">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="icon icon-tabler icon-tabler-users stroke-primary-400 rounded-full w-6 h-6"
										width="24"
										height="24"
										viewBox="0 0 24 24"
										stroke-width="1.5"
										stroke="currentColor"
										fill="none"
										stroke-linecap="round"
										stroke-linejoin="round"
										><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M9 7m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" /><path
											d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2"
										/><path d="M16 3.13a4 4 0 0 1 0 7.75" /><path d="M21 21v-2a4 4 0 0 0 -3 -3.85" /></svg
									>
									<p class="text-text-400">Počet ľudí: {reservation.guestCount || ""}</p>
								</div>
								<div class="flex flex-row gap-3">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="icon icon-tabler icon-tabler-calendar-due stroke-primary-400 rounded-full w-6 h-6"
										width="24"
										height="24"
										viewBox="0 0 24 24"
										stroke-width="1.5"
										stroke="currentColor"
										fill="none"
										stroke-linecap="round"
										stroke-linejoin="round"
										><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path
											d="M4 5m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z"
										/><path d="M16 3v4" /><path d="M8 3v4" /><path d="M4 11h16" /><path
											d="M12 16m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"
										/></svg
									>
									<p class="text-text-400">
										Dátum: {new Date(reservation.date).toLocaleDateString("sk")}
									</p>
								</div>
							</div>
						</div>
					</a>
				</div>
			{/each}
		</div>
	</div>
</div>

<Popup bind:openPopup={openDeletePopup} bind:closePopup={closeDeletePopup}>
	<form class="flex flex-col" method="post" action="">
		<div class="w-80">
			<h2 class="text-text-700 text-xl mb-2">Vymazanie udalosti</h2>
			<h3 class="text-text-500 mb-4">Vážne chcete zrušiť túto udalosť? Túto akciu nie je možné vrátiť späť.</h3>
		</div>
		<div class="ml-auto mt-3 items-center flex flex-row flex-nowrap gap-2">
			<button type="reset" on:click={closeDeletePopup} class="px-4 py-2 bg-background-100 hover:bg-background-200 rounded-md text-text-900"
				>Zrušiť</button
			>
			<button type="submit" class="px-4 py-2 bg-background-700 hover:bg-primary-600 rounded-md text-text-50 w-[120px]">
				{#if isLoadingCalendar}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="icon animate-spin icon-tabler icon-tabler-loader-2 mx-auto stroke-2 stroke-text-50 h-6 w-6"
						stroke="currentColor"
						fill="none"
						stroke-linecap="round"
						stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M12 3a9 9 0 1 0 9 9" /></svg
					>
				{:else}
					Vymazať
				{/if}
			</button>
		</div>
	</form>
</Popup>

<Popup
	bind:openPopup={openCalendarPopup}
	bind:closePopup={closeCalendarPopup}
	onClose={() => {
		selectedDate.set(null);
		errorCalendarMessage = "";
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
				if (result.type == "success") {
					applyAction(result);
					closeCalendarPopup();
					openHallPopup();
				} else if (result.type == "failure") {
					errorCalendarMessage = result.data?.message;
				}
			};
		}}
	>
		<Turnstile on:turnstile-error={turnstileLoginError} siteKey={PUBLIC_TURNSTILE_TOKEN} appearance="interaction-only" />
		<div class="w-80">
			<h2 class="text-text-700 text-xl mb-2">Vytvorenie udalosti</h2>
			<h3 class="text-text-500 mb-4">Výber dňa</h3>
			{#if errorCalendarMessage}
				<p class="text-red-500 mb-2 max-w-xs">{errorCalendarMessage}</p>
			{/if}
			<Calendar
				bind:selectedDate
				bind:selectedDateString
				tempBlockedDays={data.tempReservations}
				blockedDays={data.reservations}
				user={data.user?.id || ""}
			/>
			<p class="text-text-700 my-2">
				Vybraný deň:
				{#if $selectedDate}
					<span class="text-text-600">{$selectedDate?.toLocaleDateString("sk")}</span>
				{:else}
					<span class="text-text-600">Bez výberu</span>
				{/if}
			</p>
			<input type="date" class="hidden" name="date" id="date" bind:value={selectedDateString} />
		</div>
		<div class="ml-auto mt-3 items-center flex flex-row flex-nowrap gap-2">
			<button type="reset" on:click={closeCalendarPopup} class="px-4 py-2 bg-background-100 hover:bg-background-200 rounded-md text-text-900"
				>Zrušiť</button
			>
			<button type="submit" class="px-4 py-2 bg-background-700 hover:bg-primary-600 rounded-md text-text-50 w-[120px]">
				{#if isLoadingCalendar}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="icon animate-spin icon-tabler icon-tabler-loader-2 mx-auto stroke-2 stroke-text-50 h-6 w-6"
						stroke="currentColor"
						fill="none"
						stroke-linecap="round"
						stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M12 3a9 9 0 1 0 9 9" /></svg
					>
				{:else}
					Pokračovať
				{/if}
			</button>
		</div>
	</form>
</Popup>

<Popup
	bind:openPopup={openHallPopup}
	bind:closePopup={closeHallPopup}
	onClose={() => {
		errorHallMessage = "";
	}}
>
	<form
		action="/?/addToDateTemp"
		method="POST"
		use:enhance={({ formData }) => {
			console.log(selectedDateString);
			if (selectedDateString) formData.append("date", selectedDateString);
			return ({ result }) => {
				console.log(result);
				if (result.type == "success") {
					applyAction(result);
					closeCalendarPopup();
					openHallPopup();
				} else if (result.type == "failure") {
					errorHallMessage = result.data?.message;
				}
				applyAction(result);
			};
		}}
	>
		<div class="w-80">
			<h2 class="text-text-700 text-xl mb-2">Vytvorenie udalosti</h2>
			<h3 class="text-text-500 mb-4">Špecifikácia sály</h3>
			{#if errorHallMessage}
				<p class="text-red-500 mb-2 max-w-xs">{errorHallMessage}</p>
			{/if}
			<fieldset class="relative text-input">
				<input
					on:change={() => (nameError = false)}
					placeholder=""
					type="text"
					required={true}
					id="menoUdalosti"
					name="menoUdalosti"
					class="w-80 appearance-none bg-background-100 text-text-600 text-left rounded-md pb-0.5 pt-5 px-2 peer border mt-0.5 {nameError
						? 'border-red-500'
						: ''}"
				/>
				<label
					for="menoUdalosti"
					class="absolute top-0.5 left-1 {nameError
						? 'text-red-500'
						: 'text-text-400'} text-sm peer-focus:top-0.5 peer-focus:left-1 peer-focus:text-text-400 peer-focus:text-sm peer-placeholder-shown:top-3 peer-placeholder-shown:left-1 peer-placeholder-shown:text-text-500 peer-placeholder-shown:text-base pointer-events-none ml-1 duration-75"
					>Názov udalosti</label
				>
			</fieldset>
			<fieldset class="relative text-input my-1">
				<input
					on:change={() => (personCountError = false)}
					on:blur={() => {
						if (!pocetLudi) {
							personCountError = true;
						}
						if (pocetLudi < 0 || pocetLudi > 120) {
							personCountError = true;
						}
					}}
					bind:value={pocetLudi}
					placeholder=""
					type="number"
					required={true}
					min="0"
					max="120"
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
			<Select name="type" bind:invalid={validateCategory} options={data.categories} defaultText="Typ udalosti" />
			{#each data.addons as addon}
				<fieldset class="mt-1 flex flex-row items-center gap-2">
					<Checkbox name={addon.id} />
					<label class="text-text-600" for={addon.id}
						>{addon.name}
						<span class="text-secondary-500 text-sm">{addon.price ? `${addon.price}€${addon.hourly ? "/hod." : ""}` : ``}</span></label
					>
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
				class="px-4 py-2 bg-background-100 hover:bg-background-200 rounded-md text-text-900">Zrušiť</button
			>
			<button type="submit" class="px-4 py-2 bg-background-700 hover:bg-primary-600 rounded-md text-text-50 w-[120px]"> Potvrdiť </button>
		</div>
	</form>
</Popup>

<style lang="postcss">
	input[type="number"] {
		-moz-appearance: textfield;
		appearance: textfield;
		@apply m-0;
	}
	input[type="number"]::-webkit-inner-spin-button,
	input[type="number"]::-webkit-outer-spin-button {
		@apply appearance-none m-0;
	}
</style>
