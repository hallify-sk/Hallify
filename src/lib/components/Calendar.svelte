<script lang="ts">
	//Icons
	import Calendar from '$lib/icons/CalendarIcon.svelte';
	import Icon from '$lib/icons/Icon.svelte';
	import Minus from '$lib/icons/Minus.svelte';
	import Plus from '$lib/icons/Plus.svelte';

	//Libraries
	import { toast } from 'svelte-french-toast';
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
	<div class="col-span-7 border-b border-slate-400/30 flex flex-row flex-nowrap w-full p-1 gap-1">
		<button
			onclick={() => (selectingDay = !selectingDay)}
			class="py-2 px-2 w-full border-slate-400/30 border rounded flex items-center hover:bg-slate-300 duration-150 gap-2 text-slate-500 text-sm"
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
			class="py-2 px-2 w-10 aspect-square border-slate-400/30 border rounded flex items-center hover:bg-slate-300 duration-150 gap-2 text-slate-500"
		>
			<Icon scale="small">
				<Minus />
			</Icon>
		</button>
		<button
			onclick={handlePlusCalendar}
			class="py-2 px-2 w-10 aspect-square border-slate-400/30 border rounded flex items-center hover:bg-slate-300 duration-150 gap-2 text-slate-500"
		>
			<Icon scale="small">
				<Plus />
			</Icon>
		</button>
	</div>
	<div class="grid place-items-center h-full">
		{#if selectingDay}
			<div
				class="flex flex-col w-full col-span-full row-span-full h-full"
				in:zoom={{ delay: 200, duration: 200, scale: 0.8 }}
				out:zoom={{ duration: 200, scale: 0.8 }}
			>
				<div
					class="p-1 bg-slate-200 grid place-items-center grid-cols-7 border-b border-slate-400/30 h-full"
				>
					{#each ['Po', 'Ut', 'St', 'Št', 'Pi', 'So', 'Ne'] as day}
						<p class="text-slate-500 text-[0.65rem] uppercase">{day}</p>
					{/each}
				</div>
				{#key month}
					<div
						class="grid place-items-center grid-cols-7 grid-rows-6 px-1 mt-1 pb-1 gap-1 w-full h-full"
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
											position: 'bottom-right'
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
				class="grid w-full grid-cols-4 grid-rows-3 col-span-full row-span-full gap-1 p-1 h-full"
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
