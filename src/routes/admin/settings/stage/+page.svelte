<script lang="ts">
	export let data;

	let startingData = structuredClone(data?.config[0]?.value);

	import AdminNav from '$lib/AdminNav.svelte';
	import Toggle from '$lib/Toggle.svelte';
	import { Toaster, toast } from 'svelte-sonner'

	import { enhance } from '$app/forms';

	const config = data.config[0];

	let form: HTMLFormElement;

	let moduleEnabled: boolean = config?.enabled;

	async function saveChanges(event: any) {
		event.preventDefault();
    // add your form handling logic here
    // for example, you might want to send a fetch request to your server with the form data
    const formData = new FormData(form);
	try{
		const response = await fetch('?/saveChanges', {
      method: 'POST',
      body: formData
    });
	if(!response.ok){
		toast.error("Nastala chyba pri ukladaní zmien");
		data.config[0] = startingData;
	}
	}catch(e){
		toast.error('Nastala chyba pri ukladaní zmien');
	}

	}
  </script>

<AdminNav pageName="Nastavenia sály" />
<Toaster position="bottom-right" visibleToasts={3} />
<div class="flex flex-row flex-nowrap justify-stretch h-screen">
	<div class="w-full px-2 pt-24 gap-8 flex justify-stretch pb-6">
		<form
			on:input={saveChanges}
			bind:this={form}
			action="?/saveChanges"
			method="POST"
			use:enhance
			class="bg-background-50 px-10 py-6 col-span-12 rounded-md divide-y divide-background-100 self-stretch overflow-auto"
		>
			{#key data?.config?.[0]}
			<h2 class="py-2 text-text-300 text-sm select-none">Nastavenia modulu</h2>
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
					<Toggle name="toggleModule" disabled={false} bind:checked={moduleEnabled} />
				</div>
			</div>
			<div class="grid grid-cols-12 items-center py-2 {moduleEnabled ? '' : 'disabled'}">
				<div class="flex flex-col col-span-11">
					<p class="text-text-800">Povoliť vlastné rozloženia</p>
					<p class="text-sm text-text-600 max-w-4xl">
						Zapnutím tejto možnosti si uživatelia môžu vytvárať vlastné rozloženia stolov vo Vašej
						sále. Ak je táto možnosť vypnutá, používatelia si môžu vyberať iba z vašich
						pred-tvorených rozložení.
					</p>
				</div>
				<div class="col-span-1 grid place-items-center">
					<Toggle name="ownLayouts" checked={config?.value?.ownLayouts} disabled={!moduleEnabled} />
				</div>
			</div>
			<div class="grid grid-cols-12 items-center py-2 {moduleEnabled ? '' : 'disabled'}">
				<div class="flex flex-col col-span-11">
					<p class="text-text-800">Vynútiť rozloženie sály pri rezervácií</p>
					<p class="text-sm text-text-600 max-w-4xl">
						Ak je táto možnosť zapnutá, uživatelia si musia vybrať/vytvoriť rozloženie stolov predtým, ako sa im umožní vytvoriť rezerváciu. Ak je táto možnosť vypnutá, uživatelia si môžu rozloženie stolov dodatočne vyplniť neskôr.
					</p>
				</div>
				<div class="col-span-1 grid place-items-center">
					<Toggle name="forceLayoutOnReservation" checked={config?.value?.forceLayoutOnReservation} disabled={!moduleEnabled} />
				</div>
			</div>
			<h2 class="py-2 text-text-300 text-sm select-none">Rozloženia</h2>
			<div class="grid grid-cols-12 gap-2 items-center py-2 {moduleEnabled ? '' : 'disabled'}">
				<div class="flex flex-col col-span-10">
					<p class="text-text-800">Základný plán sály</p>
					<p class="text-sm text-text-600 max-w-3xl">
						Toto je základné rozloženie sály, na ktoré viete následne vytvárať rozloženia. Ak zmeníte plán, existujúce rozloženia môžu byť ovplyvnené.
					</p>
				</div>
				<div class="grid col-span-2 place-items-center">
					<button
						type="submit"
						disabled={!moduleEnabled}
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
