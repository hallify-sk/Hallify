<script lang="ts">
	import AdminNav from "$lib/AdminNav.svelte";
	import Toggle from "$lib/Toggle.svelte";

	
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
			<div class="flex flex-row items-center justify-between py-2">
				<div class="flex flex-col">
					<p class="text-text-800">Zapnúť modul</p>
					<p class="text-sm text-text-600">Zapnutie tohto modulu umožní plánovanie rozloženia sály priamo v Hallify.</p>
				</div>
				<Toggle name="toggle"/>
			</div>
			<div class="flex flex-row items-center justify-between py-2">
				<div class="flex flex-col">
					<p class="text-text-800">Názov nastavenia</p>
					<p class="text-sm text-text-600">Popis nastavenia</p>
				</div>
				<Toggle name="toggle"/>
			</div>
		</div>
	</div>
</div>
