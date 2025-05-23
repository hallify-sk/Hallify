<script lang="ts">
	//Icons
	import Icon from '$lib/icons/Icon.svelte';
	import Plus from '$lib/icons/Plus.svelte';

	//Components
	import Switch from '$lib/components/inputs/Switch.svelte';
	import Calendar from '$lib/components/Calendar.svelte';
	import Button from '$lib/components/Button.svelte';

	const { data } = $props();

	let validate: string[] = $state([]);

	$effect(() => {
		validate.forEach((i) => {
			(document.getElementById(i) as HTMLInputElement).setCustomValidity('Chybné pole');
		});
	});
</script>

<div class="w-full min-h-screen px-4 py-6 bg-background-main md:px-24">
	<div class="flex flex-row flex-wrap items-center justify-between w-full mx-auto max-w-7xl">
		<div class="flex flex-col flex-nowrap">
			<p class="uppercase text-[0.65rem] text-text-1">Prehľad</p>
			<p class="text-text-main">Časové výluky</p>
		</div>
		<div class="flex flex-row items-center flex-nowrap">
			<Button color="primary">
				<Icon scale="small">
					<Plus />
				</Icon>
				<p>Pridať sálu</p>
			</Button>
		</div>
	</div>
	<div class="flex flex-col items-start w-full gap-4 mx-auto mt-4 max-w-7xl">
		<div class="flex flex-col w-full gap-4 sm:flex-row">
			<div
				class="relative w-full overflow-y-auto border rounded border-border-main/30 max-h-96 bg-background-1"
			>
				<div class="sticky top-0 p-4 border-b border-border-main/30 bg-background-1">
					<h2 class="text-text-main">Trvalé výluky</h2>
				</div>
				<div class="overflow-y-auto">
					<table class="w-full border-collapse">
						<colgroup>
							<col span="1" style="width: 30%; min-width:150px;" />
							<col span="1" style="width: 10%;" />
							<col span="1" style="width: 10%;" />
							<col span="1" style="width: 10%;" />
							<col span="1" style="width: 10%;" />
							<col span="1" style="width: 10%;" />
							<col span="1" style="width: 10%;" />
							<col span="1" style="width: 10%;" />
						</colgroup>
						<thead>
							<tr class="bg-background-2">
								<th
									rowspan="2"
									class="text-[0.65rem] text-left px-4 py-2 text-text-1 font-normal uppercase border-r border-solid border-r-border-main/40"
									>Názov sály</th
								>
								<th
									colspan="7"
									class="text-[0.65rem] px-4 pt-2 text-text-1 font-bold text-center uppercase"
									>Povolené dni</th
								>
							</tr>
							<tr class="bg-background-2">
								<th class="text-[0.65rem] text-left px-4 py-2 text-text-1 font-normal uppercase"
									>Pondelok</th
								>
								<th class="text-[0.65rem] text-left px-4 py-2 text-text-1 font-normal uppercase"
									>Utorok</th
								>
								<th class="text-[0.65rem] text-left px-4 py-2 text-text-1 font-normal uppercase"
									>Streda</th
								>
								<th class="text-[0.65rem] text-left px-4 py-2 text-text-1 font-normal uppercase"
									>Štvrtok</th
								>
								<th class="text-[0.65rem] text-left px-4 py-2 text-text-1 font-normal uppercase"
									>Piatok</th
								>
								<th class="text-[0.65rem] text-left px-4 py-2 text-text-1 font-normal uppercase"
									>Sobota</th
								>
								<th class="text-[0.65rem] text-left px-4 py-2 text-text-1 font-normal uppercase"
									>Nedeľa</th
								>
							</tr>
						</thead>
						<tbody>
							<!-- Fix: Access hall data correctly for Drizzle join result -->
							{#each data.halls as hallItem}
								{@const hall = hallItem.hall}
								<tr class="event-table-row">
									<td class="event-table-long-text">{hall.name}</td>
									<td class="px-4 py-3 text-sm text-slate-600">
										<Switch checked={true} name="{hall.id}-pon" id="{hall.id}-pon" />
									</td>
									<td class="px-4 py-3 text-sm text-slate-600">
										<Switch checked={true} name="{hall.id}-uto" id="{hall.id}-uto" />
									</td>
									<td class="px-4 py-3 text-sm text-slate-600">
										<Switch checked={true} name="{hall.id}-str" id="{hall.id}-str" />
									</td>
									<td class="px-4 py-3 text-sm text-slate-600">
										<Switch checked={true} name="{hall.id}-stv" id="{hall.id}-stv" />
									</td>
									<td class="px-4 py-3 text-sm text-slate-600">
										<Switch checked={true} name="{hall.id}-pia" id="{hall.id}-pia" />
									</td>
									<td class="px-4 py-3 text-sm text-slate-600">
										<Switch checked={true} name="{hall.id}-sob" id="{hall.id}-sob" />
									</td>
									<td class="px-4 py-3 text-sm text-slate-600">
										<Switch checked={true} name="{hall.id}-ned" id="{hall.id}-ned" />
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		</div>
		<div class="flex flex-col w-full gap-4 sm:flex-row">
			<div
				class="relative flex flex-col w-full overflow-y-auto border rounded border-border-main/30 h-96 bg-background-1"
			>
				<div
					class="flex flex-row items-center justify-between p-4 border-b border-border-main/30 bg-background-1"
				>
					<h2 class="text-text-main">Časové výluky</h2>
					<Button color="primary">Vytvoriť výluku</Button>
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
			<div class="flex flex-col w-full p-4 border border-border-main/30 bg-background-1">
				<h2 class="text-sm text-text-1">Počet sál</h2>
				<p class="text-3xl font-bold text-text-main">{data?.halls?.length ?? 0}</p>
			</div>
			<div class="flex flex-col w-full p-4 border border-border-main/30 bg-background-1">
				<h2 class="text-sm text-text-1">Naplánované udalosti</h2>
				<p class="text-3xl font-bold text-text-main">24</p>
			</div>
			<div class="flex flex-col w-full p-4 border border-border-main/30 bg-background-1">
				<h2 class="text-sm text-text-1">Udalosti</h2>
				<p class="text-3xl font-bold text-text-main">24</p>
			</div>
			<div class="flex flex-col w-full p-4 border border-border-main/30 bg-background-1">
				<h2 class="text-sm text-text-1">Udalosti</h2>
				<p class="text-3xl font-bold text-text-main">24</p>
			</div>
		</div>
	</div>
</div>

<style lang="postcss">
	/*
	.color-picker-radio {
		@apply w-full h-full rounded block p-1 border border-border-main/30 cursor-pointer relative hover:bg-slate-200;
	}
	.color-picker-radio div {
		@apply w-full h-full rounded block;
	}*/
	:global(input[type='radio'] + .color-picker-radio svg) {
		@apply hidden;
	}
	:global(input[type='radio']:checked + .color-picker-radio svg) {
		@apply block absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-text-main;
	}
	.event-table-row {
		@apply border-t border-border-main/30;
	}
	/*
	.event-table-row-modify {
		@apply mx-2 border-border-main/30 border w-8 h-8 flex justify-center items-center rounded duration-150 hover:bg-slate-300;
	}*/
	.event-table-long-text {
		@apply text-sm px-4 py-3 text-text-main max-w-40 overflow-ellipsis overflow-hidden whitespace-nowrap text-nowrap h-12;
	}
</style>
