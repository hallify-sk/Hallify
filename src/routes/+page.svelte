<script lang="ts">
	import Calendar from '$lib/components/Calendar.svelte';
	import Dialog from '$lib/components/Dialog.svelte';
	import TextInput from '$lib/components/inputs/TextInput.svelte';
	import Navbar from '$lib/components/Navbar.svelte';
	import Adjustments from '$lib/icons/Adjustments.svelte';
	import Icon from '$lib/icons/Icon.svelte';
	import Plus from '$lib/icons/Plus.svelte';

	let openEventDialog: () => void;
	let closeEventDialog: () => void;

	export let data;
</script>

<Navbar user={data.user} permission={data.permission}/>

<div class="w-full min-h-screen bg-slate-200 py-6 px-4 md:px-24">
	<div class="max-w-7xl w-full mx-auto flex flex-row flex-wrap justify-between items-center">
		<div class="flex flex-col flex-nowrap">
			<p class="uppercase text-[0.65rem] text-slate-400">Prehľad</p>
			<p class="text-slate-700">Panel informácií</p>
		</div>
		<div class="flex flex-row flex-nowrap items-center">
			<button
				on:click={openEventDialog}
				class="flex flex-row gap-2 items-center bg-blue-500 hover:bg-blue-400 duration-150 text-slate-100 px-4 py-2 rounded border border-blue-600/30 text-sm"
			>
				<Icon scale="small">
					<Plus />
				</Icon>
				<p>Vytvoriť udalosť</p>
			</button>
		</div>
	</div>
	<div class="max-w-7xl w-full mx-auto flex flex-col gap-4 mt-4 items-start">
		<div class="flex flex-col sm:flex-row gap-4 w-full">
			<div class="border border-slate-400/30 w-full h-96 bg-slate-100 relative overflow-y-auto rounded">
				<div class="p-4 border-b border-slate-400/30 sticky top-0 bg-slate-100">
					<h2>Prehľad udalostí</h2>
				</div>
				<div class="overflow-y-auto">
					<table class="w-full border-collapse">
						<colgroup>
							<col span="1" style="width: 5%;" />
							<col span="2" style="width: 70%;" />
							<col span="1" style="width: 15%;" />
							<col span="1" style="width: 10%;" />
						</colgroup>
						<thead>
							<tr class="bg-slate-200">
								<th></th>
								<th class="text-[0.65rem] text-left px-4 py-2 text-slate-500 font-normal uppercase"
									>Názov</th
								>
								<th class="text-[0.65rem] text-left px-4 py-2 text-slate-500 font-normal uppercase"
									>Dátum</th
								>
								<th class="text-[0.65rem] text-left px-4 py-2 text-slate-500 font-normal uppercase"
									>Stav</th
								>
							</tr>
						</thead>
						<tbody>
							<tr class="event-table-row">
								<td>
									<a href="/" class="event-table-row-modify">
										<Icon scale="small">
											<Adjustments />
										</Icon>
									</a>
								</td>
								<td class="event-table-long-text">Maturitný ples SSOSTA 2024 - 4.B</td>
								<td class="text-sm px-4 py-3 text-slate-600">12.12.2021</td>
								<td class="text-sm px-4 py-3">
									<span class="bg-blue-300/40 px-2 py-1 rounded text-blue-600">Plánovaná</span>
								</td>
							</tr>
							<tr class="event-table-row">
								<td>
									<a href="/" class="event-table-row-modify">
										<Icon scale="small">
											<Adjustments />
										</Icon>
									</a>
								</td>
								<td class="event-table-long-text">Maturitný ples SSOSTA 2024 - 4.A</td>
								<td class="text-sm px-4 py-3 text-slate-600">12.12.2021</td>
								<td class="text-sm px-4 py-3">
									<span class="bg-black/30 px-2 py-1 rounded text-black">Ukončená</span>
								</td>
							</tr>
						</tbody>
					</table>
				</div>
			</div>
			<div class="border border-slate-400/30 min-w-72 w-full sm:w-72 sm:h-96 bg-slate-100 flex flex-col rounded">
				<div class="p-4 border-b border-slate-400/30">
					<h2>Naplánované udalosti</h2>
				</div>
				<div class="h-full block">
					<Calendar />
				</div>
			</div>
		</div>
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
			<div class="border border-slate-400/30 w-full bg-slate-100 p-4 flex flex-col">
				<h2 class="text-slate-500 text-sm">Udalosti</h2>
				<p class="text-3xl font-bold">24</p>
			</div>
			<div class="border border-slate-400/30 w-full bg-slate-100 p-4 flex flex-col">
				<h2 class="text-slate-500 text-sm">Naplánované udalosti</h2>
				<p class="text-3xl font-bold">24</p>
			</div>
			<div class="border border-slate-400/30 w-full bg-slate-100 p-4 flex flex-col">
				<h2 class="text-slate-500 text-sm">Udalosti</h2>
				<p class="text-3xl font-bold">24</p>
			</div>
			<div class="border border-slate-400/30 w-full bg-slate-100 p-4 flex flex-col">
				<h2 class="text-slate-500 text-sm">Udalosti</h2>
				<p class="text-3xl font-bold">24</p>
			</div>
		</div>
	</div>
</div>

<Dialog title="Nová udalosť" bind:handleOpen={openEventDialog} bind:handleClose={closeEventDialog}>
	<form class="w-full flex flex-col" action="">
		<div class="p-4 flex flex-col">
			<label for="" class="text-sm text-slate-800">Názov</label>
			<TextInput name="názov" id="newEventName" />
			<label for="" class="text-sm text-slate-800 mt-4">Názov</label>
			<TextInput name="názov" id="newEventName"/>
		</div>
		<div class="bg-slate-200 p-4 w-full border-t border-slate-400/30 flex justify-between">
			<button
				on:click={closeEventDialog}
				class="flex flex-row gap-2 items-center hover:bg-slate-100/50 duration-150 text-slate-500 px-4 py-2 rounded text-sm"
			>
				<p>Zrušiť</p>
			</button>
			<button
				on:click={openEventDialog}
				class="flex flex-row gap-2 items-center bg-blue-500 hover:bg-blue-400 duration-150 text-slate-100 px-4 py-2 rounded border border-blue-600/30 text-sm"
			>
				<Icon scale="small">
					<Plus />
				</Icon>
				<p>Vytvoriť udalosť</p>
			</button>
		</div>
	</form>
</Dialog>

<style lang="postcss">
	.event-table-row {
		@apply border-t border-slate-400/30 hover:bg-slate-200;
	}
	.event-table-row-modify {
		@apply mx-2 border-slate-400/30 border w-8 h-8 flex justify-center items-center rounded duration-150 hover:bg-slate-300;
	}
	.event-table-long-text {
		@apply text-sm px-4 py-3 text-slate-600 max-w-40 overflow-ellipsis overflow-hidden whitespace-nowrap text-nowrap h-12;
	}
</style>
