<script lang="ts">
	import AdminNav from "$lib/AdminNav.svelte";
	import Toggle from "$lib/Toggle.svelte";

	let moduleEnabled: boolean = true;
</script>

<AdminNav pageName="Nastavenia sály"/>
<div class="flex flex-row flex-nowrap">
	<div class="w-full min-h-screen grid auto-rows-min grid-cols-12 px-2 pt-24 gap-8">
        <div class="bg-background-50 px-10 py-6 col-span-3 rounded-md flex flex-col justify-center">
			<ul>
				<li>
					<a href="#" class="w-full text-text-600 hover:text-text-700 flex text-center items-center justify-center rounded-md">Nastavenia modulu</a>
				</li>
			</ul>
		</div>
		<div class="bg-background-50 px-10 py-6 col-span-9 rounded-md overflow-auto max-h-full divide-y divide-background-100">
			<div class="grid grid-cols-12 items-center py-2">
				<div class="flex flex-col col-span-11">
					<p class="text-text-800">Zapnúť modul</p>
					<p class="text-sm text-text-600 max-w-4xl">Zapnutie tohto modulu umožní plánovanie rozloženia sály priamo v Hallify. Pri vypnutí modulu sa existujúce rezervácie nezmenia, avšak všetky nové rezervácie tento modul nebudu môcť použiť.</p>
				</div>
				<div class="col-span-1 grid place-items-center">
					<Toggle name="toggleModule" bind:checked={moduleEnabled}/>
				</div>
			</div>
			<div class="grid grid-cols-12 items-center py-2 {moduleEnabled ? "" : "disabled"}">
				<div class="flex flex-col col-span-11">
					<p class="text-text-800">Povoliť vlastné rozloženia</p>
					<p class="text-sm text-text-600 max-w-4xl">Zapnutím tejto možnosti si uživatelia môžu vytvárať vlastné rozloženia stolov vo Vašej sále. Ak je táto možnosť vypnutá, používatelia si môžu vyberať iba z vašich pred-tvorených rozložení.</p>
				</div>
				<div class="col-span-1 grid place-items-center">
					<Toggle name="toggle2" disabled={!moduleEnabled}/>
				</div>
			</div>
		</div>
	</div>
</div>

<style lang="postcss">
	.disabled p{
		@apply text-text-300 select-none;
	}
</style>