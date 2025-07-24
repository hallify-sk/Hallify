<script lang="ts">
    import ChevronLeft from '$lib/icons/ChevronLeft.svelte';
    import ChevronRight from '$lib/icons/ChevronRight.svelte';
    import Icon from '$lib/icons/Icon.svelte';

    type Props = {
        selectedDate?: string;
        availableDates?: string[];
        unavailableDates?: string[];
        onDateSelect?: (date: string) => void;
        disabled?: boolean;
    };

    let {
        selectedDate = $bindable(''),
        availableDates = [],
        unavailableDates = [],
        onDateSelect = () => {},
        disabled = false
    }: Props = $props();

    let currentDate = $state(new Date());
    let currentMonth = $state(currentDate.getMonth());
    let currentYear = $state(currentDate.getFullYear());

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const monthNames = [
        'Január', 'Február', 'Marec', 'Apríl', 'Máj', 'Jún',
        'Júl', 'August', 'September', 'Október', 'November', 'December'
    ];

    const dayNames = ['Po', 'Ut', 'St', 'Št', 'Pi', 'So', 'Ne'];

    // Get calendar days for the current month  
    const calendarDays = $derived(() => {
        const firstDay = new Date(currentYear, currentMonth, 1);
        const lastDay = new Date(currentYear, currentMonth + 1, 0);
        
        // Adjust to start on Monday (0 = Sunday, 1 = Monday)
        const dayOfWeek = firstDay.getDay();
        const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        
        // Calculate start date using local date arithmetic
        const startYear = firstDay.getFullYear();
        const startMonth = firstDay.getMonth();
        const startDay = firstDay.getDate() - mondayOffset;
        
        const days = [];
        
        // Generate 6 weeks (42 days) to ensure consistent grid
        for (let i = 0; i < 42; i++) {
            // Create date using explicit local date constructor
            const currentDatePtr = new Date(startYear, startMonth, startDay + i);
            
            // Ensure we're working with local time by creating a clean date
            const cleanDate = new Date(currentDatePtr.getFullYear(), currentDatePtr.getMonth(), currentDatePtr.getDate());
            
            // Format date as YYYY-MM-DD using the clean date
            const year = cleanDate.getFullYear();
            const month = String(cleanDate.getMonth() + 1).padStart(2, '0');
            const day = String(cleanDate.getDate()).padStart(2, '0');
            const dateStr = `${year}-${month}-${day}`;
            
            const isCurrentMonth = cleanDate.getMonth() === currentMonth;
            const isToday = cleanDate.getTime() === today.getTime();
            const isSelected = selectedDate === dateStr;
            const isPast = cleanDate < today;
            const isAvailable = availableDates.includes(dateStr);
            const isUnavailable = unavailableDates.includes(dateStr);
            
            days.push({
                date: new Date(cleanDate),
                dateStr,
                day: cleanDate.getDate(),
                isCurrentMonth,
                isToday,
                isSelected,
                isPast,
                isAvailable,
                isUnavailable
            });
        }
        
        return days;
    });

    function goToPreviousMonth() {
        if (currentMonth === 0) {
            currentMonth = 11;
            currentYear--;
        } else {
            currentMonth--;
        }
    }

    function goToNextMonth() {
        if (currentMonth === 11) {
            currentMonth = 0;
            currentYear++;
        } else {
            currentMonth++;
        }
    }

    function selectDate(dateStr: string, isAvailable: boolean, isPast: boolean, isCurrentMonth: boolean) {
        if (disabled || isPast || !isCurrentMonth) return;
        
        // Only allow selection of available dates
        if (!isAvailable) return;
        
        selectedDate = dateStr;
        onDateSelect(dateStr);
    }

    function getDayClass(day: any) {
        let classes = 'w-8 h-8 flex items-center justify-center text-xs rounded cursor-pointer transition-colors duration-150 ';
        
        if (!day.isCurrentMonth) {
            classes += 'text-text-3 bg-background-main cursor-default ';
        } else if (day.isPast) {
            classes += 'text-text-3 bg-background-main cursor-not-allowed ';
        } else if (disabled) {
            classes += 'text-text-3 bg-background-main cursor-not-allowed ';
        } else if (day.isUnavailable) {
            classes += 'text-red-600 bg-red-100 cursor-not-allowed ';
        } else if (day.isAvailable) {
            if (day.isSelected) {
                classes += 'bg-primary text-white ';
            } else {
                classes += 'text-text-main hover:bg-primary-4/20 hover:text-primary ';
            }
        } else {
            classes += 'text-text-4 bg-background-main cursor-default ';
        }
        
        if (day.isToday && !day.isSelected) {
            classes += 'ring-1 ring-primary ';
        }
        
        return classes;
    }

    ["cursor-not-allowed"];
</script>

<div class="w-full max-w-sm mx-auto">
    <!-- Header -->
    <div class="flex items-center justify-between mb-4">
        <button
            type="button"
            onclick={goToPreviousMonth}
            class="p-1 rounded hover:bg-background-4 transition-colors duration-150"
            disabled={disabled}
        >
            <Icon scale="small">
                <ChevronLeft />
            </Icon>
        </button>
        
        <h3 class="text-base font-medium text-text-main">
            {monthNames[currentMonth]} {currentYear}
        </h3>
        
        <button
            type="button"
            onclick={goToNextMonth}
            class="p-1 rounded hover:bg-background-4 transition-colors duration-150"
            disabled={disabled}
        >
            <Icon scale="small">
                <ChevronRight />
            </Icon>
        </button>
    </div>

    <!-- Day names -->
    <div class="grid grid-cols-7 gap-1 mb-2">
        {#each dayNames as dayName}
            <div class="text-xs text-text-2 text-center font-medium py-2">
                {dayName}
            </div>
        {/each}
    </div>

    <!-- Calendar grid -->
    <div class="grid grid-cols-7 gap-1">
        {#each calendarDays() as day}
            <button
                type="button"
                class={getDayClass(day)}
                onclick={() => selectDate(day.dateStr, day.isAvailable, day.isPast, day.isCurrentMonth)}
                disabled={disabled || day.isPast || !day.isCurrentMonth || day.isUnavailable || !day.isAvailable}
                title={
                    day.isUnavailable ? 'Nedostupné' :
                    day.isAvailable ? 'Dostupné' :
                    day.isPast ? 'Minulosť' :
                    ''
                }
            >
                {day.day}
            </button>
        {/each}
    </div>

    <!-- Legend -->
    {#if availableDates.length > 0 || unavailableDates.length > 0}
        <div class="mt-4 space-y-2">
            <p class="text-xs text-text-2 font-medium">Legenda:</p>
            <div class="flex flex-wrap gap-3 text-xs">
                {#if availableDates.length > 0}
                    <div class="flex items-center gap-1">
                        <div class="w-3 h-3 rounded bg-primary"></div>
                        <span class="text-text-3">Dostupné</span>
                    </div>
                {/if}
                {#if unavailableDates.length > 0}
                    <div class="flex items-center gap-1">
                        <div class="w-3 h-3 rounded bg-red-600"></div>
                        <span class="text-text-3">Obsadené</span>
                    </div>
                {/if}
                <div class="flex items-center gap-1">
                    <div class="w-3 h-3 rounded border border-primary"></div>
                    <span class="text-text-3">Dnes</span>
                </div>
            </div>
        </div>
    {/if}
</div>
