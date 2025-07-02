<script lang="ts">
    // filepath: c:\Users\marci\Documents\GitHub\Hallify\src\lib\components\Calendar.svelte
    //Icons
    import Calendar from '$lib/icons/CalendarIcon.svelte';
    import Icon from '$lib/icons/Icon.svelte';
    import Minus from '$lib/icons/Minus.svelte';
    import Plus from '$lib/icons/Plus.svelte';
    import X from '$lib/icons/Cross.svelte';
    import Shield from '$lib/icons/Shield.svelte';
    import Clock from '$lib/icons/Clock.svelte';

    //Components
    import Dialog from '$lib/components/Dialog.svelte';
    import Button from '$lib/components/Button.svelte';

    //Libraries
    import { CalendarOfMonth, type Month } from '@onsetsoftware/headless-calendar';

    //Utils
    import { zoom } from '$lib/transitions/zoom';
    import { fade, fly } from 'svelte/transition';

    // Props
    let {
        eventBlocks = [],
        permanentBlocks = [],
        selectedHallId = null,
        halls = []
    }: {
        eventBlocks?: Array<{
            id: number;
            hallId: number;
            startDate: string;
            endDate: string;
            reason: string;
            blockedDays: string[];
            isActive: boolean;
        }>;
        permanentBlocks?: Array<{
            id: number;
            hallId: number;
            reason: string;
            blockedDays: string[];
            isActive: boolean;
        }>;
        selectedHallId?: number | null;
        halls?: Array<{
            id: number;
            name: string;
            color: string;
        }>;
    } = $props();

    let selectedDate = $state(new Date());
    let currentYear = $state(selectedDate.getFullYear());
    let currentMonth = $state(selectedDate.getMonth());
    let selectingDay = $state(true);
    let hoveredDate: Date | null = $state(null);
    let popupPosition = $state({ x: 0, y: 0 });
    let showBlocksDialog = $state(false);
    let clickedDate: Date | null = $state(null);

    const today = Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
    const dayNames = ['Po', 'Ut', 'St', 'Št', 'Pi', 'So', 'Ne'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Máj', 'Jún', 'Júl', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];

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
        const prevDays = [...prev].filter(day => 
            day.value.weekAxisIndex === Math.max(...[...prev].map(d => d.value.weekAxisIndex))
        ).slice(1);
        
        const totalDaysInGrid = 42;
        const nextDaysCount = totalDaysInGrid - [...current].length - prevDays.length;
        const nextDays = [...next].slice(0, Math.max(0, nextDaysCount));

        return { prevDays, currentDays: [...current], nextDays };
    });

    // Get blocked halls for a specific date (temporary blocks)
    function getBlockedHallsForDate(date: Date): Array<{
        hallId: number;
        hallName: string;
        hallColor: string;
        reason: string;
        blockId: number;
        startDate: string;
        endDate: string;
        type: 'temporary';
    }> {
        const dayOfWeek = date.getDay();
        const dayNames = ['ned', 'pon', 'uto', 'str', 'stv', 'pia', 'sob'];
        const dayName = dayNames[dayOfWeek];
        
        const blockedHalls: Array<{
            hallId: number;
            hallName: string;
            hallColor: string;
            reason: string;
            blockId: number;
            startDate: string;
            endDate: string;
            type: 'temporary';
        }> = [];

        for (const block of eventBlocks) {
            if (!block.isActive) continue;

            const blockStart = new Date(block.startDate);
            const blockEnd = new Date(block.endDate);
            
            // Check if date is within the blocked date range
            if (date >= blockStart && date <= blockEnd) {
                // Check if this day of week is blocked
                if (block.blockedDays.includes(dayName)) {
                    const hall = halls.find(h => h.id === block.hallId);
                    if (hall) {
                        blockedHalls.push({
                            hallId: block.hallId,
                            hallName: hall.name,
                            hallColor: hall.color,
                            reason: block.reason,
                            blockId: block.id,
                            startDate: block.startDate,
                            endDate: block.endDate,
                            type: 'temporary'
                        });
                    }
                }
            }
        }
        
        return blockedHalls;
    }

    // Get permanently blocked halls for a specific date
    function getPermanentlyBlockedHallsForDate(date: Date): Array<{
        hallId: number;
        hallName: string;
        hallColor: string;
        reason: string;
        blockId: number;
        type: 'permanent';
    }> {
        const dayOfWeek = date.getDay();
        const dayNames = ['ned', 'pon', 'uto', 'str', 'stv', 'pia', 'sob'];
        const dayName = dayNames[dayOfWeek];
        
        const blockedHalls: Array<{
            hallId: number;
            hallName: string;
            hallColor: string;
            reason: string;
            blockId: number;
            type: 'permanent';
        }> = [];

        for (const block of permanentBlocks) {
            if (!block.isActive) continue;

            // Check if this day of week is permanently blocked
            if (block.blockedDays.includes(dayName)) {
                const hall = halls.find(h => h.id === block.hallId);
                if (hall) {
                    blockedHalls.push({
                        hallId: block.hallId,
                        hallName: hall.name,
                        hallColor: hall.color,
                        reason: block.reason,
                        blockId: block.id,
                        type: 'permanent'
                    });
                }
            }
        }
        
        return blockedHalls;
    }

    // Get all blocked halls for a specific date (both temporary and permanent)
    function getAllBlockedHallsForDate(date: Date) {
        const temporary = getBlockedHallsForDate(date);
        const permanent = getPermanentlyBlockedHallsForDate(date);
        return { temporary, permanent };
    }

    // Check if date has any blocked halls
    function hasBlockedHalls(date: Date): boolean {
        const { temporary, permanent } = getAllBlockedHallsForDate(date);
        return temporary.length > 0 || permanent.length > 0;
    }

    // Check if specific hall is blocked on date (for filtering)
    function isHallBlocked(date: Date, hallId: number): boolean {
        const { temporary, permanent } = getAllBlockedHallsForDate(date);
        return [...temporary, ...permanent].some(blocked => blocked.hallId === hallId);
    }

    function updateCalendar() {
        currentYear = selectedDate.getFullYear();
        currentMonth = selectedDate.getMonth();
    }

    function navigate(direction: 'prev' | 'next') {
        if (selectingDay) {
            selectedDate.setMonth(currentMonth + (direction === 'next' ? 1 : -1));
        } else {
            selectedDate.setFullYear(currentYear + (direction === 'next' ? 1 : -1));
        }
        updateCalendar();
    }

    function getDayClasses(day: any, type: 'prev' | 'current' | 'next') {
        const dayDate = day.value.date.toJSDate();
        const isToday = today === dayDate.getTime();
        const isSunday = day.value.dayAxisIndex % 7 === 0;
        const isFiltered = selectedHallId && isHallBlocked(dayDate, selectedHallId);
        
        const baseClasses = `calendarButton col-start-${day.value.dayAxisIndex} w-full aspect-square rounded duration-150 text-sm relative`;
        
        // Add indicator for filtered hall only (no general background indicators)
        let indicatorClasses = '';
        if (selectedHallId && isFiltered) {
            // Only show ring indicator when specific hall is blocked and filtered
            indicatorClasses = 'ring-2 ring-red-400 bg-red-50';
        }
        
        if (type === 'current') {
            return `${baseClasses} hover:bg-background-2 ${indicatorClasses} ${
                isToday ? 'text-primary bg-primary-1/30' : 
                isSunday ? 'text-calendar-sunday-main' : 'text-text-main'
            }`;
        }
        
        const opacity = type === 'prev' ? 'hover:bg-background-2/30' : 'hover:bg-background-2';
        return `${baseClasses} ${opacity} ${indicatorClasses} ${
            isToday ? 'text-primary bg-primary-1/15' : 
            isSunday ? 'text-calendar-sunday-1' : 'text-text-1'
        }`;
    }

    function getMonthClasses(monthIndex: number) {
        const isCurrentMonth = monthIndex === new Date().getMonth() && currentYear === new Date().getFullYear();
        const isSelectedMonth = currentMonth === monthIndex;
        
        return `calendarButton w-full aspect-square rounded hover:bg-background-4 duration-150 text-sm h-full ${
            isCurrentMonth ? 'text-primary bg-primary-1/30' :
            isSelectedMonth ? 'text-secondary bg-secondary-1/30' : 'text-text-main'
        }`;
    }

    function handleDayClick(day: any) {
        const dayDate = day.value.date.toJSDate();
        const { temporary, permanent } = getAllBlockedHallsForDate(dayDate);
        
        if (temporary.length > 0 || permanent.length > 0) {
            clickedDate = dayDate;
            showBlocksDialog = true;
        }
    }

    function handleDayHover(event: MouseEvent, day: any) {
        const dayDate = day.value.date.toJSDate();
        const { temporary, permanent } = getAllBlockedHallsForDate(dayDate);
        
        if (temporary.length > 0 || permanent.length > 0) {
            hoveredDate = dayDate;
            const rect = (event.target as HTMLElement).getBoundingClientRect();
            popupPosition = {
                x: rect.left + rect.width / 2,
                y: rect.top - 10
            };
        }
    }

    function handleDayLeave() {
        hoveredDate = null;
    }

    function selectMonth(monthIndex: number) {
        selectedDate.setMonth(monthIndex);
        updateCalendar();
        selectingDay = true;
    }

    // Get popup data for hovered date
    const popupData = $derived(() => {
        if (!hoveredDate) return null;
        return getAllBlockedHallsForDate(hoveredDate);
    });

    // Get dialog data for clicked date
    const dialogData = $derived(() => {
        if (!clickedDate) return null;
        return getAllBlockedHallsForDate(clickedDate);
    });
</script>

<div class="flex flex-col h-full relative">
    <!-- Header Controls -->
    <div class="flex flex-row w-full gap-1 p-1 border-b border-border-main/30 bg-background-2">
        <button
            onclick={() => selectingDay = !selectingDay}
            class="flex items-center w-full gap-2 px-2 py-2 text-sm duration-150 border rounded border-border-main/30 bg-background-1 hover:bg-background-4 text-text-2"
        >
            <Icon scale="small"><Calendar /></Icon>
            {selectingDay 
                ? `${new Date(currentYear, currentMonth, 1).toLocaleString('sk', { month: 'long' })} ${currentYear}`
                : currentYear
            }
        </button>
        
        <button
            onclick={() => navigate('prev')}
            class="flex items-center w-10 gap-2 px-2 py-2 duration-150 border rounded aspect-square border-border-main/30 bg-background-1 hover:bg-background-4 text-text-2"
        >
            <Icon scale="small"><Minus /></Icon>
        </button>
        
        <button
            onclick={() => navigate('next')}
            class="flex items-center w-10 gap-2 px-2 py-2 duration-150 border rounded aspect-square border-border-main/30 bg-background-1 hover:bg-background-4 text-text-2"
        >
            <Icon scale="small"><Plus /></Icon>
        </button>
    </div>

    <!-- Calendar Content -->
    <div class="grid h-full place-items-center">
        {#if selectingDay}
            <div
                class="flex flex-col w-full h-full"
                in:zoom={{ delay: 200, duration: 200, scale: 0.8 }}
                out:zoom={{ duration: 200, scale: 0.8 }}
            >
                <!-- Day Headers -->
                <div class="grid h-full grid-cols-7 p-1 border-b bg-background-2 place-items-center border-border-main/30">
                    {#each dayNames as day}
                        <p class="text-text-1 text-[0.65rem] uppercase">{day}</p>
                    {/each}
                </div>

                <!-- Calendar Grid -->
                {#key calendarData.current}
                    <div class="grid w-full h-full grid-cols-7 grid-rows-6 gap-1 px-1 pb-1 mt-1 place-items-center">
                        <!-- Previous Month Days -->
                        {#each calendarDays().prevDays as day}
                            <button 
                                class={getDayClasses(day, 'prev')}
                                onmouseenter={(e) => handleDayHover(e, day)}
                                onmouseleave={handleDayLeave}
                                onclick={() => handleDayClick(day)}
                            >
                                {day.value.dayNumber}
                                <!-- Block indicator dots -->
                                {#if hasBlockedHalls(day.value.date.toJSDate())}
                                    {@const { temporary, permanent } = getAllBlockedHallsForDate(day.value.date.toJSDate())}
                                    <div class="absolute top-1 right-1 flex gap-0.5">
                                        {#if temporary.length > 0}
                                            <div class="w-1.5 h-1.5 bg-orange-400 rounded-full"></div>
                                        {/if}
                                        {#if permanent.length > 0}
                                            <div class="w-1.5 h-1.5 bg-red-500 rounded-full"></div>
                                        {/if}
                                    </div>
                                {/if}
                            </button>
                        {/each}

                        <!-- Current Month Days -->
                        {#each calendarDays().currentDays as day}
                            <button 
                                onclick={() => handleDayClick(day)} 
                                class={getDayClasses(day, 'current')}
                                onmouseenter={(e) => handleDayHover(e, day)}
                                onmouseleave={handleDayLeave}
                            >
                                {day.value.dayNumber}
                                <!-- Block indicator dots -->
                                {#if hasBlockedHalls(day.value.date.toJSDate())}
                                    {@const { temporary, permanent } = getAllBlockedHallsForDate(day.value.date.toJSDate())}
                                    <div class="absolute top-1 right-1 flex gap-0.5">
                                        {#if temporary.length > 0}
                                            <div class="w-1.5 h-1.5 bg-orange-400 rounded-full"></div>
                                        {/if}
                                        {#if permanent.length > 0}
                                            <div class="w-1.5 h-1.5 bg-red-500 rounded-full"></div>
                                        {/if}
                                    </div>
                                {/if}
                            </button>
                        {/each}

                        <!-- Next Month Days -->
                        {#each calendarDays().nextDays as day}
                            <button 
                                class={getDayClasses(day, 'next')}
                                onmouseenter={(e) => handleDayHover(e, day)}
                                onmouseleave={handleDayLeave}
                                onclick={() => handleDayClick(day)}
                            >
                                {day.value.dayNumber}
                                <!-- Block indicator dots -->
                                {#if hasBlockedHalls(day.value.date.toJSDate())}
                                    {@const { temporary, permanent } = getAllBlockedHallsForDate(day.value.date.toJSDate())}
                                    <div class="absolute top-1 right-1 flex gap-0.5">
                                        {#if temporary.length > 0}
                                            <div class="w-1.5 h-1.5 bg-orange-400 rounded-full"></div>
                                        {/if}
                                        {#if permanent.length > 0}
                                            <div class="w-1.5 h-1.5 bg-red-500 rounded-full"></div>
                                        {/if}
                                    </div>
                                {/if}
                            </button>
                        {/each}
                    </div>
                {/key}
            </div>
        {:else}
            <!-- Month Selection -->
            <div
                class="grid w-full h-full grid-cols-4 grid-rows-3 gap-1 p-1"
                in:zoom={{ delay: 200, duration: 200, scale: 0.8 }}
                out:zoom={{ duration: 200, scale: 0.8 }}
            >
                {#each monthNames as month, i}
                    <button onclick={() => selectMonth(i)} class={getMonthClasses(i)}>
                        {month}
                    </button>
                {/each}
            </div>
        {/if}
    </div>

    <!-- Hover Popup for Blocked Halls -->
    {#if hoveredDate && popupData() && (popupData().temporary.length > 0 || popupData().permanent.length > 0)}
        <div 
            class="fixed z-50 pointer-events-none"
            style="left: {popupPosition.x}px; top: {popupPosition.y}px; transform: translateX(-50%) translateY(-100%);"
            transition:fade={{ duration: 200 }}
        >
            <div class="bg-white border border-border-main/30 rounded-lg shadow-lg p-3 max-w-xs">
                <!-- Popup Arrow -->
                <div class="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-white"></div>
                
                <!-- Popup Header -->
                <div class="mb-2">
                    <p class="text-sm font-medium text-text-main">
                        {hoveredDate.toLocaleDateString('sk', { 
                            weekday: 'long',
                            day: 'numeric', 
                            month: 'long' 
                        })}
                    </p>
                    <p class="text-xs text-text-2">
                        Blokované sály ({popupData().temporary.length + popupData().permanent.length})
                    </p>
                </div>

                <!-- Quick Preview -->
                <div class="space-y-1">
                    {#if popupData().temporary.length > 0}
                        <div class="flex items-center gap-1 text-xs text-orange-600">
                            <div class="w-2 h-2 bg-orange-400 rounded-full"></div>
                            <span>{popupData().temporary.length} dočasne</span>
                        </div>
                    {/if}
                    {#if popupData().permanent.length > 0}
                        <div class="flex items-center gap-1 text-xs text-red-600">
                            <div class="w-2 h-2 bg-red-500 rounded-full"></div>
                            <span>{popupData().permanent.length} trvale</span>
                        </div>
                    {/if}
                </div>

                <p class="text-xs text-text-2 mt-2">Kliknite pre detaily</p>
            </div>
        </div>
    {/if}
</div>

<!-- Blocked Halls Detail Dialog -->
<Dialog bind:open={showBlocksDialog}>
    {#snippet header()}
        <div class="flex items-center gap-2">
            <Icon scale="small">
                <Shield />
            </Icon>
            <p class="text-text-main">Blokované sály</p>
        </div>
    {/snippet}
    
    {#if clickedDate && dialogData()}
        <div class="flex flex-col max-w-2xl w-full">
            <!-- Header -->
            <div class="p-6 border-b border-border-main/30">
                <div class="space-y-2">
                    <h2 class="text-xl font-semibold text-text-main">
                        {clickedDate.toLocaleDateString('sk', { 
                            weekday: 'long',
                            day: 'numeric', 
                            month: 'long',
                            year: 'numeric'
                        })}
                    </h2>
                    <p class="text-text-2">
                        Celkom blokovaných sál: {dialogData().temporary.length + dialogData().permanent.length}
                    </p>
                </div>
            </div>

            <!-- Content -->
            <div class="p-6 space-y-6 max-h-96 overflow-y-auto">
                <!-- Temporary Blocks Section -->
                {#if dialogData().temporary.length > 0}
                    <div class="space-y-4">
                        <div class="flex items-center gap-2">
                            <div class="w-3 h-3 bg-orange-400 rounded-full"></div>
                            <h3 class="text-lg font-medium text-text-main">Dočasné blokovania</h3>
                            <span class="px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded-full">
                                {dialogData().temporary.length}
                            </span>
                        </div>
                        
                        <div class="space-y-3">
                            {#each dialogData().temporary as block}
                                <div class="p-4 border border-orange-200 bg-orange-50 rounded-lg">
                                    <div class="flex items-start justify-between gap-4">
                                        <div class="flex items-center gap-3 flex-1">
                                            <!-- Hall color indicator -->
                                            <div 
                                                class="w-4 h-4 rounded-full border-2 border-white shadow-sm flex-shrink-0"
                                                style="background-color: {block.hallColor};"
                                            ></div>
                                            
                                            <div class="flex-1">
                                                <h4 class="font-medium text-text-main">{block.hallName}</h4>
                                                <p class="text-sm text-text-2 mt-1">{block.reason}</p>
                                            </div>
                                        </div>
                                        
                                        <div class="text-right flex-shrink-0">
                                            <div class="flex items-center gap-1 text-xs text-orange-700 mb-1">
                                                <Icon scale="tiny">
                                                    <Clock />
                                                </Icon>
                                                <span>Dočasné</span>
                                            </div>
                                            <p class="text-xs text-text-2">
                                                {new Date(block.startDate).toLocaleDateString('sk')} - 
                                                {new Date(block.endDate).toLocaleDateString('sk')}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    </div>
                {/if}

                <!-- Permanent Blocks Section -->
                {#if dialogData().permanent.length > 0}
                    <div class="space-y-4">
                        <div class="flex items-center gap-2">
                            <div class="w-3 h-3 bg-red-500 rounded-full"></div>
                            <h3 class="text-lg font-medium text-text-main">Trvalé blokovania</h3>
                            <span class="px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full">
                                {dialogData().permanent.length}
                            </span>
                        </div>
                        
                        <div class="space-y-3">
                            {#each dialogData().permanent as block}
                                <div class="p-4 border border-red-200 bg-red-50 rounded-lg">
                                    <div class="flex items-start justify-between gap-4">
                                        <div class="flex items-center gap-3 flex-1">
                                            <!-- Hall color indicator -->
                                            <div 
                                                class="w-4 h-4 rounded-full border-2 border-white shadow-sm flex-shrink-0"
                                                style="background-color: {block.hallColor};"
                                            ></div>
                                            
                                            <div class="flex-1">
                                                <h4 class="font-medium text-text-main">{block.hallName}</h4>
                                                <p class="text-sm text-text-2 mt-1">{block.reason}</p>
                                            </div>
                                        </div>
                                        
                                        <div class="text-right flex-shrink-0">
                                            <div class="flex items-center gap-1 text-xs text-red-700 mb-1">
                                                <Icon scale="tiny">
                                                    <Shield />
                                                </Icon>
                                                <span>Trvalé</span>
                                            </div>
                                            <p class="text-xs text-text-2">
                                                Každý týždeň
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    </div>
                {/if}

                <!-- Hall Filter Status -->
                {#if selectedHallId}
                    {@const selectedHall = halls.find(h => h.id === selectedHallId)}
                    {@const isSelectedBlocked = [...dialogData().temporary, ...dialogData().permanent].some(b => b.hallId === selectedHallId)}
                    {#if selectedHall}
                        <div class="p-4 border border-border-main/30 bg-background-2 rounded-lg">
                            <div class="flex items-center gap-3">
                                <div 
                                    class="w-4 h-4 rounded-full border-2 border-white shadow-sm"
                                    style="background-color: {selectedHall.color};"
                                ></div>
                                <div class="flex-1">
                                    <p class="font-medium text-text-main">Filtrácia: {selectedHall.name}</p>
                                    <p class="text-sm {isSelectedBlocked ? 'text-red-600' : 'text-green-600'}">
                                        {#if isSelectedBlocked}
                                            ⚠️ Táto sála je blokovaná na vybraný dátum
                                        {:else}
                                            ✅ Táto sála je dostupná na vybraný dátum
                                        {/if}
                                    </p>
                                </div>
                            </div>
                        </div>
                    {/if}
                {/if}

                <!-- Empty State -->
                {#if dialogData().temporary.length === 0 && dialogData().permanent.length === 0}
                    <div class="text-center py-8">
                        <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg class="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <h3 class="text-lg font-medium text-text-main mb-2">Žiadne blokovania</h3>
                        <p class="text-text-2">Na tento dátum nie sú blokované žiadne sály.</p>
                    </div>
                {/if}
            </div>

            <!-- Footer -->
            <div class="p-4 border-t border-border-main/30 bg-background-2">
                <div class="flex justify-end">
                    <Button 
                        color="transparent" 
                        onclick={() => showBlocksDialog = false}
                    >
                        Zavrieť
                    </Button>
                </div>
            </div>
        </div>
    {/if}
</Dialog>

<style lang="postcss">
    .calendarButton {
        @apply no-underline;
    }
</style>
