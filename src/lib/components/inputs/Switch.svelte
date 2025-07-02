<script lang="ts">
    import { createEventDispatcher } from 'svelte';

    let {
        name = '',
        id = '',
        checked = $bindable(false),
        disabled = false,
        readonly = false,
        size = 'medium',
        color = 'primary',
        class: className = '',
        ...restProps
    }: {
        name?: string;
        id?: string;
        checked?: boolean;
        disabled?: boolean;
        readonly?: boolean;
        size?: 'small' | 'medium' | 'large';
        color?: 'primary' | 'green' | 'red' | 'blue';
        class?: string;
        [key: string]: any;
    } = $props();

    const dispatch = createEventDispatcher();

    let switchElement: HTMLInputElement;

    function handleChange(event: Event) {
        const target = event.target as HTMLInputElement;
        checked = target.checked;
        dispatch('change', { checked, event });
    }

    function handleClick() {
        if (!disabled && !readonly) {
            checked = !checked;
            dispatch('change', { checked, event: new Event('change') });
        }
    }

    // Size classes
    const sizeClasses = $derived(() => {
        switch (size) {
            case 'small': return 'w-8 h-4';
            case 'large': return 'w-12 h-6';
            default: return 'w-10 h-5';
        }
    });

    const thumbSizeClasses = $derived(() => {
        switch (size) {
            case 'small': return 'w-3 h-3';
            case 'large': return 'w-5 h-5';
            default: return 'w-4 h-4';
        }
    });

    const translateClasses = $derived(() => {
        if (!checked) return 'translate-x-0';
        switch (size) {
            case 'small': return 'translate-x-4';
            case 'large': return 'translate-x-6';
            default: return 'translate-x-5';
        }
    });

    // Color classes
    const colorClasses = $derived(() => {
        if (disabled) return 'bg-gray-200';
        if (!checked) return 'bg-gray-300';
        
        switch (color) {
            case 'green': return 'bg-green-500';
            case 'red': return 'bg-red-500';
            case 'blue': return 'bg-blue-500';
            default: return 'bg-primary';
        }
    });

    const switchClasses = $derived(() => {
        const baseClasses = `relative inline-flex items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 ${sizeClasses}`;
        const stateClasses = disabled 
            ? 'cursor-not-allowed opacity-50' 
            : readonly 
            ? 'cursor-default' 
            : 'cursor-pointer';
        const focusClasses = disabled ? '' : 'focus:ring-primary/20';
        
        return `${baseClasses} ${colorClasses} ${stateClasses} ${focusClasses} ${className}`.trim();
    });
</script>

<div class="switch-wrapper inline-flex items-center">
    <!-- Hidden checkbox for form submission -->
    <input
        bind:this={switchElement}
        type="checkbox"
        {name}
        {id}
        {disabled}
        bind:checked
        onchange={handleChange}
        class="sr-only"
        {...restProps}
    />
    
    <!-- Visual switch -->
    <button
        type="button"
        class={switchClasses}
        role="switch"
        aria-checked={checked}
        aria-labelledby={id ? `${id}-label` : undefined}
        onclick={handleClick}
        {disabled}
        tabindex={disabled ? -1 : 0}
    >
        <!-- Switch thumb -->
        <span
            class={`inline-block ${thumbSizeClasses} transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${translateClasses}`}
        ></span>
    </button>
</div>

<style lang="postcss">
    .switch-wrapper {
        @apply select-none;
    }
    
    /* Screen reader only class */
    .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
    }
</style>
