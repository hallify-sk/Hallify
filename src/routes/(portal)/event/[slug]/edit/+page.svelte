<script lang="ts">
	import Checkbox from "$lib/Checkbox.svelte";
	import Select from "$lib/Select.svelte";
	import Navbar from "$lib/Navbar.svelte";
	import ImagePreview from "$lib/ImagePreview.svelte";
	import { getMinutesToDate } from "$lib/lib.js";
	import { goto } from "$app/navigation";
	import { enhance, applyAction } from "$app/forms";
	import { PUBLIC_API_URL } from "$env/static/public";
	import type { RecordModel } from "pocketbase";

	export let data;

	let nameError: boolean = false;
	let categoryError: boolean = false;
	let dateError: boolean = false;
	let guestError: boolean = false;

	let openImagePreview: boolean = false;
	let imageSrc: string = "";
	let imageAlt: string = "";
	let reservationData: RecordModel;

	/**
	 * Opens an image preview with the specified source, alternate text, and reservation data.
	 *
	 * @param {string} src - The source URL of the image.
	 * @param {string} alt - The alternate text for the image.
	 * @param {RecordModel} template - The reservation data associated with the image.
	 */
	function openImage(src: string, alt: string, template: RecordModel): void {
		imageSrc = src;
		imageAlt = alt;
		openImagePreview = true;
		reservationData = template;
	}

	let error: string = "";
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
		</div>
		<h2 class="mt-7 text-text-500">
			Tu si môžete zobraziť detaily vašej udalosti, poprípade ich upraviť {data.reservation.expires ? "pred dokončením rezervácie." : "."}
		</h2>
		<form
			method="post"
			action={data.reservation.expires ? `/event/${data.slug}/edit/?/confirmReservation` : `/event/${data.slug}/edit/?/updateReservation`}
			use:enhance={({ formData }) => {
				formData.append("date", data.reservation.date);
				return ({ result }) => {
					console.log(result);
					if (result.type == "success") {
						console.log("got here");
						goto(`/event/${result.data?.reservationId}`);
					} else if (result.type == "failure") {
						switch (result.data?.type) {
							case "name":
								nameError = true;
								break;
							case "type":
								categoryError = true;
								break;
							case "date":
								dateError = true;
								break;
							case "personCount":
								guestError = true;
								break;
						}
						error = `${result.data?.message}` || "";
					}
					applyAction(result);
				};
			}}
			class="grid grid-cols-1 lg:grid-cols-2 mt-7 gap-3 w-full"
		>
			{#if error}
				<p class="text-red-500 col-span-1 lg:col-span-2">{error}</p>
			{/if}
			<fieldset class="relative text-input">
				<input
					on:change={() => (nameError = false)}
					placeholder=""
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
				<Select
					value={data.reservation.category}
					name="type"
					bind:invalid={categoryError}
					options={data.categories}
					defaultText="Typ udalosti"
				/>
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
					value={data.reservation.guestCount}
					type="number"
					min="0"
					max="120"
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
					<Checkbox name={addon.id} checked={data.reservation.addons.includes(addon.id)} />
					<label class="text-text-600" for={addon.id}
						>{addon.name}
						<span class="text-secondary-500 text-sm">{addon.price ? `${addon.price}€${addon.hourly ? "/hod." : ""}` : ``}</span></label
					>
				</fieldset>
			{/each}
			<div class="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 col-span-1 lg:col-span-2">
				<p class="col-span-4 text-text-600">Odporúčané rozloženia sály:</p>
				<p class="col-span-4 text-text-500 text-sm mb-4">K tomuto kroku sa môžete vrátiť neskôr</p>
				{#if data.templates.length}
					{#each data.templates as template}
						<button
							type="button"
							on:click={() => {
								openImage(`${PUBLIC_API_URL}/files/${template.collectionId}/${template.id}/${template.image}`, template.id, template);
							}}
							class="mt-1 flex flex-row items-center gap-2 hover:brightness-90"
						>
							<img src="{PUBLIC_API_URL}/files/{template.collectionId}/{template.id}/{template.image}" alt="" />
						</button>
					{/each}
				{:else}
					<div class="col-span-4 bg-background-100 rounded-md p-4 flex justify-center items-center flex-col flex-nowrap gap-2">
						<p class="p-4 rounded-full aspect-square text-center text-3xl pointer-events-none text-text-400">:(</p>
						<p class="text-center text-text-600">Bohužiaľ, nepodarilo sa nám pre Vás nájsť rozloženie sály.</p>
						<a href="/editor" class="px-4 py-2 bg-accent-700 hover:bg-accent-600 rounded-md text-text-50">Vytvoriť rozloženie sály</a>
					</div>
				{/if}
			</div>
			<div class="ml-auto mt-3 items-center flex flex-row flex-nowrap gap-2 col-span-1 lg:col-span-2">
				<button
					type="reset"
					on:click={() => {
						goto(`/event/${data.slug}`);
					}}
					class="px-4 py-2 bg-background-100 hover:bg-background-200 rounded-md text-text-900">Zrušiť</button
				>
				<button type="submit" class="px-4 py-2 bg-background-700 hover:bg-primary-600 rounded-md text-text-50 w-[120px]"> Rezervovať </button>
			</div>
		</form>
	</div>
</div>

<ImagePreview bind:isOpen={openImagePreview} bind:imageSrc bind:imageAlt bind:reservationData />

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
