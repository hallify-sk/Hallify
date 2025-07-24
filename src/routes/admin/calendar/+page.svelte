<script lang="ts">
    import Button from '$lib/components/Button.svelte';
    import NavbarAdmin from '$lib/components/NavbarAdmin.svelte';
    import Dialog from '$lib/components/Dialog.svelte';
    import Switch from '$lib/components/inputs/Switch.svelte';
    import ChevronLeft from '$lib/icons/ChevronLeft.svelte';
    import ChevronRight from '$lib/icons/ChevronRight.svelte';
    import CalendarIcon from '$lib/icons/CalendarIcon.svelte';
    import Clock from '$lib/icons/Clock.svelte';
    import Adjustments from '$lib/icons/Adjustments.svelte';
    import Shield from '$lib/icons/Shield.svelte';
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
    let showItemDialog = $state(false);
    let popupPosition = $state({ x: 0, y: 0 });
    let showEventBlocks = $state(true); // Toggle for event blocks

    const today = Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
    const dayNames = ['Po', 'Ut', 'St', 'Št', 'Pi', 'So', 'Ne'];
    const monthNames = ['Január', 'Február', 'Marec', 'Apríl', 'Máj', 'Jún', 'Júl', 'August', 'September', 'Október', 'November', 'December'];

    // Map day names to indexes
    const dayNameToIndex: Record<string, number> = {
        'pon': 1, 'uto': 2, 'str': 3, 'stv': 4, 'pia': 5, 'sob': 6, 'ned': 0
    };

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

    // Check if a day is blocked by permanent blocks
    function isDayBlockedPermanently(date: Date, hallId?: number): boolean {
        const dayName = date.toLocaleDateString('sk-SK', { weekday: 'short' }).toLowerCase().replace('.', '');
        const normalizedDayName = dayName === 'ne' ? 'ned' : dayName;
        
        return data.eventBlocks.some(block => {
            if (!block.isActive || block.hallId !== hallId) return false;
            
            if (block.blockedDays && block.blockedDays.length > 0) {
                return block.blockedDays.some(day => {
                    const normalizedBlockDay = day.toLowerCase();
                    return normalizedBlockDay === normalizedDayName;
                });
            }
            return false;
        });
    }

    // Check if a day is blocked by event blocks
    function isDayBlockedByEventBlocks(date: Date, hallId?: number): boolean {
        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        
        return data.eventBlocks.some(block => {
            if (!block.isActive || block.hallId !== hallId || !block.startDate || !block.endDate) return false;
            
            const blockStart = new Date(block.startDate);
            const blockEnd = new Date(block.endDate);
            const checkDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
            const blockStartDate = new Date(blockStart.getFullYear(), blockStart.getMonth(), blockStart.getDate());
            const blockEndDate = new Date(blockEnd.getFullYear(), blockEnd.getMonth(), blockEnd.getDate());
            
            return checkDate >= blockStartDate && checkDate <= blockEndDate;
        });
    }

    // Get event blocks for a specific date
    function getEventBlocksForDate(date: Date): typeof data.eventBlocks {
        if (!showEventBlocks) return [];
        
        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        const dayName = date.toLocaleDateString('sk-SK', { weekday: 'short' }).toLowerCase().replace('.', '');
        const normalizedDayName = dayName === 'ne' ? 'ned' : dayName;
        
        return data.eventBlocks.filter(block => {
            if (!block.isActive) return false;
            
            // Check permanent blocks (by day of week)
            if (block.blockedDays && block.blockedDays.length > 0) {
                const hasMatchingDay = block.blockedDays.some(day => {
                    const normalizedBlockDay = day.toLowerCase();
                    return normalizedBlockDay === normalizedDayName;
                });
                if (hasMatchingDay) return true;
            }
            
            // Check date range blocks
            if (block.startDate && block.endDate) {
                const blockStart = new Date(block.startDate);
                const blockEnd = new Date(block.endDate);
                const checkDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
                const blockStartDate = new Date(blockStart.getFullYear(), blockStart.getMonth(), blockStart.getDate());
                const blockEndDate = new Date(blockEnd.getFullYear(), blockEnd.getMonth(), blockEnd.getDate());
                
                return checkDate >= blockStartDate && checkDate <= blockEndDate;
            }
            
            return false;
        });
    }

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

    // Get all items (events + blocks) for a date
    function getAllItemsForDate(date: Date) {
        const events = getEventsForDate(date);
        const blocks = getEventBlocksForDate(date);
        return { events, blocks };
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
        const { events, blocks } = getAllItemsForDate(date);
        if (events.length > 0 || blocks.length > 0) {
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
        const { events, blocks } = getAllItemsForDate(date);
        const isCurrentMonth = date.getMonth() === currentMonth;
        
        // If clicking on a day from previous/next month, navigate to that month
        if (!isCurrentMonth) {
            currentYear = date.getFullYear();
            currentMonth = date.getMonth();
            return;
        }
        
        // If clicking on current month day with items, show dialog
        if (events.length > 0 || blocks.length > 0) {
            clickedDate = date;
            showItemDialog = true;
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
    const hoveredItems = $derived(hoveredDate ? getAllItemsForDate(hoveredDate) : { events: [], blocks: [] });
    const clickedItems = $derived(clickedDate ? getAllItemsForDate(clickedDate) : { events: [], blocks: [] });
</script>

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
                    <p class="uppercase text-[0.65rem] text-text-1 mb-1">Admin kalendár</p>
                    <h1 class="text-2xl font-bold text-text-main">Správa kalendára</h1>
                    <p class="text-text-2 mt-1">Prehľad podujatí a blokovania termínov</p>
                </div>
            </div>
            
            <div class="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <!-- Event Blocks Toggle -->
                <div class="flex items-center gap-3 bg-background-1 rounded border border-border-main/30 px-3 py-2">
                    <Icon scale="small">
                        <Shield />
                    </Icon>
                    <span class="text-sm font-medium text-text-main">Blokovanie termínov</span>
                    <Switch id="event-blocks-toggle" name="eventBlocks" bind:checked={showEventBlocks} />
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
                    {@const blocks = getEventBlocksForDate(date)}
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
                            {#if events.length > 0 || blocks.length > 0}
                                <div class="flex gap-1">
                                    <!-- Event indicators -->
                                    {#each events.slice(0, 3) as event}
                                        {@const hall = getHallInfo(event.hallId)}
                                        <div 
                                            class="w-2 h-2 rounded-full transition-transform duration-200 group-hover:scale-110 {!isCurrentMonth ? 'opacity-60' : ''}"
                                            style="background-color: {hall?.color || '#3B82F6'}"
                                        ></div>
                                    {/each}
                                    <!-- Block indicators -->
                                    {#if showEventBlocks}
                                        {#each blocks.slice(0, Math.max(0, 3 - events.length)) as block}
                                            {@const hall = getHallInfo(block.hallId)}
                                            <div 
                                                class="w-2 h-2 rounded-full border border-white/60 transition-transform duration-200 group-hover:scale-110 {!isCurrentMonth ? 'opacity-60' : ''}"
                                                style="background-color: {hall?.color || '#EF4444'}"
                                            ></div>
                                        {/each}
                                    {/if}
                                    {#if events.length + (showEventBlocks ? blocks.length : 0) > 3}
                                        <span class="text-xs text-text-3 font-medium bg-background-2 px-1 py-0.5 rounded text-[10px] {!isCurrentMonth ? 'opacity-60' : ''}">+{events.length + (showEventBlocks ? blocks.length : 0) - 3}</span>
                                    {/if}
                                </div>
                            {/if}
                        </div>
                        
                        <!-- Item previews -->
                        <div class="space-y-1">
                            <!-- Events -->
                            {#each events.slice(0, 1) as event}
                                {@const hall = getHallInfo(event.hallId)}
                                <div 
                                    class="text-xs px-2 py-1 rounded text-white truncate transition-all duration-200 group-hover:scale-[1.01] font-medium {!isCurrentMonth ? 'opacity-60' : ''}"
                                    style="background-color: {hall?.color || '#3B82F6'}"
                                >
                                    {event.name}
                                </div>
                            {/each}
                            <!-- Blocks -->
                            {#if showEventBlocks && events.length === 0}
                                {#each blocks.slice(0, 1) as block}
                                    {@const hall = getHallInfo(block.hallId)}
                                    <div 
                                        class="text-xs px-2 py-1 rounded text-white truncate transition-all duration-200 group-hover:scale-[1.01] font-medium border border-white/30 {!isCurrentMonth ? 'opacity-60' : ''}"
                                        style="background-color: {hall?.color || '#EF4444'}; opacity: 0.9;"
                                    >
                                        🛡️ {block.reason}
                                    </div>
                                {/each}
                            {/if}
                            {#if events.length + (showEventBlocks ? blocks.length : 0) > 1}
                                <div class="text-xs text-text-3 font-medium pl-2 bg-background-2/80 py-0.5 rounded text-[10px] {!isCurrentMonth ? 'opacity-60' : ''}">
                                    +{events.length + (showEventBlocks ? blocks.length : 0) - 1} ďalších
                                </div>
                            {/if}
                        </div>
                        
                        <!-- Hover indicator for days with items -->
                        {#if events.length > 0 || blocks.length > 0}
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
                onclick={() => goto('/admin/events/new')}
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
{#if hoveredDate && (hoveredItems.events.length > 0 || hoveredItems.blocks.length > 0)}
    <div 
        class="fixed z-50 bg-background-1 border border-border-main/30 rounded shadow-lg p-4 max-w-sm pointer-events-none"
        style="left: {popupPosition.x}px; top: {popupPosition.y}px; transform: translateX(-50%) translateY(-100%);"
        transition:fade={{ duration: 250 }}
    >
        <div class="space-y-3">
            <!-- Events -->
            {#each hoveredItems.events as event}
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
            
            <!-- Blocks -->
            {#if showEventBlocks}
                {#each hoveredItems.blocks as block}
                    {@const hall = getHallInfo(block.hallId)}
                    <div class="flex items-start gap-3">
                        <div class="flex items-center justify-center w-3 h-3 mt-1 flex-shrink-0">
                            <Icon scale="tiny" fill="white">
                                <Shield />
                            </Icon>
                            <div 
                                class="absolute w-3 h-3 rounded-full -z-10"
                                style="background-color: {hall?.color || '#EF4444'}"
                            ></div>
                        </div>
                        <div class="min-w-0 flex-1">
                            <div class="font-semibold text-text-main text-sm leading-tight mb-1">
                                {block.reason}
                            </div>
                            {#if hall}
                                <div class="flex items-center gap-1 text-xs text-text-2 mb-2">
                                    <span>📍</span>
                                    <span class="font-medium">{hall.name}</span>
                                </div>
                            {/if}
                            <div class="text-xs text-text-3">
                                🛡️ Blokovanie termínu
                            </div>
                        </div>
                    </div>
                {/each}
            {/if}
        </div>
        <div class="text-xs text-text-3 mt-3 pt-3 border-t border-border-main/30 text-center font-medium bg-background-2 -mx-4 -mb-4 px-4 pb-4 rounded-b">
            Kliknite pre detailné informácie
        </div>
    </div>
{/if}

<!-- Item Details Dialog -->
<Dialog bind:open={showItemDialog}>
    {#snippet header()}
        <div class="flex items-center gap-3">
            <div class="p-2 bg-background-2 rounded">
                <Icon scale="small">
                    <CalendarIcon />
                </Icon>
            </div>
            <div>
                <h3 class="text-lg font-bold text-text-main">Podujatia a bloky</h3>
                <p class="text-sm text-text-2">{clickedDate?.toLocaleDateString('sk-SK')}</p>
            </div>
        </div>
    {/snippet}
    {#snippet children()}
    {#if clickedItems.events.length > 0 || clickedItems.blocks.length > 0}
        <div class="p-6">
            <div class="space-y-6 max-h-96 overflow-y-auto">
                <!-- Events -->
                {#if clickedItems.events.length > 0}
                    <div>
                        <h4 class="font-semibold text-text-main mb-3 flex items-center gap-2">
                            <Icon scale="small">
                                <CalendarIcon />
                            </Icon>
                            <span>Podujatia</span>
                        </h4>
                        <div class="space-y-3">
                            {#each clickedItems.events as event}
                                {@const hall = getHallInfo(event.hallId)}
                                <div class="group bg-background-2 border border-border-main/30 rounded p-4 hover:bg-background-4 transition-all duration-200">
                                    <div class="flex items-start justify-between gap-4">
                                        <div class="flex items-start gap-3 min-w-0 flex-1">
                                            <div 
                                                class="w-4 h-4 rounded-full mt-0.5 flex-shrink-0"
                                                style="background-color: {hall?.color || '#3B82F6'}"
                                            ></div>
                                            <div class="min-w-0 flex-1">
                                                <h5 class="font-bold text-text-main mb-2 text-base leading-tight">
                                                    {event.name}
                                                </h5>
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

                <!-- Blocks -->
                {#if showEventBlocks && clickedItems.blocks.length > 0}
                    <div>
                        <h4 class="font-semibold text-text-main mb-3 flex items-center gap-2">
                            <Icon scale="small">
                                <Shield />
                            </Icon>
                            <span>Blokovanie termínov</span>
                        </h4>
                        <div class="space-y-3">
                            {#each clickedItems.blocks as block}
                                {@const hall = getHallInfo(block.hallId)}
                                <div class="bg-background-2 border border-border-main/30 rounded p-4 bg-red-50/50 border-red-200/60">
                                    <div class="flex items-start gap-3">
                                        <div class="flex items-center justify-center w-4 h-4 mt-0.5 flex-shrink-0">
                                            <Icon scale="tiny" fill="white">
                                                <Shield />
                                            </Icon>
                                            <div 
                                                class="absolute w-4 h-4 rounded-full -z-10"
                                                style="background-color: {hall?.color || '#EF4444'}"
                                            ></div>
                                        </div>
                                        <div class="min-w-0 flex-1">
                                            <h5 class="font-bold text-text-main mb-2 text-base leading-tight">
                                                {block.reason}
                                            </h5>
                                            {#if hall}
                                                <div class="flex items-center gap-1 text-sm text-text-2 mb-3">
                                                    <span>📍</span>
                                                    <span class="font-medium">{hall.name}</span>
                                                </div>
                                            {/if}
                                            <div class="text-sm text-red-600 font-medium">
                                                {#if block.startDate && block.endDate}
                                                    📅 Rozsah: {new Date(block.startDate).toLocaleDateString('sk-SK')} - {new Date(block.endDate).toLocaleDateString('sk-SK')}
                                                {:else if block.blockedDays && block.blockedDays.length > 0}
                                                    🗓️ Dni: {block.blockedDays.join(', ')}
                                                {/if}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    </div>
                {/if}
            </div>
        </div>
    {/if}
    {/snippet}
</Dialog>
