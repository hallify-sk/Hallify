<script lang="ts">
	import Checkbox from "$lib/Checkbox.svelte";
	import Navbar from "$lib/Navbar.svelte";
	import { getMinutesToDate } from "$lib/lib.js";

	export let data;

	let nameError: boolean = false;
	let categoryError: boolean = false;
	let dateError: boolean = false;
	let guestError: boolean = false;
</script>

<Navbar user={data.user} />

<div class="flex flex-row flex-nowrap relative">
	{#if data.reservation?.expires}
		<p class="absolute w-full top-0 text-center bg-primary-500 text-text-800">
			Ponuka vyprší o: {Math.floor(getMinutesToDate(data.reservation.expires) / 60 / 1000)} minút
		</p>
	{/if}
	<div class="min-h-screen pt-24 px-14 w-full xl:w-3/4">
		<div class="flex flex-row flex-nowrap items-center justify-between">
			<h1 class="text-3xl font-bold text-text-600">Detaily udalosti</h1>
			<div class="relative group">
				<button type="button" class="p-1 hover:bg-background-50 rounded-full text-text-600 aspect-square flex flex-row gap-2 items-center">
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
					class="hidden group-focus-within:flex focus-within:flex focus:flex flex-col absolute top-9 rounded-md -right-4 bg-background-100 w-52 px-2 py-2 gap-1 border border-background-200 z-30"
				>
					<a href="/event/{data.slug}/edit" class="px-4 py-2 hover:bg-background-50 rounded-md text-text-600 w-full text-center">
						Upraviť udalosť
					</a>
					<button type="button" class="px-4 py-2 bg-background-700 hover:bg-primary-600 rounded-md text-text-50 w-full">
						Vymazať udalosť
					</button>
				</div>
			</div>
		</div>
		<h2 class="mt-7 text-text-500">Tu si môžete zobraziť detaily vašej udalosti, poprípade ich ešte upraviť.</h2>
		<form class="grid grid-cols-1 lg:grid-cols-2 mt-7 gap-3 w-full">
			<fieldset class="relative text-input">
				<input
					on:change={() => (nameError = false)}
					placeholder=""
					disabled={true}
					value={data.reservation.name || "Bez názvu"}
					type="text"
					required={true}
					id="menoUdalosti"
					name="menoUdalosti"
					class="appearance-none w-full bg-background-100 text-text-600 text-left rounded-md pb-0.5 pt-5 px-2 peer border mt-0.5 {nameError
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
			<fieldset class="relative text-input">
				<input
					on:change={() => (categoryError = false)}
					placeholder=""
					disabled={true}
					value={data.reservation.expand?.category?.name || "Bez kategórie"}
					type="text"
					required={true}
					id="kategoriaUdalosti"
					name="kategoriaUdalosti"
					class="appearance-none w-full bg-background-100 text-text-600 text-left rounded-md pb-0.5 pt-5 px-2 peer border mt-0.5 {nameError
						? 'border-red-500'
						: ''}"
				/>
				<label
					for="menoUdalosti"
					class="absolute top-0.5 left-1 {categoryError
						? 'text-red-500'
						: 'text-text-400'} text-sm peer-focus:top-0.5 peer-focus:left-1 peer-focus:text-text-400 peer-focus:text-sm peer-placeholder-shown:top-3 peer-placeholder-shown:left-1 peer-placeholder-shown:text-text-500 peer-placeholder-shown:text-base pointer-events-none ml-1 duration-75"
					>Typ udalosti</label
				>
			</fieldset>
			<fieldset class="relative text-input">
				<input
					on:change={() => (dateError = false)}
					placeholder=""
					disabled={true}
					value={new Date(data.reservation.date).toLocaleDateString("sk")}
					type="text"
					required={true}
					id="datumUdalosti"
					name="datumUdalosti"
					class="appearance-none w-full bg-background-100 text-text-600 text-left rounded-md pb-0.5 pt-5 px-2 peer border mt-0.5 {dateError
						? 'border-red-500'
						: ''}"
				/>
				<label
					for="datumUdalosti"
					class="absolute top-0.5 left-1 {dateError
						? 'text-red-500'
						: 'text-text-400'} text-sm peer-focus:top-0.5 peer-focus:left-1 peer-focus:text-text-400 peer-focus:text-sm peer-placeholder-shown:top-3 peer-placeholder-shown:left-1 peer-placeholder-shown:text-text-500 peer-placeholder-shown:text-base pointer-events-none ml-1 duration-75"
					>Dátum udalosti</label
				>
			</fieldset>
			<fieldset class="relative text-input">
				<input
					on:change={() => (dateError = false)}
					placeholder=""
					disabled={true}
					value={data.reservation.guestCount}
					type="text"
					required={true}
					id="pocetHosti"
					name="pocetHosti"
					class="appearance-none w-full bg-background-100 text-text-600 text-left rounded-md pb-0.5 pt-5 px-2 peer border mt-0.5 {guestError
						? 'border-red-500'
						: ''}"
				/>
				<label
					for="pocetHosti"
					class="absolute top-0.5 left-1 {guestError
						? 'text-red-500'
						: 'text-text-400'} text-sm peer-focus:top-0.5 peer-focus:left-1 peer-focus:text-text-400 peer-focus:text-sm peer-placeholder-shown:top-3 peer-placeholder-shown:left-1 peer-placeholder-shown:text-text-500 peer-placeholder-shown:text-base pointer-events-none ml-1 duration-75"
					>Počet hostí</label
				>
			</fieldset>
			{#each data.addons as addon}
				<fieldset class="mt-1 flex flex-row items-center gap-2">
					<Checkbox name={addon.id} disabled={true} checked={data.reservation.addons.includes(addon.id)} />
					<label class="text-text-600" for={addon.id}
						>{addon.name}
						<span class="text-secondary-500 text-sm">{addon.price ? `${addon.price}€${addon.hourly ? "/hod." : ""}` : ``}</span></label
					>
				</fieldset>
			{/each}
		</form>
	</div>
</div>
