<script lang="ts">
    import Button from '$lib/components/Button.svelte';
    import Navbar from '$lib/components/Navbar.svelte';
    import Dialog from '$lib/components/Dialog.svelte';
    import ChevronLeft from '$lib/icons/ChevronLeft.svelte';
    import ChevronRight from '$lib/icons/ChevronRight.svelte';
    import CalendarIcon from '$lib/icons/CalendarIcon.svelte';
    import Clock from '$lib/icons/Clock.svelte';
    import Adjustments from '$lib/icons/Adjustments.svelte';
    import Plus from '$lib/icons/Plus.svelte';
    import Icon from '$lib/icons/Icon.svelte';
    
    import { CalendarOfMonth, type Month } from '@onsetsoftware/headless-calendar';
    import { goto } from '$app/navigation';
    import { fade, fly } from 'svelte/transition';

    let { data } = $props();

    let currentYear = $state(new Date().getFullYear());
    let currentMonth = $state(new Date().getMonth());
    let hoveredDate: Date | null = $state(null);
    let clickedDate: Date | null = $state(null);
    let showEventDialog = $state(false);
    let popupPosition = $state({ x: 0, y: 0 });

    const today = Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
    const dayNames = ['Po', 'Ut', 'St', 'Št', 'Pi', 'So', 'Ne'];
    const monthNames = ['Január', 'Február', 'Marec', 'Apríl', 'Máj', 'Jún', 'Júl', 'August', 'September', 'Október', 'November', 'December'];

    // Computed calendar months
    const calendarData = $derived({
        prev: new CalendarOfMonth(currentYear, currentMonth as Month, 0, 'sk'),
        current: new CalendarOfMonth(currentYear, (currentMonth + 1) as Month, 0, 'sk'),
        next: new CalendarOfMonth(currentYear, (currentMonth + 2) as Month, 0, 'sk')
    });

    // Get calendar days for rendering
    const calendarDays = $derived(() => {
        const { prev, current, next } = calendarData;
        const prevDays = Array.from(prev).filter(day => 
            day.value.weekAxisIndex === Math.max(...Array.from(prev).map(d => d.value.weekAxisIndex))
        ).slice(1);
        
        const totalDaysInGrid = 42;
        const currentDays = Array.from(current);
        const nextDaysCount = totalDaysInGrid - currentDays.length - prevDays.length;
        const nextDays = Array.from(next).slice(0, Math.max(0, nextDaysCount));

        return [...prevDays, ...currentDays, ...nextDays];
    });

    // Get events for a specific date
    function getEventsForDate(date: Date): typeof data.events {
        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        
        return data.events.filter(event => {
            const eventStart = new Date(event.startDate);
            const eventEnd = new Date(event.endDate);
            
            // Use local date components to avoid timezone issues
            const eventStartDate = new Date(eventStart.getFullYear(), eventStart.getMonth(), eventStart.getDate());
            const eventEndDate = new Date(eventEnd.getFullYear(), eventEnd.getMonth(), eventEnd.getDate());
            const checkDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
            
            return checkDate >= eventStartDate && checkDate <= eventEndDate;
        });
    }

    // Navigation functions
    function previousMonth() {
        if (currentMonth === 0) {
            currentMonth = 11;
            currentYear -= 1;
        } else {
            currentMonth -= 1;
        }
    }

    function nextMonth() {
        if (currentMonth === 11) {
            currentMonth = 0;
            currentYear += 1;
        } else {
            currentMonth += 1;
        }
    }

    function goToToday() {
        const now = new Date();
        currentYear = now.getFullYear();
        currentMonth = now.getMonth();
    }

    // Event handlers
    function handleDateHover(event: MouseEvent, date: Date) {
        const events = getEventsForDate(date);
        if (events.length > 0) {
            hoveredDate = date;
            const rect = (event.target as HTMLElement).getBoundingClientRect();
            popupPosition = {
                x: rect.left + rect.width / 2,
                y: rect.top - 10
            };
        } else {
            hoveredDate = null;
        }
    }

    function handleDateClick(date: Date) {
        const events = getEventsForDate(date);
        const isCurrentMonth = date.getMonth() === currentMonth;
        
        // If clicking on a day from previous/next month, navigate to that month
        if (!isCurrentMonth) {
            currentYear = date.getFullYear();
            currentMonth = date.getMonth();
            return;
        }
        
        // If clicking on current month day with events, show dialog
        if (events.length > 0) {
            clickedDate = date;
            showEventDialog = true;
        }
    }

    function editEvent(eventId: number) {
        goto(`/events/${eventId}`);
    }

    // Get hall info
    function getHallInfo(hallId?: number) {
        if (!hallId) return null;
        return data.halls.find(h => h.id === hallId);
    }

    // Derived values
    const hoveredEvents = $derived(hoveredDate ? getEventsForDate(hoveredDate) : []);
    const clickedEvents = $derived(clickedDate ? getEventsForDate(clickedDate) : []);
</script>

<Navbar user={data.user} permission={data.permission} />

<main class="min-h-screen bg-background-main p-6">
    <div class="max-w-7xl mx-auto">
        <!-- Header -->
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
            <div class="flex items-center gap-4">
                <div class="p-3 bg-background-1 rounded border border-border-main/30">
                    <Icon scale="medium">
                        <CalendarIcon />
                    </Icon>
                </div>
                <div>
                    <p class="uppercase text-[0.65rem] text-text-1 mb-1">Kalendár</p>
                    <h1 class="text-2xl font-bold text-text-main">Kalendár podujatí</h1>
                    <p class="text-text-2 mt-1">Prehľad všetkých naplánovaných podujatí</p>
                </div>
            </div>
            
            <div class="flex items-center gap-3">
                <Button color="primary" onclick={goToToday}>
                    {#snippet children()}
                        <span class="font-medium">Dnes</span>
                    {/snippet}
                </Button>
                <div class="flex items-center bg-background-1 rounded border border-border-main/30 p-1">
                    <Button color="transparent" onclick={previousMonth}>
                        {#snippet children()}
                            <Icon scale="small">
                                <ChevronLeft />
                            </Icon>
                        {/snippet}
                    </Button>
                    <h2 class="text-lg font-semibold text-text-main min-w-[180px] text-center px-4">
                        {monthNames[currentMonth]} {currentYear}
                    </h2>
                    <Button color="transparent" onclick={nextMonth}>
                        {#snippet children()}
                            <Icon scale="small">
                                <ChevronRight />
                            </Icon>
                        {/snippet}
                    </Button>
                </div>
            </div>
        </div>

        <!-- Calendar Grid -->
        <div class="bg-background-1 rounded border border-border-main/30 overflow-hidden">
            <!-- Day Headers -->
            <div class="grid grid-cols-7 bg-background-2 border-b border-border-main/30">
                {#each dayNames as dayName}
                    <div class="p-4 text-center text-xs font-medium text-text-1 uppercase tracking-wide">
                        {dayName}
                    </div>
                {/each}
            </div>

            <!-- Calendar Days -->
            <div class="grid grid-cols-7">
                {#each calendarDays() as day}
                    {@const date = day.value.date.toJSDate()}
                    {@const events = getEventsForDate(date)}
                    {@const isToday = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) === today}
                    {@const isCurrentMonth = date.getMonth() === currentMonth}
                    
                    <button 
                        class="group h-32 w-full border-r border-b border-border-main/30 p-3 transition-all duration-200 hover:bg-background-4 active:bg-background-5 relative {isCurrentMonth ? 'bg-background-1' : 'bg-background-2/50'} text-left overflow-hidden {!isCurrentMonth ? 'opacity-60' : ''}"
                        onmouseenter={(e) => handleDateHover(e, date)}
                        onmouseleave={() => hoveredDate = null}
                        onclick={() => handleDateClick(date)}
                        type="button"
                    >
                        <div class="flex items-start justify-between mb-2">
                            <span class="text-xs font-medium transition-all duration-200 {isCurrentMonth ? (isToday ? 'text-white bg-primary px-2 py-1 rounded-full text-xs' : 'text-text-2') : 'text-text-4'}">
                                {day.value.date.toJSDate().getDate()}
                            </span>
                            {#if events.length > 0}
                                <div class="flex gap-1">
                                    {#each events.slice(0, 4) as event}
                                        {@const hall = getHallInfo(event.hallId)}
                                        <div 
                                            class="w-2 h-2 rounded-full transition-transform duration-200 group-hover:scale-110 {!isCurrentMonth ? 'opacity-60' : ''}"
                                            style="background-color: {hall?.color || '#3B82F6'}"
                                        ></div>
                                    {/each}
                                    {#if events.length > 4}
                                        <span class="text-xs text-text-3 font-medium bg-background-2 px-1 py-0.5 rounded text-[10px] {!isCurrentMonth ? 'opacity-60' : ''}">+{events.length - 4}</span>
                                    {/if}
                                </div>
                            {/if}
                        </div>
                        
                        <!-- Event previews -->
                        <div class="space-y-1">
                            {#each events.slice(0, 1) as event}
                                {@const hall = getHallInfo(event.hallId)}
                                <div 
                                    class="text-xs px-2 py-1 rounded text-white truncate transition-all duration-200 group-hover:scale-[1.01] font-medium {!isCurrentMonth ? 'opacity-60' : ''}"
                                    style="background-color: {hall?.color || '#3B82F6'}"
                                >
                                    {event.name}
                                </div>
                            {/each}
                            {#if events.length > 1}
                                <div class="text-xs text-text-3 font-medium pl-2 bg-background-2/80 py-0.5 rounded text-[10px] {!isCurrentMonth ? 'opacity-60' : ''}">
                                    +{events.length - 1} ďalších
                                </div>
                            {/if}
                        </div>
                        
                        <!-- Hover indicator for days with events -->
                        {#if events.length > 0}
                            <div class="absolute inset-0 border-2 border-primary/30 rounded opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none"></div>
                        {/if}
                        
                        <!-- Visual indicator for non-current month -->
                        {#if !isCurrentMonth}
                            <div class="absolute inset-0 bg-background-2/20 pointer-events-none"></div>
                        {/if}
                    </button>
                {/each}
            </div>
        </div>
    </div>
    
    <!-- Floating Action Button for Quick Event Creation -->
    <div class="fixed bottom-8 right-8 z-50">
        <div class="relative group">
            <button 
                class="bg-primary hover:bg-primary/90 text-white rounded p-4 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 active:scale-95"
                onclick={() => goto('/events/new')}
                type="button"
            >
                <Icon scale="medium" fill="white">
                    <Plus />
                </Icon>
            </button>
            
            <!-- Tooltip -->
            <div class="absolute bottom-full right-0 mb-3 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0 pointer-events-none">
                <div class="bg-background-2 text-text-main text-sm font-medium px-3 py-2 rounded border border-border-main/30 whitespace-nowrap shadow-lg">
                    Vytvoriť nové podujatie
                    <div class="absolute top-full right-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-background-2"></div>
                </div>
            </div>
        </div>
    </div>
</main>

<!-- Hover Popup -->
{#if hoveredDate && hoveredEvents.length > 0}
    <div 
        class="fixed z-50 bg-background-1 border border-border-main/30 rounded shadow-lg p-4 max-w-sm pointer-events-none"
        style="left: {popupPosition.x}px; top: {popupPosition.y}px; transform: translateX(-50%) translateY(-100%);"
        transition:fade={{ duration: 250 }}
    >
        <div class="space-y-3">
            {#each hoveredEvents as event}
                {@const hall = getHallInfo(event.hallId)}
                <div class="flex items-start gap-3">
                    <div 
                        class="w-3 h-3 rounded-full mt-1 flex-shrink-0"
                        style="background-color: {hall?.color || '#3B82F6'}"
                    ></div>
                    <div class="min-w-0 flex-1">
                        <div class="font-semibold text-text-main text-sm leading-tight mb-1">
                            {event.name}
                        </div>
                        {#if hall}
                            <div class="flex items-center gap-1 text-xs text-text-2 mb-2">
                                <span>📍</span>
                                <span class="font-medium">{hall.name}</span>
                            </div>
                        {/if}
                        <div class="flex items-center gap-1.5 text-xs text-text-3">
                            <Icon scale="tiny">
                                <Clock />
                            </Icon>
                            <span class="font-medium">
                                {new Date(event.startDate).toLocaleDateString('sk-SK')}
                                {#if event.startDate !== event.endDate}
                                    - {new Date(event.endDate).toLocaleDateString('sk-SK')}
                                {/if}
                            </span>
                        </div>
                    </div>
                </div>
            {/each}
        </div>
        <div class="text-xs text-text-3 mt-3 pt-3 border-t border-border-main/30 text-center font-medium bg-background-2 -mx-4 -mb-4 px-4 pb-4 rounded-b">
            Kliknite pre detailné informácie
        </div>
    </div>
{/if}

<!-- Event Details Dialog -->
<Dialog bind:open={showEventDialog}>
    {#snippet header()}
        <div class="flex items-center gap-3">
            <div class="p-2 bg-background-2 rounded">
                <Icon scale="small">
                    <CalendarIcon />
                </Icon>
            </div>
            <div>
                <h3 class="text-lg font-bold text-text-main">Podujatia</h3>
                <p class="text-sm text-text-2">{clickedDate?.toLocaleDateString('sk-SK')}</p>
            </div>
        </div>
    {/snippet}
    {#snippet children()}
        {#if clickedEvents.length > 0}
            <div class="p-6">
                <div class="space-y-4 max-h-96 overflow-y-auto">
                {#each clickedEvents as event}
                    {@const hall = getHallInfo(event.hallId)}
                    <div class="group bg-background-2 border border-border-main/30 rounded p-4 hover:bg-background-4 transition-all duration-200">
                        <div class="flex items-start justify-between gap-4">
                            <div class="flex items-start gap-4 min-w-0 flex-1">
                                <div 
                                    class="w-4 h-4 rounded-full mt-0.5 flex-shrink-0"
                                    style="background-color: {hall?.color || '#3B82F6'}"
                                ></div>
                                <div class="min-w-0 flex-1">
                                    <h4 class="font-bold text-text-main mb-2 text-base leading-tight">
                                        {event.name}
                                    </h4>
                                    {#if hall}
                                        <div class="flex items-center gap-1 text-sm text-text-2 mb-3">
                                            <span>📍</span>
                                            <span class="font-medium">{hall.name}</span>
                                        </div>
                                    {/if}
                                    <div class="flex items-center gap-2 text-sm text-text-3">
                                        <div class="flex items-center gap-1">
                                            <Icon scale="tiny">
                                                <Clock />
                                            </Icon>
                                            <span class="font-medium">
                                                {new Date(event.startDate).toLocaleDateString('sk-SK')}
                                                {#if event.startDate !== event.endDate}
                                                    - {new Date(event.endDate).toLocaleDateString('sk-SK')}
                                                {/if}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <Button 
                                color="secondary" 
                                onclick={() => editEvent(event.id)}
                            >
                                {#snippet children()}
                                    <div class="flex items-center gap-2">
                                        <Icon scale="small">
                                            <Adjustments />
                                        </Icon>
                                        <span class="font-medium">Upraviť</span>
                                    </div>
                                {/snippet}
                            </Button>
                        </div>
                    </div>
                {/each}
                </div>
            </div>
        {/if}
    {/snippet}
</Dialog>
