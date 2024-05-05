<script lang="ts">
	import { enhance, applyAction } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { Bar } from 'svelte-chartjs';
	import 'chart.js/auto';
	import { writable, type Unsubscriber, type Writable } from 'svelte/store';
	import { onDestroy, onMount } from 'svelte';
	import Calendar from '$lib/Calendar.svelte';

	import themes from '$lib/themes.json';
	import { theme } from '$lib/stores/theme.js';
	import type { RecordModel } from 'pocketbase';
	import AdminNav from '$lib/AdminNav.svelte';
	import Popup from '$lib/Popup.svelte';

	let openEventPopup: () => {};
	let closeEventPopup: () => {};

	let emailRegisterError: boolean = false;
	let passwordRegisterError: boolean = false;

	let loadingAdmin = false;

	let errorMessage: string = '';

	export let data;

	let counts: Array<number> = [];

	let pollingInterval: NodeJS.Timeout;

	const reservations = writable('week');
	onMount(() => {
		pollingInterval = setInterval(async () => {
			await invalidateAll();
			reservationData.labels = [];
			counts = [];
			recalculateData();
		}, 5000);
	});

	onDestroy(() => {
		clearInterval(pollingInterval);
	});

	let reservationData: {
		labels: Array<string>;
		datasets: Array<{
			label: string;
			data: Array<number>;
			backgroundColor: Array<string> | string;
			borderWidth: number;
			borderColor: Array<string> | string;
			borderRadius: number;
		}>;
	} = {
		labels: [],
		datasets: [
			{
				backgroundColor: themes?.[$theme]?.primary?.[100],
				data: [],
				borderWidth: 2,
				borderColor: themes?.[$theme]?.primary?.[300],
				label: 'Vytvorené rezervácie',
				borderRadius: 5
			}
		]
	};

	let reservationDataCache: {
		labels: Array<string>;
		datasets: Array<{
			label: string;
			data: Array<number>;
			backgroundColor: Array<string> | string;
			borderWidth: number;
			borderColor: Array<string> | string;
			borderRadius: number;
		}>;
	};

	function recalculateData(days: number = 7) {
		reservationDataCache = structuredClone(reservationData);
		let lastxDays = Array.from({ length: days }, (_, i) => {
			const d = new Date().setUTCHours(0, 0, 0, 0) - i * 86400000;
			reservationData.labels.unshift(new Date(d).toLocaleDateString('sk'));
			return d;
		});
		//Get every day in the last 7 days and count how many reservations there are for each day
		reservationData.datasets[0].data = lastxDays
			.map((day) => {
				return (
					data.reservations?.reduce((acc, reservation) => {
						return new Date(reservation.created).setUTCHours(0, 0, 0, 0) === day ? acc + 1 : acc;
					}, 0) || 0
				);
			})
			.reverse();
	}

	import { Calendar as calendar } from 'headless-calendar';
	import { PUBLIC_TURNSTILE_TOKEN } from '$env/static/public';
	import { Turnstile } from 'svelte-turnstile';

	const nextWeek = calendar.custom(
			new Date().toISOString().slice(0, 10),
			new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString().slice(0, 10)
		);

	console.log(nextWeek.getWeekdayNames());

	if ($reservations == 'week' && data.reservations) {
		recalculateData();
	}

	let selectedDate: Writable<Date | null> = writable(null);
	console.log(data);
	let selectedEvent: RecordModel | undefined;

	let unsubscribe: Unsubscriber;

	onMount(() => {
		unsubscribe = selectedDate.subscribe(() => {
			selectedEvent = data.reservations?.find(
				(i) => new Date(i.date).setUTCHours(0, 0, 0, 0) == $selectedDate?.getTime()
			);
		});
	});

	onDestroy(() => {
		unsubscribe?.();
	});

	console.log(data.user);

	$: if (data.user) {
		console.log('CHANGE');
	}

	function turnstileLoginError() {
		errorMessage = 'Skúste obnoviť stránku (zlyhala CAPTCHA)';
	}
</script>

{#if data.user}
	<AdminNav />
	<div class="flex flex-row flex-nowrap pl-80">
		<div class="w-full min-h-screen grid auto-rows-min grid-cols-12 px-14 pt-24 gap-8">
			<h1 class="col-span-12 text-2xl text-text-600 font-semibold">Nástenka</h1>
			<div class="col-span-12 md:col-span-6 bg-background-100 h-full block rounded-md overflow-hidden">
				<h2 class="text-text-600 bg-background-200 py-1 px-2">Najbližšie 7 dní</h2>
				<p class="text-sm text-right mr-2 py-0.5"><a href="/admin/reservations" class="text-accent-600 hover:text-accent-400 text-sm">Zobraziť všetky rezervácie</a></p>
				<div class="grid grid-rows-7 m-2 mt-0">
					{#each Array(7) as _, i}
					{#if data.reservations?.find(e => new Date(e.date).setUTCHours(0,0,0,0) == new Date(Date.now() + 1000 * 60 * 60 * 24 * i).setUTCHours(0, 0, 0, 0))}
					<a href="/admin/reservations/{data.reservations.find(e => new Date(e.date).setUTCHours(0,0,0,0) == new Date(Date.now() + 1000 * 60 * 60 * 24 * i).setUTCHours(0, 0, 0, 0))?.id}" class="border-t p-2 border-gray-300 hover:bg-background-200 rounded-md flex flex-row gap-2">
						<div class="flex flex-col border-r border-background-200 pr-2 w-24">
							<p class="text-text-400 m-0 p-0 text-sm">{new Date(Date.now() + 1000 * 60 * 60 * 24 * i).toLocaleDateString("sk")}</p>
							<p class="text-text-600 m-0 p-0">{new Date(Date.now() + 1000 * 60 * 60 * 24 * i).toLocaleDateString("sk", { weekday: 'long' })}</p>	
						</div>
						<div class="flex flex-col">
							<p class="text-text-600">Meno udalosti: <span class="text-text-500">{data.reservations.find(e => new Date(e.date).setUTCHours(0,0,0,0) == new Date(Date.now() + 1000 * 60 * 60 * 24 * i).setUTCHours(0, 0, 0, 0))?.name}</span></p>
							<p class="text-text-600">Typ udalosti: <span class="text-text-500">{data.reservations.find(e => new Date(e.date).setUTCHours(0,0,0,0) == new Date(Date.now() + 1000 * 60 * 60 * 24 * i).setUTCHours(0, 0, 0, 0))?.expand?.category?.name}</span></p>
						</div>
						<div class="ml-auto items-end flex">
							<p class="text-text-400 text-xs underline">Zobraziť detail</p>
						</div>
					</a>
					{:else}
					<div class="border-t p-2 border-gray-300 hover:bg-background-200 rounded-md flex flex-row gap-2">
						<div class="flex flex-col border-r border-background-200 pr-2 w-24">
							<p class="text-text-400 m-0 p-0 text-sm">{new Date(Date.now() + 1000 * 60 * 60 * 24 * i).toLocaleDateString("sk")}</p>
							<p class="text-text-600 m-0 p-0">{new Date(Date.now() + 1000 * 60 * 60 * 24 * i).toLocaleDateString("sk", { weekday: 'long' })}</p>	
						</div>
						<div class="flex flex-col">
							<p class="text-text-600">Bez udalosti</p>
						</div>
					</div>
					{/if}
					{/each}
				</div>
				
			</div>
			<!--<div class="col-span-12 md:col-span-5 lg:col-span-4 xl:col-span-3">
				<Calendar
					highlightedDays={data.reservations}
					blockPastDays={false}
					onSelect={() => {
						openEventPopup();
					}}
					bind:selectedDate
				/>
			</div>
			<div class="col-span-12 md:col-span-7 lg:col-span-8 xl:col-span-9">
				{#key reservationDataCache !== reservationData}
					<Bar
						options={{
							maintainAspectRatio: false,
							scales: {
								y: {
									ticks: {
										precision: 0
									}
								}
							}
						}}
						data={reservationData}
					/>
				{/key}
			</div>
			<div class="col-span-6">
				<Bar
					data={{
						labels: ['Red', 'Blue', 'Yellow', 'Green', 'Purple', 'Orange'],
						datasets: [
							{
								label: '% of Votes',
								data: [12, 19, 3, 5, 2, 3],
								backgroundColor: [
									'rgba(255, 134,159,0.4)',
									'rgba(98,  182, 239,0.4)',
									'rgba(255, 218, 128,0.4)',
									'rgba(113, 205, 205,0.4)',
									'rgba(170, 128, 252,0.4)',
									'rgba(255, 177, 101,0.4)'
								],
								borderWidth: 2,
								borderColor: [
									'rgba(255, 134, 159, 1)',
									'rgba(98,  182, 239, 1)',
									'rgba(255, 218, 128, 1)',
									'rgba(113, 205, 205, 1)',
									'rgba(170, 128, 252, 1)',
									'rgba(255, 177, 101, 1)'
								]
							}
						]
					}}
				/>
			</div>-->
		</div>
	</div>

	<Popup bind:closePopup={closeEventPopup} bind:openPopup={openEventPopup}>
		<div class="max-w-xl">
			<img
				src="http://localhost:8090/api/files/5yw1wmo1kh08q5p/srrrgzndboytak5/stage_Vt78Dmjp1X.png?token="
				alt=""
			/>
		</div>
	</Popup>
{:else}
	<div
		class="w-full h-screen grid place-items-center z-50 text-left bg-[url(/Waves.svg)] bg-no-repeat bg-cover"
	>
		<div class="bg-background-50 p-8 rounded-md shadow-md z-10">
			<h2 class="text-text-700 text-xl mb-4">Admin Login</h2>
			<form
				action="/admin?/login"
				method="POST"
				class="flex flex-col bg-background-50"
				use:enhance={async () => {
					loadingAdmin = true;
					return async ({ result }) => {
						loadingAdmin = false;
						emailRegisterError = false;
						passwordRegisterError = false;
						errorMessage = '';
						if (result.type == 'failure') {
							switch (result.data?.type) {
								case 'email':
									emailRegisterError = true;
									break;
								case 'password':
									passwordRegisterError = true;
									break;
							}
							errorMessage = typeof result.data?.message == 'string' ? result.data.message : '';
						}
						if (result.type == 'success') {
							await invalidateAll();
						}
						await applyAction(result);
					};
				}}
			>
				{#if errorMessage}
					<p class="text-red-500 mt-2 max-w-xs">{errorMessage}</p>
				{/if}
				<Turnstile
				on:turnstile-error={turnstileLoginError}
					siteKey={PUBLIC_TURNSTILE_TOKEN}
					appearance="always"
				/>
				<fieldset class="relative text-input mt-2">
					<input
						on:change={() => (emailRegisterError = false)}
						placeholder=""
						type="text"
						required={true}
						id="email"
						name="email"
						class="w-80 appearance-none bg-background-100 text-text-600 text-left rounded-md pb-0.5 pt-5 px-2 peer border {emailRegisterError
							? 'border-red-500'
							: ''}"
					/>
					<label
						for="email"
						class="absolute top-0.5 left-1 {emailRegisterError
							? 'text-red-500'
							: 'text-text-400'} text-sm peer-focus:top-0.5 peer-focus:left-1 peer-focus:text-text-400 peer-focus:text-sm peer-placeholder-shown:top-3 peer-placeholder-shown:left-1 peer-placeholder-shown:text-text-500 peer-placeholder-shown:text-base pointer-events-none ml-1 duration-75"
						>Admin E-Mail</label
					>
				</fieldset>
				<fieldset class="relative text-input mt-2">
					<input
						on:change={() => (passwordRegisterError = false)}
						placeholder=""
						type="password"
						required={true}
						id="password"
						name="password"
						class="w-80 appearance-none bg-background-100 text-text-600 text-left rounded-md pb-0.5 pt-5 px-2 peer border {passwordRegisterError
							? 'border-red-500'
							: ''}"
					/>
					<label
						for="password"
						class="absolute top-0.5 left-1 {passwordRegisterError
							? 'text-red-500'
							: 'text-text-400'} text-sm peer-focus:top-0.5 peer-focus:left-1 peer-focus:text-text-400 peer-focus:text-sm peer-placeholder-shown:top-3 peer-placeholder-shown:left-1 peer-placeholder-shown:text-text-500 peer-placeholder-shown:text-base pointer-events-none ml-1 duration-75"
						>Admin password</label
					>
				</fieldset>
				<div class="ml-auto mt-3 items-center flex flex-row flex-nowrap gap-2">
					<button
						type="submit"
						class="px-4 py-2 bg-background-700 hover:bg-primary-600 rounded-md text-text-50 w-[120px]"
					>
						{#if loadingAdmin}
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
							Continue
						{/if}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
