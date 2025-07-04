<script lang="ts">
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
        oninput,
        onchange,
        onfocus,
        onblur,
        onkeydown,
        onkeyup,
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
        oninput?: (event: Event & { currentTarget: EventTarget & HTMLTextAreaElement }) => void;
        onchange?: (event: Event & { currentTarget: EventTarget & HTMLTextAreaElement }) => void;
        onfocus?: (event: FocusEvent & { currentTarget: EventTarget & HTMLTextAreaElement }) => void;
        onblur?: (event: FocusEvent & { currentTarget: EventTarget & HTMLTextAreaElement }) => void;
        onkeydown?: (event: KeyboardEvent & { currentTarget: EventTarget & HTMLTextAreaElement }) => void;
        onkeyup?: (event: KeyboardEvent & { currentTarget: EventTarget & HTMLTextAreaElement }) => void;
        [key: string]: any;
    } = $props();

    let textareaElement: HTMLTextAreaElement;
    let isFocused = $state(false);

    function handleInput(event: Event) {
        const target = event.target as HTMLTextAreaElement;
        value = target.value;
        
        // Clear custom validation when user starts typing
        if (target.validity.customError) {
            target.setCustomValidity('');
        }
        
        autoResize();
        oninput?.(event as Event & { currentTarget: EventTarget & HTMLTextAreaElement });
    }

    function handleChange(event: Event) {
        const target = event.target as HTMLTextAreaElement;
        value = target.value;
        onchange?.(event as Event & { currentTarget: EventTarget & HTMLTextAreaElement });
    }

    function handleFocus(event: FocusEvent) {
        isFocused = true;
        onfocus?.(event as FocusEvent & { currentTarget: EventTarget & HTMLTextAreaElement });
    }

    function handleBlur(event: FocusEvent) {
        isFocused = false;
        onblur?.(event as FocusEvent & { currentTarget: EventTarget & HTMLTextAreaElement });
    }

    function handleKeydown(event: KeyboardEvent) {
        onkeydown?.(event as KeyboardEvent & { currentTarget: EventTarget & HTMLTextAreaElement });
    }

    function handleKeyup(event: KeyboardEvent) {
        onkeyup?.(event as KeyboardEvent & { currentTarget: EventTarget & HTMLTextAreaElement });
    }

    // Auto-resize functionality
    function autoResize() {
        if (textareaElement && resize === 'vertical') {
            textareaElement.style.height = 'auto';
            textareaElement.style.height = textareaElement.scrollHeight + 'px';
        }
    }

    // Set custom validity when error changes
    $effect(() => {
        if (textareaElement && error) {
            textareaElement.setCustomValidity(error);
        } else if (textareaElement) {
            textareaElement.setCustomValidity('');
        }
    });

    // Auto-resize on value change
    $effect(() => {
        if (value !== undefined) {
            autoResize();
        }
    });

    // Computed classes - Fixed the logic and background colors
    const textareaClasses = $derived(() => {
        const baseClasses = 'w-full px-3 py-2 text-sm border rounded-md transition-colors duration-150 focus:outline-none';
        
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

        const resizeClasses = `resize-${resize}`;

        return `${baseClasses} ${stateClasses} ${resizeClasses} ${className}`.trim();
    });
</script>

<div class="textarea-wrapper w-full">
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
        class={textareaClasses()}
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
        <p class="error-message mt-1 text-xs text-red-600 w-full" role="alert">
            {error}
        </p>
    {/if}
    
    {#if maxlength}
        <div class="character-count mt-1 text-xs text-gray-500 text-right">
            {value.length}/{maxlength}
        </div>
    {/if}
</div>

<style lang="postcss">
    .textarea-wrapper {
        @apply w-full block;
    }

    textarea {
        @apply w-full block box-border;
        font-family: inherit;
        line-height: 1.5;
        min-height: 2.5rem;
        min-width: 0;
    }

    textarea::placeholder {
        @apply text-gray-400;
    }

    /* Override browser validation styles */
    textarea:invalid {
        box-shadow: none !important;
    }

    textarea:valid {
        box-shadow: none !important;
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
    textarea::-webkit-scrollbar {
        width: 6px;
    }

    textarea::-webkit-scrollbar-track {
        @apply bg-gray-100 rounded;
    }

    textarea::-webkit-scrollbar-thumb {
        @apply bg-gray-400 rounded;
    }

    textarea::-webkit-scrollbar-thumb:hover {
        @apply bg-gray-600;
    }
</style>