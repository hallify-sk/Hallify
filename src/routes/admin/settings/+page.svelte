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

<AdminNav />
<div class="flex flex-row flex-nowrap pl-80">
	<div class="w-full min-h-screen grid auto-rows-min grid-cols-12 px-14 pt-24 gap-8">
		<h1 class="col-span-12 text-2xl text-text-600 font-semibold">Nastavenia</h1>
        <h2 class="col-span-12 text-text-500">Nastavenia budú pridané v ďalších verziách</h2>
	</div>
</div>
