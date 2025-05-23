<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import Calendar from '$lib/components/Calendar.svelte';
	import Dialog from '$lib/components/Dialog.svelte';
	import TextInput from '$lib/components/inputs/TextInput.svelte';
	import Navbar from '$lib/components/Navbar.svelte';
	import Adjustments from '$lib/icons/Adjustments.svelte';
	import Icon from '$lib/icons/Icon.svelte';
	import Plus from '$lib/icons/Plus.svelte';

	let { data } = $props();

	let showEventDialog = $state(false);
</script>

<Navbar user={data.user} permission={data.permission} />

<div class="w-full min-h-screen px-4 py-6 bg-background-main md:px-24">
	<div class="flex flex-row flex-wrap items-center justify-between w-full mx-auto max-w-7xl">
		<div class="flex flex-col flex-nowrap">
			<p class="uppercase text-[0.65rem] text-text-1">Prehľad</p>
			<p class="text-text-main">Panel informácií</p>
		</div>
		<div class="flex flex-row items-center flex-nowrap">
			<Button color="primary" onclick={() => (showEventDialog = true)}>
				<Icon scale="small">
					<Plus />
				</Icon>
				<p>Vytvoriť udalosť</p>
			</Button>
		</div>
	</div>
	<div class="flex flex-col items-start w-full gap-4 mx-auto mt-4 max-w-7xl">
		<div class="flex flex-col w-full gap-4 sm:flex-row">
			<div
				class="relative w-full overflow-y-auto border rounded border-border-main/30 h-96 bg-background-1"
			>
				<div class="sticky top-0 p-4 border-b border-border-main/30 bg-background-1">
					<h2 class="text-text-main">Prehľad udalostí</h2>
				</div>
				<div class="overflow-y-auto">
					<table class="w-full border-b border-collapse border-border-main/30">
						<colgroup>
							<col span="1" style="width: 5%;" />
							<col span="2" style="width: 70%;" />
							<col span="1" style="width: 15%;" />
							<col span="1" style="width: 10%;" />
						</colgroup>
						<thead>
							<tr class="bg-background-2">
								<th></th>
								<th class="text-[0.65rem] text-left px-4 py-2 text-text-1 font-normal uppercase"
									>Názov</th
								>
								<th class="text-[0.65rem] text-left px-4 py-2 text-text-1 font-normal uppercase"
									>Dátum</th
								>
								<th class="text-[0.65rem] text-left px-4 py-2 text-text-1 font-normal uppercase"
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
								<td class="px-4 py-3 text-sm text-text-4">12.12.2021</td>
								<td class="px-4 py-3 text-sm">
									<span class="px-2 py-1 text-blue-600 rounded bg-blue-300/40">Plánovaná</span>
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
								<td class="event-table-long-text">Maturitný ples SSOSTA 2024 - 4.B</td>
								<td class="px-4 py-3 text-sm text-text-4">12.12.2021</td>
								<td class="px-4 py-3 text-sm">
									<span class="px-2 py-1 rounded text-primary bg-primary-4/40">Plánovaná</span>
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
								<td class="event-table-long-text">Maturitný ples SSOSTA 2024 - 4.B</td>
								<td class="px-4 py-3 text-sm text-text-4">12.12.2021</td>
								<td class="px-4 py-3 text-sm">
									<span class="px-2 py-1 text-blue-600 rounded bg-blue-300/40">Plánovaná</span>
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
								<td class="event-table-long-text">Maturitný ples SSOSTA 2024 - 4.B</td>
								<td class="px-4 py-3 text-sm text-text-4">12.12.2021</td>
								<td class="px-4 py-3 text-sm">
									<span class="px-2 py-1 text-blue-600 rounded bg-blue-300/40">Plánovaná</span>
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
								<td class="event-table-long-text">Maturitný ples SSOSTA 2024 - 4.B</td>
								<td class="px-4 py-3 text-sm text-text-4">12.12.2021</td>
								<td class="px-4 py-3 text-sm">
									<span class="px-2 py-1 text-blue-600 rounded bg-blue-300/40">Plánovaná</span>
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
								<td class="event-table-long-text">Maturitný ples SSOSTA 2024 - 4.B</td>
								<td class="px-4 py-3 text-sm text-text-4">12.12.2021</td>
								<td class="px-4 py-3 text-sm">
									<span class="px-2 py-1 text-blue-600 rounded bg-blue-300/40">Plánovaná</span>
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
								<td class="event-table-long-text">Maturitný ples SSOSTA 2024 - 4.B</td>
								<td class="px-4 py-3 text-sm text-text-4">12.12.2021</td>
								<td class="px-4 py-3 text-sm">
									<span class="px-2 py-1 text-blue-600 rounded bg-blue-300/40">Plánovaná</span>
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
								<td class="event-table-long-text">Maturitný ples SSOSTA 2024 - 4.B</td>
								<td class="px-4 py-3 text-sm text-text-4">12.12.2021</td>
								<td class="px-4 py-3 text-sm">
									<span class="px-2 py-1 text-blue-600 rounded bg-blue-300/40">Plánovaná</span>
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
								<td class="px-4 py-3 text-sm text-text-4">12.12.2021</td>
								<td class="px-4 py-3 text-sm">
									<span class="px-2 py-1 text-black rounded bg-black/30">Ukončená</span>
								</td>
							</tr>
						</tbody>
					</table>
				</div>
			</div>
			<div
				class="flex flex-col w-full border rounded border-border-main/30 min-w-72 sm:w-72 sm:h-96 bg-background-1"
			>
				<div class="p-4 border-b border-border-main/30">
					<h2 class="text-text-main">Naplánované udalosti</h2>
				</div>
				<div class="block h-full">
					<Calendar />
				</div>
			</div>
		</div>
		<div class="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
			<div class="flex flex-col w-full p-4 border rounded border-border-main/30 bg-background-1">
				<h2 class="text-sm text-text-1">Udalosti</h2>
				<p class="text-3xl font-bold text-text-main">24</p>
			</div>
			<div class="flex flex-col w-full p-4 border rounded border-border-main/30 bg-background-1">
				<h2 class="text-sm text-text-1">Naplánované udalosti</h2>
				<p class="text-3xl font-bold text-text-main">24</p>
			</div>
			<div class="flex flex-col w-full p-4 border rounded border-border-main/30 bg-background-1">
				<h2 class="text-sm text-text-1">Udalosti</h2>
				<p class="text-3xl font-bold text-text-main">24</p>
			</div>
			<div class="flex flex-col w-full p-4 border rounded border-border-main/30 bg-background-1">
				<h2 class="text-sm text-text-1">Udalosti</h2>
				<p class="text-3xl font-bold text-text-main">24</p>
			</div>
		</div>
	</div>
</div>

<Dialog bind:open={showEventDialog}>
	{#snippet header()}
		<p>Nová udalosť</p>
	{/snippet}
	<form class="flex flex-col w-full" action="">
		<div class="flex flex-col p-4">
			<label for="" class="text-sm text-text-4">Názov</label>
			<TextInput name="názov" id="newEventName" />
			<label for="" class="mt-4 text-sm text-text-4">Názov</label>
			<TextInput name="názov" id="newEventName" />
		</div>
		<div class="flex justify-between w-full p-4 border-t bg-background-2 border-border-main/30">
			<Button onclick={() => (showEventDialog = false)} color="transparent">
				<p>Zrušiť</p>
			</Button>
			<Button onclick={() => (showEventDialog = false)} color="primary">
				<Icon scale="small">
					<Plus />
				</Icon>
				<p>Vytvoriť udalosť</p>
			</Button>
		</div>
	</form>
</Dialog>

<style lang="postcss">
	.event-table-row {
		@apply border-t border-border-main/30 hover:bg-background-4;
	}
	.event-table-row-modify {
		@apply mx-2 border-border-main/30 border text-text-4 w-8 h-8 flex justify-center items-center rounded duration-150 hover:bg-background-5;
	}
	.event-table-long-text {
		@apply text-sm px-4 py-3 text-text-4 max-w-40 overflow-ellipsis overflow-hidden whitespace-nowrap text-nowrap h-12;
	}
</style>
