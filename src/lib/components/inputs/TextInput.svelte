<script lang="ts">
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
        error = undefined,
        class: className = '',
        oninput,
        onchange,
        onfocus,
        onblur,
        onkeydown,
        onkeyup,
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
        oninput?: (event: Event & { currentTarget: EventTarget & HTMLInputElement }) => void;
        onchange?: (event: Event & { currentTarget: EventTarget & HTMLInputElement }) => void;
        onfocus?: (event: FocusEvent & { currentTarget: EventTarget & HTMLInputElement }) => void;
        onblur?: (event: FocusEvent & { currentTarget: EventTarget & HTMLInputElement }) => void;
        onkeydown?: (event: KeyboardEvent & { currentTarget: EventTarget & HTMLInputElement }) => void;
        onkeyup?: (event: KeyboardEvent & { currentTarget: EventTarget & HTMLInputElement }) => void;
        [key: string]: any;
    } = $props();

    let inputElement: HTMLInputElement;
    let isFocused = $state(false);

    function handleInput(event: Event) {
        const target = event.target as HTMLInputElement;
        value = target.value;
        
        // Clear custom validation when user starts typing
        if (target.validity.customError) {
            target.setCustomValidity('');
        }
        
        oninput?.(event as Event & { currentTarget: EventTarget & HTMLInputElement });
    }

    function handleChange(event: Event) {
        const target = event.target as HTMLInputElement;
        value = target.value;
        onchange?.(event as Event & { currentTarget: EventTarget & HTMLInputElement });
    }

    function handleFocus(event: FocusEvent) {
        isFocused = true;
        onfocus?.(event as FocusEvent & { currentTarget: EventTarget & HTMLInputElement });
    }

    function handleBlur(event: FocusEvent) {
        isFocused = false;
        onblur?.(event as FocusEvent & { currentTarget: EventTarget & HTMLInputElement });
    }

    function handleKeydown(event: KeyboardEvent) {
        onkeydown?.(event as KeyboardEvent & { currentTarget: EventTarget & HTMLInputElement });
    }

    function handleKeyup(event: KeyboardEvent) {
        onkeyup?.(event as KeyboardEvent & { currentTarget: EventTarget & HTMLInputElement });
    }

    // Set custom validity when error changes
    $effect(() => {
        if (inputElement && error) {
            inputElement.setCustomValidity(error);
        } else if (inputElement) {
            inputElement.setCustomValidity('');
        }
    });

    // Computed classes - Fixed the logic and background colors
    const inputClasses = $derived(() => {
        const baseClasses = 'w-full p-2 text-sm border rounded shadow-sm transition-colors duration-150 focus:outline-none bg-white';
        
        let stateClasses = '';
        
        if (disabled) {
            stateClasses = 'bg-gray-100 text-gray-500 cursor-not-allowed border-gray-300 opacity-60';
        } else if (readonly) {
            stateClasses = 'bg-gray-50 cursor-default border-gray-300 text-gray-700';
        } else if (error) {
            stateClasses = 'border-red-400 bg-red-50 text-red-900 focus:border-red-500 focus:ring-2 focus:ring-red-200';
        } else if (isFocused) {
            stateClasses = 'border-blue-500 bg-white text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200';
        } else {
            stateClasses = 'border-gray-300 bg-white text-gray-900 hover:border-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200';
        }

        return `${baseClasses} ${stateClasses} ${className}`.trim();
    });
</script>

<div class="input-wrapper w-full">
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
        class={inputClasses()}
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
        <p class="error-message mt-1 text-xs text-red-600 w-full" role="alert">
            {error}
        </p>
    {/if}
</div>

<style lang="postcss">
    .input-wrapper {
        @apply w-full block;
    }

    input {
        @apply w-full block box-border;
        min-width: 0;
    }

    input::placeholder {
        @apply text-gray-400;
    }

    /* Override browser validation styles */
    input:invalid {
        box-shadow: none !important;
    }

    input:valid {
        box-shadow: none !important;
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
