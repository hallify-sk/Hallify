<script lang="ts">
    import type { Snippet } from 'svelte';
    import ChevronLeft from '$lib/icons/ChevronLeft.svelte';
    import ChevronRight from '$lib/icons/ChevronRight.svelte';
    import Icon from '$lib/icons/Icon.svelte';

    interface DateRangePickerProps {
        startDate?: Date | null;
        endDate?: Date | null;
        onDateChange?: (startDate: Date | null, endDate: Date | null) => void;
        placeholder?: string;
        disabled?: boolean;
        minDate?: Date;
        maxDate?: Date;
    }

    let {
        startDate = $bindable(),
        endDate = $bindable(),
        onDateChange,
        placeholder = "Vyberte dátumový rozsah",
        disabled = false,
        minDate,
        maxDate
    }: DateRangePickerProps = $props();

    let isOpen = $state(false);
    let currentMonth = $state(new Date().getMonth());
    let currentYear = $state(new Date().getFullYear());
    let selectingStart = $state(true);
    let hoverDate: Date | null = $state(null);

    const months = [
        'Január', 'Február', 'Marec', 'Apríl', 'Máj', 'Jún',
        'Júl', 'August', 'September', 'Október', 'November', 'December'
    ];

    const daysOfWeek = ['Po', 'Ut', 'St', 'Št', 'Pi', 'So', 'Ne'];

    function getDaysInMonth(month: number, year: number): Date[] {
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const startDate = new Date(firstDay);
        
        // Get Monday of the first week
        const startDay = firstDay.getDay();
        const mondayOffset = startDay === 0 ? 6 : startDay - 1;
        startDate.setDate(firstDay.getDate() - mondayOffset);

        const days: Date[] = [];
        const current = new Date(startDate);

        // Generate 42 days (6 weeks * 7 days)
        for (let i = 0; i < 42; i++) {
            days.push(new Date(current));
            current.setDate(current.getDate() + 1);
        }

        return days;
    }

    function isInCurrentMonth(date: Date): boolean {
        return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
    }

    function isSameDay(date1: Date | null, date2: Date | null): boolean {
        if (!date1 || !date2) return false;
        return date1.toDateString() === date2.toDateString();
    }

    function isInRange(date: Date): boolean {
        if (!startDate || !endDate) return false;
        return date >= startDate && date <= endDate;
    }

    function isInHoverRange(date: Date): boolean {
        if (!startDate || !hoverDate || endDate) return false;
        const start = startDate < hoverDate ? startDate : hoverDate;
        const end = startDate < hoverDate ? hoverDate : startDate;
        return date >= start && date <= end;
    }

    function isDisabled(date: Date): boolean {
        if (disabled) return true;
        if (minDate && date < minDate) return true;
        if (maxDate && date > maxDate) return true;
        return false;
    }

    function handleDateClick(date: Date) {
        if (isDisabled(date)) return;

        if (selectingStart || !startDate) {
            startDate = new Date(date);
            endDate = null;
            selectingStart = false;
        } else {
            if (date < startDate) {
                endDate = startDate;
                startDate = new Date(date);
            } else {
                endDate = new Date(date);
            }
            selectingStart = true;
            isOpen = false;
        }

        onDateChange?.(startDate, endDate);
    }

    function handleDateHover(date: Date) {
        if (!isDisabled(date)) {
            hoverDate = date;
        }
    }

    function previousMonth() {
        if (currentMonth === 0) {
            currentMonth = 11;
            currentYear--;
        } else {
            currentMonth--;
        }
    }

    function nextMonth() {
        if (currentMonth === 11) {
            currentMonth = 0;
            currentYear++;
        } else {
            currentMonth++;
        }
    }

    function formatDateRange(): string {
        if (!startDate && !endDate) return placeholder;
        if (startDate && !endDate) return `${startDate.toLocaleDateString('sk-SK')} - ...`;
        if (startDate && endDate) {
            return `${startDate.toLocaleDateString('sk-SK')} - ${endDate.toLocaleDateString('sk-SK')}`;
        }
        return placeholder;
    }

    function clearSelection() {
        startDate = null;
        endDate = null;
        selectingStart = true;
        onDateChange?.(null, null);
    }

    // Close calendar when clicking outside
    function handleClickOutside(event: MouseEvent) {
        const target = event.target as HTMLElement;
        if (!target.closest('.date-range-picker')) {
            isOpen = false;
        }
    }

    $effect(() => {
        if (isOpen) {
            document.addEventListener('click', handleClickOutside);
            return () => document.removeEventListener('click', handleClickOutside);
        }
    });
</script>

<div class="date-range-picker relative w-full">
    <!-- Input Display -->
    <button
        type="button"
        class="w-full p-2 text-sm border rounded shadow-sm bg-background-1 border-border-main/30 text-text-2 focus:text-text-4 text-left flex items-center justify-between {disabled ? 'opacity-50 cursor-not-allowed' : ''}"
        onclick={() => !disabled && (isOpen = !isOpen)}
        {disabled}
    >
        <span class="{startDate || endDate ? 'text-text-main' : 'text-text-2'}">
            {formatDateRange()}
        </span>
        <svg 
            class="ml-2 transition-transform duration-200 text-text-2" 
            class:rotate-180={isOpen}
            width="12" 
            height="12" 
            viewBox="0 0 12 12"
        >
            <path d="M2 4l4 4 4-4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
    </button>

    <!-- Calendar Dropdown -->
    {#if isOpen}
        <div class="absolute left-0 z-30 mt-1 bg-background-1 border rounded border-border-main/30 shadow-lg min-w-80">
            <!-- Header -->
            <div class="flex items-center justify-between p-4 border-b border-border-main/30">
                <button
                    type="button"
                    class="p-1 rounded hover:bg-background-4"
                    onclick={previousMonth}
                >
                    <Icon scale="small">
                        <ChevronLeft />
                    </Icon>
                </button>
                
                <h2 class="font-medium text-text-main">
                    {months[currentMonth]} {currentYear}
                </h2>
                
                <button
                    type="button"
                    class="p-1 rounded hover:bg-background-4"
                    onclick={nextMonth}
                >
                    <Icon scale="small">
                        <ChevronRight />
                    </Icon>
                </button>
            </div>

            <!-- Calendar Grid -->
            <div class="p-4">
                <!-- Days of week header -->
                <div class="grid grid-cols-7 mb-2">
                    {#each daysOfWeek as day}
                        <div class="p-2 text-xs font-medium text-center text-text-2">
                            {day}
                        </div>
                    {/each}
                </div>

                <!-- Calendar days -->
                <div class="grid grid-cols-7">
                    {#each getDaysInMonth(currentMonth, currentYear) as date}
                        <button
                            type="button"
                            class="relative p-2 text-sm transition-colors duration-150 hover:bg-background-4 focus:outline-none
                                {!isInCurrentMonth(date) ? 'text-text-2 opacity-50' : 'text-text-main'}
                                {isSameDay(date, startDate ?? null) || isSameDay(date, endDate ?? null) ? 'bg-primary text-white hover:bg-primary-2' : ''}
                                {isInRange(date) && !isSameDay(date, startDate ?? null) && !isSameDay(date, endDate ?? null) ? 'bg-primary-1 text-primary-5' : ''}
                                {isInHoverRange(date) && !isSameDay(date, startDate ?? null) ? 'bg-primary-1/50' : ''}
                                {isDisabled(date) ? 'opacity-25 cursor-not-allowed' : 'cursor-pointer'}
                                {isSameDay(date, new Date()) ? 'font-bold' : ''}"
                            onclick={() => handleDateClick(date)}
                            onmouseenter={() => handleDateHover(date)}
                            onmouseleave={() => hoverDate = null}
                            disabled={isDisabled(date)}
                        >
                            {date.getDate()}
                            
                            <!-- Today indicator -->
                            {#if isSameDay(date, new Date()) && !isSameDay(date, startDate ?? null) && !isSameDay(date, endDate ?? null)}
                                <div class="absolute bottom-1 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-primary rounded-full"></div>
                            {/if}
                        </button>
                    {/each}
                </div>
            </div>

            <!-- Footer -->
            <div class="flex justify-between items-center p-4 border-t border-border-main/30 bg-background-1">
                <button
                    type="button"
                    class="px-3 py-1 text-sm text-text-2 hover:text-text-main transition-colors"
                    onclick={clearSelection}
                >
                    Vymazať
                </button>
                
                <div class="text-xs text-text-2">
                    {#if selectingStart}
                        Vyberte začiatočný dátum
                    {:else if startDate && !endDate}
                        Vyberte konečný dátum
                    {:else}
                        Rozsah vybraný
                    {/if}
                </div>
            </div>
        </div>
    {/if}
</div>

<style lang="postcss">
    .date-range-picker {
        /* Additional custom styles if needed */
    }
</style>