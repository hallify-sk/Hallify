<script lang="ts">
	export let data;

	let startingData = structuredClone(data?.hall.config);

	import AdminNav from '$lib/AdminNav.svelte';
	import Toggle from '$lib/Toggle.svelte';
	import { Toaster, toast } from 'svelte-sonner';

	let openPopup: () => void = () => {};
	let closePopup: () => void = () => {};

	import { enhance } from '$app/forms';
	import Popup from '$lib/Popup.svelte';

	const hall = data.hall;

	let form: HTMLFormElement;

	let hallModuleEnabled: boolean = hall?.config?.toggleModule == "on";

	async function saveChanges(event: any) {
		event.preventDefault();
		// add your form handling logic here
		// for example, you might want to send a fetch request to your server with the form data
		const formData = new FormData(form);
		try {
			const response = await fetch('?/saveChanges', {
				method: 'POST',
				body: formData
			});
			if (!response.ok) {
				console.log(response);
				toast.error('Nastala chyba pri ukladaní zmien');
				data.hall.config = startingData;
			}
		} catch (e) {
			toast.error('Nastala chyba pri ukladaní zmien');
		}
	}

</script>

<AdminNav pageName="Nastavenia sály" />
<Toaster position="bottom-right" visibleToasts={3} />
<Popup bind:openPopup bind:closePopup>
<div class="flex flex-col">
	<h2 class="text-text-600 font-bold mb-3">
		Základný plán sály
	</h2>
	<img src={data.apiUrl+"/files/"+hall.collectionId+"/"+hall.id+"/"+hall.render} class="max-h-[24rem] overflow-auto" alt="Hall preview">
	<div class="ml-auto mt-3 items-center flex flex-row flex-nowrap gap-2">
		<button
			type="button"
			on:click={closePopup}
			class="px-4 py-2 bg-background-100 hover:bg-background-200 rounded-md text-text-900"
			>Zrušiť</button
		>
		<a
			href="/admin/halls/{data.hall.id}/editor"
			type="button"
			class="px-4 py-2 bg-background-700 hover:bg-primary-600 rounded-md text-text-50"
		>
			Upraviť
	</a>
	</div>
</div>
</Popup>
<div class="flex flex-row flex-nowrap justify-stretch h-screen pl-64">
	<div class="w-full px-2 pt-24 gap-8 flex justify-stretch pb-6">
		<form
			on:change={saveChanges}
			bind:this={form}
			action="?/saveChanges"
			method="POST"
			use:enhance
			class="bg-background-50 px-10 py-6 col-span-12 rounded-md divide-y divide-background-100 self-stretch overflow-auto w-full"
		>
			{#key data?.hall.config}
				<h2 class="py-2 text-text-300 text-sm select-none">Nastavenie sály</h2>
				<div class="py-2">
				<fieldset class="relative text-input w-full">
					<input
						value={hall?.name}
						on:change={() => (false)}
						placeholder=""
						type="text"
						required={true}
						id="hallName"
						name="hallName"
						class="w-full appearance-none bg-background-100 text-text-600 text-left rounded-md pb-0.5 pt-5 px-2 peer border {false
							? 'border-red-500'
							: ''}"
					/>
					<label
						for="hallName"
						class="absolute top-0.5 left-1 {false
							? 'text-red-500'
							: 'text-text-400'} text-sm peer-focus:top-0.5 peer-focus:left-1 peer-focus:text-text-400 peer-focus:text-sm peer-placeholder-shown:top-3 peer-placeholder-shown:left-1 peer-placeholder-shown:text-text-500 peer-placeholder-shown:text-base pointer-events-none ml-1 duration-75"
						>Názov sály</label
					>
				</fieldset>
				</div>
				<div class="grid grid-cols-12 items-center py-2">
					<div class="flex flex-col col-span-11">
						<p class="text-text-800">Prijímať rezervácie</p>
						<p class="text-text-600 max-w-4xl text-xs">
							Ak je táto možnosť zapnutá, uživatelia si môžu rezervovať dátum v tejto sále.
						</p>
					</div>
					<div class="col-span-1 grid place-items-center">
						<Toggle name="enabled" disabled={false} bind:checked={hall.enabled} />
					</div>
				</div>
				<h2 class="py-2 text-text-300 text-sm select-none">Nastavenie rozloženia sál</h2>
				<div class="grid grid-cols-12 items-center py-2">
					<div class="flex flex-col col-span-11">
						<p class="text-text-800">Zapnúť modul</p>
						<p class="text-text-600 max-w-4xl text-xs">
							Zapnutie tohto modulu umožní plánovanie rozloženia sály priamo v Hallify. Pri vypnutí
							modulu sa existujúce rezervácie nezmenia, avšak všetky nové rezervácie tento modul
							nebudu môcť použiť.
						</p>
					</div>
					<div class="col-span-1 grid place-items-center">
						<Toggle name="toggleModule" disabled={false} bind:checked={hallModuleEnabled} />
					</div>
				</div>
				<div class="grid grid-cols-12 items-center py-2 {hallModuleEnabled ? '' : 'disabled'}">
					<div class="flex flex-col col-span-11">
						<p class="text-text-800">Povoliť vlastné rozloženia</p>
						<p class="text-sm text-text-600 max-w-4xl">
							Zapnutím tejto možnosti si uživatelia môžu vytvárať vlastné rozloženia stolov vo Vašej
							sále. Ak je táto možnosť vypnutá, používatelia si môžu vyberať iba z vašich
							pred-tvorených rozložení.
						</p>
					</div>
					<div class="col-span-1 grid place-items-center">
						<Toggle
							name="ownLayouts"
							checked={hall?.config?.ownLayouts}
							disabled={!hallModuleEnabled}
						/>
					</div>
				</div>
				<div class="grid grid-cols-12 items-center py-2 {hallModuleEnabled ? '' : 'disabled'}">
					<div class="flex flex-col col-span-11">
						<p class="text-text-800">Vynútiť rozloženie sály pri rezervácií</p>
						<p class="text-sm text-text-600 max-w-4xl">
							Ak je táto možnosť zapnutá, uživatelia si musia vybrať/vytvoriť rozloženie stolov
							predtým, ako sa im umožní vytvoriť rezerváciu. Ak je táto možnosť vypnutá, uživatelia
							si môžu rozloženie stolov dodatočne vyplniť neskôr.
						</p>
					</div>
					<div class="col-span-1 grid place-items-center">
						<Toggle
							name="forceLayoutOnReservation"
							checked={hall?.config?.forceLayoutOnReservation}
							disabled={!hallModuleEnabled}
						/>
					</div>
				</div>
				<h2 class="py-2 text-text-300 text-sm select-none">Rozloženia</h2>
				<div class="grid grid-cols-12 gap-2 items-center py-2 {hallModuleEnabled ? '' : 'disabled'}">
					<div class="flex flex-col col-span-10">
						<p class="text-text-800">Základný plán sály{data.hall.render ? "" : "- nenastavený"}</p>
						<p class="text-sm text-text-600 max-w-3xl">
							Toto je základné rozloženie sály, na ktoré viete následne vytvárať rozloženia. Ak
							zmeníte plán, existujúce rozloženia môžu byť ovplyvnené. Kým není nastavený základný plán, uživateľom sa neumožní vytvárať vlastné rozloženia sály.
						</p>
					</div>
					<div class="grid col-span-2 place-items-center">
						<button
							type="button"
							on:click={openPopup}
							disabled={!hallModuleEnabled}
							class="px-4 py-2 bg-background-700 hover:bg-primary-600 rounded-md text-text-50 w-[120px] disabled:bg-background-300 disabled:text-text-400"
						>
							Zobraziť
						</button>
					</div>
				</div>
			{/key}
		</form>
	</div>
</div>

<style lang="postcss">
	.disabled p {
		@apply text-text-300 select-none;
	}
</style>
