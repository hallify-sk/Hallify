<script lang="ts">
	import AdminNav from "$lib/AdminNav.svelte";
	import Toggle from "$lib/Toggle.svelte";

	
</script>

<AdminNav pageName="Nastavenia sály"/>
<div class="flex flex-row flex-nowrap">
	<div class="w-full min-h-screen grid auto-rows-min grid-cols-12 px-2 pt-24 gap-8">
        <div class="bg-background-50 px-10 py-6 col-span-3 sticky top-[5.7rem] self-start">
			<ul>
				<li>
					<a href="#">Zapnúť funkcionalitu</a>
				</li>
			</ul>
		</div>
		<div class="bg-background-50 px-10 py-6 col-span-9 h-[2000px]">
			<div class="flex flex-row items-center justify-between">
				<div class="flex flex-col">
					<p class="text-text-800">Názov nastavenia</p>
					<p class="text-sm text-text-600">Popis nastavenia</p>
				</div>
				<Toggle name="toggle"/>
			</div>
		</div>
	</div>
</div>
