<script lang="ts">
	import { Calendar } from 'headless-calendar';
	import { getMonthName, getNumberOfDaysInMonth, isToday } from './lib';
	import { writable } from 'svelte/store';
	import { onDestroy } from 'svelte';

	const month = writable(new Date().getMonth() + 1);
	const year = writable(new Date().getFullYear());
	let monthData: Calendar;

	const unsubscribe = month.subscribe(() => {
		monthData = Calendar.ofMonth($year, $month, { startWeekdayIndex: 1 });
		console.log(monthData);
	});
	onDestroy(() => {
		unsubscribe?.();
	});

    function addMonthHandleYear(){
        if($month == 12){
            console.log("hi");
            year.set($year + 1);
            month.set(1);
        }else{
            month.set($month + 1);
        }
    }

    function subtractMonthHandleYear(){
        if($month == 1){
            year.set($year - 1);
            month.set(12);
        }else{
            month.set($month - 1);
        }
    }

    //Prevents purging of css classes
    ['col-start-1', 'col-start-2', 'col-start-3', 'col-start-4', 'col-start-5', 'col-start-6', 'col-start-7'];

</script>

<div class="flex flex-col mt-20">
	<div class="flex flex-col">
        <p>{getMonthName([...monthData][0].JSDate)} {$year}</p>
		<div class="flex flex-row justify-evenly">
			<button
				on:click={subtractMonthHandleYear}
				class="bg-blue-200 hover:bg-blue-300 w-full"
			>
				-
			</button>
			<button
				on:click={addMonthHandleYear}
				class="bg-blue-200 hover:bg-blue-300 w-full"
			>
				+
			</button>
		</div>
		<div class="grid grid-cols-7 bg-blue-50 grid-rows-6 gap-1">
            {#each Array([...monthData][0].weekdayIndex) as _, i}
                <p class="
                row-start-1
                col-start-{[...monthData][0].weekdayIndex - i}
                bg-blue-100 opacity-50 text-center grid place-items-center text-lg
                ">{getNumberOfDaysInMonth($year, $month - 1) - i}</p>
            {/each}
			{#each [...monthData] as day}
				<p
					class="
                {isToday(day.JSDate) ? 'text-red-500' : ''}
                col-start-{day.weekdayIndex + 1}
                bg-blue-100 hover:bg-blue-200 text-center grid place-items-center text-lg"
				>
					{day.day}
				</p>
			{/each}
            {#each Array(42 - Array([...monthData][0].weekdayIndex).length - [...monthData].length) as _, i}
             <!--
                +2 because 
                +1 for the grid-cols (it counts from 1 not 0)
                +1 because i starts from 0 and it needs to start from 1
             -->
            <p class="
            col-start-{([...monthData].at(-1)?.weekdayIndex || 0) + i + 2}
            bg-blue-100 opacity-50 text-center grid place-items-center text-lg
            ">{i + 1}</p>
            {/each}
		</div>
	</div>
</div>
