<script lang="ts">
    import { createEventDispatcher } from 'svelte';

    let {
        name = '',
        id = '',
        type = 'text',
        value = $bindable(''),
        placeholder = '',
        disabled = false,
        readonly = false,
        required = false,
        min,
        max,
        step,
        maxlength,
        minlength,
        pattern,
        autocomplete = undefined,
        error = '',
        class: className = '',
        ...restProps
    }: {
        name?: string;
        id?: string;
        type?: 'text' | 'password' | 'email' | 'number' | 'tel' | 'url' | 'search' | 'date' | 'time' | 'datetime-local' | 'month' | 'week';
        value?: string;
        placeholder?: string;
        disabled?: boolean;
        readonly?: boolean;
        required?: boolean;
        min?: string | number;
        max?: string | number;
        step?: string | number;
        maxlength?: number;
        minlength?: number;
        pattern?: string;
        autocomplete?: AutoFill | null | undefined;
        error?: string;
        class?: string;
        [key: string]: any;
    } = $props();

    const dispatch = createEventDispatcher();

    let inputElement: HTMLInputElement;
    let isFocused = $state(false);

    function handleInput(event: Event) {
        const target = event.target as HTMLInputElement;
        value = target.value;
        
        // Clear custom validation when user starts typing
        if (target.validity.customError) {
            target.setCustomValidity('');
        }
        
        dispatch('input', { value, event });
    }

    function handleChange(event: Event) {
        const target = event.target as HTMLInputElement;
        value = target.value;
        dispatch('change', { value, event });
    }

    function handleFocus(event: FocusEvent) {
        isFocused = true;
        dispatch('focus', { value, event });
    }

    function handleBlur(event: FocusEvent) {
        isFocused = false;
        dispatch('blur', { value, event });
    }

    function handleKeydown(event: KeyboardEvent) {
        dispatch('keydown', { value, event });
    }

    function handleKeyup(event: KeyboardEvent) {
        dispatch('keyup', { value, event });
    }

    // Remove validation when error prop changes
    function removeValidation() {
        if (inputElement) {
            inputElement.setCustomValidity('');
        }
    }

    // Set custom validity when error changes
    $effect(() => {
        if (inputElement && error) {
            inputElement.setCustomValidity(error);
        } else if (inputElement) {
            inputElement.setCustomValidity('');
        }
    });

    // Computed classes
    const inputClasses = $derived(() => {
        const baseClasses = 'w-full p-2 text-sm border rounded shadow-sm transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-offset-0';
        
        const stateClasses = error
            ? 'border-red-400 focus:border-red-500 focus:ring-red-200 bg-red-50 text-text-main'
            : isFocused
            ? 'border-primary focus:border-primary focus:ring-primary/20 bg-background-1 text-text-4'
            : 'border-border-main/50 hover:border-border-main/70 bg-background-1 text-text-2 focus:text-text-4';
        
        const disabledClasses = disabled
            ? 'bg-background-3 text-text-2 cursor-not-allowed border-border-main/20 opacity-60'
            : '';

        const readonlyClasses = readonly
            ? 'bg-background-2 cursor-default'
            : '';

        return `${baseClasses} ${stateClasses} ${disabledClasses} ${readonlyClasses} ${className}`.trim();
    });
</script>

<div class="input-wrapper">
    <input
        bind:this={inputElement}
        {type}
        {name}
        {id}
        {placeholder}
        {disabled}
        {readonly}
        {required}
        {min}
        {max}
        {step}
        {maxlength}
        {minlength}
        {pattern}
        {autocomplete}
        class={inputClasses}
        bind:value
        oninput={handleInput}
        onchange={handleChange}
        onfocus={handleFocus}
        onblur={handleBlur}
        onkeydown={handleKeydown}
        onkeyup={handleKeyup}
        {...restProps}
    />
    
    {#if error}
        <p class="error-message mt-1 text-xs text-red-600" role="alert">
            {error}
        </p>
    {/if}
</div>

<style lang="postcss">
    .input-wrapper {
        @apply w-full;
    }

    input::placeholder {
        @apply text-text-1;
    }

    input:focus {
        @apply ring-2;
    }

    input:disabled {
        @apply opacity-60;
    }

    /* Remove default number input spinners */
    input[type="number"]::-webkit-outer-spin-button,
    input[type="number"]::-webkit-inner-spin-button {
        -webkit-appearance: none;
        margin: 0;
    }

    input[type="number"] {
        -moz-appearance: textfield;
    }

    /* Style date/time inputs */
    input[type="date"]::-webkit-calendar-picker-indicator,
    input[type="time"]::-webkit-calendar-picker-indicator,
    input[type="datetime-local"]::-webkit-calendar-picker-indicator {
        @apply cursor-pointer opacity-60 hover:opacity-100;
    }
</style>
