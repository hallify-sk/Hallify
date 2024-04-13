<script lang="ts">
	import { Calendar } from 'headless-calendar';
	import { dateToInputString, getMonthName, getMonthNameFromIndex, getNumberOfDaysInMonth, isToday } from './lib';
	import { writable, type Writable } from 'svelte/store';
	import { onDestroy } from 'svelte';
	import { crossfade, fly } from 'svelte/transition';
	import { sineIn, sineInOut, sineOut } from 'svelte/easing';
	import { zoom } from './animations/zoom';
	import type { RecordModel } from 'pocketbase';
	const month = writable(new Date().getMonth() + 1);
	const year = writable(new Date().getFullYear());
	const action: Writable<number> = writable();

	const view: Writable<'y' | 'm' | 'd'> = writable('d');

	let monthData: Calendar;

	export let tempBlockedDays: RecordModel[] = [];
	export let blockedDays: RecordModel[] = [];
	export let highlightedDays: RecordModel[] = [];

	export let blockPastDays: boolean = true;

	export let user: string = "";

	const unsubscribeMonth = month.subscribe(() => {
		monthData = Calendar.ofMonth($year, $month, { startWeekdayIndex: 1 });
	});
	const unsubscribeYear = year.subscribe(() => {
		monthData = Calendar.ofMonth($year, $month, { startWeekdayIndex: 1 });
	});
	onDestroy(() => {
		unsubscribeMonth?.();
		unsubscribeYear?.();
	});

	function setMonth(m: number) {
		month.set(m);
	}

	function addMonthHandleYear() {
		if ($month == 12) {
			year.set($year + 1);
			month.set(1);
		} else {
			month.set($month + 1);
		}
		action.set(1);
		console.log($action);
	}

	function subtractMonthHandleYear() {
		if ($month == 1) {
			year.set($year - 1);
			month.set(12);
		} else {
			month.set($month - 1);
		}
		action.set(-1);
		console.log($action);
	}

	function setView(viewStr: 'd' | 'm' | 'y') {
		view.set(viewStr);
	}

	//Prevents purging of css classes
	[
		'col-start-1',
		'col-start-2',
		'col-start-3',
		'col-start-4',
		'col-start-5',
		'col-start-6',
		'col-start-7'
	];

	export let selectedDateString: string | null = null;
	export let selectedDate: Date | null = null;

	export let onSelect: () => void = () => {};

</script>

<div class="flex flex-col overflow-hidden">
	<div class="p-2 bg-background-100 grid rounded-md">
		<div class="flex flex-row flex-nowrap gap-1 bg-background-100 z-20">
			{#if $view == 'd'}
				<button
					type="button"
					in:fly={{ delay: 200, duration: 200, y: 30, opacity: 0, easing: sineOut }}
					out:fly={{ duration: 200, y: -30, opacity: 0, easing: sineIn }}
					class="w-full col-span-4 text-left px-2 hover:bg-background-50 rounded text-text-900 dark:hover:bg-background-200 whitespace-nowrap"
					on:click={() => {
						setView('m');
					}}
				>
					{getMonthName([...monthData][0].JSDate, 'long')}
					{$year}
				</button>
			{:else if $view == 'm'}
				<p
					class="w-full col-span-4 text-left px-2 my-1 text-text-900 whitespace-nowrap"
					in:fly={{ delay: 200, duration: 200, y: 30, opacity: 0, easing: sineOut }}
					out:fly={{ duration: 200, y: -30, opacity: 0, easing: sineIn }}
				>
					{$year}
				</p>
			{/if}
			<button type="button"
				on:click={() => {
					if ($view == 'd') {
						subtractMonthHandleYear();
					} else if ($view == 'm') {
						$year = $year - 1;
					}
				}}
				class="hover:bg-background-50 dark:hover:bg-background-200 h-8 aspect-square text-text-900 rounded"
			>
				-
			</button>
			<button type="button"
				on:click={() => {
					if ($view == 'd') {
						addMonthHandleYear();
					} else if ($view == 'm') {
						$year = $year + 1;
					}
				}}
				class="hover:bg-background-50 dark:hover:bg-background-200 h-8 aspect-square text-text-900 rounded"
			>
				+
			</button>
		</div>
		{#if $view == 'd'}
			<div
				class="w-full grid grid-cols-7 bg-background-100 rotate-0 z-20"
				in:zoom={{ delay: 200, duration: 200, scale: 0.8 }}
				out:zoom={{ duration: 200, scale: 0.8 }}
			>
				{#each ['Pon', 'Uto', 'Str', 'Štv', 'Pia', 'Sob', 'Ned'] as weekDay}
					<p class="aspect-square grid place-items-center text-center text-text-700">{weekDay}</p>
				{/each}
			</div>
			<div
				class="grid item"
				in:zoom={{ delay: 200, duration: 200, scale: 0.8 }}
				out:zoom={{ duration: 200, scale: 0.8 }}
			>
				{#key $month}
					<div
						class="grid grid-cols-7 grid-rows-6 gap-1 item"
						in:fly={{ duration: 300, y: $action * 50, opacity: 0 }}
						out:fly={{ duration: 300, y: $action * -50, opacity: 0 }}
					>
						<!--Last Month-->
						{#each Array([...monthData][0].weekdayIndex) as _, i}
							<p
								class="
								row-start-1
								col-start-{[...monthData][0].weekdayIndex - i}
								text-center rounded-full hover:bg-background-200 text-text-400 grid place-items-center text-lg aspect-square
							"
							>
								{getNumberOfDaysInMonth($year, $month - 1) - i}
							</p>
						{/each}
						<!--Month-->
						{#each [...monthData] as day}
							<button type="button"
								data-selected={dateToInputString(day.JSDate) == selectedDateString}
								data-blocked={blockedDays.some(i => new Date(i.date).getTime() == day.JSDate.getTime())}
								data-highlighted={highlightedDays.some(i => new Date(i.date).getTime() == day.JSDate.getTime())}
								disabled={ 
									blockPastDays&&((new Date().getTime() + 1000 * 60 * 60 * 24 * 6) - day.JSDate.getTime() > 0)
									|| tempBlockedDays.filter(i => i.user != user).some(i => new Date(i.date).getTime() == day.JSDate.getTime()) 
									|| blockedDays.some(i => new Date(i.date).getTime() == day.JSDate.getTime())
								}
								on:click={() => {
									onSelect();
									selectedDate = day.JSDate;
									selectedDateString = dateToInputString(day.JSDate);
								}}
								class='
								{isToday(day.JSDate)
									? 'text-accent-500 bg-secondary-200 hover:bg-secondary-300'
									: 'text-text-600 hover:bg-background-200 disabled:text-text-400'}
								col-start-{day.weekdayIndex + 1}
								text-center grid place-items-center text-lg aspect-square rounded-full relative
								data-[highlighted="true"]:hover:bg-primary-500 data-[highlighted="true"]:hover:text-primary-600 data-[highlighted="true"]:bg-primary-400 data-[highlighted="true"]:text-primary-600
								data-[blocked="true"]:hover:bg-accent-500 data-[blocked="true"]:hover:text-accent-600 data-[blocked="true"]:bg-accent-400 data-[blocked="true"]:text-accent-600
								data-[selected="true"]:!bg-primary-500 data-[selected="true"]:!text-text-100
								'
							>
								{day.day}
								{#if tempBlockedDays.some(i => new Date(i.date).getTime() === day.JSDate.getTime())}
									<div class="absolute block top-1 right-1 bg-accent-500 rounded-full w-1.5 h-1.5"></div>
								{/if}
								</button>
						{/each}
						<!--Next Month-->
						{#each Array(42 - Array([...monthData][0].weekdayIndex).length - [...monthData].length) as _, i}
							<!--
            +2 because 
            +1 for the grid-cols (it counts from 1 not 0)
            +1 because i starts from 0 and it needs to start from 1
         -->
							<p
								class="
							col-start-{([...monthData].at(-1)?.weekdayIndex || 0) + i + 2}
							hover:bg-background-200 text-text-400 text-center grid place-items-center text-lg aspect-square rounded-full
						"
							>
								{i + 1}
							</p>
						{/each}
					</div>
				{/key}
			</div>
		{:else if $view == 'm'}
			<div
				class="grid grid-cols-4 grid-rows-3 gap-1 item"
				in:zoom={{ delay: 200, duration: 200, scale: 0.8 }}
				out:zoom={{ duration: 200, scale: 0.8 }}
			>
				{#each Array(12) as _, i}
					<button
						type="button"
						on:click={() => {
							setMonth(i + 1);
							setView('d');
						}}
						class="
                col-start-{(i + 1) % 4}
				{i+1 == $month ? 'text-accent-500 bg-secondary-200 hover:bg-secondary-300'
				: 'text-text-600 hover:bg-background-200'}
				hover:bg-background-200
				text-center grid place-items-center text-lg aspect-square rounded-full
                ">{getMonthNameFromIndex(i, 'short')}</button
					>
				{/each}
			</div>
		{:else}{/if}
	</div>
</div>

<style>
	.item {
		grid-column-start: 1;
		grid-column-end: 2;
		grid-row-start: 3;
		grid-row-end: 4;
	}
</style>
