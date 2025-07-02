<script lang="ts">
    import { createEventDispatcher } from 'svelte';

    let {
        id = '',
        name = '',
        value = $bindable(''),
        placeholder = '',
        disabled = false,
        readonly = false,
        required = false,
        rows = 3,
        cols,
        maxlength,
        minlength,
        resize = 'vertical',
        error = '',
        class: className = '',
        ...restProps
    }: {
        id?: string;
        name?: string;
        value?: string;
        placeholder?: string;
        disabled?: boolean;
        readonly?: boolean;
        required?: boolean;
        rows?: number;
        cols?: number;
        maxlength?: number;
        minlength?: number;
        resize?: 'none' | 'both' | 'horizontal' | 'vertical';
        error?: string;
        class?: string;
        [key: string]: any;
    } = $props();

    const dispatch = createEventDispatcher();

    let textareaElement: HTMLTextAreaElement;
    let isFocused = $state(false);

    function handleInput(event: Event) {
        const target = event.target as HTMLTextAreaElement;
        value = target.value;
        dispatch('input', { value, event });
    }

    function handleChange(event: Event) {
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

    // Auto-resize functionality
    function autoResize() {
        if (textareaElement && resize === 'vertical') {
            textareaElement.style.height = 'auto';
            textareaElement.style.height = textareaElement.scrollHeight + 'px';
        }
    }

    // Auto-resize on value change
    $effect(() => {
        if (value !== undefined) {
            autoResize();
        }
    });

    // Computed classes
    const textareaClasses = $derived(() => {
        const baseClasses = 'textarea-input w-full px-3 py-2 text-sm border rounded-md transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-offset-0';
        
        const stateClasses = error
            ? 'border-red-400 focus:border-red-500 focus:ring-red-200 bg-red-50'
            : isFocused
            ? 'border-primary focus:border-primary focus:ring-primary/20 bg-background-1'
            : 'border-border-main/30 hover:border-border-main/50 bg-background-1';
        
        const disabledClasses = disabled
            ? 'bg-background-3 text-text-2 cursor-not-allowed border-border-main/20'
            : 'text-text-main';

        const readonlyClasses = readonly
            ? 'bg-background-2 cursor-default'
            : '';

        const resizeClasses = `resize-${resize}`;

        return `${baseClasses} ${stateClasses} ${disabledClasses} ${readonlyClasses} ${resizeClasses} ${className}`.trim();
    });
</script>

<div class="textarea-wrapper">
    <textarea
        bind:this={textareaElement}
        {id}
        {name}
        {placeholder}
        {disabled}
        {readonly}
        {required}
        {rows}
        {cols}
        {maxlength}
        {minlength}
        class={textareaClasses}
        bind:value
        oninput={handleInput}
        onchange={handleChange}
        onfocus={handleFocus}
        onblur={handleBlur}
        onkeydown={handleKeydown}
        onkeyup={handleKeyup}
        {...restProps}
    ></textarea>
    
    {#if error}
        <p class="error-message mt-1 text-xs text-red-600" role="alert">
            {error}
        </p>
    {/if}
    
    {#if maxlength}
        <div class="character-count mt-1 text-xs text-text-2 text-right">
            {value.length}/{maxlength}
        </div>
    {/if}
</div>

<style lang="postcss">
    .textarea-input {
        font-family: inherit;
        line-height: 1.5;
        min-height: 2.5rem;
    }

    .textarea-input::placeholder {
        @apply text-text-2;
    }

    .textarea-input:focus {
        @apply ring-2;
    }

    .textarea-input:disabled {
        @apply opacity-60;
    }

    .resize-none {
        resize: none;
    }

    .resize-both {
        resize: both;
    }

    .resize-horizontal {
        resize: horizontal;
    }

    .resize-vertical {
        resize: vertical;
    }

    /* Custom scrollbar for better UX */
    .textarea-input::-webkit-scrollbar {
        width: 6px;
    }

    .textarea-input::-webkit-scrollbar-track {
        @apply bg-background-2 rounded;
    }

    .textarea-input::-webkit-scrollbar-thumb {
        @apply bg-border-main/40 rounded;
    }

    .textarea-input::-webkit-scrollbar-thumb:hover {
        @apply bg-border-main/60;
    }
</style>