<script lang="ts">
    import { validateHex } from '$lib/util';
    import { onMount } from 'svelte';
    import { fly, fade } from 'svelte/transition';

    interface Props {
        options?: Array<{ value: string; name: string }>;
        placeholder?: string;
        name?: string;
        value?: string;
        id: string;
        error?: string;
        disabled?: boolean;
        required?: boolean;
    }

    let {
        options = [],
        placeholder = 'Vyberte farbu alebo zadajte HEX kód',
        name = $bindable(''),
        value = $bindable(''),
        id,
        error = '',
        disabled = false,
        required = false
    }: Props = $props();

    let showOptions = $state(false);
    let inputRef: HTMLInputElement;
    let containerRef: HTMLDivElement;
    let selectedIndex = $state(-1);

    // Filter options based on input
    const filteredOptions = $derived(() => {
        if (!name) return options;
        return options.filter((option) => 
            option.name.toLowerCase().includes(name.toLowerCase())
        );
    });

    // Check if current input is valid hex
    const isValidHex = $derived(() => validateHex(name));

    // Get current color for preview
    const currentColor = $derived(() => {
        if (isValidHex()) return name;
        const matchedOption = options.find(opt => opt.name.toLowerCase() === name.toLowerCase());
        return matchedOption?.value || value || '#e5e7eb';
    });

    // Handle outside click
    onMount(() => {
        function handleClickOutside(event: Event) {
            if (containerRef && !containerRef.contains(event.target as Node)) {
                showOptions = false;
                selectedIndex = -1;
            }
        }

        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    });

    function handleFocus() {
        if (!disabled) {
            showOptions = true;
            selectedIndex = -1;
        }
    }

    function handleInput() {
        value = name;
        showOptions = true;
        selectedIndex = -1;
        clearCustomValidity();
    }

    function selectOption(optionName: string, optionValue: string) {
        name = optionName;
        value = optionValue;
        showOptions = false;
        selectedIndex = -1;
        inputRef?.blur();
    }

    function selectCurrentHex() {
        if (isValidHex()) {
            value = name;
            showOptions = false;
            selectedIndex = -1;
            inputRef?.blur();
        }
    }

    function handleKeydown(event: KeyboardEvent) {
        if (disabled) return;

        const availableOptions = isValidHex() ? [{ name, value: name }] : filteredOptions();

        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                if (!showOptions) {
                    showOptions = true;
                } else {
                    selectedIndex = Math.min(selectedIndex + 1, availableOptions.length - 1);
                }
                break;

            case 'ArrowUp':
                event.preventDefault();
                if (showOptions) {
                    selectedIndex = Math.max(selectedIndex - 1, -1);
                }
                break;

            case 'Enter':
                event.preventDefault();
                if (showOptions && selectedIndex >= 0) {
                    const selected = availableOptions[selectedIndex];
                    if (selected) {
                        selectOption(selected.name, selected.value || selected.name);
                    }
                } else if (isValidHex()) {
                    selectCurrentHex();
                }
                break;

            case 'Escape':
                showOptions = false;
                selectedIndex = -1;
                inputRef?.blur();
                break;

            case 'Tab':
                showOptions = false;
                selectedIndex = -1;
                break;
        }
    }

    function clearCustomValidity() {
        inputRef?.setCustomValidity('');
    }

    // Set error state
    $effect(() => {
        if (inputRef && error) {
            inputRef.setCustomValidity(error);
        }
    });
</script>

<div class="relative w-full" bind:this={containerRef}>
    <!-- Color Preview & Input Container -->
    <div class="relative flex items-center">
        <!-- Color Preview -->
        <div 
            class="absolute left-2 top-1/2 transform -translate-y-1/2 w-6 h-6 rounded border-2 border-white shadow-sm z-10 flex-shrink-0 transition-all duration-200"
            style="background-color: {currentColor()};"
            class:opacity-50={disabled}
        ></div>

        <!-- Input Field -->
        <input
            bind:this={inputRef}
            bind:value={name}
            oninput={handleInput}
            onfocus={handleFocus}
            onkeydown={handleKeydown}
            {id}
            name={id}
            type="text"
            {placeholder}
            {disabled}
            {required}
            autocomplete="off"
            class="w-full pl-12 pr-10 py-2.5 text-sm border rounded-lg shadow-sm transition-all duration-200
                {error 
                    ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' 
                    : 'border-border-main/30 focus:border-primary focus:ring-primary/20'
                }
                {disabled 
                    ? 'bg-background-2 text-text-2 cursor-not-allowed' 
                    : 'bg-background-1 text-text-main hover:border-border-main/50'
                }
                focus:outline-none focus:ring-2"
            aria-expanded={showOptions}
            aria-haspopup="listbox"
            aria-autocomplete="list"
            role="combobox"
        />

        <!-- Dropdown Arrow -->
        <div class="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
            <svg 
                class="w-4 h-4 text-text-2 transition-transform duration-200 {showOptions ? 'rotate-180' : ''}"
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
            >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
        </div>
    </div>

    <!-- Hidden input for form submission -->
    <input 
        id="{id}_value" 
        name="{id}_value" 
        bind:value 
        type="hidden" 
    />

    <!-- Error Message -->
    {#if error}
        <p class="mt-1 text-xs text-red-600" transition:fade={{ duration: 200 }}>
            {error}
        </p>
    {/if}

    <!-- Dropdown Options -->
    {#if showOptions && !disabled}
        <div 
            class="absolute left-0 right-0 top-full mt-1 z-50 bg-background-1 border border-border-main/30 rounded-lg shadow-lg max-h-60 overflow-y-auto"
            transition:fly={{ y: -10, duration: 200 }}
            role="listbox"
            aria-label="Color options"
        >
            <!-- Valid Hex Option -->
            {#if isValidHex()}
                <button
                    type="button"
                    onclick={selectCurrentHex}
                    class="flex items-center w-full gap-3 p-3 text-left hover:bg-background-4 focus:bg-background-4 focus:outline-none transition-colors duration-150
                        {selectedIndex === 0 ? 'bg-background-4' : ''}"
                    role="option"
                    aria-selected={selectedIndex === 0}
                >
                    <div 
                        class="w-8 h-8 rounded border-2 border-white shadow-sm flex-shrink-0"
                        style="background-color: {name};"
                    ></div>
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-medium text-text-main truncate">{name}</p>
                        <p class="text-xs text-text-2">Vlastná HEX farba</p>
                    </div>
                    <svg class="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path>
                    </svg>
                </button>
            {:else}
                <!-- Predefined Options -->
                {#each filteredOptions() as option, index}
                    <button
                        type="button"
                        onclick={() => selectOption(option.name, option.value)}
                        class="flex items-center w-full gap-3 p-3 text-left hover:bg-background-4 focus:bg-background-4 focus:outline-none transition-colors duration-150
                            {selectedIndex === index ? 'bg-background-4' : ''}"
                        role="option"
                        aria-selected={selectedIndex === index}
                    >
                        <div 
                            class="w-8 h-8 rounded border-2 border-white shadow-sm flex-shrink-0"
                            style="background-color: {option.value};"
                        ></div>
                        <div class="flex-1 min-w-0">
                            <p class="text-sm font-medium text-text-main truncate">{option.name}</p>
                            <p class="text-xs text-text-2 font-mono">{option.value}</p>
                        </div>
                    </button>
                {:else}
                    <div class="p-4 text-center text-text-2">
                        <p class="text-sm">Žiadne farby sa nenašli</p>
                        <p class="text-xs mt-1">Skúste zadať HEX kód (napr. #3b82f6)</p>
                    </div>
                {/each}
            {/if}
        </div>
    {/if}
</div>
