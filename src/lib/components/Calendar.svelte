<script lang="ts">
	//Icons
	import Calendar from '$lib/icons/CalendarIcon.svelte';
	import Icon from '$lib/icons/Icon.svelte';
	import Minus from '$lib/icons/Minus.svelte';
	import Plus from '$lib/icons/Plus.svelte';

	//Libraries
	import { toast } from 'svelte-hot-french-toast';
	import { CalendarOfMonth, type Month } from '@onsetsoftware/headless-calendar';

	//Utils
	import { zoom } from '$lib/transitions/zoom';

	let selectedDate = $state(new Date());
	let currentYear = $state(selectedDate.getFullYear());
	let currentMonth = $state(selectedDate.getMonth());

	let prevMonth = $derived(new CalendarOfMonth(currentYear, currentMonth as Month, 0, 'sk'));
	let month = $derived(new CalendarOfMonth(currentYear, (currentMonth + 1) as Month, 0, 'sk'));
	let nextMonth = $derived(new CalendarOfMonth(currentYear, (currentMonth + 2) as Month, 0, 'sk'));

	let selectingDay = $state(true);

	const d = new Date();
	const todayMidnight = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);

	function regenerateDates() {
		currentYear = selectedDate.getFullYear();
		currentMonth = selectedDate.getMonth();
	}

	function handleMinusCalendar() {
		if (selectingDay) {
			selectedDate.setMonth(selectedDate.getMonth() - 1);
			//monthIncrement = -1;
		} else {
			selectedDate.setFullYear(selectedDate.getFullYear() - 1);
		}
		regenerateDates();
	}
	function handlePlusCalendar() {
		if (selectingDay) {
			selectedDate.setMonth(selectedDate.getMonth() + 1);
			//monthIncrement = +1;
		} else {
			selectedDate.setFullYear(selectedDate.getFullYear() + 1);
		}
		regenerateDates();
	}
</script>

<div class="flex flex-col h-full">
	<!--Loop over month Sveltekit-->
	<div class="flex flex-row w-full col-span-7 gap-1 p-1 border-b border-slate-400/30 flex-nowrap">
		<button
			onclick={() => (selectingDay = !selectingDay)}
			class="flex items-center w-full gap-2 px-2 py-2 text-sm duration-150 border rounded border-slate-400/30 hover:bg-slate-300 text-slate-500"
		>
			<Icon scale="small">
				<Calendar />
			</Icon>
			{#if selectingDay}
				{new Date(currentYear, currentMonth, 1).toLocaleString('sk', { month: 'long' })}
				{currentYear}
			{:else}
				{currentYear}
			{/if}
		</button>
		<button
			onclick={handleMinusCalendar}
			class="flex items-center w-10 gap-2 px-2 py-2 duration-150 border rounded aspect-square border-slate-400/30 hover:bg-slate-300 text-slate-500"
		>
			<Icon scale="small">
				<Minus />
			</Icon>
		</button>
		<button
			onclick={handlePlusCalendar}
			class="flex items-center w-10 gap-2 px-2 py-2 duration-150 border rounded aspect-square border-slate-400/30 hover:bg-slate-300 text-slate-500"
		>
			<Icon scale="small">
				<Plus />
			</Icon>
		</button>
	</div>
	<div class="grid h-full place-items-center">
		{#if selectingDay}
			<div
				class="flex flex-col w-full h-full col-span-full row-span-full"
				in:zoom={{ delay: 200, duration: 200, scale: 0.8 }}
				out:zoom={{ duration: 200, scale: 0.8 }}
			>
				<div
					class="grid h-full grid-cols-7 p-1 border-b bg-slate-200 place-items-center border-slate-400/30"
				>
					{#each ['Po', 'Ut', 'St', 'Št', 'Pi', 'So', 'Ne'] as day}
						<p class="text-slate-500 text-[0.65rem] uppercase">{day}</p>
					{/each}
				</div>
				{#key month}
					<div
						class="grid w-full h-full grid-cols-7 grid-rows-6 gap-1 px-1 pb-1 mt-1 place-items-center"
					>
						{#each [...prevMonth]
							.filter((i) => i.value.weekAxisIndex == Math.max(...[...prevMonth].map((obj) => obj.value.weekAxisIndex)))
							.slice(1) as prevMonthDay}
							<button
								disabled={true}
								class="calendarButton col-start-{prevMonthDay.value
									.dayAxisIndex} w-full aspect-square rounded hover:bg-slate-200 text-sm duration-150 {todayMidnight ==
								prevMonthDay.value.date.toJSDate().getTime()
									? 'text-blue-300 bg-blue-300/40'
									: prevMonthDay.value.dayAxisIndex % 7 == 0
										? 'text-red-300'
										: 'text-slate-400'}"
							>
								{prevMonthDay.value.dayNumber}
							</button>
						{/each}
						{#each [...month] as day}
							{#key selectedDate.getMonth()}
								<button
									onclick={() => {
										toast.error('Na tento dátum není žiadna udalosť.', {
											duration: 3000,
											position: 'bottom-end'
										});
									}}
									class="calendarButton col-start-{day.value
										.dayAxisIndex} w-full aspect-square rounded hover:bg-slate-200 duration-150 text-sm {todayMidnight ==
									day.value.date.toJSDate().getTime()
										? 'text-blue-500 bg-blue-300/40'
										: day.value.dayAxisIndex % 7 == 0
											? 'text-red-500'
											: 'text-slate-700'}"
								>
									{day.value.dayNumber}
								</button>
							{/key}
						{/each}
						{#each [...nextMonth].slice(0, 43 - [...month].length - [...prevMonth].filter((i) => i.value.weekAxisIndex == Math.max(...[...prevMonth].map((obj) => obj.value.weekAxisIndex))).length) as nextMonthDay}
							<button
								disabled={true}
								class="calendarButton col-start-{nextMonthDay.value
									.dayAxisIndex} w-full aspect-square rounded hover:bg-slate-200 duration-150 text-sm
                    {todayMidnight == nextMonthDay.value.date.toJSDate().getTime()
									? 'text-blue-300 bg-blue-300/40'
									: nextMonthDay.value.dayAxisIndex % 7 == 0
										? 'text-red-300'
										: 'text-slate-400'}"
							>
								{nextMonthDay.value.dayNumber}
							</button>
						{/each}
					</div>
				{/key}
			</div>
		{:else}
			<div
				class="grid w-full h-full grid-cols-4 grid-rows-3 gap-1 p-1 col-span-full row-span-full"
				in:zoom={{ delay: 200, duration: 200, scale: 0.8 }}
				out:zoom={{ duration: 200, scale: 0.8 }}
			>
				{#each ['Jan', 'Feb', 'Mar', 'Apr', 'Máj', 'Jún', 'Júl', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'] as month, i}
					<button
						onclick={() => {
							selectedDate.setMonth(i);
							regenerateDates();
							selectingDay = true;
						}}
						class="calendarButton w-full aspect-square rounded hover:bg-slate-200 duration-150 text-sm h-full {i ==
							new Date().getMonth() && currentYear == new Date().getFullYear()
							? 'text-blue-500 bg-blue-300/40'
							: currentMonth == i
								? 'bg-slate-300 text-slate-700'
								: 'text-slate-700'}"
					>
						{month}
					</button>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style lang="postcss">
	.calendarButton {
		@apply no-underline;
	}
</style>
